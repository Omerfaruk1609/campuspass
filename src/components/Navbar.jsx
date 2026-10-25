import { Link, NavLink } from "react-router-dom";
import { MONAD_CHAIN_ID, shortenAddress } from "../data/events";

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
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            shrink: 0,
            textDecoration: "none",
          }}
          onClick={() => onSelectTab && onSelectTab("home")}
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
        </Link>

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
          <NavLink
            to="/"
            end
            className="font-headline-sm"
            style={({ isActive }) => {
              const active = isActive || activeTab === "home";
              return {
                padding: "0.35rem 0.85rem",
                borderRadius: "0.5rem",
                border: "none",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: active ? "var(--stitch-surface-container-high)" : "transparent",
                color: active ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
                fontWeight: active ? 600 : 500,
              };
            }}
            onClick={() => onSelectTab && onSelectTab("home")}
          >
            Ana Sayfa
          </NavLink>

          <NavLink
            to="/events"
            className="font-headline-sm"
            style={({ isActive }) => {
              const active = isActive || activeTab === "all";
              return {
                padding: "0.35rem 0.85rem",
                borderRadius: "0.5rem",
                border: "none",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: active ? "var(--stitch-surface-container-high)" : "transparent",
                color: active ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
                fontWeight: active ? 600 : 500,
              };
            }}
            onClick={() => onSelectTab && onSelectTab("all")}
          >
            Etkinlikler
          </NavLink>

          <NavLink
            to="/communities"
            className="font-headline-sm"
            style={({ isActive }) => {
              const active =
                isActive ||
                activeTab === "communities" ||
                activeTab === "community-profile" ||
                activeTab === "community-manage";
              return {
                padding: "0.35rem 0.85rem",
                borderRadius: "0.5rem",
                border: "none",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: active ? "var(--stitch-surface-container-high)" : "transparent",
                color: active ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
                fontWeight: active ? 600 : 500,
              };
            }}
            onClick={() => onSelectTab && onSelectTab("communities")}
          >
            Topluluklar
          </NavLink>

          <NavLink
            to="/profile"
            className="font-headline-sm"
            style={({ isActive }) => {
              const active = isActive || activeTab === "student";
              return {
                padding: "0.35rem 0.85rem",
                borderRadius: "0.5rem",
                border: "none",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: active ? "var(--stitch-surface-container-high)" : "transparent",
                color: active ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
                fontWeight: active ? 600 : 500,
              };
            }}
            onClick={() => onSelectTab && onSelectTab("student")}
          >
            Öğrenci Panelim
          </NavLink>

          <NavLink
            to="/verify"
            className="font-headline-sm"
            style={({ isActive }) => {
              const active = isActive || activeTab === "verify";
              return {
                padding: "0.35rem 0.85rem",
                borderRadius: "0.5rem",
                border: "none",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: active ? "var(--stitch-surface-container-high)" : "transparent",
                color: active ? "var(--stitch-primary)" : "var(--stitch-on-surface-variant)",
                fontWeight: active ? 600 : 500,
              };
            }}
            onClick={() => onSelectTab && onSelectTab("verify")}
          >
            Sertifika Doğrula
          </NavLink>

          <NavLink
            to="/organizer"
            className="font-label-badge"
            style={({ isActive }) => {
              const active = isActive || activeTab === "organizer";
              return {
                marginLeft: "0.25rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "0.5rem",
                border: "none",
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: active
                  ? "var(--stitch-secondary-container)"
                  : "var(--stitch-surface-container-high)",
                color: active
                  ? "var(--stitch-on-secondary-container)"
                  : "var(--stitch-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              };
            }}
            onClick={() => onSelectTab && onSelectTab("organizer")}
          >
            Organizatör Paneli
          </NavLink>
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
            <Link
              to="/profile"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.3rem 0.75rem 0.3rem 0.4rem",
                borderRadius: "9999px",
                backgroundColor: "var(--stitch-surface-container)",
                border: "1px solid rgba(185, 195, 255, 0.2)",
                cursor: "pointer",
                textDecoration: "none",
              }}
              onClick={() => onSelectTab && onSelectTab("student")}
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
            </Link>
          ) : (
            <button
              type="button"
              className="stitch-btn-primary"
              style={{ padding: "0.45rem 1rem", fontSize: "0.88rem" }}
              onClick={onConnectWallet}
              disabled={isConnecting}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                account_balance_wallet
              </span>
              <span>{isConnecting ? "Bağlanıyor..." : "Cüzdan Bağla"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
