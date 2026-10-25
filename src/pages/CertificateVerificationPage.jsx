import { useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { CONTRACT_ADDRESS, MONAD_CHAIN_ID, MONAD_EXPLORER_URL } from "../data/events.js";
import { fetchCertificateVerificationFromBackend } from "../utils/apiClient.js";
import {
  buildCertificateSvgMarkup,
  buildVerificationUrl,
  downloadCertificatePdf,
} from "../utils/certificatePdf.js";
import { formatTurkeyDateTime } from "../utils/eventMetadata.js";

const STATUS_META = {
  VERIFIED: {
    label: "Doğrulandı",
    badgeClass: "verify-badge-verified",
    icon: "✅",
    summary:
      "Bu katılım sertifikası CampusPass veritabanı, kriptografik bütünlük mührü ve Monad Testnet üzerindeki canlı akıllı sözleşme üzerinden doğrulandı.",
  },
  NOT_FOUND: {
    label: "Bulunamadı",
    badgeClass: "verify-badge-notfound",
    icon: "🔎",
    summary:
      "Belirtilen sertifika kimliğiyle eşleşen bir kayıt CampusPass sisteminde bulunamadı.",
  },
  INVALID: {
    label: "Geçersiz",
    badgeClass: "verify-badge-invalid",
    icon: "⛔",
    summary:
      "Bu sertifika kaydı bütünlük kontrolünden geçemedi, iptal edildi veya blokzincir üzerindeki katılım kanıtı geçersizleşti.",
  },
  UNVERIFIABLE_NOW: {
    label: "Doğrulama şu anda yapılamıyor",
    badgeClass: "verify-badge-unverifiable",
    icon: "⚠️",
    summary:
      "Blokzincir düğümüne (RPC) veya indeksleyiciye şu anda ulaşılamadığı için canlı zincir doğrulaması tamamlanamadı. Sertifika geçersiz sayılmamıştır.",
  },
};

export default function CertificateVerificationPage({
  initialCertificateId = "",
  onBackToEvents,
}) {
  const navigate = useNavigate();
  const params = useParams();
  const effectiveId = params.certificateId || initialCertificateId || "";
  const [inputCertId, setInputCertId] = useState(
    String(effectiveId || "").trim().toUpperCase()
  );
  const [activeCertId, setActiveCertId] = useState(
    String(effectiveId || "").trim().toUpperCase()
  );
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formatError, setFormatError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const runVerification = useCallback(async (targetId) => {
    const cleanId = String(targetId || "").trim().toUpperCase();
    if (!cleanId) {
      setVerificationResult(null);
      setFormatError("");
      return;
    }

    if (!/^CP-CERT-[0-9A-F]{32}$/i.test(cleanId)) {
      setVerificationResult({
        certificateId: cleanId,
        verified: false,
        verificationStatus: "INVALID",
        verificationLabel: "Geçersiz",
        reasonCode: "INVALID_CERTIFICATE_ID_FORMAT",
        reasonMessage:
          "Sertifika kimliği formatı geçersiz. Geçerli bir CampusPass sertifika kimliği CP-CERT- ile başlamalı ve 32 karakterlik onaltılık (hex) kod içermelidir.",
        verifiedAt: new Date().toISOString(),
        certificate: null,
        verificationSources: null,
      });
      setFormatError("");
      return;
    }

    setLoading(true);
    setFormatError("");
    try {
      const data = await fetchCertificateVerificationFromBackend(cleanId);
      setVerificationResult(data);
    } catch (err) {
      // Backend veya ağ erişilemezse sertifikayı ASLA "Geçersiz" olarak işaretleme!
      // "Doğrulama şu anda yapılamıyor" (UNVERIFIABLE_NOW) durumunu göster.
      if (err.code === "INVALID_CERTIFICATE_ID" || err.status === 400) {
        setVerificationResult({
          certificateId: cleanId,
          verified: false,
          verificationStatus: "INVALID",
          verificationLabel: "Geçersiz",
          reasonCode: "INVALID_CERTIFICATE_ID",
          reasonMessage: err.message,
          verifiedAt: new Date().toISOString(),
          certificate: null,
          verificationSources: null,
        });
      } else {
        setVerificationResult({
          certificateId: cleanId,
          verified: false,
          verificationStatus: "UNVERIFIABLE_NOW",
          verificationLabel: "Doğrulama şu anda yapılamıyor",
          reasonCode: err.code || "BACKEND_OR_RPC_UNREACHABLE",
          reasonMessage:
            err.message ||
            "Doğrulama sunucusuna veya Monad Testnet RPC düğümüne şu anda erişilemiyor. Lütfen kısa süre sonra tekrar deneyin.",
          verifiedAt: new Date().toISOString(),
          certificate: null,
          verificationSources: null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const normalized = String(effectiveId || "").trim().toUpperCase();
    if (normalized) {
      runVerification(normalized);
    } else {
      setVerificationResult(null);
    }
  }, [effectiveId, runVerification]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputCertId.trim().toUpperCase();
    if (!trimmed) {
      setFormatError("Lütfen doğrulamak istediğiniz sertifika kimliğini (CP-CERT-...) girin.");
      return;
    }
    setActiveCertId(trimmed);
    navigate(`/verify/${encodeURIComponent(trimmed)}`);
    runVerification(trimmed);
  };

  const handleCopyLink = async () => {
    if (!activeCertId) return;
    const url = buildVerificationUrl(activeCertId);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopyMessage("Doğrulama bağlantısı kopyalandı!");
        setTimeout(() => setCopyMessage(""), 2500);
      }
    } catch {
      setCopyMessage(url);
    }
  };

  const currentStatusKey =
    verificationResult?.verificationStatus || "NOT_FOUND";
  const statusMeta = STATUS_META[currentStatusKey] || STATUS_META.NOT_FOUND;
  const cert = verificationResult?.certificate || null;
  const sources = verificationResult?.verificationSources || null;

  return (
    <section className="verify-page-container">
      <div className="verify-hero-card">
        <div className="verify-hero-top">
          <div>
            <span className="verify-eyebrow">
              🛡️ Herkese Açık Kriptografik Doğrulama Portalı • Cüzdan Bağlantısı Gerektirmez
            </span>
            <h2 className="verify-page-title">
              Dijital Katılım Sertifikası Doğrulama
            </h2>
            <p className="verify-page-subtitle">
              Sertifika üzerindeki QR kodu taratarak veya <code>CP-CERT-...</code> kimliğini
              girerek belgenin PostgreSQL bütünlük mührünü ve Monad Testnet üzerindeki{" "}
              <code>CampusPass.sol</code> katılım kaydını bağımsız olarak doğrulayın.
            </p>
          </div>
          {onBackToEvents && (
            <button
              type="button"
              className="verify-back-btn"
              onClick={onBackToEvents || (() => navigate("/events"))}
            >
              ← Etkinliklere Dön
            </button>
          )}
        </div>

        <form className="verify-search-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="verify-search-input"
            value={inputCertId}
            onChange={(e) => setInputCertId(e.target.value)}
            placeholder="Örn: CP-CERT-8F4A2C91E0B37D65123498ABCDEF0123"
            aria-label="Sertifika Kimliği (Certificate ID)"
          />
          <button
            type="submit"
            className="verify-search-btn"
            disabled={loading}
          >
            {loading ? "Doğrulanıyor..." : "🔍 Sertifikayı Doğrula"}
          </button>
        </form>
        {formatError && <p className="verify-form-error">{formatError}</p>}
      </div>

      {loading && (
        <div className="verify-loading-box">
          <div className="verify-spinner" />
          <p>
            Sertifika kaydı, SHA-256 bütünlük mührü ve Monad Testnet akıllı sözleşmesi
            kontrol ediliyor...
          </p>
        </div>
      )}

      {!loading && verificationResult && (
        <div className="verify-result-wrapper">
          {/* 4 Durumlu Ana Doğrulama Banner'ı */}
          <div className={`verify-status-banner ${statusMeta.badgeClass}`}>
            <div className="verify-status-header">
              <span className="verify-status-icon">{statusMeta.icon}</span>
              <div>
                <div className="verify-status-label-row">
                  <span className="verify-status-pill">
                    {verificationResult.verificationLabel || statusMeta.label}
                  </span>
                  <span className="verify-status-code">
                    Kod: <code>{verificationResult.reasonCode}</code>
                  </span>
                </div>
                <p className="verify-status-message">
                  {verificationResult.reasonMessage || statusMeta.summary}
                </p>
              </div>
            </div>

            {activeCertId && (
              <div className="verify-status-actions">
                <button
                  type="button"
                  className="verify-copy-btn"
                  onClick={handleCopyLink}
                >
                  🔗 Bağlantıyı Kopyala
                </button>
                {verificationResult.verificationStatus === "UNVERIFIABLE_NOW" && (
                  <button
                    type="button"
                    className="verify-retry-btn"
                    onClick={() => runVerification(activeCertId)}
                  >
                    🔄 Tekrar Dene
                  </button>
                )}
                {verificationResult.verified && cert && (
                  <button
                    type="button"
                    className="verify-download-btn"
                    onClick={() => downloadCertificatePdf(cert)}
                  >
                    📥 PDF İndir
                  </button>
                )}
              </div>
            )}
          </div>

          {copyMessage && (
            <div className="verify-copy-feedback">{copyMessage}</div>
          )}

          {/* 4 Katmanlı Doğrulama Kaynakları Kontrol Listesi */}
          {sources && (
            <div className="verify-sources-grid">
              <div
                className={`verify-source-card ${sources.databaseRecord?.passed ? "source-pass" : "source-fail"}`}
              >
                <div className="verify-source-title">
                  <span>{sources.databaseRecord?.passed ? "✓" : "✕"}</span>
                  <strong>1. Sertifika Kaydı</strong>
                </div>
                <p>{sources.databaseRecord?.detail}</p>
              </div>

              <div
                className={`verify-source-card ${sources.cryptographicIntegrity?.passed ? "source-pass" : "source-fail"}`}
              >
                <div className="verify-source-title">
                  <span>{sources.cryptographicIntegrity?.passed ? "✓" : "✕"}</span>
                  <strong>2. Kriptografik Bütünlük (CP-CERT-V1)</strong>
                </div>
                <p>{sources.cryptographicIntegrity?.detail}</p>
              </div>

              <div
                className={`verify-source-card ${sources.indexedAttendanceLog?.passed ? "source-pass" : "source-fail"}`}
              >
                <div className="verify-source-title">
                  <span>{sources.indexedAttendanceLog?.passed ? "✓" : "✕"}</span>
                  <strong>3. İndekslenmiş Blokzincir Logu</strong>
                </div>
                <p>{sources.indexedAttendanceLog?.detail}</p>
              </div>

              <div
                className={`verify-source-card ${sources.liveBlockchainContract?.passed ? "source-pass" : "source-fail"}`}
              >
                <div className="verify-source-title">
                  <span>{sources.liveBlockchainContract?.passed ? "✓" : "✕"}</span>
                  <strong>4. Canlı Monad Testnet Sözleşmesi</strong>
                </div>
                <p>{sources.liveBlockchainContract?.detail}</p>
              </div>
            </div>
          )}

          {/* Sertifika Detayları ve Blokzincir Kanıt Tablosu */}
          {cert && (
            <div className="verify-details-card">
              <h3 className="verify-section-heading">
                📋 Sertifika ve Blokzincir Kanıt Detayları
              </h3>

              <div className="verify-detail-grid">
                <div className="verify-detail-item">
                  <span className="verify-detail-label">Doğrulama Durumu</span>
                  <span className="verify-detail-value">
                    <strong>{verificationResult.verificationLabel}</strong> (
                    <code>{verificationResult.verificationStatus}</code>)
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Sertifika Kimliği</span>
                  <span className="verify-detail-value">
                    <code>{cert.certificateId}</code>
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Etkinlik Başlığı</span>
                  <span className="verify-detail-value">
                    <strong>{cert.eventTitle}</strong> (Etkinlik #{cert.eventId})
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Düzenleyen Topluluk / Kategori</span>
                  <span className="verify-detail-value">
                    {cert.community || "Kampüs Topluluğu"} • {cert.category || "Etkinlik"}
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">
                    Katılımcı Cüzdan Adresi (Birincil Kimlik)
                  </span>
                  <span className="verify-detail-value">
                    <code>{cert.participantAddress}</code>
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Organizatör Cüzdan Adresi</span>
                  <span className="verify-detail-value">
                    <code>{cert.organizerAddress}</code>
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Sertifika Veriliş Tarihi</span>
                  <span className="verify-detail-value">
                    {formatTurkeyDateTime(cert.issuedAt)} (TSİ)
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Blokzincir Ağı ve Sözleşme</span>
                  <span className="verify-detail-value">
                    Monad Testnet (Chain ID: {cert.chainId || MONAD_CHAIN_ID}) •{" "}
                    <a
                      href={
                        cert.explorerContractUrl ||
                        `${MONAD_EXPLORER_URL}/address/${CONTRACT_ADDRESS}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="verify-ext-link"
                    >
                      <code>{cert.contractAddress || CONTRACT_ADDRESS}</code> ↗
                    </a>
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">
                    Katılım İşlem Özeti (AttendanceMarked Tx)
                  </span>
                  <span className="verify-detail-value">
                    <a
                      href={
                        cert.explorerTxUrl ||
                        `${MONAD_EXPLORER_URL}/tx/${cert.attendanceTxHash}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="verify-ext-link"
                    >
                      <code>{cert.attendanceTxHash}</code> ↗
                    </a>
                  </span>
                </div>

                <div className="verify-detail-item">
                  <span className="verify-detail-label">Blok Numarası ve Log İndeksi</span>
                  <span className="verify-detail-value">
                    Blok #{cert.attendanceBlockNumber} • Log #{cert.attendanceLogIndex}
                  </span>
                </div>

                <div className="verify-detail-item verify-detail-full">
                  <span className="verify-detail-label">
                    Kanonik Bütünlük Özeti (SHA-256 Certificate Hash)
                  </span>
                  <span className="verify-detail-value">
                    <code>{cert.certificateHash}</code>
                  </span>
                </div>
              </div>

              <div className="verify-disclaimer-box">
                <strong>Resmî Belge Niteliği Uyarısı:</strong>{" "}
                {cert.disclaimer ||
                  "Bu belge resmî bir üniversite diploması veya akademik yeterlilik belgesi değildir; yalnızca belirtilen cüzdan adresinin Monad Testnet üzerindeki CampusPass akıllı sözleşmesinde doğrulanmış etkinlik katılımını temsil eder."}
              </div>
            </div>
          )}

          {/* Doğrulanmış Sertifikanın Canlı Yatay A4 Görsel Önizlemesi */}
          {verificationResult.verified && cert && (
            <div className="verify-certificate-preview-section">
              <h3 className="verify-section-heading">
                🎓 Doğrulanmış Sertifika Belge Önizlemesi (A4 Yatay)
              </h3>
              <div
                className="verify-svg-preview-box"
                dangerouslySetInnerHTML={{
                  __html: buildCertificateSvgMarkup(cert),
                }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
