import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { MONAD_CHAIN_ID, shortenAddress } from "../data/events";
import { ensureSiweSession } from "../utils/apiClient";

export default function Navbar({
  account,
  chainId,
  onConnectWallet,
  onSwitchNetwork,
  isConnecting,
  sessionState = null,
  onLogout = null,
  onDisconnectWallet = null,
  onSiweLogin = null,
  unreadNotificationCount = 0,
}) {
  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [siweLoading, setSiweLoading] = useState(false);
  const [siweError, setSiweError] = useState(null);
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
    setSiweError(null);
    try {
      if (typeof onSiweLogin === "function") {
        await onSiweLogin();
      } else {
        await ensureSiweSession(account);
      }
    } catch (err) {
      setSiweError(
        err?.code === 4001 || err?.code === "ACTION_REJECTED"
          ? "İmza isteği reddedildi."
          : err?.message || "SIWE oturumu açılamadı."
      );
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
              boxShadow: "0 0 16px rgba(111, 136, 255, 0.4)",
            }}
          >
            <span className="material-symbols-outlined" style={{ color: "#ffffff", fontSize: "20px" }}>
              school
            </span>
          </div>
          <div>
            <span
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.01em",
                display: "block",
                lineHeight: 1.2,
              }}
            >
              Campus<span style={{ color: "#6f88ff" }}>Pass</span>
            </span>
            <span
              style={{
                fontSize: "0.625rem",
                color: "var(--stitch-outline)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "block",
                lineHeight: 1,
              }}
            >
              Monad Testnet
            </span>
          </div>
        </Link>

        {/* Primary Navigation Links */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
          className="hide-mobile"
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `stitch-nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              home
            </span>
            Ana Sayfa
          </NavLink>

          <NavLink
            to="/events"
            className={({ isActive }) =>
              `stitch-nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              event
            </span>
            Etkinlikler
          </NavLink>

          <NavLink
            to="/communities"
            className={({ isActive }) =>
              `stitch-nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              groups
            </span>
            Topluluklar
          </NavLink>

          {account && (
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `stitch-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                badge
              </span>
              Öğrenci Paneli
            </NavLink>
          )}

          {account && (
            <NavLink
              to="/organizer"
              className={({ isActive }) =>
                `stitch-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                dashboard
              </span>
              Organizatör
            </NavLink>
          )}

          <NavLink
            to="/verify"
            className={({ isActive }) =>
              `stitch-nav-link ${isActive ? "active" : ""}`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              verified
            </span>
            Sertifika Doğrula
          </NavLink>
        </nav>

        {/* Right Section: Network & Wallet Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {/* Network Indicator / Switcher */}
          {account && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.3rem 0.65rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                backgroundColor: isCorrectNetwork
                  ? "rgba(111, 136, 255, 0.12)"
                  : "rgba(239, 68, 68, 0.15)",
                border: isCorrectNetwork
                  ? "1px solid rgba(111, 136, 255, 0.3)"
                  : "1px solid rgba(239, 68, 68, 0.4)",
                color: isCorrectNetwork ? "#b9c3ff" : "#fca5a5",
              }}
              className="hide-mobile"
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: isCorrectNetwork ? "#10b981" : "#ef4444",
                  boxShadow: isCorrectNetwork
                    ? "0 0 6px #10b981"
                    : "0 0 6px #ef4444",
                }}
              />
              {isCorrectNetwork ? (
                "Monad Testnet"
              ) : (
                <button
                  type="button"
                  onClick={onSwitchNetwork}
                  style={{
                    background: "none",
                    border: "none",
                    color: "inherit",
                    fontWeight: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Monad&apos;a Geç
                </button>
              )}
            </div>
          )}

          {/* Notification Bell Button */}
          {account && (
            <Link
              to="/notifications"
              aria-label={`Bildirimler (${unreadNotificationCount} okunmamış)`}
              title="Bildirimler"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                backgroundColor: "var(--stitch-surface-container, rgba(255, 255, 255, 0.05))",
                border: "1px solid rgba(185, 195, 255, 0.2)",
                color: "var(--stitch-on-surface, #e2e8f0)",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                notifications
              </span>
              {unreadNotificationCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "-2px",
                    right: "-2px",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 4px",
                    borderRadius: "9999px",
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "2px solid #03122e",
                    lineHeight: 1,
                  }}
                >
                  {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                </span>
              )}
            </Link>
          )}

          {/* Wallet Connection / Session Button & Dropdown */}
          {account ? (
            <div style={{ position: "relative" }} ref={menuRef}>
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
                    color: "#ffffff",
                  }}
                >
                  {account.slice(2, 4).toUpperCase()}
                </div>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    fontFamily: "monospace",
                    color: "var(--stitch-on-surface)",
                  }}
                >
                  {shortenAddress(account)}
                </span>
                {sessionState?.authenticated && (
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "#10b981",
                      title: "SIWE Oturumu Aktif",
                    }}
                  />
                )}
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "16px",
                    color: "var(--stitch-outline)",
                    transition: "transform 0.2s",
                    transform: accountMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  arrow_drop_down
                </span>
              </button>

              {/* Account Dropdown Menu */}
              {accountMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: "280px",
                    backgroundColor: "var(--stitch-surface-container)",
                    border: "1px solid rgba(185, 195, 255, 0.2)",
                    borderRadius: "0.75rem",
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
                    padding: "0.75rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    zIndex: 60,
                  }}
                >
                  {/* Cüzdan Bilgisi */}
                  <div style={{ padding: "0.25rem 0.5rem" }}>
                    <div
                      style={{
                        fontSize: "0.6875rem",
                        color: "var(--stitch-outline)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Bağlı Cüzdan
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        marginTop: "0.2rem",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          color: "var(--stitch-on-surface)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {shortenAddress(account)}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        style={{
                          background: "none",
                          border: "none",
                          color: copied ? "#10b981" : "var(--stitch-primary)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.15rem 0.35rem",
                          borderRadius: "0.25rem",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                          {copied ? "check" : "content_copy"}
                        </span>
                        {copied ? "Kopyalandı" : "Kopyala"}
                      </button>
                    </div>
                  </div>

                  {/* SIWE Oturum Durumu */}
                  <div
                    style={{
                      padding: "0.45rem 0.6rem",
                      borderRadius: "0.5rem",
                      backgroundColor: sessionState?.authenticated
                        ? "rgba(16, 185, 129, 0.1)"
                        : "rgba(245, 158, 11, 0.1)",
                      border: sessionState?.authenticated
                        ? "1px solid rgba(16, 185, 129, 0.25)"
                        : "1px solid rgba(245, 158, 11, 0.25)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: "14px",
                          color: sessionState?.authenticated ? "#10b981" : "#f59e0b",
                        }}
                      >
                        {sessionState?.authenticated ? "verified_user" : "gpp_maybe"}
                      </span>
                      <strong
                        style={{
                          color: sessionState?.authenticated ? "#10b981" : "#f59e0b",
                        }}
                      >
                        {sessionState?.authenticated
                          ? "SIWE Oturumu Aktif"
                          : "SIWE Oturumu Yok"}
                      </strong>
                    </div>
                    {!sessionState?.authenticated && (
                      <>
                        <button
                          type="button"
                          onClick={handleQuickSiweLogin}
                          disabled={siweLoading}
                          style={{
                            marginTop: "0.4rem",
                            width: "100%",
                            padding: "0.35rem 0.5rem",
                            borderRadius: "0.375rem",
                            backgroundColor: "var(--stitch-primary)",
                            color: "#ffffff",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {siweLoading ? "İmzalanıyor..." : "Oturum Aç (SIWE İmzala)"}
                        </button>
                        {siweError && (
                          <div
                            style={{
                              marginTop: "0.35rem",
                              color: "#fca5a5",
                              fontSize: "0.7rem",
                              lineHeight: 1.35,
                            }}
                          >
                            {siweError}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* SIWE Oturumu Kapat */}
                  {sessionState?.authenticated && onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onLogout();
                      }}
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        justifyContent: "center",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                        logout
                      </span>
                      Oturumu Kapat (SIWE)
                    </button>
                  )}

                  <div style={{ height: "1px", backgroundColor: "rgba(142, 144, 161, 0.2)" }} />

                  {/* Hızlı Bağlantılar */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
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

                    <Link
                      to="/settings"
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
                        settings
                      </span>
                      Hesap ve Oturum Ayarları
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
              onClick={onConnectWallet}
              disabled={isConnecting}
              style={{
                fontSize: "0.8125rem",
                padding: "0.45rem 1rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                account_balance_wallet
              </span>
              {isConnecting ? "Bağlanıyor..." : "Cüzdanı Bağla"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
