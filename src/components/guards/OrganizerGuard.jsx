import { Link, useParams } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";

export default function OrganizerGuard({ children, requireEventOrganizer = false }) {
  const { account, sessionState, isConnecting, handleConnectWallet, events, loadingEvents } =
    useAppContext();
  const { eventId } = useParams();

  // Oturum durumu kontrol ediliyor
  if (sessionState.loading) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "5rem 1rem", textAlign: "center" }}>
        <div className="stitch-container">
          <span
            className="material-symbols-outlined pulse-glow"
            style={{ fontSize: "40px", color: "var(--stitch-primary)" }}
          >
            sync
          </span>
          <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
            Organizatör oturumu kontrol ediliyor...
          </p>
        </div>
      </div>
    );
  }

  // Cüzdan bağlı değil
  if (!account) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container">
          <section
            className="stitch-card"
            style={{
              padding: "4rem 2rem",
              textAlign: "center",
              borderRadius: "1.5rem",
              background:
                "linear-gradient(135deg, rgba(17, 31, 59, 0.95) 0%, rgba(3, 18, 46, 0.95) 100%)",
              border: "1px solid rgba(142, 144, 161, 0.2)",
              maxWidth: "600px",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(208, 188, 255, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-secondary)",
                marginBottom: "1.5rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "32px" }}>
                shield_person
              </span>
            </div>
            <span className="stitch-badge stitch-badge-testnet" style={{ marginBottom: "0.75rem" }}>
              Organizatör Paneli
            </span>
            <h2 className="font-headline-lg" style={{ margin: "0.5rem 0", color: "var(--stitch-on-surface)" }}>
              Organizatör Cüzdan Bağlantısı Gerekli
            </h2>
            <p
              className="font-body-md text-on-surface-variant"
              style={{ maxWidth: "480px", margin: "0 auto 2rem auto", lineHeight: 1.6 }}
            >
              Etkinliklerinizi yönetmek, katılım analitiğini görüntülemek ve yoklama almak için organizatör cüzdanınızı bağlayın.
            </p>
            <button
              type="button"
              className="stitch-btn-primary"
              onClick={handleConnectWallet}
              disabled={isConnecting}
              style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                account_balance_wallet
              </span>
              <span>{isConnecting ? "Cüzdan Bağlanıyor..." : "Organizatör Cüzdanını Bağla"}</span>
            </button>
          </section>
        </div>
      </div>
    );
  }

  // Belirli bir etkinlik analitiğine giriliyorsa organizatör sahipliğini kontrol et
  if (requireEventOrganizer && eventId) {
    if (loadingEvents) {
      return (
        <div className="stitch-shell page-container" style={{ padding: "5rem 1rem", textAlign: "center" }}>
          <div className="stitch-container">
            <span
              className="material-symbols-outlined pulse-glow"
              style={{ fontSize: "40px", color: "var(--stitch-primary)" }}
            >
              sync
            </span>
            <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
              Etkinlik sahipliği doğrulanıyor...
            </p>
          </div>
        </div>
      );
    }

    const targetEvent = events.find((e) => e.id === Number(eventId));
    if (targetEvent && targetEvent.organizer) {
      const isOwner = targetEvent.organizer.toLowerCase() === account.toLowerCase();
      if (!isOwner) {
        return (
          <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
            <div className="stitch-container" style={{ maxWidth: "600px", margin: "0 auto" }}>
              <div
                className="stitch-card"
                style={{
                  padding: "3.5rem 2rem",
                  textAlign: "center",
                  borderRadius: "1.5rem",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "16px",
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--stitch-error)",
                    marginBottom: "1.5rem",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "32px" }}>
                    block
                  </span>
                </div>
                <h2 className="font-headline-lg" style={{ color: "var(--stitch-error)", margin: "0 0 0.5rem 0" }}>
                  Yetkisiz Erişim (403 Forbidden)
                </h2>
                <p className="font-body-md text-on-surface-variant" style={{ marginBottom: "2rem" }}>
                  Etkinlik #{eventId} analitiği ve katılımcı listesini yalnızca bu etkinliğin blokzincir üzerindeki organizatörü görüntüleyebilir.
                </p>
                <Link to="/organizer" className="stitch-btn-secondary" style={{ textDecoration: "none" }}>
                  ← Organizatör Paneline Dön
                </Link>
              </div>
            </div>
          </div>
        );
      }
    }
  }

  return children;
}
