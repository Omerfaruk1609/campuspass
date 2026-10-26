import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import {
  fetchNotificationsFromBackend,
  markNotificationAsReadOnBackend,
  markAllNotificationsAsReadOnBackend,
  deleteNotificationOnBackend,
} from "../utils/apiClient";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_ICONS,
  formatNotificationRelativeTime,
  sanitizeDestinationUrl,
} from "../utils/notifications";

export default function NotificationsPage() {
  const {
    account,
    unreadNotificationCount,
    setUnreadNotificationCount,
    liveNotification,
  } = useAppContext();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" | "unread"
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    unreadCount: 0,
    hasMore: false,
  });
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  // Bildirimleri API'den yükleme
  const loadNotifications = useCallback(
    async (targetPage = 1, append = false) => {
      if (!account) {
        setNotifications([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchNotificationsFromBackend({
          page: targetPage,
          limit: 20,
          unreadOnly: filter === "unread",
        });

        if (append) {
          setNotifications((prev) => [...prev, ...res.items]);
        } else {
          setNotifications(res.items);
        }

        setPagination(res.pagination || {});
        if (typeof res.pagination?.unreadCount === "number") {
          setUnreadNotificationCount(res.pagination.unreadCount);
        }
        setPage(targetPage);
      } catch (err) {
        setError(err.message || "Bildirimler yüklenirken bir sorun oluştu.");
      } finally {
        setLoading(false);
      }
    },
    [account, filter, setUnreadNotificationCount]
  );

  useEffect(() => {
    loadNotifications(1, false);
  }, [loadNotifications]);

  // Canlı SSE bildirimi geldiğinde listeye otomatik ekleme
  useEffect(() => {
    if (!liveNotification) return;

    setNotifications((prev) => {
      // Dedup kontrolü
      if (prev.some((n) => n.id === liveNotification.id)) return prev;
      if (filter === "unread" && liveNotification.read) return prev;
      return [liveNotification, ...prev];
    });

    setPagination((prev) => ({
      ...prev,
      total: (prev.total || 0) + 1,
      unreadCount: (prev.unreadCount || 0) + 1,
    }));
  }, [liveNotification, filter]);

  // Tekil bildirimi okundu olarak işaretle
  async function handleMarkAsRead(notifId) {
    setActionLoading(notifId);
    try {
      await markNotificationAsReadOnBackend(notifId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId ? { ...n, read: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
      setPagination((prev) => ({
        ...prev,
        unreadCount: Math.max(0, (prev.unreadCount || 1) - 1),
      }));
    } catch (err) {
      setError(err.message || "Bildirim işaretlenemedi.");
    } finally {
      setActionLoading(null);
    }
  }

  // Tümünü okundu olarak işaretle
  async function handleMarkAllAsRead() {
    setActionLoading("all");
    try {
      await markAllNotificationsAsReadOnBackend();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      setUnreadNotificationCount(0);
      setPagination((prev) => ({ ...prev, unreadCount: 0 }));
    } catch (err) {
      setError(err.message || "Bildirimler işaretlenemedi.");
    } finally {
      setActionLoading(null);
    }
  }

  // Tekil bildirimi sil
  async function handleDelete(notifId) {
    const target = notifications.find((n) => n.id === notifId);
    setActionLoading(`del-${notifId}`);
    try {
      await deleteNotificationOnBackend(notifId);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      if (target && !target.read) {
        setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, (prev.total || 1) - 1),
          unreadCount: Math.max(0, (prev.unreadCount || 1) - 1),
        }));
      } else {
        setPagination((prev) => ({
          ...prev,
          total: Math.max(0, (prev.total || 1) - 1),
        }));
      }
    } catch (err) {
      setError(err.message || "Bildirim silinemedi.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 140px)",
        backgroundColor: "var(--stitch-surface, #030e22)",
        color: "var(--stitch-on-surface, #f8fafc)",
        padding: "2rem 1rem",
      }}
    >
      <div
        className="stitch-container"
        style={{
          maxWidth: "840px",
          margin: "0 auto",
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.75rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "28px", color: "var(--stitch-primary, #6f88ff)" }}
              >
                notifications_active
              </span>
              <h1
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Bildirim Merkezi
              </h1>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--stitch-outline, #94a3b8)",
                margin: "0.25rem 0 0 0",
              }}
            >
              Etkinlikleriniz, başvurularınız ve sertifikalarınıza ait tüm gerçek zamanlı bildirimler.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Link
              to="/settings"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.45rem 0.75rem",
                borderRadius: "0.5rem",
                backgroundColor: "var(--stitch-surface-container, rgba(255,255,255,0.05))",
                border: "1px solid rgba(185, 195, 255, 0.2)",
                color: "var(--stitch-on-surface, #e2e8f0)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
              title="Bildirim Ayarları"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                tune
              </span>
              Tercihler
            </Link>

            {unreadNotificationCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={actionLoading === "all"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.45rem 0.85rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(111, 136, 255, 0.15)",
                  border: "1px solid rgba(111, 136, 255, 0.35)",
                  color: "#b9c3ff",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  done_all
                </span>
                {actionLoading === "all" ? "İşleniyor..." : "Tümünü Okundu İşaretle"}
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            borderBottom: "1px solid rgba(142, 144, 161, 0.2)",
            marginBottom: "1.25rem",
            paddingBottom: "0.5rem",
          }}
        >
          <button
            type="button"
            onClick={() => setFilter("all")}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              backgroundColor:
                filter === "all"
                  ? "var(--stitch-surface-container-high, rgba(111, 136, 255, 0.2))"
                  : "transparent",
              color: filter === "all" ? "#ffffff" : "var(--stitch-outline, #94a3b8)",
              transition: "all 0.15s ease",
            }}
          >
            Tümü
          </button>

          <button
            type="button"
            onClick={() => setFilter("unread")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.4rem 0.85rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              backgroundColor:
                filter === "unread"
                  ? "var(--stitch-surface-container-high, rgba(111, 136, 255, 0.2))"
                  : "transparent",
              color: filter === "unread" ? "#ffffff" : "var(--stitch-outline, #94a3b8)",
              transition: "all 0.15s ease",
            }}
          >
            Okunmamış
            {unreadNotificationCount > 0 && (
              <span
                style={{
                  padding: "0.05rem 0.4rem",
                  borderRadius: "9999px",
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                }}
              >
                {unreadNotificationCount}
              </span>
            )}
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              fontSize: "0.875rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{
                background: "none",
                border: "none",
                color: "#fca5a5",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Notifications List */}
        {loading && notifications.length === 0 ? (
          <div
            style={{
              padding: "3rem 1rem",
              textAlign: "center",
              color: "var(--stitch-outline, #94a3b8)",
            }}
          >
            <div
              className="spinner-border"
              style={{
                display: "inline-block",
                width: "2rem",
                height: "2rem",
                border: "3px solid rgba(111, 136, 255, 0.2)",
                borderTopColor: "var(--stitch-primary, #6f88ff)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
              Bildirimler yükleniyor...
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              padding: "3.5rem 1.5rem",
              textAlign: "center",
              backgroundColor: "var(--stitch-surface-container, rgba(255, 255, 255, 0.03))",
              border: "1px dashed rgba(185, 195, 255, 0.2)",
              borderRadius: "0.75rem",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "48px",
                color: "var(--stitch-outline, #64748b)",
                marginBottom: "0.75rem",
              }}
            >
              notifications_off
            </span>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.25rem 0" }}>
              {filter === "unread" ? "Okunmamış Bildiriminiz Yok" : "Henüz Bildiriminiz Yok"}
            </h3>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--stitch-outline, #94a3b8)",
                margin: 0,
              }}
            >
              {filter === "unread"
                ? "Tüm bildirimlerinizi okudunuz. Harika bir iş!"
                : "Etkinlik kayıtları, topluluk duyuruları ve sertifikalarınız burada görünecek."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {notifications.map((notif) => {
              const icon = NOTIFICATION_TYPE_ICONS[notif.type] || "notifications";
              const typeLabel = NOTIFICATION_TYPE_LABELS[notif.type] || "Bildirim";
              const sanitizedDest = sanitizeDestinationUrl(notif.destinationUrl);

              return (
                <article
                  key={notif.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "1rem",
                    padding: "1rem 1.25rem",
                    borderRadius: "0.75rem",
                    backgroundColor: notif.read
                      ? "var(--stitch-surface-container, rgba(255, 255, 255, 0.025))"
                      : "rgba(111, 136, 255, 0.08)",
                    border: notif.read
                      ? "1px solid rgba(142, 144, 161, 0.15)"
                      : "1px solid rgba(111, 136, 255, 0.35)",
                    transition: "all 0.15s ease",
                    position: "relative",
                  }}
                >
                  {/* Status Indicator Dot */}
                  {!notif.read && (
                    <span
                      style={{
                        position: "absolute",
                        top: "1.25rem",
                        left: "0.5rem",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "var(--stitch-primary, #6f88ff)",
                        boxShadow: "0 0 6px var(--stitch-primary, #6f88ff)",
                      }}
                      title="Okunmamış Bildirim"
                    />
                  )}

                  {/* Icon Circle */}
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: notif.read
                        ? "rgba(142, 144, 161, 0.12)"
                        : "rgba(111, 136, 255, 0.2)",
                      color: notif.read
                        ? "var(--stitch-outline, #94a3b8)"
                        : "var(--stitch-primary, #6f88ff)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                      {icon}
                    </span>
                  </div>

                  {/* Notification Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        marginBottom: "0.2rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "0.25rem",
                          backgroundColor: "rgba(142, 144, 161, 0.15)",
                          color: "var(--stitch-outline, #94a3b8)",
                        }}
                      >
                        {typeLabel}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--stitch-outline, #64748b)",
                        }}
                      >
                        {formatNotificationRelativeTime(notif.createdAt)}
                      </span>
                    </div>

                    <h4
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: notif.read ? 600 : 700,
                        color: "var(--stitch-on-surface, #ffffff)",
                        margin: "0 0 0.25rem 0",
                      }}
                    >
                      {notif.title}
                    </h4>

                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--stitch-outline, #cbd5e1)",
                        margin: 0,
                        lineHeight: 1.45,
                        wordBreak: "break-word",
                      }}
                    >
                      {notif.message}
                    </p>

                    {/* Footer Actions: Destination Link + Mark Read + Delete */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginTop: "0.75rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {sanitizedDest && (
                        <Link
                          to={sanitizedDest}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            color: "var(--stitch-primary, #6f88ff)",
                            textDecoration: "none",
                          }}
                        >
                          Detayları Görüntüle
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                            arrow_forward
                          </span>
                        </Link>
                      )}

                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(notif.id)}
                          disabled={actionLoading === notif.id}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "var(--stitch-outline, #94a3b8)",
                            cursor: "pointer",
                            fontSize: "0.8125rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.2rem",
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                            check
                          </span>
                          {actionLoading === notif.id ? "İşleniyor..." : "Okundu"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(notif.id)}
                        disabled={actionLoading === `del-${notif.id}`}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "0.8125rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.2rem",
                          opacity: 0.8,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                          delete_outline
                        </span>
                        {actionLoading === `del-${notif.id}` ? "Siliniyor..." : "Sil"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Load More Button */}
            {pagination.hasMore && (
              <div style={{ textAlign: "center", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => loadNotifications(page + 1, true)}
                  disabled={loading}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: "0.5rem",
                    backgroundColor: "var(--stitch-surface-container, rgba(255,255,255,0.05))",
                    border: "1px solid rgba(185, 195, 255, 0.2)",
                    color: "var(--stitch-on-surface, #ffffff)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Yükleniyor..." : "Daha Fazla Yükle"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
