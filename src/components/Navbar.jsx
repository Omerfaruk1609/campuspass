import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { MONAD_CHAIN_ID, shortenAddress } from "../data/events";
import { ensureSiweSession } from "../utils/apiClient";

export default function Navbar({
  account,
  chainId,
  activeTab,
  onSelectTab,
  onConnectWallet,
  onSwitchNetwork,
  isConnecting,
  sessionState = null,
  onLogout = null,
  onDisconnectWallet = null,
}) {
  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [siweLoading, setSiweLoading] = useState(false);
  const menuRef = useRef(null);

  // Dışarı tıklama durumunda menüyü kapat
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [accountMenuOpen]);

  async function handleCopyAddress() {
    if (!account) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(account);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // kopyalama hatası
    }
  }

  async function handleQuickSiweLogin() {
    if (!account) return;
    setSiweLoading(true);
    try {
      await ensureSiweSession(account);
      window.location.reload();
    } catch {
      // SIWE reddedildi veya hata
    } finally {
      setSiweLoading(false);
    }
  }

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

          {/* Connected Wallet Pill with Account & Session Dropdown */}
          {account ? (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.3rem 0.65rem 0.3rem 0.4rem",
                  borderRadius: "9999px",
                  backgroundColor: accountMenuOpen
                    ? "var(--stitch-surface-container-high)"
                    : "var(--stitch-surface-container)",
                  border: "1px solid rgba(185, 195, 255, 0.25)",
                  cursor: "pointer",
                  color: "inherit",
                }}
                title={`Bağlı Cüzdan: ${account} (Oturum Menüsü)`}
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
                <span
                  className="font-label-mono"
                  style={{ color: "var(--stitch-on-surface)", fontSize: "0.82rem" }}
                >
                  {shortenAddress(account)}
                </span>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "18px",
                    color: "var(--stitch-on-surface-variant)",
                    transform: accountMenuOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s ease",
                  }}
                >
                  arrow_drop_down
                </span>
              </button>

              {accountMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "280px",
                    backgroundColor: "var(--stitch-surface-container-high)",
                    border: "1px solid rgba(142, 144, 161, 0.25)",
                    borderRadius: "0.875rem",
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
                    padding: "1rem",
                    zIndex: 100,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {/* Cüzdan Adresi & Kopyala */}
                  <div>
                    <span
                      className="font-label-mono"
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--stitch-on-surface-variant)",
                        textTransform: "uppercase",
                      }}
                    >
                      Bağlı Cüzdan Adresi
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: "var(--stitch-surface-container)",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.5rem",
                        marginTop: "0.25rem",
                      }}
                    >
                      <span
                        className="font-label-mono"
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--stitch-on-surface)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "180px",
                        }}
                      >
                        {account}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        style={{
                          background: "none",
                          border: "none",
                          color: copied ? "var(--stitch-primary)" : "var(--stitch-tertiary)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.4rem",
                        }}
                      >
                        {copied ? "Kopyalandı!" : "Kopyala"}
                      </button>
                    </div>
                  </div>

                  {/* SIWE Oturum Durumu */}
                  <div
                    style={{
                      padding: "0.6rem",
                      borderRadius: "0.5rem",
                      backgroundColor: sessionState?.authenticated
                        ? "rgba(16, 185, 129, 0.1)"
                        : "rgba(245, 158, 11, 0.1)",
                      border: `1px solid ${
                        sessionState?.authenticated
                          ? "rgba(16, 185, 129, 0.3)"
                          : "rgba(245, 158, 11, 0.3)"
                      }`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: sessionState?.authenticated ? "#10b981" : "#f59e0b",
                        }}
                      />
                      <span
                        className="font-headline-sm"
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: sessionState?.authenticated ? "#10b981" : "#f59e0b",
                        }}
                      >
                        {sessionState?.authenticated
                          ? "SIWE Oturumu Aktif"
                          : "Salt Cüzdan (SIWE Yok)"}
                      </span>
                    </div>

                    {sessionState?.authenticated ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          if (onLogout) onLogout();
                        }}
                        style={{
                          marginTop: "0.5rem",
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          fontSize: "0.75rem",
                          backgroundColor: "rgba(239, 68, 68, 0.15)",
                          color: "#f87171",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          borderRadius: "0.375rem",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        SIWE Oturumunu Kapat (Logout)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleQuickSiweLogin}
                        disabled={siweLoading}
                        style={{
                          marginTop: "0.5rem",
                          width: "100%",
                          padding: "0.35rem 0.5rem",
                          fontSize: "0.75rem",
                          backgroundColor: "var(--stitch-primary)",
                          color: "var(--stitch-on-primary)",
                          border: "none",
                          borderRadius: "0.375rem",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {siweLoading ? "İmza Bekleniyor..." : "SIWE ile Giriş Yap"}
                      </button>
                    )}
                  </div>

                  <div style={{ height: "1px", backgroundColor: "rgba(142, 144, 161, 0.2)" }} />

                  {/* Hızlı Rota Bağlantıları */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <Link
                      to="/profile"
                      onClick={() => setAccountMenuOpen(false)}
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        color: "var(--stitch-on-surface)",
                        textDecoration: "none",
                        fontSize: "0.82rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                        badge
                      </span>
                      Öğrenci Profilim
                    </Link>

                    <Link
                      to="/organizer"
                      onClick={() => setAccountMenuOpen(false)}
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        color: "var(--stitch-on-surface)",
                        textDecoration: "none",
                        fontSize: "0.82rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                        dashboard
                      </span>
                      Organizatör Paneli
                    </Link>
                  </div>

                  <div style={{ height: "1px", backgroundColor: "rgba(142, 144, 161, 0.2)" }} />

                  {/* Cüzdan Bağlantısını Kes */}
                  {onDisconnectWallet && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onDisconnectWallet();
                      }}
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        backgroundColor: "transparent",
                        color: "var(--stitch-outline)",
                        border: "1px solid rgba(142, 144, 161, 0.3)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        link_off
                      </span>
                      Cüzdan Bağlantısını Kes (Disconnect)
                    </button>
                  )}
                </div>
              )}
            </div>
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
