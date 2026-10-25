import { Link } from "react-router-dom";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  shortenAddress,
} from "../data/events";

export default function Footer({ onSelectTab }) {
  return (
    <footer
      style={{
        width: "100%",
        backgroundColor: "var(--stitch-surface-container-lowest)",
        marginTop: "3rem",
        borderTop: "1px solid rgba(142, 144, 161, 0.15)",
        boxShadow: "0 -1px 12px rgba(0, 0, 0, 0.4)",
      }}
    >
      <div className="stitch-container" style={{ paddingTop: "2.5rem", paddingBottom: "1.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "2rem",
            paddingBottom: "2rem",
          }}
        >
          {/* Col 1: Brand & Academic Web3 Infrastructure */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Link
              to="/"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", textDecoration: "none" }}
              onClick={() => onSelectTab && onSelectTab("all")}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #6f88ff, #7c3aed)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "0.85rem",
                  color: "#fff",
                }}
              >
                CP
              </div>
              <span className="font-headline-md" style={{ color: "var(--stitch-on-surface)" }}>
                Campus<span style={{ color: "var(--stitch-primary)" }}>Pass</span>
              </span>
            </Link>

            <p className="font-body-sm" style={{ color: "var(--stitch-on-surface-variant)", lineHeight: 1.6 }}>
              Üniversite kulüpleri, kampüs etkinlikleri ve blokzincir tabanlı katılım ekosistemi.
              Monad Testnet üzerinde doğrulanabilir katılım sertifikaları ile başarılarınızı kalıcı kılın.
            </p>

            <div
              className="font-label-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                color: "var(--stitch-tertiary)",
                marginTop: "0.25rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>verified</span>
              <span>Akademik Web3 Altyapısı</span>
            </div>
          </div>

          {/* Col 2: Hızlı Erişim */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h4 className="font-headline-sm" style={{ color: "var(--stitch-on-surface)", marginBottom: "0.25rem" }}>
              Hızlı Erişim
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <Link
                to="/events"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
                onClick={() => onSelectTab && onSelectTab("all")}
              >
                Etkinlikleri Keşfet
              </Link>
              <Link
                to="/profile"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
                onClick={() => onSelectTab && onSelectTab("student")}
              >
                Öğrenci Profilim
              </Link>
              <Link
                to="/organizer"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
                onClick={() => onSelectTab && onSelectTab("organizer")}
              >
                Organizatör Paneli
              </Link>
              <Link
                to="/verify"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
                onClick={() => onSelectTab && onSelectTab("verify")}
              >
                Sertifika Doğrula
              </Link>
            </div>
          </div>

          {/* Col 3: Kampüs Toplulukları */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h4 className="font-headline-sm" style={{ color: "var(--stitch-on-surface)", marginBottom: "0.25rem" }}>
              Topluluklar
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <Link
                to="/communities"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
              >
                İTÜ Blockchain Kulübü
              </Link>
              <Link
                to="/communities"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
              >
                ODTÜ Yapay Zeka Topluluğu
              </Link>
              <Link
                to="/communities"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
              >
                YTÜ Yazılım Geliştiricileri
              </Link>
              <Link
                to="/communities"
                className="font-body-sm"
                style={{ color: "var(--stitch-on-surface-variant)", textDecoration: "none" }}
              >
                Boğaziçi Tasarım &amp; İnovasyon
              </Link>
            </div>
          </div>

          {/* Col 4: Web3 & Güven */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h4 className="font-headline-sm" style={{ color: "var(--stitch-on-surface)", marginBottom: "0.25rem" }}>
              Web3 &amp; Güven
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <a
                href={`${MONAD_EXPLORER_URL}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="font-body-sm"
                style={{ color: "var(--stitch-primary)", textDecoration: "none" }}
              >
                Sözleşme: {shortenAddress(CONTRACT_ADDRESS)} ↗
              </a>
              <span className="font-body-sm" style={{ color: "var(--stitch-on-surface-variant)" }}>
                Ağ: Monad Testnet ({MONAD_CHAIN_ID})
              </span>
              <span className="font-body-sm" style={{ color: "var(--stitch-on-surface-variant)" }}>
                Doğrulama: EIP-191 İmzalı QR
              </span>
              <span className="font-body-sm" style={{ color: "var(--stitch-on-surface-variant)" }}>
                Güvenlik: SIWE (EIP-4361)
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            paddingTop: "1.25rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
          className="font-body-sm"
        >
          <p style={{ color: "var(--stitch-outline)", margin: 0 }}>
            © 2025–2026 CampusPass. Kampüs etkinlikleri ve blokzincir tabanlı katılım ekosistemi.
          </p>

          <div
            className="font-label-mono"
            style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--stitch-outline)" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "var(--stitch-tertiary)",
                  display: "inline-block",
                }}
              />
              Monad Testnet Aktif
            </span>
            <span>v2.4.0-testnet</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
