import { useState } from "react";
import {
  buildCertificateSvgMarkup,
  buildVerificationUrl,
  downloadCertificatePdf,
  openCertificatePrintWindow,
} from "../utils/certificatePdf.js";

export default function CertificateModal({
  certificate,
  onClose,
  onOpenVerifyPage,
}) {
  const [copyFeedback, setCopyFeedback] = useState("");

  if (!certificate) return null;

  const svgMarkup = buildCertificateSvgMarkup(certificate);
  const verificationUrl = buildVerificationUrl(certificate.certificateId);

  const handleCopyVerifyUrl = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(verificationUrl);
        setCopyFeedback("Doğrulama bağlantısı panoya kopyalandı!");
        setTimeout(() => setCopyFeedback(""), 2800);
      }
    } catch {
      setCopyFeedback(verificationUrl);
    }
  };

  const handleDownloadPdf = () => {
    downloadCertificatePdf(certificate);
  };

  const handlePrintPdf = () => {
    openCertificatePrintWindow(certificate);
  };

  return (
    <div
      className="cert-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cert-modal-title"
      onClick={onClose}
    >
      <div
        className="cert-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cert-modal-header">
          <div>
            <span className="cert-modal-eyebrow">
              🎓 CampusPass Blokzincir Doğrulamalı Belge
            </span>
            <h3 id="cert-modal-title" className="cert-modal-title">
              {certificate.eventTitle} — Dijital Katılım Sertifikası
            </h3>
          </div>
          <button
            type="button"
            className="cert-modal-close-btn"
            onClick={onClose}
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Yatay A4 Sertifika Önizleme Alanı */}
        <div className="cert-preview-stage">
          <div
            className="cert-svg-wrapper"
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        </div>

        {copyFeedback && (
          <div className="cert-copy-toast">{copyFeedback}</div>
        )}

        {/* Eylem Düğmeleri ve Doğrulama Bilgisi */}
        <div className="cert-modal-footer">
          <div className="cert-modal-meta">
            <span className="cert-id-pill">
              ID: <code>{certificate.certificateId}</code>
            </span>
            {certificate.explorerTxUrl && (
              <a
                href={certificate.explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="cert-explorer-link"
              >
                ⛓️ Monad Explorer Kanıtı ↗
              </a>
            )}
          </div>

          <div className="cert-modal-actions">
            <button
              type="button"
              className="cert-action-btn cert-btn-primary"
              onClick={handleDownloadPdf}
            >
              📥 PDF İndir (A4 Yatay)
            </button>
            <button
              type="button"
              className="cert-action-btn cert-btn-secondary"
              onClick={handlePrintPdf}
            >
              🖨️ Yüksek Çözünürlüklü Yazdır
            </button>
            <button
              type="button"
              className="cert-action-btn cert-btn-outline"
              onClick={handleCopyVerifyUrl}
            >
              🔗 Doğrulama Bağlantısını Kopyala
            </button>
            {onOpenVerifyPage && (
              <button
                type="button"
                className="cert-action-btn cert-btn-verify"
                onClick={() => {
                  onClose();
                  onOpenVerifyPage(certificate.certificateId);
                }}
              >
                🔍 Doğrulama Sayfasını Aç
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
