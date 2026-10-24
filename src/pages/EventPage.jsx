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
      style={{ borderRadius: "8px", maxWidth: "100%", height: "auto" }}
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
              fill="#03122e"
            />
          ) : null
        )
      )}
    </svg>
  );
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return "";
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
  const [copiedLink, setCopiedLink] = useState(false);

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
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container">
          <button type="button" className="stitch-btn-secondary" onClick={onBack}>
            ← Etkinlik Listesine Dön
          </button>
          <div className="stitch-card" style={{ padding: "3rem", textAlign: "center", marginTop: "2rem" }}>
            Etkinlik bulunamadı.
          </div>
        </div>
      </div>
    );
  }

  const isOrganizer =
    account && event.organizer && event.organizer.toLowerCase() === account.toLowerCase();
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
    upcoming: "stitch-badge-open",
    ongoing: "stitch-badge-verified",
    completed: "stitch-badge-completed",
    cancelled: "stitch-badge-full",
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

  function handleShareLink() {
    if (typeof window !== "undefined" && window.location) {
      navigator.clipboard?.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }

  // Organizatör QR Doğrulama
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
    <div className="stitch-shell page-container" style={{ paddingBottom: "5rem" }}>
      {/* Ambient Glows */}
      <div
        className="ambient-glow-primary"
        style={{ top: "10%", left: "5%", width: "450px", height: "450px" }}
      />
      <div
        className="ambient-glow-cyan"
        style={{ top: "30%", right: "10%", width: "400px", height: "400px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, paddingTop: "1.5rem" }}>
        {/* Üst Gezinme / Ekmek Kırıntısı (Breadcrumb) ve İşlem Butonları */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <button
            type="button"
            className="stitch-btn-secondary"
            onClick={onBack}
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              arrow_back
            </span>
            Tüm Etkinliklere Dön
          </button>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="stitch-btn-secondary"
              onClick={handleShareLink}
              style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                share
              </span>
              {copiedLink ? "Bağlantı Kopyalandı ✓" : "Paylaş"}
            </button>
            <a
              href={`${MONAD_EXPLORER_URL}/address/${event.organizer}`}
              target="_blank"
              rel="noreferrer"
              className="stitch-btn-secondary"
              style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem", textDecoration: "none" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                open_in_new
              </span>
              Monad Explorer
            </a>
          </div>
        </div>

        {/* HERO GÖRSEL BANNER (Stitch 16:9 Geniş Kapak) */}
        <div
          className="stitch-card"
          style={{
            position: "relative",
            width: "100%",
            borderRadius: "1.25rem",
            overflow: "hidden",
            marginBottom: "2rem",
            backgroundColor: "var(--stitch-surface-container-lowest)",
            border: "1px solid rgba(142, 144, 161, 0.2)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              minHeight: "260px",
              maxHeight: "380px",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            {event.posterUrl ? (
              <img
                src={event.posterUrl}
                alt={event.title}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(circle at 80% 20%, rgba(111, 136, 255, 0.3), transparent 70%), linear-gradient(135deg, #0a1f4d 0%, #03122e 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "80px", color: "var(--stitch-primary)", opacity: 0.25 }}
                >
                  school
                </span>
              </div>
            )}

            {/* Gradient Karartma */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(3, 18, 46, 0.98) 0%, rgba(3, 18, 46, 0.6) 60%, rgba(3, 18, 46, 0.2) 100%)",
              }}
            />

            {/* Banner Üst Rozetleri */}
            <div
              style={{
                position: "relative",
                zIndex: 2,
                padding: "2rem",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="stitch-badge stitch-badge-testnet">
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    loyalty
                  </span>
                  {event.category}
                </span>

                <span className={`stitch-badge ${statusClassMap[event.status] || "stitch-badge-open"}`}>
                  {event.statusLabel}
                </span>

                <span className="stitch-badge stitch-badge-testnet">
                  Etkinlik #{event.id}
                </span>

                {isOrganizer && (
                  <span className="stitch-badge stitch-badge-verified">
                    Organizatörsünüz
                  </span>
                )}
              </div>

              <h1 className="font-display-hero" style={{ margin: 0, color: "#ffffff", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                {event.title}
              </h1>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--stitch-on-surface-variant)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--stitch-primary)" }}>
                  groups
                </span>
                <span className="font-headline-sm" style={{ color: "var(--stitch-primary)" }}>
                  {event.community}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 SÜTUNLU HIZLI BİLGİ ŞERİDİ (Fast Bar) */}
        <div
          className="stitch-card-low"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1.25rem",
            padding: "1.25rem 1.5rem",
            marginBottom: "2.5rem",
            borderRadius: "1rem",
          }}
        >
          {/* 1. Tarih & Saat */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                backgroundColor: "rgba(111, 136, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-primary)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                calendar_month
              </span>
            </div>
            <div>
              <div className="font-label-badge text-outline">TARİH &amp; SAAT (TSİ)</div>
              <div className="font-headline-sm" style={{ fontSize: "0.875rem" }}>
                {formatTurkeyDateOnly(event.date)}
              </div>
              <div className="font-body-sm text-on-surface-variant">
                {event.startTime} - {event.endTime}
              </div>
              <div className="font-body-sm text-outline" style={{ fontSize: "0.6875rem" }}>
                Son Kayıt: {formatTurkeyDateTime(event.registrationDeadline)}
              </div>
            </div>
          </div>

          {/* 2. Konum */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                backgroundColor: "rgba(208, 188, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-secondary)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                location_on
              </span>
            </div>
            <div>
              <div className="font-label-badge text-outline">LOKASYON</div>
              <div className="font-headline-sm" style={{ fontSize: "0.875rem" }}>
                {event.location?.campus}
              </div>
              <div className="font-body-sm text-on-surface-variant">
                {event.location?.building} ({event.location?.room})
              </div>
            </div>
          </div>

          {/* 3. Kontenjan & Doluluk */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                backgroundColor: "rgba(123, 208, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-tertiary)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                group
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div className="font-label-badge text-outline">KONTENJAN DURUMU</div>
              <div className="font-headline-sm" style={{ fontSize: "0.875rem" }}>
                {event.registeredCount} / {event.capacity} Katılımcı (%{fillPercent})
              </div>
              <div className="stitch-progress-track" style={{ marginTop: "0.35rem" }}>
                <div className="stitch-progress-fill" style={{ width: `${fillPercent}%` }} />
              </div>
            </div>
          </div>

          {/* 4. Katılım Türü / Doğrulama */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6ee7b7",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                verified_user
              </span>
            </div>
            <div>
              <div className="font-label-badge text-outline">KATILIM TÜRÜ</div>
              <div className="font-headline-sm" style={{ fontSize: "0.875rem" }}>
                Fiziksel &amp; İmzalı QR
              </div>
              <div className="font-body-sm text-on-surface-variant">
                Monad Testnet Onaylı
              </div>
            </div>
          </div>
        </div>

        {/* İPTAL BİLDİRİMİ (Varsa) */}
        {event.status === "cancelled" && (
          <div
            className="stitch-card"
            style={{
              padding: "1.25rem 1.5rem",
              backgroundColor: "rgba(147, 0, 10, 0.25)",
              borderColor: "var(--stitch-error)",
              borderRadius: "0.75rem",
              marginBottom: "2rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--stitch-error)", fontWeight: 700 }}>
              <span className="material-symbols-outlined">warning</span>
              Bu etkinlik organizatör tarafından iptal edilmiştir.
            </div>
            {event.cancelReason && (
              <p className="font-body-sm" style={{ color: "var(--stitch-on-surface-variant)", marginTop: "0.5rem", margin: "0.5rem 0 0 0" }}>
                Gerekçe: {event.cancelReason}
              </p>
            )}
          </div>
        )}

        {/* İKİ SÜTUNLU ANA İÇERİK BÖLGESİ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "2rem",
          }}
          className="event-detail-grid-layout"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem" }}>
            {/* SOL SÜTUN — ETKİNLİK DETAYLARI & AJANDA & KULÜP */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* Etkinlik Hakkında */}
              <section className="stitch-card" style={{ padding: "1.75rem" }}>
                <h3 className="font-headline-md" style={{ margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--stitch-primary)" }}>
                    description
                  </span>
                  Etkinlik Hakkında
                </h3>
                <p className="font-body-md text-on-surface-variant" style={{ margin: 0, whiteSpace: "pre-line", lineHeight: 1.7 }}>
                  {event.description}
                </p>
              </section>

              {/* Kazanımlar & Sertifika Avantajları */}
              <section className="stitch-card" style={{ padding: "1.75rem" }}>
                <h3 className="font-headline-md" style={{ margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "#6ee7b7" }}>
                    workspace_premium
                  </span>
                  Kazanımlar ve Dijital Sertifika
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div className="stitch-card-low" style={{ padding: "1rem" }}>
                    <div style={{ color: "var(--stitch-tertiary)", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                      🎓 Doğrulanabilir Başarı
                    </div>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      Etkinlik katılımınız Monad Testnet üzerinde `AttendanceMarked` olayıyla mühürlenir.
                    </p>
                  </div>
                  <div className="stitch-card-low" style={{ padding: "1rem" }}>
                    <div style={{ color: "var(--stitch-primary)", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                      🔗 Kalıcı Dijital Sertifika
                    </div>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      Etkinlik bitiminde HMAC doğrulamalı dijital katılım sertifikanızı tek tıkla oluşturun.
                    </p>
                  </div>
                </div>
              </section>

              {/* Organizatör / Ev Sahibi Bilgisi */}
              <section className="stitch-card" style={{ padding: "1.75rem" }}>
                <h3 className="font-headline-md" style={{ margin: "0 0 1rem 0" }}>
                  Organizatör &amp; Ev Sahibi
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-secondary-container))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: "1.25rem",
                    }}
                  >
                    {event.community ? event.community.charAt(0) : "C"}
                  </div>
                  <div>
                    <h4 className="font-headline-sm" style={{ margin: 0 }}>
                      {event.community}
                    </h4>
                    <a
                      href={`${MONAD_EXPLORER_URL}/address/${event.organizer}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-label-mono"
                      style={{ color: "var(--stitch-primary)", fontSize: "0.75rem", textDecoration: "none" }}
                    >
                      Organizatör Cüzdanı: {shortenAddress(event.organizer)} ↗
                    </a>
                  </div>
                </div>
              </section>

              {/* ÖĞRENCİ İMZALI QR KATILIM ALANI (Kayıtlı ve Katılımı Doğrulanmamışsa) */}
              {account && event.isRegistered && !event.isAttended && (
                <section
                  className="stitch-card"
                  style={{
                    padding: "2rem",
                    border: "1px solid rgba(111, 136, 255, 0.4)",
                    background: "linear-gradient(135deg, rgba(17, 31, 59, 0.95) 0%, rgba(12, 27, 54, 0.95) 100%)",
                  }}
                >
                  <div style={{ marginBottom: "1.5rem" }}>
                    <span className="stitch-badge stitch-badge-testnet" style={{ marginBottom: "0.5rem" }}>
                      Etkinlik Alanı Doğrulaması
                    </span>
                    <h3 className="font-headline-md" style={{ margin: "0.25rem 0" }}>
                      Öğrenci İmzalı QR Katılım Kodu
                    </h3>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      Kopyalama saldırılarını önlemek için QR kodunuz cüzdan imzanızla (EIP-191),
                      tek kullanımlık nonce koduyla ve 3 dakikalık geçerlilik süresiyle üretilir (Gas ücreti gerektirmez).
                    </p>
                  </div>

                  {!qrTicket ? (
                    <div>
                      <button
                        type="button"
                        className="stitch-btn-primary"
                        onClick={handleGenerateQr}
                        disabled={qrGenerating}
                      >
                        <span className="material-symbols-outlined">qr_code_scanner</span>
                        {qrGenerating
                          ? "Cüzdanınızda İmza Bekleniyor..."
                          : "İmzalı QR Katılım Kodu Oluştur"}
                      </button>
                      {qrError && (
                        <div style={{ marginTop: "1rem", color: "var(--stitch-error)", fontSize: "0.875rem" }}>
                          {qrError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                        <div
                          style={{
                            padding: "0.75rem",
                            backgroundColor: "#ffffff",
                            borderRadius: "12px",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                          }}
                        >
                          <QrSvg value={qrTicket.qrString} size={200} />
                        </div>
                        <span
                          className={`stitch-badge ${remainingSeconds <= 30 ? "stitch-badge-full" : "stitch-badge-testnet"}`}
                        >
                          {remainingSeconds > 0
                            ? `Geçerlilik: ${formatCountdown(remainingSeconds)}`
                            : "Süresi Doldu (Geçersiz)"}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div className="font-body-sm text-outline">
                          <div><strong>Katılımcı:</strong> {shortenAddress(qrTicket.participant)}</div>
                          <div><strong>Etkinlik ID:</strong> #{qrTicket.eventId}</div>
                          <div><strong>Nonce:</strong> {qrTicket.nonce}</div>
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                          <button
                            type="button"
                            className="stitch-btn-primary"
                            onClick={handleGenerateQr}
                            disabled={qrGenerating}
                            style={{ fontSize: "0.8125rem", padding: "0.5rem 0.85rem" }}
                          >
                            ↻ Yeni QR Üret
                          </button>
                          <button
                            type="button"
                            className="stitch-btn-secondary"
                            onClick={handleCopyQrString}
                            style={{ fontSize: "0.8125rem", padding: "0.5rem 0.85rem" }}
                          >
                            {copiedQr ? "Kopyalandı ✓" : "Veriyi Kopyala"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* SAĞ SÜTUN — STICKY KAYIT KARTI & ORGANİZATÖR AKSİYONLARI */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* STICKY KAYIT KARTI */}
              <div
                className="stitch-card"
                style={{
                  padding: "2rem",
                  borderRadius: "1.25rem",
                  border: "1px solid rgba(185, 195, 255, 0.3)",
                  background: "linear-gradient(145deg, #16264c 0%, #0c1b36 100%)",
                  boxShadow: "0 16px 36px rgba(0, 13, 40, 0.7)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span className="font-label-mono text-tertiary">KATILIM DURUMU</span>
                  <span className="stitch-badge stitch-badge-testnet">Ücretsiz</span>
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", marginBottom: "0.35rem" }}>
                    <span>Kontenjan Doluluğu:</span>
                    <strong style={{ color: isFull ? "var(--stitch-error)" : "var(--stitch-primary)" }}>
                      %{fillPercent} ({event.registeredCount}/{event.capacity})
                    </strong>
                  </div>
                  <div className="stitch-progress-track">
                    <div
                      className="stitch-progress-fill"
                      style={{
                        width: `${fillPercent}%`,
                        backgroundColor: isFull ? "var(--stitch-error)" : undefined,
                      }}
                    />
                  </div>
                </div>

                {/* Kullanıcı Durumu Bildirimi */}
                {!account ? (
                  <div style={{ marginBottom: "1.5rem" }}>
                    <p className="font-body-sm text-on-surface-variant">
                      Etkinliğe kayıt olmak veya biletinizi görüntülemek için cüzdanınızı bağlayın.
                    </p>
                  </div>
                ) : (
                  <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span className="text-outline">Cüzdanınız:</span>
                      <span className="font-label-mono text-primary">{shortenAddress(account)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span className="text-outline">Kayıt:</span>
                      <span>
                        {event.isRegistered ? (
                          <span className="stitch-badge stitch-badge-open">Kayıtlısınız ✓</span>
                        ) : (
                          <span className="text-outline">Kayıtlı Değil</span>
                        )}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <span className="text-outline">Katılım:</span>
                      <span>
                        {event.isAttended ? (
                          <span className="stitch-badge stitch-badge-completed">Doğrulandı ✓</span>
                        ) : (
                          <span className="text-outline">Bekleniyor</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Kayıt Aksiyon Butonu */}
                <div>
                  {event.isAttended ? (
                    <div className="stitch-card-low" style={{ padding: "0.75rem 1rem", textAlign: "center", color: "#6ee7b7" }}>
                      ✓ Katılımınız Blokzincirde Doğrulanmıştır!
                    </div>
                  ) : event.isRegistered ? (
                    <div className="stitch-card-low" style={{ padding: "0.75rem 1rem", textAlign: "center", color: "var(--stitch-primary)" }}>
                      ✓ Bu etkinliğe kaydınız tamamlandı.
                    </div>
                  ) : event.status === "cancelled" ? (
                    <button type="button" className="stitch-btn-secondary" disabled style={{ width: "100%", opacity: 0.6 }}>
                      Etkinlik İptal Edildi
                    </button>
                  ) : event.deadlinePassed || event.status === "completed" ? (
                    <button type="button" className="stitch-btn-secondary" disabled style={{ width: "100%", opacity: 0.6 }}>
                      Kayıt Süresi Sona Erdi
                    </button>
                  ) : isFull ? (
                    <button type="button" className="stitch-btn-secondary" disabled style={{ width: "100%", opacity: 0.6 }}>
                      Kontenjan Doldu
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="stitch-btn-primary"
                      onClick={() => onRegisterEvent(event.id)}
                      disabled={txState.busy || !account}
                      style={{ width: "100%", padding: "0.875rem" }}
                    >
                      {txState.type === "register" && txState.targetId === event.id
                        ? "Cüzdan / Blokzincir Onayı Bekleniyor..."
                        : "Hemen Kaydol (registerForEvent)"}
                    </button>
                  )}
                </div>

                {/* Katılım Koşulları Listesi */}
                <div style={{ marginTop: "1.5rem", borderTop: "1px solid rgba(142, 144, 161, 0.15)", paddingTop: "1rem" }}>
                  <div className="font-label-badge text-outline" style={{ marginBottom: "0.5rem" }}>
                    KATILIM GEREKSİNİMLERİ
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.8125rem" }}>
                    <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--stitch-tertiary)" }}>
                        check
                      </span>
                      MetaMask / Web3 Cüzdanı
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--stitch-tertiary)" }}>
                        check
                      </span>
                      Monad Testnet Ağı (Chain ID 10143)
                    </li>
                    <li style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--stitch-tertiary)" }}>
                        check
                      </span>
                      Fiziksel Katılımda İmzalı QR
                    </li>
                  </ul>
                </div>
              </div>

              {/* ORGANİZATÖR YÖNETİM PANELİ (Sadece Organizatöre Görünür) */}
              {isOrganizer && (
                <div
                  className="stitch-card"
                  style={{
                    padding: "1.5rem",
                    border: "1px solid rgba(208, 188, 255, 0.35)",
                    background: "linear-gradient(135deg, rgba(28, 42, 70, 0.95) 0%, rgba(17, 31, 59, 0.95) 100%)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 className="font-headline-sm" style={{ margin: 0, color: "var(--stitch-secondary)" }}>
                      Organizatör Yönetimi
                    </h3>
                    <button
                      type="button"
                      className="stitch-btn-secondary"
                      onClick={() => setEditMode((prev) => !prev)}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem" }}
                    >
                      {editMode ? "Kapat" : "✎ Düzenle"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                    <div className="stitch-card-low" style={{ padding: "0.5rem" }}>
                      <div className="font-label-mono text-outline" style={{ fontSize: "0.6875rem" }}>KAYIT</div>
                      <div className="font-headline-sm" style={{ color: "var(--stitch-primary)", fontSize: "0.875rem" }}>
                        {event.registeredCount}/{event.capacity}
                      </div>
                    </div>
                    <div className="stitch-card-low" style={{ padding: "0.5rem" }}>
                      <div className="font-label-mono text-outline" style={{ fontSize: "0.6875rem" }}>DOĞRULANAN</div>
                      <div className="font-headline-sm" style={{ color: "#6ee7b7", fontSize: "0.875rem" }}>
                        {event.verifiedAttendanceCount || 0}
                      </div>
                    </div>
                    <div className="stitch-card-low" style={{ padding: "0.5rem" }}>
                      <div className="font-label-mono text-outline" style={{ fontSize: "0.6875rem" }}>KATILIM</div>
                      <div className="font-headline-sm" style={{ color: "var(--stitch-tertiary)", fontSize: "0.875rem" }}>
                        %{attendanceRate}
                      </div>
                    </div>
                  </div>

                  {/* QR Tarayıcı Aç/Kapa */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <button
                      type="button"
                      className="stitch-btn-primary"
                      onClick={cameraActive ? stopCamera : startCameraScan}
                      style={{ width: "100%", fontSize: "0.875rem" }}
                    >
                      <span className="material-symbols-outlined">
                        {cameraActive ? "videocam_off" : "photo_camera"}
                      </span>
                      {cameraActive ? "Kamerayı Kapat" : "Kamerayla QR Doğrula"}
                    </button>

                    {cameraActive && (
                      <div style={{ marginTop: "0.5rem" }}>
                        <video ref={videoRef} style={{ width: "100%", borderRadius: "8px" }} muted playsInline />
                      </div>
                    )}
                    {cameraError && (
                      <div style={{ color: "var(--stitch-error)", fontSize: "0.75rem" }}>{cameraError}</div>
                    )}
                  </div>

                  {/* QR Verisi Yapıştırma ve 5 Aşamalı Kontrol */}
                  <div style={{ marginTop: "1rem" }}>
                    <label className="font-label-badge text-outline" htmlFor="qr-raw-input">
                      İmzalı QR JSON Verisi
                    </label>
                    <textarea
                      id="qr-raw-input"
                      rows={2}
                      className="stitch-input font-label-mono"
                      placeholder='{"v":"CP1","c":10143,...}'
                      value={qrInputRaw}
                      onChange={(e) => {
                        setQrInputRaw(e.target.value);
                        setVerificationResult(null);
                      }}
                      style={{ marginTop: "0.35rem", fontSize: "0.75rem" }}
                    />

                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className="stitch-btn-secondary"
                        onClick={() => handleVerifyQr()}
                        disabled={!qrInputRaw.trim() || verifyingQr || txState.busy}
                        style={{ flex: 1, fontSize: "0.75rem", padding: "0.4rem" }}
                      >
                        {verifyingQr ? "Denetleniyor..." : "1. İmzayı Doğrula"}
                      </button>

                      {verificationResult?.valid && (
                        <button
                          type="button"
                          className="stitch-btn-primary"
                          onClick={handleConfirmVerifiedQrAttendance}
                          disabled={txState.busy}
                          style={{ flex: 1, fontSize: "0.75rem", padding: "0.4rem" }}
                        >
                          2. Katılımı Onayla
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Doğrulama Raporu */}
                  {verificationResult && (
                    <div
                      style={{
                        marginTop: "1rem",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        backgroundColor: verificationResult.valid ? "rgba(16, 185, 129, 0.15)" : "rgba(147, 0, 10, 0.15)",
                        border: `1px solid ${verificationResult.valid ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 180, 171, 0.4)"}`,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.8125rem", color: verificationResult.valid ? "#6ee7b7" : "var(--stitch-error)" }}>
                        {verificationResult.valid ? "✓ Doğrulama Başarılı" : "✗ Doğrulama Başarısız"}
                      </div>
                      <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0 0", fontSize: "0.75rem" }}>
                        {verificationResult.checks.map((item) => (
                          <li key={item.id} style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                            <span>{item.passed ? "✓" : "✗"}</span>
                            <span>{item.label}: {item.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Manuel Adres ile Katılım İşaretleme */}
                  <details style={{ marginTop: "1rem", fontSize: "0.8125rem" }}>
                    <summary style={{ cursor: "pointer", color: "var(--stitch-outline)" }}>
                      Manuel Cüzdan Adresi ile Doğrulama
                    </summary>
                    <form onSubmit={handleManualAttendanceSubmit} style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <input
                        type="text"
                        className="stitch-input font-label-mono"
                        placeholder="0x..."
                        value={participantInput}
                        onChange={(e) => setParticipantInput(e.target.value)}
                        style={{ fontSize: "0.75rem" }}
                      />
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="stitch-btn-secondary"
                          onClick={() => handleCheckParticipant()}
                          disabled={checkingParticipant}
                          style={{ flex: 1, fontSize: "0.75rem", padding: "0.35rem" }}
                        >
                          Sorgula
                        </button>
                        <button
                          type="submit"
                          className="stitch-btn-primary"
                          disabled={txState.busy}
                          style={{ flex: 1, fontSize: "0.75rem", padding: "0.35rem" }}
                        >
                          İşaretle
                        </button>
                      </div>
                    </form>
                    {localError && <div style={{ color: "var(--stitch-error)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{localError}</div>}
                    {lookupStatus && (
                      <div className="font-label-mono" style={{ fontSize: "0.6875rem", marginTop: "0.5rem" }}>
                        <div>Kayıtlı: {lookupStatus.isRegistered ? "Evet ✓" : "Hayır ✗"}</div>
                        <div>Katıldı: {lookupStatus.isAttended ? "Evet ✓" : "Hayır ✗"}</div>
                      </div>
                    )}
                  </details>

                  {/* İptal Kontrolü */}
                  <div style={{ marginTop: "1.25rem", borderTop: "1px solid rgba(142, 144, 161, 0.2)", paddingTop: "0.75rem" }}>
                    {!event.cancelled ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input
                          type="text"
                          className="stitch-input"
                          placeholder="İptal gerekçesi"
                          value={cancelReasonInput}
                          onChange={(e) => setCancelReasonInput(e.target.value)}
                          style={{ fontSize: "0.75rem" }}
                        />
                        <button
                          type="button"
                          className="stitch-btn-secondary"
                          onClick={() => handleToggleCancelEvent(true)}
                          disabled={txState.busy}
                          style={{ color: "var(--stitch-error)", borderColor: "var(--stitch-error)", fontSize: "0.75rem", whiteSpace: "nowrap" }}
                        >
                          İptal Et
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="stitch-btn-secondary"
                        onClick={() => handleToggleCancelEvent(false)}
                        disabled={txState.busy}
                        style={{ width: "100%", fontSize: "0.75rem" }}
                      >
                        İptali Kaldır &amp; Aktifleştir
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ORGANİZATÖR METADATA DÜZENLEME MODAL / PANEL */}
        {editMode && (
          <section
            className="stitch-card"
            style={{
              padding: "2rem",
              borderRadius: "1rem",
              marginTop: "2rem",
              border: "1px solid rgba(208, 188, 255, 0.4)",
              background: "linear-gradient(135deg, rgba(17, 31, 59, 0.98) 0%, rgba(12, 27, 54, 0.98) 100%)",
            }}
          >
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 className="font-headline-md" style={{ margin: 0 }}>
                Etkinlik Metadata Bilgilerini Güncelle (İmza Doğrulamalı)
              </h3>
              <p className="font-body-sm text-on-surface-variant" style={{ margin: "0.25rem 0 0" }}>
                Yalnızca etkinlik organizatörünün cüzdan imzasıyla onaylanan değişiklikler kaydedilir.
              </p>
            </div>

            <form onSubmit={handleSaveMetadataSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-community">
                    Düzenleyen Topluluk *
                  </label>
                  <input
                    id="edit-community"
                    type="text"
                    className="stitch-input"
                    value={editCommunity}
                    onChange={(e) => setEditCommunity(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-category">
                    Kategori *
                  </label>
                  <select
                    id="edit-category"
                    className="stitch-select"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  >
                    {EVENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-date">
                    Tarih *
                  </label>
                  <input
                    id="edit-date"
                    type="date"
                    className="stitch-input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-start">
                    Başlangıç Saati *
                  </label>
                  <input
                    id="edit-start"
                    type="time"
                    className="stitch-input"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-end">
                    Bitiş Saati *
                  </label>
                  <input
                    id="edit-end"
                    type="time"
                    className="stitch-input"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-deadline">
                    Kayıt Son Tarihi *
                  </label>
                  <input
                    id="edit-deadline"
                    type="datetime-local"
                    className="stitch-input"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-campus">
                    Kampüs *
                  </label>
                  <input
                    id="edit-campus"
                    type="text"
                    className="stitch-input"
                    value={editCampus}
                    onChange={(e) => setEditCampus(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-building">
                    Bina *
                  </label>
                  <input
                    id="edit-building"
                    type="text"
                    className="stitch-input"
                    value={editBuilding}
                    onChange={(e) => setEditBuilding(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-room">
                    Salon *
                  </label>
                  <input
                    id="edit-room"
                    type="text"
                    className="stitch-input"
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="edit-poster">
                    Afiş Görsel URL
                  </label>
                  <input
                    id="edit-poster"
                    type="url"
                    className="stitch-input"
                    placeholder="https://..."
                    value={editPosterUrl.startsWith("data:") ? "" : editPosterUrl}
                    onChange={(e) => setEditPosterUrl(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleEditPosterFile}
                    style={{ marginTop: "0.25rem", fontSize: "0.75rem" }}
                  />
                </div>
              </div>

              <div>
                <label className="font-label-badge text-outline" htmlFor="edit-desc">
                  Etkinlik Açıklaması *
                </label>
                <textarea
                  id="edit-desc"
                  rows={3}
                  className="stitch-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{ marginTop: "0.25rem" }}
                />
              </div>

              {editError && (
                <div style={{ color: "var(--stitch-error)", fontSize: "0.875rem" }}>{editError}</div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={() => setEditMode(false)}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="stitch-btn-primary"
                  disabled={txState.busy}
                >
                  {txState.type === "metadata" ? "İmza Bekleniyor..." : "Cüzdan İmzasıyla Kaydet"}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
