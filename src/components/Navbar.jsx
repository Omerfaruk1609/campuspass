import {
  MONAD_CHAIN_ID,
  shortenAddress,
} from "../data/events";

export default function Navbar({
  account,
  chainId,
  activeTab,
  onSelectTab,
  onConnectWallet,
  onSwitchNetwork,
  isConnecting,
}) {
  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "rgba(3, 18, 46, 0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(142, 144, 161, 0.18)",
        boxShadow: "0 1px 12px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div
        className="stitch-container"
        style={{
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        {/* Brand / Logo */}
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", shrink: 0 }}
          onClick={() => onSelectTab("home")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelectTab("home")}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #6f88ff, #7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "0.95rem",
              color: "#ffffff",
              boxShadow: "0 0 16px rgba(111, 136, 255, 0.4)",
            }}
          >
            CP
          </div>
          <span className="font-headline-md" style={{ color: "var(--stitch-on-surface)", fontWeight: 700 }}>
            Campus<span style={{ color: "var(--stitch-primary)" }}>Pass</span>
          </span>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            backgroundColor: "rgba(17, 31, 59, 0.6)",
            padding: "0.25rem 0.4rem",
            borderRadius: "0.625rem",
            border: "1px solid rgba(142, 144, 161, 0.15)",
          }}
          className="stitch-nav-tabs"
        >
          <button
            type="button"
            className="font-headline-sm"
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "home" ? "var(--stitch-surface-container-high)" : "transparent",
              color: activeTab === "home" ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
              fontWeight: activeTab === "home" ? 600 : 500,
            }}
            onClick={() => onSelectTab("home")}
          >
            Ana Sayfa
          </button>

          <button
            type="button"
            className="font-headline-sm"
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "all" ? "var(--stitch-surface-container-high)" : "transparent",
              color: activeTab === "all" ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
              fontWeight: activeTab === "all" ? 600 : 500,
            }}
            onClick={() => onSelectTab("all")}
          >
            Etkinlikler
          </button>

          <button
            type="button"
            className="font-headline-sm"
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor:
                activeTab === "communities" ||
                activeTab === "community-profile" ||
                activeTab === "community-manage"
                  ? "var(--stitch-surface-container-high)"
                  : "transparent",
              color:
                activeTab === "communities" ||
                activeTab === "community-profile" ||
                activeTab === "community-manage"
                  ? "var(--stitch-primary)"
                  : "var(--stitch-on-surface-variant)",
              fontWeight:
                activeTab === "communities" ||
                activeTab === "community-profile" ||
                activeTab === "community-manage"
                  ? 600
                  : 500,
            }}
            onClick={() => onSelectTab("communities")}
          >
            Topluluklar
          </button>

          <button
            type="button"
            className="font-headline-sm"
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "student" ? "var(--stitch-surface-container-high)" : "transparent",
              color: activeTab === "student" ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
              fontWeight: activeTab === "student" ? 600 : 500,
            }}
            onClick={() => onSelectTab("student")}
          >
            Öğrenci Panelim
          </button>

          <button
            type="button"
            className="font-headline-sm"
            style={{
              padding: "0.35rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "verify" ? "var(--stitch-surface-container-high)" : "transparent",
              color: activeTab === "verify" ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
              fontWeight: activeTab === "verify" ? 600 : 500,
            }}
            onClick={() => onSelectTab("verify")}
          >
            Sertifika Doğrula
          </button>

          <button
            type="button"
            className="font-label-badge"
            style={{
              marginLeft: "0.25rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeTab === "organizer" ? "var(--stitch-secondary-container)" : "var(--stitch-surface-container-high)",
              color: activeTab === "organizer" ? "var(--stitch-on-secondary-container)" : "var(--stitch-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
            onClick={() => onSelectTab("organizer")}
          >
            Organizatör Paneli
          </button>
        </nav>

        {/* Right Controls: Network pill, Contract link, Wallet connect */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", shrink: 0 }}>
          {/* Monad Testnet Pill */}
          <div
            className="font-label-mono"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "9999px",
              backgroundColor: "var(--stitch-surface-container-high)",
              color: "var(--stitch-tertiary)",
              border: "1px solid rgba(123, 208, 255, 0.25)",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "var(--stitch-tertiary)",
                boxShadow: "0 0 8px rgba(123, 208, 255, 0.8)",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: "0.78rem" }}>Monad Testnet</span>
          </div>

          {/* Network Switch Button if wrong network */}
          {account && !isCorrectNetwork && (
            <button
              type="button"
              className="stitch-btn-secondary"
              style={{
                padding: "0.4rem 0.75rem",
                fontSize: "0.82rem",
                borderColor: "#f59e0b",
                color: "#fcd34d",
              }}
              onClick={onSwitchNetwork}
            >
              Ağı Değiştir (10143)
            </button>
          )}

          {/* Connected Wallet Pill or Connect Button */}
          {account ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.3rem 0.75rem 0.3rem 0.4rem",
                borderRadius: "9999px",
                backgroundColor: "var(--stitch-surface-container)",
                border: "1px solid rgba(185, 195, 255, 0.2)",
                cursor: "pointer",
              }}
              onClick={() => onSelectTab("student")}
              title={`Bağlı Cüzdan: ${account} (Öğrenci Profiline Git)`}
            >
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {account.slice(2, 4).toUpperCase()}
              </div>
              <span className="font-label-mono" style={{ color: "var(--stitch-on-surface)", fontSize: "0.82rem" }}>
                {shortenAddress(account)}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="stitch-btn-primary"
              style={{ padding: "0.45rem 1rem", fontSize: "0.88rem" }}
              onClick={onConnectWallet}
              disabled={isConnecting}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>account_balance_wallet</span>
              <span>{isConnecting ? "Bağlanıyor..." : "Cüzdan Bağla"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
