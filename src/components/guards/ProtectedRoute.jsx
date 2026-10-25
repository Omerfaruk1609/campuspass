import { useAppContext } from "../../context/AppContext";

export default function ProtectedRoute({ children }) {
  const { account, sessionState, isConnecting, handleConnectWallet } = useAppContext();

  // Oturum durumu sunucudan yüklenirken erken yönlendirme yapma
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
            Oturum ve yetki durumu kontrol ediliyor...
          </p>
        </div>
      </div>
    );
  }

  // Cüzdan bağlı değilse veya yetkisizse giriş/cüzdan bağlantısı ekranını göster
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
                backgroundColor: "rgba(111, 136, 255, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-primary)",
                marginBottom: "1.5rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "32px" }}>
                account_balance_wallet
              </span>
            </div>
            <h2 className="font-headline-lg" style={{ margin: "0 0 0.5rem 0", color: "var(--stitch-on-surface)" }}>
              Cüzdan Bağlantısı Gerekli
            </h2>
            <p
              className="font-body-md text-on-surface-variant"
              style={{ maxWidth: "480px", margin: "0 auto 2rem auto", lineHeight: 1.6 }}
            >
              Bu sayfaya erişebilmek ve işlem yapabilmek için lütfen Web3 cüzdanınızı bağlayın.
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
              <span>{isConnecting ? "Cüzdan Bağlanıyor..." : "Cüzdanı Bağla"}</span>
            </button>
          </section>
        </div>
      </div>
    );
  }

  return children;
}
