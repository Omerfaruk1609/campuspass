import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { MONAD_CHAIN_ID, MONAD_EXPLORER_URL, shortenAddress } from "../data/events";
import {
  ensureSiweSession,
  fetchNotificationPreferencesFromBackend,
  fetchStudentAccountProfileFromBackend,
  updateNotificationPreferencesOnBackend,
  updateStudentProfileOnBackend,
} from "../utils/apiClient";

export default function AccountSettingsPage() {
  const {
    account,
    chainId,
    sessionState,
    handleLogout,
    handleDisconnectWallet,
    handleSwitchNetwork,
    handleSiweLogin,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState("profile"); // profile | security | privacy
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null); // { type: 'success' | 'error', message: string }

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState({
    eventUpdates: true,
    community: true,
    announcements: true,
    certificates: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsBanner, setPrefsBanner] = useState(null);
  const [university, setUniversity] = useState("Monad Üniversitesi");
  const [department, setDepartment] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  // Cüzdan kopyalama durumu
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [siweLoggingIn, setSiweLoggingIn] = useState(false);

  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  // Profil verisini yükle

  useEffect(() => {
    if (!account) return;
    setLoadingPrefs(true);
    fetchNotificationPreferencesFromBackend()
      .then((data) => {
        if (data) {
          setNotificationPrefs({
            eventUpdates: Boolean(data.eventUpdates),
            community: Boolean(data.community),
            announcements: Boolean(data.announcements),
            certificates: Boolean(data.certificates),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPrefs(false));
  }, [account]);

  async function handleSaveNotificationPreferences() {
    setSavingPrefs(true);
    setPrefsBanner(null);
    try {
      if (!sessionState?.authenticated) {
        await ensureSiweSession(account);
      }
      const updated = await updateNotificationPreferencesOnBackend(notificationPrefs);
      setPrefsBanner({
        type: "success",
        message: "Bildirim tercihleriniz başarıyla kaydedildi.",
      });
    } catch (err) {
      setPrefsBanner({
        type: "error",
        message: err.message || "Bildirim tercihleri kaydedilemedi.",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  const loadProfile = useCallback(async () => {
    if (!account) return;
    setProfileLoading(true);
    try {
      const data = await fetchStudentAccountProfileFromBackend(account);
      if (data) {
        setDisplayName(data.displayName || "");
        setUniversity(data.university || "Monad Üniversitesi");
        setDepartment(data.department || "");
        setBio(data.bio || "");
        setAvatarUrl(data.avatarUrl || "");
        setIsPublic(typeof data.isPublic === "boolean" ? data.isPublic : true);
      }
    } catch (err) {
      // Backend çevrimdışı fallback veya profil henüz oluşturulmamış
      console.warn("Profil yüklenirken bildirim:", err.message);
    } finally {
      setProfileLoading(false);
    }
  }, [account]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleSaveProfile(e) {
    if (e) e.preventDefault();
    if (!account) return;

    setSaving(true);
    setBanner(null);

    try {
      // Eğer SIWE oturumu henüz yoksa önce cüzdandan imza iste
      if (!sessionState?.authenticated) {
        await ensureSiweSession(account);
      }

      await updateStudentProfileOnBackend({
        displayName: displayName.trim() || null,
        university: university.trim() || "Monad Üniversitesi",
        department: department.trim() || null,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        isPublic,
      });

      setBanner({
        type: "success",
        message: "Profil bilgileriniz ve ayarlarınız başarıyla kaydedildi.",
      });
    } catch (err) {
      setBanner({
        type: "error",
        message:
          err.message ||
          "Profil güncellenirken bir hata oluştu. Lütfen oturumunuzu kontrol edin.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyAddress() {
    if (!account) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(account);
        setCopiedWallet(true);
        setTimeout(() => setCopiedWallet(false), 2000);
      }
    } catch {
      // copy fallback
    }
  }

  async function handleQuickSiwe() {
    if (!account) return;
    setSiweLoggingIn(true);
    try {
      if (typeof handleSiweLogin === "function") {
        await handleSiweLogin();
      } else {
        await ensureSiweSession(account);
      }
      setBanner({
        type: "success",
        message: "SIWE oturumu başarıyla açıldı.",
      });
    } catch (err) {
      setBanner({
        type: "error",
        message: err.message || "SIWE oturum açma işlemi tamamlanamadı.",
      });
    } finally {
      setSiweLoggingIn(false);
    }
  }

  return (
    <div className="stitch-shell page-container" style={{ paddingBottom: "5rem" }}>
      {/* Ambient background glows */}
      <div
        className="ambient-glow-primary"
        style={{ top: "10%", left: "15%", width: "420px", height: "420px" }}
      />
      <div
        className="ambient-glow-secondary"
        style={{ top: "45%", right: "10%", width: "420px", height: "420px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, paddingTop: "2rem" }}>
        {/* Üst Başlık & Geri Dönüş */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Link
              to="/profile"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                color: "var(--stitch-primary, #6f88ff)",
                fontSize: "0.875rem",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                arrow_back
              </span>
              Öğrenci Paneline Dön
            </Link>
          </div>
          <h1
            className="font-headline-lg"
            style={{ margin: 0, color: "var(--stitch-on-surface, #f1f5f9)", fontWeight: 800 }}
          >
            Hesap ve Oturum Ayarları
          </h1>
          <p style={{ color: "var(--stitch-outline, #94a3b8)", fontSize: "0.95rem", marginTop: "0.35rem" }}>
            Öğrenci profil bilgilerinizi düzenleyin, gizlilik tercihlerinizi yönetin ve Web3 oturum durumunuzu kontrol edin.
          </p>
        </div>

        {/* Banner Mesajı */}
        {banner && (
          <div
            className={`stitch-card`}
            style={{
              padding: "1rem 1.25rem",
              borderRadius: "0.75rem",
              marginBottom: "1.5rem",
              backgroundColor:
                banner.type === "success"
                  ? "rgba(16, 185, 129, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
              border:
                banner.type === "success"
                  ? "1px solid rgba(16, 185, 129, 0.4)"
                  : "1px solid rgba(239, 68, 68, 0.4)",
              color: banner.type === "success" ? "#10b981" : "#ef4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                {banner.type === "success" ? "check_circle" : "error"}
              </span>
              <span>{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Menüsü */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            borderBottom: "1px solid rgba(142, 144, 161, 0.2)",
            marginBottom: "2rem",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            style={{
              padding: "0.75rem 1.25rem",
              background: "none",
              border: "none",
              borderBottom: activeTab === "profile" ? "3px solid var(--stitch-primary, #6f88ff)" : "3px solid transparent",
              color: activeTab === "profile" ? "var(--stitch-primary, #6f88ff)" : "var(--stitch-outline, #94a3b8)",
              fontWeight: activeTab === "profile" ? 700 : 500,
              fontSize: "0.95rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              badge
            </span>
            Öğrenci Profili
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("security")}
            style={{
              padding: "0.75rem 1.25rem",
              background: "none",
              border: "none",
              borderBottom: activeTab === "security" ? "3px solid var(--stitch-primary, #6f88ff)" : "3px solid transparent",
              color: activeTab === "security" ? "var(--stitch-primary, #6f88ff)" : "var(--stitch-outline, #94a3b8)",
              fontWeight: activeTab === "security" ? 700 : 500,
              fontSize: "0.95rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              security
            </span>
            Cüzdan & Güvenlik
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            style={{
              padding: "0.75rem 1.25rem",
              background: "none",
              border: "none",
              borderBottom: activeTab === "privacy" ? "3px solid var(--stitch-primary, #6f88ff)" : "3px solid transparent",
              color: activeTab === "privacy" ? "var(--stitch-primary, #6f88ff)" : "var(--stitch-outline, #94a3b8)",
              fontWeight: activeTab === "privacy" ? 700 : 500,
              fontSize: "0.95rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              visibility
            </span>
            Gizlilik ve Tercihler
          </button>
        </div>


        {/* TAB 4: BİLDİRİM TERCİHLERİ */}
        {activeTab === "notifications" && (
          <div
            className="stitch-card"
            style={{
              backgroundColor: "var(--stitch-surface-container, rgba(255, 255, 255, 0.03))",
              border: "1px solid rgba(185, 195, 255, 0.15)",
              borderRadius: "0.75rem",
              padding: "1.75rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "var(--stitch-on-surface, #f8fafc)",
                margin: "0 0 0.5rem 0",
              }}
            >
              Bildirim ve İletişim Tercihleri
            </h3>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--stitch-outline, #94a3b8)",
                margin: "0 0 1.5rem 0",
              }}
            >
              Hangi kategorilerde anlık sistem bildirimleri almak istediğinizi belirleyin.
            </p>

            {prefsBanner && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  marginBottom: "1.25rem",
                  backgroundColor:
                    prefsBanner.type === "success"
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(239, 68, 68, 0.12)",
                  border:
                    prefsBanner.type === "success"
                      ? "1px solid rgba(16, 185, 129, 0.3)"
                      : "1px solid rgba(239, 68, 68, 0.3)",
                  color: prefsBanner.type === "success" ? "#6ee7b7" : "#fca5a5",
                  fontSize: "0.875rem",
                }}
              >
                {prefsBanner.message}
              </div>
            )}

            {/* Toggle Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Event Updates */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(142, 144, 161, 0.15)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    Etkinlik Güncellemeleri ve İptalleri
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--stitch-outline, #94a3b8)" }}>
                    Kayıtlı olduğunuz etkinliklerin tarihi, saati, konumu güncellendiğinde veya etkinlik iptal edildiğinde bildirim al.
                  </div>
                </div>
                <label style={{ position: "relative", display: "inline-block", width: "50px", height: "26px", flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.eventUpdates}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, eventUpdates: e.target.checked }))
                    }
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      cursor: "pointer",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: notificationPrefs.eventUpdates ? "#10b981" : "rgba(142, 144, 161, 0.3)",
                      transition: "0.3s",
                      borderRadius: "34px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        height: "18px",
                        width: "18px",
                        left: notificationPrefs.eventUpdates ? "26px" : "4px",
                        bottom: "4px",
                        backgroundColor: "white",
                        transition: "0.3s",
                        borderRadius: "50%",
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Community Updates */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(142, 144, 161, 0.15)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    Topluluk Üyelik ve Başvuru Bildirimleri
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--stitch-outline, #94a3b8)" }}>
                    Topluluk başvurunuz onaylandığında, reddedildiğinde veya topluluktaki rolünüz değiştiğinde bildirim al.
                  </div>
                </div>
                <label style={{ position: "relative", display: "inline-block", width: "50px", height: "26px", flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.community}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, community: e.target.checked }))
                    }
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      cursor: "pointer",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: notificationPrefs.community ? "#10b981" : "rgba(142, 144, 161, 0.3)",
                      transition: "0.3s",
                      borderRadius: "34px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        height: "18px",
                        width: "18px",
                        left: notificationPrefs.community ? "26px" : "4px",
                        bottom: "4px",
                        backgroundColor: "white",
                        transition: "0.3s",
                        borderRadius: "50%",
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Announcements */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(142, 144, 161, 0.15)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    Topluluk ve Etkinlik Duyuruları
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--stitch-outline, #94a3b8)" }}>
                    Topluluk yöneticileri veya etkinlik organizatörleri tarafından yayınlanan önemli duyuruları al.
                  </div>
                </div>
                <label style={{ position: "relative", display: "inline-block", width: "50px", height: "26px", flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.announcements}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, announcements: e.target.checked }))
                    }
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      cursor: "pointer",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: notificationPrefs.announcements ? "#10b981" : "rgba(142, 144, 161, 0.3)",
                      transition: "0.3s",
                      borderRadius: "34px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        height: "18px",
                        width: "18px",
                        left: notificationPrefs.announcements ? "26px" : "4px",
                        bottom: "4px",
                        backgroundColor: "white",
                        transition: "0.3s",
                        borderRadius: "50%",
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Certificates */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(142, 144, 161, 0.15)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                    Sertifika Bildirimleri
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--stitch-outline, #94a3b8)" }}>
                    Katılım sağladığınız bir etkinlik için dijital katılım sertifikası düzenlendiğinde bildirim al.
                  </div>
                </div>
                <label style={{ position: "relative", display: "inline-block", width: "50px", height: "26px", flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={notificationPrefs.certificates}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, certificates: e.target.checked }))
                    }
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      cursor: "pointer",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: notificationPrefs.certificates ? "#10b981" : "rgba(142, 144, 161, 0.3)",
                      transition: "0.3s",
                      borderRadius: "34px",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        height: "18px",
                        width: "18px",
                        left: notificationPrefs.certificates ? "26px" : "4px",
                        bottom: "4px",
                        backgroundColor: "white",
                        transition: "0.3s",
                        borderRadius: "50%",
                      }}
                    />
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.75rem" }}>
              <button
                type="button"
                onClick={handleSaveNotificationPreferences}
                disabled={savingPrefs || loadingPrefs}
                className="stitch-btn-primary"
                style={{ padding: "0.75rem 2rem", fontSize: "0.95rem" }}
              >
                {savingPrefs ? "Kaydediliyor..." : "Bildirim Tercihlerini Kaydet"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: ÖĞRENCİ PROFİLİ */}
        {activeTab === "profile" && (
          <form onSubmit={handleSaveProfile}>
            <div
              className="stitch-card"
              style={{
                padding: "2rem",
                borderRadius: "1rem",
                background: "linear-gradient(135deg, rgba(22, 38, 76, 0.7) 0%, rgba(12, 27, 54, 0.85) 100%)",
                border: "1px solid rgba(185, 195, 255, 0.2)",
              }}
            >
              <h2
                className="font-headline-sm"
                style={{ margin: 0, marginBottom: "1.5rem", color: "var(--stitch-on-surface, #f1f5f9)" }}
              >
                Kişisel Bilgiler & Kimlik
              </h2>

              {profileLoading ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--stitch-outline)" }}>
                  Profil yükleniyor...
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
                  {/* Avatar & Display Name Önizleme */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1.25rem",
                      padding: "1rem",
                      borderRadius: "0.75rem",
                      backgroundColor: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(185, 195, 255, 0.1)",
                    }}
                  >
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        background: avatarUrl
                          ? `url("${avatarUrl}") center/cover no-repeat`
                          : "linear-gradient(135deg, #7c3aed, #3b82f6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: "#ffffff",
                        border: "2px solid rgba(185, 195, 255, 0.4)",
                      }}
                    >
                      {!avatarUrl && (displayName ? displayName.slice(0, 2).toUpperCase() : account?.slice(2, 4).toUpperCase())}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--stitch-on-surface)" }}>
                        {displayName || "İsim Belirtilmemiş"}
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--stitch-outline)", fontFamily: "monospace" }}>
                        {account ? shortenAddress(account) : "Cüzdan bağlı değil"}
                      </div>
                    </div>
                  </div>

                  {/* İsim & Soyisim */}
                  <div>
                    <label
                      htmlFor="displayName"
                      style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.875rem", fontWeight: 600 }}
                    >
                      Görüntüleme Adı (İsim / Soyisim / Takma Ad)
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      className="stitch-input"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Örn: Ahmet Yılmaz"
                      maxLength={60}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        backgroundColor: "rgba(10, 20, 40, 0.6)",
                        border: "1px solid rgba(185, 195, 255, 0.25)",
                        borderRadius: "0.5rem",
                        color: "var(--stitch-on-surface)",
                        fontSize: "0.95rem",
                      }}
                    />
                    <div style={{ fontSize: "0.75rem", color: "var(--stitch-outline)", marginTop: "0.25rem" }}>
                      Etkinlik katılımcı listelerinde ve isteğe bağlı sertifikalarda görünür. Maksimum 60 karakter.
                    </div>
                  </div>

                  {/* Üniversite & Bölüm (2 Sütun) */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
                    <div>
                      <label
                        htmlFor="university"
                        style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.875rem", fontWeight: 600 }}
                      >
                        Üniversite
                      </label>
                      <input
                        id="university"
                        type="text"
                        className="stitch-input"
                        value={university}
                        onChange={(e) => setUniversity(e.target.value)}
                        placeholder="Örn: Monad Üniversitesi"
                        maxLength={100}
                        style={{
                          width: "100%",
                          padding: "0.75rem 1rem",
                          backgroundColor: "rgba(10, 20, 40, 0.6)",
                          border: "1px solid rgba(185, 195, 255, 0.25)",
                          borderRadius: "0.5rem",
                          color: "var(--stitch-on-surface)",
                          fontSize: "0.95rem",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="department"
                        style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.875rem", fontWeight: 600 }}
                      >
                        Bölüm / Fakülte
                      </label>
                      <input
                        id="department"
                        type="text"
                        className="stitch-input"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="Örn: Bilgisayar Mühendisliği"
                        maxLength={100}
                        style={{
                          width: "100%",
                          padding: "0.75rem 1rem",
                          backgroundColor: "rgba(10, 20, 40, 0.6)",
                          border: "1px solid rgba(185, 195, 255, 0.25)",
                          borderRadius: "0.5rem",
                          color: "var(--stitch-on-surface)",
                          fontSize: "0.95rem",
                        }}
                      />
                    </div>
                  </div>

                  {/* Biyografi */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                      <label htmlFor="bio" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                        Hakkımda / Biyografi
                      </label>
                      <span style={{ fontSize: "0.75rem", color: bio.length > 280 ? "#ef4444" : "var(--stitch-outline)" }}>
                        {bio.length} / 300
                      </span>
                    </div>
                    <textarea
                      id="bio"
                      className="stitch-input"
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="İlgi alanlarınız, öğrenci kulübü üyeliğiniz veya teknoloji hedefleriniz..."
                      maxLength={300}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        backgroundColor: "rgba(10, 20, 40, 0.6)",
                        border: "1px solid rgba(185, 195, 255, 0.25)",
                        borderRadius: "0.5rem",
                        color: "var(--stitch-on-surface)",
                        fontSize: "0.95rem",
                        resize: "vertical",
                      }}
                    />
                  </div>

                  {/* Avatar URL */}
                  <div>
                    <label
                      htmlFor="avatarUrl"
                      style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.875rem", fontWeight: 600 }}
                    >
                      Profil Fotoğrafı / Avatar Görseli Bağlantısı (URL)
                    </label>
                    <input
                      id="avatarUrl"
                      type="url"
                      className="stitch-input"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      maxLength={500}
                      style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        backgroundColor: "rgba(10, 20, 40, 0.6)",
                        border: "1px solid rgba(185, 195, 255, 0.25)",
                        borderRadius: "0.5rem",
                        color: "var(--stitch-on-surface)",
                        fontSize: "0.95rem",
                      }}
                    />
                    <div style={{ fontSize: "0.75rem", color: "var(--stitch-outline)", marginTop: "0.25rem" }}>
                      Doğrudan erişilebilir bir görsel bağlantısı (HTTPS). Boş bırakılırsa cüzdan adresinize özel gradyan rozet kullanılır.
                    </div>
                  </div>

                  {/* Kaydet Butonu */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button
                      type="submit"
                      disabled={saving || profileLoading}
                      className="stitch-btn-primary"
                      style={{
                        padding: "0.75rem 2rem",
                        fontSize: "0.95rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                        save
                      </span>
                      {saving ? "Kaydediliyor..." : "Profili Kaydet"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        )}

        {/* TAB 2: CÜZDAN & GÜVENLİK */}
        {activeTab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Cüzdan Bilgileri Kartı */}
            <div
              className="stitch-card"
              style={{
                padding: "2rem",
                borderRadius: "1rem",
                background: "linear-gradient(135deg, rgba(22, 38, 76, 0.7) 0%, rgba(12, 27, 54, 0.85) 100%)",
                border: "1px solid rgba(185, 195, 255, 0.2)",
              }}
            >
              <h2
                className="font-headline-sm"
                style={{ margin: 0, marginBottom: "1.25rem", color: "var(--stitch-on-surface)" }}
              >
                Web3 Cüzdan Durumu
              </h2>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                  padding: "1rem",
                  borderRadius: "0.75rem",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(185, 195, 255, 0.1)",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--stitch-outline)", textTransform: "uppercase" }}>
                    Bağlı Cüzdan Adresi
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      fontSize: "1rem",
                      color: "var(--stitch-on-surface)",
                      wordBreak: "break-all",
                      marginTop: "0.2rem",
                    }}
                  >
                    {account}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="stitch-btn-secondary"
                    style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                      content_copy
                    </span>
                    {copiedWallet ? "Kopyalandı ✓" : "Adresi Kopyala"}
                  </button>

                  <a
                    href={`${MONAD_EXPLORER_URL}/address/${account}`}
                    target="_blank"
                    rel="noreferrer"
                    className="stitch-btn-secondary"
                    style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", textDecoration: "none" }}
                  >
                    Explorer ↗
                  </a>
                </div>
              </div>

              {/* Ağ Durumu */}
              <div
                style={{
                  marginTop: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: isCorrectNetwork ? "#10b981" : "#ef4444",
                    }}
                  />
                  <span style={{ fontSize: "0.9rem" }}>
                    Aktif Ağ:{" "}
                    <strong>{isCorrectNetwork ? `Monad Testnet (${MONAD_CHAIN_ID})` : `Bilinmeyen Ağ (${chainId || "?"})`}</strong>
                  </span>
                </div>

                {!isCorrectNetwork && (
                  <button
                    type="button"
                    onClick={handleSwitchNetwork}
                    className="stitch-btn-primary"
                    style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", backgroundColor: "#ef4444" }}
                  >
                    Monad Testnet&apos;e Geç
                  </button>
                )}
              </div>
            </div>

            {/* SIWE Oturum Kartı */}
            <div
              className="stitch-card"
              style={{
                padding: "2rem",
                borderRadius: "1rem",
                background: "linear-gradient(135deg, rgba(22, 38, 76, 0.7) 0%, rgba(12, 27, 54, 0.85) 100%)",
                border: "1px solid rgba(185, 195, 255, 0.2)",
              }}
            >
              <h2
                className="font-headline-sm"
                style={{ margin: 0, marginBottom: "0.5rem", color: "var(--stitch-on-surface)" }}
              >
                Sunucu Oturumu (SIWE / EIP-4361)
              </h2>
              <p style={{ color: "var(--stitch-outline)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
                Sign-In with Ethereum, cüzdanınız ile imzalanan kriptografik meydan okuma ile sunucu tarafında güvenli bir oturum açar.
              </p>

              <div
                style={{
                  padding: "1rem",
                  borderRadius: "0.75rem",
                  backgroundColor: sessionState?.authenticated
                    ? "rgba(16, 185, 129, 0.08)"
                    : "rgba(245, 158, 11, 0.08)",
                  border: sessionState?.authenticated
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : "1px solid rgba(245, 158, 11, 0.3)",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "20px",
                      color: sessionState?.authenticated ? "#10b981" : "#f59e0b",
                    }}
                  >
                    {sessionState?.authenticated ? "verified_user" : "shield_lock"}
                  </span>
                  <span style={{ fontWeight: 700, color: sessionState?.authenticated ? "#10b981" : "#f59e0b" }}>
                    {sessionState?.authenticated
                      ? "Aktif ve Doğrulanmış SIWE Oturumu Mevcut"
                      : "Henüz SIWE Sunucu Oturumu Açılmamış"}
                  </span>
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--stitch-outline)", marginTop: "0.4rem" }}>
                  {sessionState?.authenticated
                    ? "HttpOnly çerez ve CSRF koruması devrede. Organizatör paneli ve profil düzenleme işlemleri yetkilendirildi."
                    : "Etkinlik düzenleme ve profil güncelleme gibi durum değiştiren işlemler için SIWE imzası zorunludur."}
                </div>
              </div>

              {/* Aksiyon Butonları */}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {!sessionState?.authenticated ? (
                  <button
                    type="button"
                    onClick={handleQuickSiwe}
                    disabled={siweLoggingIn}
                    className="stitch-btn-primary"
                    style={{ padding: "0.6rem 1.25rem", fontSize: "0.875rem" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      login
                    </span>
                    {siweLoggingIn ? "İmzalanıyor..." : "SIWE ile Giriş Yap (İmzala)"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="stitch-btn-secondary"
                    style={{
                      padding: "0.6rem 1.25rem",
                      fontSize: "0.875rem",
                      color: "#ef4444",
                      borderColor: "rgba(239, 68, 68, 0.3)",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      logout
                    </span>
                    Sunucu Oturumunu Kapat (SIWE Logout)
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDisconnectWallet}
                  className="stitch-btn-secondary"
                  style={{ padding: "0.6rem 1.25rem", fontSize: "0.875rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    link_off
                  </span>
                  Cüzdan Bağlantısını Kes (Disconnect)
                </button>
              </div>

              {/* Bilgi Kutusu: Cüzdan vs Oturum Ayrımı */}
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  fontSize: "0.8125rem",
                  color: "#93c5fd",
                  lineHeight: 1.5,
                }}
              >
                <strong>Önemli Ayrım:</strong>
                <ul style={{ margin: "0.4rem 0 0 1.25rem" }}>
                  <li>
                    <strong>Cüzdan Bağlantısını Kesmek:</strong> Tarayıcınız ile MetaMask/Web3 eklentisi arasındaki bağlantıyı sonlandırır.
                  </li>
                  <li>
                    <strong>SIWE Oturumunu Kapatmak:</strong> Sunucu tarafındaki yetkili oturum kayıtlarını (HttpOnly çerezler, CSRF token) geçersiz kılar ve güvenli şekilde sonlandırır.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: GİZLİLİK VE TERCİHLER */}
        {activeTab === "privacy" && (
          <div
            className="stitch-card"
            style={{
              padding: "2rem",
              borderRadius: "1rem",
              background: "linear-gradient(135deg, rgba(22, 38, 76, 0.7) 0%, rgba(12, 27, 54, 0.85) 100%)",
              border: "1px solid rgba(185, 195, 255, 0.2)",
            }}
          >
            <h2
              className="font-headline-sm"
              style={{ margin: 0, marginBottom: "0.5rem", color: "var(--stitch-on-surface)" }}
            >
              Gizlilik ve Profil Görünürlüğü
            </h2>
            <p style={{ color: "var(--stitch-outline)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              CampusPass üzerindeki kişisel profil bilgilerinizin diğer kullanıcılar tarafından nasıl görüntüleneceğini yapılandırın.
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.25rem",
                borderRadius: "0.75rem",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(185, 195, 255, 0.1)",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--stitch-on-surface)" }}>
                  Herkese Açık Öğrenci Profili
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--stitch-outline)", marginTop: "0.25rem" }}>
                  Açık olduğunda; adınız, biyografiniz ve bölüm bilginiz etkinlik katılımcı listelerinde görüntülenebilir.
                  Kapalı olduğunda yalnızca cüzdan adresiniz (0x...) görünür.
                </div>
              </div>

              <label
                style={{
                  position: "relative",
                  display: "inline-block",
                  width: "52px",
                  height: "28px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: "absolute",
                    cursor: "pointer",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: isPublic ? "#10b981" : "rgba(142, 144, 161, 0.3)",
                    transition: "0.3s",
                    borderRadius: "34px",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      content: "",
                      height: "20px",
                      width: "20px",
                      left: isPublic ? "26px" : "4px",
                      bottom: "4px",
                      backgroundColor: "white",
                      transition: "0.3s",
                      borderRadius: "50%",
                    }}
                  />
                </span>
              </label>
            </div>

            {/* Blokzincir Verisi Bildirimi */}
            <div
              style={{
                padding: "1rem",
                borderRadius: "0.5rem",
                backgroundColor: "rgba(124, 58, 237, 0.08)",
                border: "1px solid rgba(124, 58, 237, 0.2)",
                fontSize: "0.8125rem",
                color: "#c4b5fd",
                lineHeight: 1.5,
                marginBottom: "1.5rem",
              }}
            >
              <strong>Blokzincir Şeffaflık İlkesi:</strong>
              <p style={{ margin: "0.25rem 0 0 0" }}>
                Monad Testnet üzerinde gerçekleşen etkinlik kayıtları ve katılım (AttendanceMarked) işlemleri dağıtık defter teknolojisi gereği halka açıktır.
                Bu sayfadaki gizlilik tercihi yalnızca veritabanında saklanan kişisel profil alanlarını (isim, biyografi, bölüm vb.) kapsar.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving || profileLoading}
                className="stitch-btn-primary"
                style={{ padding: "0.75rem 2rem", fontSize: "0.95rem" }}
              >
                {saving ? "Kaydediliyor..." : "Tercihleri Kaydet"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
