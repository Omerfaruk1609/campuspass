import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  getReadOnlyContract,
  parseBlockchainError,
  shortenAddress,
} from "../data/events";
import {
  createSignedQrTicket,
  markNonceUsed,
  verifySignedQrTicket,
} from "../utils/qrVerification";
import { generateQrMatrix } from "../utils/qrMatrix";
import {
  EVENT_CATEGORIES,
  formatTurkeyDateOnly,
  formatTurkeyDateTime,
  validatePosterFile,
} from "../utils/eventMetadata";

function QrSvg({ value, size = 220 }) {
  if (!value) return null;
  let matrix;
  try {
    matrix = generateQrMatrix(value);
  } catch {
    return <div className="inline-alert error">QR matrisi oluşturulamadı.</div>;
  }

  const modules = matrix.length;
  const quietZone = 4;
  const totalModules = modules + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${totalModules} ${totalModules}`}
      shapeRendering="crispEdges"
      className="qr-svg"
      role="img"
      aria-label="İmzalı Katılım Doğrulama QR Kodu"
    >
      <rect width={totalModules} height={totalModules} fill="#ffffff" rx="2" />
      {matrix.map((row, rIdx) =>
        Array.from(row).map((cell, cIdx) =>
          cell === 1 ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx + quietZone}
              y={rIdx + quietZone}
              width={1}
              height={1}
              fill="#0f172a"
            />
          ) : null
        )
      )}
    </svg>
  );
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
  // "2026-11-15T13:30:00+03:00" -> "2026-11-15T13:30"
  const match = String(isoString).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : "";
}

export default function EventPage({
  event,
  account,
  chainId,
  onBack,
  onRegisterEvent,
  onMarkAttendance,
  onUpdateMetadata,
  txState,
}) {
  // Öğrenci QR State
  const [qrTicket, setQrTicket] = useState(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrError, setQrError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copiedQr, setCopiedQr] = useState(false);

  // Organizatör QR Tarama & Doğrulama State
  const [qrInputRaw, setQrInputRaw] = useState("");
  const [verifyingQr, setVerifyingQr] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Manuel Sorgulama State
  const [participantInput, setParticipantInput] = useState("");
  const [lookupStatus, setLookupStatus] = useState(null);
  const [checkingParticipant, setCheckingParticipant] = useState(false);
  const [localError, setLocalError] = useState("");

  // Organizatör Metadata Düzenleme State
  const [editMode, setEditMode] = useState(false);
  const [editCommunity, setEditCommunity] = useState(event?.community || "");
  const [editCategory, setEditCategory] = useState(event?.category || "Blockchain");
  const [editDescription, setEditDescription] = useState(event?.description || "");
  const [editDate, setEditDate] = useState(event?.date || "2026-11-15");
  const [editStartTime, setEditStartTime] = useState(event?.startTime || "14:00");
  const [editEndTime, setEditEndTime] = useState(event?.endTime || "17:00");
  const [editDeadline, setEditDeadline] = useState(
    toDatetimeLocalValue(event?.registrationDeadline) || "2026-11-15T13:30"
  );
  const [editCampus, setEditCampus] = useState(event?.location?.campus || "");
  const [editBuilding, setEditBuilding] = useState(event?.location?.building || "");
  const [editRoom, setEditRoom] = useState(event?.location?.room || "");
  const [editPosterUrl, setEditPosterUrl] = useState(event?.posterUrl || "");
  const [cancelReasonInput, setCancelReasonInput] = useState(
    event?.cancelReason || ""
  );
  const [editError, setEditError] = useState("");

  // Öğrenci QR geri sayım sayacı
  useEffect(() => {
    if (!qrTicket) return undefined;

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, qrTicket.expiresAt - now);
      setRemainingSeconds(diff);
    }, 1000);
    return () => clearInterval(timer);
  }, [qrTicket]);

  // Kamera temizliği
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function startCameraScan() {
    setCameraError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Tarayıcınız kamera erişimini desteklemiyor.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);

      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const raw = barcodes[0].rawValue;
              setQrInputRaw(raw);
              stopCamera();
              handleVerifyQr(raw);
            }
          } catch {
            // Tarama devam ediyor
          }
        }, 500);
      } else {
        setCameraError(
          "Kamera açıldı. Tarayıcınızda yerleşik BarcodeDetector API bulunmadığı için QR kod verisini aşağıdaki alana yapıştırarak da doğrulayabilirsiniz."
        );
      }
    } catch (err) {
      setCameraError("Kamera açılamadı: " + (err.message || "İzin verilmedi."));
    }
  }

  if (!event) {
    return (
      <div className="page-container">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Etkinlik Listesine Dön
        </button>
        <div className="empty-state">Etkinlik bulunamadı.</div>
      </div>
    );
  }

  const isOrganizer =
    account && event.organizer.toLowerCase() === account.toLowerCase();
  const isFull = event.registeredCount >= event.capacity;
  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;
  const fillPercent =
    event.capacity > 0
      ? Math.min(100, Math.round((event.registeredCount / event.capacity) * 100))
      : 0;
  const attendanceRate =
    event.registeredCount > 0
      ? Math.min(
          100,
          Math.round(
            ((event.verifiedAttendanceCount || 0) / event.registeredCount) * 100
          )
        )
      : 0;

  const statusClassMap = {
    upcoming: "active",
    ongoing: "ongoing",
    completed: "inactive",
    cancelled: "cancelled",
  };

  // Öğrenci İmzalı QR Üretimi
  async function handleGenerateQr() {
    setQrError("");
    setCopiedQr(false);
    if (!account) {
      setQrError("QR kod üretmek için cüzdanınızı bağlayın.");
      return;
    }
    if (!isCorrectNetwork) {
      setQrError("Lütfen Monad Testnet (10143) ağına geçin.");
      return;
    }

    setQrGenerating(true);
    try {
      const ticket = await createSignedQrTicket(event.id);
      const now = Math.floor(Date.now() / 1000);
      setRemainingSeconds(Math.max(0, ticket.expiresAt - now));
      setQrTicket(ticket);
    } catch (err) {
      setQrError(parseBlockchainError(err));
    } finally {
      setQrGenerating(false);
    }
  }

  async function handleCopyQrString() {
    if (!qrTicket) return;
    try {
      await navigator.clipboard.writeText(qrTicket.qrString);
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2500);
    } catch {
      // Clipboard izin hatası
    }
  }

  // Organizatör QR Doğrulama (Algoritma 5.C)
  async function handleVerifyQr(overrideRaw) {
    const rawToVerify = typeof overrideRaw === "string" ? overrideRaw : qrInputRaw;
    setVerifyingQr(true);
    setVerificationResult(null);
    try {
      const res = await verifySignedQrTicket({
        rawQrString: rawToVerify,
        expectedEventId: event.id,
        connectedAccount: account,
      });
      setVerificationResult(res);
    } catch (err) {
      setVerificationResult({
        valid: false,
        ticket: null,
        checks: [
          {
            id: "unexpected",
            label: "Sistem Doğrulama Kontrolü",
            passed: false,
            detail: err.message || "Doğrulama sırasında hata oluştu.",
          },
        ],
      });
    } finally {
      setVerifyingQr(false);
    }
  }

  async function handleConfirmVerifiedQrAttendance() {
    if (!verificationResult || !verificationResult.valid || !verificationResult.ticket) {
      return;
    }

    const { ticket } = verificationResult;

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > ticket.expiresAt) {
      await handleVerifyQr(qrInputRaw);
      return;
    }

    const ok = await onMarkAttendance(event.id, ticket.participant);
    if (ok) {
      markNonceUsed(ticket.nonce);
      await handleVerifyQr(qrInputRaw);
    }
  }

  async function handleCheckParticipant(addressToCheck) {
    setLocalError("");
    const cleaned = (addressToCheck ?? participantInput).trim();
    if (!ethers.isAddress(cleaned)) {
      setLocalError("Lütfen geçerli bir EVM cüzdan adresi (0x...) girin.");
      setLookupStatus(null);
      return;
    }

    setCheckingParticipant(true);
    try {
      const contract = getReadOnlyContract();
      const [isReg, isAtt] = await Promise.all([
        contract.registered(event.id, cleaned),
        contract.attended(event.id, cleaned),
      ]);
      setLookupStatus({
        address: cleaned,
        isRegistered: Boolean(isReg),
        isAttended: Boolean(isAtt),
      });
    } catch (err) {
      setLocalError("Katılımcı durumu sorgulanırken hata oluştu: " + err.message);
    } finally {
      setCheckingParticipant(false);
    }
  }

  async function handleManualAttendanceSubmit(e) {
    e.preventDefault();
    setLocalError("");

    const cleaned = participantInput.trim();
    if (!ethers.isAddress(cleaned)) {
      setLocalError("Lütfen geçerli bir katılımcı cüzdan adresi (0x...) girin.");
      return;
    }
    if (!isOrganizer) {
      setLocalError("Yalnızca etkinliğin organizatörü katılım doğrulayabilir.");
      return;
    }
    if (!isCorrectNetwork) {
      setLocalError("Lütfen önce Monad Testnet (10143) ağına geçin.");
      return;
    }

    const ok = await onMarkAttendance(event.id, cleaned);
    if (ok) {
      await handleCheckParticipant(cleaned);
    }
  }

  function handleEditPosterFile(e) {
    setEditError("");
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validatePosterFile(file);
    } catch (err) {
      setEditError(err.message);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEditPosterUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveMetadataSubmit(e) {
    e.preventDefault();
    setEditError("");

    const updatedPayload = {
      community: editCommunity,
      category: editCategory,
      description: editDescription,
      date: editDate,
      startTime: editStartTime,
      endTime: editEndTime,
      registrationDeadline: editDeadline,
      location: {
        campus: editCampus,
        building: editBuilding,
        room: editRoom,
      },
      posterUrl: editPosterUrl,
      cancelled: event.cancelled,
      cancelReason: event.cancelReason,
    };

    const ok = await onUpdateMetadata(
      event.id,
      updatedPayload,
      "UPDATE_METADATA"
    );
    if (ok) {
      setEditMode(false);
    }
  }

  async function handleToggleCancelEvent(shouldCancel) {
    setEditError("");
    const updatedPayload = {
      community: event.community,
      category: event.category,
      description: event.description,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      registrationDeadline: event.registrationDeadline,
      location: event.location,
      posterUrl: event.posterUrl,
      cancelled: shouldCancel,
      cancelReason: shouldCancel ? cancelReasonInput : "",
    };

    await onUpdateMetadata(
      event.id,
      updatedPayload,
      shouldCancel ? "CANCEL_EVENT" : "RESTORE_EVENT"
    );
  }

  const formatCountdown = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="page-container">
      <div className="back-bar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Tüm Etkinliklere Dön
        </button>
      </div>

      {/* Etkinlik Detay Kartı */}
      <section className="card-panel detail-card">
        {event.posterUrl && (
          <div className="detail-poster-wrap">
            <img
              src={event.posterUrl}
              alt={event.title}
              className="detail-poster-img"
            />
          </div>
        )}

        <div className="detail-header">
          <div>
            <div className="badge-group">
              <span className="event-id-badge">Etkinlik #{event.id}</span>
              <span className="category-pill">{event.category}</span>
              <span
                className={`status-badge ${
                  statusClassMap[event.status] || "active"
                }`}
              >
                {event.statusLabel}
              </span>
              {isOrganizer && (
                <span className="status-badge organizer">Organizatörsünüz</span>
              )}
            </div>
            <div className="event-community-line" style={{ marginTop: "0.5rem" }}>
              {event.community}
            </div>
            <h1 className="detail-title">{event.title}</h1>
          </div>
        </div>

        {event.status === "cancelled" && (
          <div className="inline-alert error">
            <strong>Bu etkinlik organizatör tarafından iptal edilmiştir.</strong>
            {event.cancelReason && <p>Gerekçe: {event.cancelReason}</p>}
          </div>
        )}

        <div className="detail-description-box">
          <h3>Etkinlik Açıklaması</h3>
          <p>{event.description}</p>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-label">📅 Etkinlik Tarihi &amp; Saati (TSİ)</span>
            <span className="detail-value">
              {formatTurkeyDateOnly(event.date)} • {event.startTime} - {event.endTime}
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">⏳ Kayıt Son Tarihi (TSİ)</span>
            <span
              className={`detail-value ${
                event.deadlinePassed ? "text-danger" : ""
              }`}
            >
              {formatTurkeyDateTime(event.registrationDeadline)}
              {event.deadlinePassed && " (Sona Erdi)"}
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">📍 Konum (Kampüs / Bina / Salon)</span>
            <span className="detail-value">
              {event.location?.campus} — {event.location?.building} (
              {event.location?.room})
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">👤 Organizatör Cüzdanı</span>
            <a
              href={`${MONAD_EXPLORER_URL}/address/${event.organizer}`}
              target="_blank"
              rel="noreferrer"
              className="detail-value monospace link"
            >
              {event.organizer} ↗
            </a>
          </div>

          <div className="detail-item">
            <span className="detail-label">👥 Kayıtlı / Kontenjan</span>
            <span className="detail-value">
              <strong>{event.registeredCount}</strong> / {event.capacity} katılımcı
              ({fillPercent}%) • Doğrulanan:{" "}
              <strong>{event.verifiedAttendanceCount || 0}</strong>
            </span>
            <div className="progress-track">
              <div
                className={`progress-fill ${isFull ? "full" : ""}`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>

          <div className="detail-item">
            <span className="detail-label">🔗 Bileşik Etkinlik Kimliği</span>
            <span className="detail-value monospace">{event.compositeKey}</span>
          </div>
        </div>

        {/* Öğrenci Kayıt & Durum Bölümü (Algoritma 5.B) */}
        <div className="student-status-box">
          <h2>Öğrenci Kayıt ve Katılım Durumu</h2>

          {!account ? (
            <p className="muted-text">
              Etkinliğe kayıt olmak veya QR katılım kodunuzu oluşturmak için sağ üstten
              cüzdanınızı bağlayın.
            </p>
          ) : (
            <div className="status-summary">
              <div className="status-row">
                <span>Bağlı Cüzdan:</span>
                <strong className="monospace">{shortenAddress(account)}</strong>
              </div>
              <div className="status-row">
                <span>Kayıt Durumu:</span>
                {event.isRegistered ? (
                  <span className="status-badge registered">Kayıtlı ✓</span>
                ) : (
                  <span className="status-badge inactive">Kayıtlı Değil</span>
                )}
              </div>
              <div className="status-row">
                <span>Katılım Doğrulaması:</span>
                {event.isAttended ? (
                  <span className="status-badge attended">
                    Blokzincirde Doğrulandı ✓
                  </span>
                ) : (
                  <span className="status-badge inactive">Henüz Doğrulanmadı</span>
                )}
              </div>

              <div className="action-row">
                {event.isRegistered ? (
                  <div className="inline-alert success">
                    Bu etkinliğe kaydınız blokzincir üzerinde tamamlanmıştır.
                    {event.isAttended
                      ? " Katılımınız organizatör tarafından blokzincirde doğrulanmıştır!"
                      : " Etkinlik alanında aşağıdaki İmzalı QR Katılım Kodunuzu organizatöre okutarak katılımınızı doğrulayabilirsiniz."}
                  </div>
                ) : event.status === "cancelled" ? (
                  <div>
                    <button type="button" className="btn btn-secondary" disabled>
                      Etkinlik İptal Edildi (Kayıt Kapalı)
                    </button>
                    <p className="security-boundary-note">
                      Güvenlik Notu: Etkinlik organizatör imzasıyla iptal edilmiştir.
                      Mevcut v1 akıllı sözleşmesinde (`CampusPass.sol`) zincir üstü iptal
                      fonksiyonu bulunmadığından bu kısıtlama uygulama katmanında
                      uygulanır.
                    </p>
                  </div>
                ) : event.deadlinePassed || event.status === "completed" ? (
                  <div>
                    <button type="button" className="btn btn-secondary" disabled>
                      Kayıt Son Tarihi Geçti (Kayıt Kapalı)
                    </button>
                    <p className="security-boundary-note">
                      Güvenlik Notu: Kayıt son tarihi ({formatTurkeyDateTime(event.registrationDeadline)})
                      dolduğu için kayıt butonu devre dışı bırakılmıştır. Mevcut v1
                      sözleşmesi son kayıt tarihini zincir üzerinde zorunlu kılmaz.
                    </p>
                  </div>
                ) : isFull ? (
                  <div className="inline-alert error">
                    Bu etkinliğin kontenjanı ({event.capacity} kişi) dolmuştur.
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onRegisterEvent(event.id)}
                    disabled={txState.busy}
                  >
                    {txState.type === "register" && txState.targetId === event.id
                      ? "Cüzdan / Blokzincir Onayı Bekleniyor..."
                      : "Etkinliğe Kayıt Ol (registerForEvent)"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* FAZ 4 — Öğrenci İmzalı QR Kod Oluşturma Ekranı (Algoritma 5.C) */}
      {account && event.isRegistered && !event.isAttended && (
        <section className="card-panel qr-student-panel">
          <div className="panel-header">
            <h2>Öğrenci QR Katılım Doğrulama Kodu</h2>
            <p className="panel-subtitle">
              Kopyalama ve tekrar kullanım saldırılarını önlemek için QR kodunuz{" "}
              <strong>cüzdan imzanızla (EIP-191)</strong>,{" "}
              <strong>tek kullanımlık rastgele kodla (nonce)</strong> ve{" "}
              <strong>3 dakikalık geçerlilik süresiyle</strong> üretilir (Gas ücreti
              gerektirmez).
            </p>
          </div>

          {!qrTicket ? (
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateQr}
                disabled={qrGenerating}
              >
                {qrGenerating
                  ? "Cüzdanınızda İmza Bekleniyor..."
                  : "İmzalı QR Katılım Kodu Oluştur"}
              </button>
              {qrError && <div className="inline-alert error">{qrError}</div>}
            </div>
          ) : (
            <div className="qr-display-grid">
              <div className="qr-box-wrapper">
                <div
                  className={`qr-visual-frame ${
                    remainingSeconds === 0 ? "expired" : ""
                  }`}
                >
                  <QrSvg value={qrTicket.qrString} size={220} />
                </div>
                <span
                  className={`qr-timer-pill ${
                    remainingSeconds <= 30 ? "expiring" : ""
                  }`}
                >
                  {remainingSeconds > 0
                    ? `Geçerlilik Süresi: ${formatCountdown(remainingSeconds)}`
                    : "Süresi Doldu (Geçersiz)"}
                </span>
              </div>

              <div className="qr-details-column">
                <div className="lookup-box">
                  <div>
                    <strong>Katılımcı Cüzdanı:</strong>{" "}
                    <span className="monospace">{qrTicket.participant}</span>
                  </div>
                  <div>
                    <strong>Etkinlik Kimliği:</strong> #{qrTicket.eventId} (Chain ID:{" "}
                    {qrTicket.chainId})
                  </div>
                  <div>
                    <strong>Tek Kullanımlık Kod (Nonce):</strong>{" "}
                    <span className="monospace">{qrTicket.nonce}</span>
                  </div>
                  <div>
                    <strong>Cüzdan İmzası:</strong>{" "}
                    <span className="monospace">
                      {shortenAddress(qrTicket.signature)}
                    </span>
                  </div>
                </div>

                <div className="qr-action-buttons">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleGenerateQr}
                    disabled={qrGenerating}
                  >
                    ↻ Yeni İmzalı QR Kod Üret
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopyQrString}
                  >
                    {copiedQr ? "Kopyalandı ✓" : "QR Doğrulama Verisini Kopyala"}
                  </button>

                  {isOrganizer && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setQrInputRaw(qrTicket.qrString);
                        handleVerifyQr(qrTicket.qrString);
                      }}
                    >
                      ↓ Organizatör Tarayıcısına Aktar ve Doğrula
                    </button>
                  )}
                </div>

                {qrError && <div className="inline-alert error">{qrError}</div>}
              </div>
            </div>
          )}
        </section>
      )}

      {/* FAZ 7 — Organizatör Yönetim, İstatistik, Metadata Düzenleme ve İptal Paneli */}
      {isOrganizer && (
        <section className="card-panel organizer-management-panel">
          <div className="panel-header-flex">
            <div>
              <h2>Organizatör Etkinlik Yönetim Paneli</h2>
              <p className="panel-subtitle">
                Yalnızca blokzincir üzerindeki etkinlik organizatörü (`{shortenAddress(event.organizer)}`)
                kriptografik cüzdan imzasıyla etkinlik detaylarını düzenleyebilir veya
                iptal durumunu değiştirebilir.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditMode((prev) => !prev)}
            >
              {editMode ? "Düzenlemeyi Kapat" : "✎ Etkinlik Bilgilerini Düzenle"}
            </button>
          </div>

          <div className="organizer-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-value">
                {event.registeredCount} / {event.capacity}
              </span>
              <span className="kpi-label">Kayıt / Kontenjan</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">%{fillPercent}</span>
              <span className="kpi-label">Kontenjan Doluluk Oranı</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">{event.verifiedAttendanceCount || 0}</span>
              <span className="kpi-label">Doğrulanmış Katılımcı</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">%{attendanceRate}</span>
              <span className="kpi-label">Kayıt / Katılım Dönüşümü</span>
            </div>
          </div>

          {editMode && (
            <form
              className="advanced-event-form"
              onSubmit={handleSaveMetadataSubmit}
            >
              <h3>Etkinlik Metadata Bilgilerini Güncelle (İmza Doğrulamalı)</h3>
              <div className="advanced-form-grid">
                <div className="form-field">
                  <label htmlFor="edit-community">Düzenleyen Topluluk *</label>
                  <input
                    id="edit-community"
                    type="text"
                    value={editCommunity}
                    onChange={(e) => setEditCommunity(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-category">Kategori *</label>
                  <select
                    id="edit-category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    disabled={txState.busy}
                  >
                    {EVENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="edit-date">Tarih (TSİ) *</label>
                  <input
                    id="edit-date"
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-start">Başlangıç Saati *</label>
                  <input
                    id="edit-start"
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-end">Bitiş Saati *</label>
                  <input
                    id="edit-end"
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-deadline">Kayıt Son Tarihi (TSİ) *</label>
                  <input
                    id="edit-deadline"
                    type="datetime-local"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-campus">Kampüs *</label>
                  <input
                    id="edit-campus"
                    type="text"
                    value={editCampus}
                    onChange={(e) => setEditCampus(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-building">Bina *</label>
                  <input
                    id="edit-building"
                    type="text"
                    value={editBuilding}
                    onChange={(e) => setEditBuilding(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-room">Salon *</label>
                  <input
                    id="edit-room"
                    type="text"
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="edit-poster">Afiş URL veya Dosya (Maks 500 KB)</label>
                  <input
                    id="edit-poster"
                    type="url"
                    placeholder="https://..."
                    value={editPosterUrl.startsWith("data:") ? "" : editPosterUrl}
                    onChange={(e) => setEditPosterUrl(e.target.value)}
                    disabled={txState.busy}
                  />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleEditPosterFile}
                    disabled={txState.busy}
                    className="file-input-compact"
                  />
                </div>
              </div>

              <div className="form-field full-width">
                <label htmlFor="edit-desc">Etkinlik Açıklaması *</label>
                <textarea
                  id="edit-desc"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={txState.busy}
                />
              </div>

              {editError && <div className="inline-alert error">{editError}</div>}

              <div className="form-submit-row">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={txState.busy}
                >
                  {txState.type === "metadata"
                    ? "İmza Bekleniyor..."
                    : "Cüzdan İmzasıyla Değişiklikleri Kaydet"}
                </button>
              </div>
            </form>
          )}

          {/* Etkinlik İptal Kontrolü */}
          <div className="cancel-control-box">
            <div>
              <strong>Etkinlik İptal Yönetimi</strong>
              <p className="muted-text">
                Not: Mevcut `CampusPass.sol` v1 sözleşmesinde zincir üstü iptal fonksiyonu
                bulunmadığı için iptal işlemi organizatörün cüzdan imzasıyla metadata
                katmanında uygulanır ve arayüzde yeni kayıtları kapatır (doğrudan akıllı
                sözleşmeye yapılan `registerForEvent` çağrılarını engellemek için Sözleşme
                v2 önerilir).
              </p>
            </div>

            {!event.cancelled ? (
              <div className="cancel-action-row">
                <input
                  type="text"
                  placeholder="İptal gerekçesi (isteğe bağlı)"
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  disabled={txState.busy}
                />
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={() => handleToggleCancelEvent(true)}
                  disabled={txState.busy}
                >
                  Etkinliği İptal Et (İmzalı)
                </button>
              </div>
            ) : (
              <div className="cancel-action-row">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleToggleCancelEvent(false)}
                  disabled={txState.busy}
                >
                  İptali Kaldır ve Etkinliği Aktifleştir (İmzalı)
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* FAZ 4 — Yetkili Organizatör QR Tarama ve Katılım Doğrulama Paneli */}
      {isOrganizer && (
        <section className="card-panel organizer-panel">
          <div className="panel-header">
            <h2>Organizatör QR Tarama ve Katılım Doğrulama Ekranı</h2>
            <p className="panel-subtitle">
              Öğrencinin gösterdiği QR kodu kamerayla tarayın veya imzalı QR verisini
              doğrulayın. Sistem 5 aşamalı kriptografik ve blokzincir kontrollerini
              yaptıktan sonra katılımı Monad Testnet&apos;e işler.
            </p>
          </div>

          <div className="scanner-controls">
            {!cameraActive ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={startCameraScan}
              >
                📷 Kamerayla QR Kod Tara
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-warning btn-sm"
                onClick={stopCamera}
              >
                ✕ Kamerayı Kapat
              </button>
            )}
          </div>

          {cameraActive && (
            <div className="camera-preview-box">
              <video ref={videoRef} className="camera-video" muted playsInline />
              <p className="muted-text">QR kodu kameraya gösterin...</p>
            </div>
          )}

          {cameraError && <div className="inline-alert error">{cameraError}</div>}

          <div className="qr-verify-form">
            <div className="form-field">
              <label htmlFor="qr-raw-input">
                Taranan / İmzalı QR Doğrulama Paketi (JSON)
              </label>
              <textarea
                id="qr-raw-input"
                rows={3}
                className="qr-textarea monospace"
                placeholder='{"v":"CP1","c":10143,"a":"0x...","e":1,"p":"0x...","n":"0x...","iat":...,"exp":...,"sig":"0x..."}'
                value={qrInputRaw}
                onChange={(e) => {
                  setQrInputRaw(e.target.value);
                  setVerificationResult(null);
                }}
                disabled={txState.busy}
              />
            </div>

            <div className="qr-verify-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleVerifyQr()}
                disabled={!qrInputRaw.trim() || verifyingQr || txState.busy}
              >
                {verifyingQr
                  ? "5 Aşamalı Güvenlik Kontrolü Yapılıyor..."
                  : "1. QR Kodunu ve İmzayı Doğrula"}
              </button>

              {verificationResult?.valid && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmVerifiedQrAttendance}
                  disabled={txState.busy}
                >
                  {txState.type === "attendance"
                    ? "Blokzincirde İşaretleniyor..."
                    : "2. Katılımı Blokzincirde Onayla (markAttendance)"}
                </button>
              )}
            </div>
          </div>

          {/* 5 Aşamalı Güvenlik Doğrulama Raporu */}
          {verificationResult && (
            <div
              className={`verification-report ${
                verificationResult.valid ? "valid" : "invalid"
              }`}
            >
              <h3>
                {verificationResult.valid
                  ? "✓ QR Doğrulama Başarılı — Katılım Onayına Hazır"
                  : "✗ QR Doğrulama Reddedildi"}
              </h3>

              <ul className="security-checklist">
                {verificationResult.checks.map((item) => (
                  <li
                    key={item.id}
                    className={`check-item ${item.passed ? "pass" : "fail"}`}
                  >
                    <span className="check-icon">{item.passed ? "✓" : "✗"}</span>
                    <div>
                      <strong>{item.label}:</strong> <span>{item.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Manuel Cüzdan Adresi ile Sorgulama / Doğrulama (Yedek Yöntem) */}
          <details className="manual-fallback-details">
            <summary>Manuel Cüzdan Adresi ile Sorgulama ve İşaretleme</summary>
            <form
              className="attendance-form"
              onSubmit={handleManualAttendanceSubmit}
            >
              <div className="form-field">
                <label htmlFor="participant-address">Katılımcı Cüzdan Adresi</label>
                <div className="input-with-btn">
                  <input
                    id="participant-address"
                    type="text"
                    className="monospace"
                    placeholder="0x..."
                    value={participantInput}
                    onChange={(e) => setParticipantInput(e.target.value)}
                    disabled={txState.busy}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleCheckParticipant()}
                    disabled={checkingParticipant || txState.busy}
                  >
                    {checkingParticipant ? "Sorgulanıyor..." : "Durumu Sorgula"}
                  </button>
                </div>
              </div>

              {lookupStatus && (
                <div className="lookup-box">
                  <div>
                    <strong>Adres:</strong>{" "}
                    <span className="monospace">{lookupStatus.address}</span>
                  </div>
                  <div>
                    <strong>Kayıtlı mı (`registered`):</strong>{" "}
                    {lookupStatus.isRegistered ? "Evet ✓" : "Hayır ✗"}
                  </div>
                  <div>
                    <strong>Katılım İşaretli mi (`attended`):</strong>{" "}
                    {lookupStatus.isAttended ? "Evet ✓" : "Hayır ✗"}
                  </div>
                </div>
              )}

              {localError && <div className="inline-alert error">{localError}</div>}

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={txState.busy}
                >
                  {txState.type === "attendance"
                    ? "Katılım Blokzincire İşleniyor..."
                    : "Manuel Olarak Katılımı İşaretle (markAttendance)"}
                </button>
              </div>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}
