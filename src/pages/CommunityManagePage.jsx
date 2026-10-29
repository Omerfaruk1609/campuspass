import { useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import {
  approveCommunityApplicationOnBackend,
  createCommunityAnnouncementOnBackend,
  fetchCommunityAnalyticsFromBackend,
  fetchCommunityAnnouncementsFromBackend,
  fetchCommunityApplicationsFromBackend,
  fetchCommunityEventsFromBackend,
  fetchCommunityMembersFromBackend,
  fetchCommunityProfileFromBackend,
  linkEventToCommunityOnBackend,
  rejectCommunityApplicationOnBackend,
  removeCommunityMemberOnBackend,
  unlinkEventFromCommunityOnBackend,
  updateCommunityMemberRoleOnBackend,
  updateCommunityOnBackend,
} from "../utils/apiClient";
import { CONTRACT_ADDRESS, MONAD_CHAIN_ID, shortenAddress } from "../data/events";

export default function CommunityManagePage(props) {
  const context = useAppContext();
  const params = useParams();
  const navigate = useNavigate();

  const account = props.account ?? context?.account ?? null;
  const slug = props.slug ?? params.slug;
  const handleBack = props.onBack || (() => (navigate ? navigate(`/communities/${slug}`) : null));
  const handleOpenEvent = props.onOpenEvent || ((id) => (navigate ? navigate(`/events/${id}`) : null));
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("members"); // members | applications | events | settings | analytics

  // Sekme Verileri
  const [members, setMembers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [events, setEvents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);

  // Form State (Ayarlar)
  const [editShortDesc, setEditShortDesc] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editUni, setEditUni] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLogo, setEditLogo] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editWeb, setEditWeb] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Etkinlik Bağlama State
  const [linkEventId, setLinkEventId] = useState("");
  const linkChainId = MONAD_CHAIN_ID;
  const linkContractAddress = CONTRACT_ADDRESS;

  // İşlem Bildirimi
  const [banner, setBanner] = useState(null);
  const [busyActionId, setBusyActionId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const comm = await fetchCommunityProfileFromBackend(slug);
      setCommunity(comm);

      // Ayarları doldur
      setEditShortDesc(comm.shortDescription || "");
      setEditDesc(comm.description || "");
      setEditUni(comm.universityName || "");
      setEditCategory(comm.category || "Genel");
      setEditLogo(comm.logoUrl || "");
      setEditCover(comm.coverImageUrl || "");
      setEditWeb(comm.websiteUrl || "");
      setEditEmail(comm.contactEmail || "");

      const [membersData, appsData, eventsData, analyticsData] = await Promise.all([
        fetchCommunityMembersFromBackend(slug, { status: "ACTIVE" }),
        fetchCommunityApplicationsFromBackend(slug),
        fetchCommunityEventsFromBackend(slug),
        fetchCommunityAnalyticsFromBackend(slug).catch(() => null),
      ]);

      setMembers(membersData.items || []);
      setApplications(appsData.items || []);
      setEvents(eventsData.items || []);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err?.message || "Yönetim paneli yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) {
      loadAll();
    }
  }, [slug, loadAll]);

  // Başvuru Onayla
  async function handleApproveApplication(memberId) {
    setBusyActionId(memberId);
    setBanner(null);
    try {
      await approveCommunityApplicationOnBackend(slug, memberId);
      setBanner({ type: "success", message: "Başvuru başarıyla onaylandı ve üye eklendi." });
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Başvuru onaylanamadı." });
    } finally {
      setBusyActionId(null);
    }
  }

  // Başvuru Reddet
  async function handleRejectApplication(memberId) {
    setBusyActionId(memberId);
    setBanner(null);
    try {
      await rejectCommunityApplicationOnBackend(slug, memberId);
      setBanner({ type: "info", message: "Başvuru reddedildi." });
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Başvuru reddedilemedi." });
    } finally {
      setBusyActionId(null);
    }
  }

  // Üye Çıkar
  async function handleRemoveMember(memberId) {
    if (!window.confirm("Bu üyeyi topluluktan çıkarmak istediğinizden emin misiniz?")) {
      return;
    }
    setBusyActionId(memberId);
    setBanner(null);
    try {
      await removeCommunityMemberOnBackend(slug, memberId);
      setBanner({ type: "info", message: "Üye topluluktan çıkarıldı." });
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Üye çıkarılamadı." });
    } finally {
      setBusyActionId(null);
    }
  }

  // Rol Değiştir (OWNER Only)
  async function handleToggleRole(memberId, currentRole) {
    const nextRole = currentRole === "ADMIN" ? "MEMBER" : "ADMIN";
    setBusyActionId(memberId);
    setBanner(null);
    try {
      await updateCommunityMemberRoleOnBackend(slug, memberId, nextRole);
      setBanner({ type: "success", message: `Üye rolü ${nextRole} olarak güncellendi.` });
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Rol güncellenemedi." });
    } finally {
      setBusyActionId(null);
    }
  }

  // Ayarları Kaydet
  async function handleSaveSettings(e) {
    e.preventDefault();
    setBanner(null);
    try {
      await updateCommunityOnBackend(slug, {
        shortDescription: editShortDesc,
        description: editDesc,
        universityName: editUni,
        category: editCategory,
        logoUrl: editLogo,
        coverImageUrl: editCover,
        websiteUrl: editWeb,
        contactEmail: editEmail,
      });
      setBanner({ type: "success", message: "Topluluk ayarları başarıyla kaydedildi." });
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Ayarlar kaydedilemedi." });
    }
  }

  // Etkinlik Bağla

  async function handlePublishAnnouncement(e) {
    if (e) e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) {
      setBanner({ type: "error", message: "Lütfen duyuru başlığı ve içeriği giriniz." });
      return;
    }

    setPublishingAnnouncement(true);
    setBanner(null);

    try {
      const created = await createCommunityAnnouncementOnBackend(slug, {
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
      });
      setBanner({
        type: "success",
        message: `Duyuru başarıyla yayınlandı ve ${created?.recipientCount ?? members.length} aktif üyeye iletildi!`,
      });
      setAnnouncementTitle("");
      setAnnouncementContent("");
      // Yenile
      const refreshed = await fetchCommunityAnnouncementsFromBackend(slug);
      setAnnouncements(refreshed.items || []);
    } catch (err) {
      setBanner({
        type: "error",
        message: err.message || "Duyuru yayınlanırken bir hata oluştu.",
      });
    } finally {
      setPublishingAnnouncement(false);
    }
  }

  async function handleLinkEvent(e) {
    e.preventDefault();
    setBanner(null);
    if (!linkEventId.trim()) return;
    try {
      await linkEventToCommunityOnBackend(slug, {
        eventId: Number(linkEventId),
        chainId: Number(linkChainId),
        contractAddress: linkContractAddress,
      });
      setBanner({ type: "success", message: `Etkinlik #${linkEventId} başarıyla topluluğa bağlandı.` });
      setLinkEventId("");
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Etkinlik bağlanamadı." });
    }
  }

  // Etkinlik Bağlantısını Kaldır
  async function handleUnlinkEvent(eventId, eventChainId, eventContract) {
    if (!window.confirm(`Etkinlik #${eventId} topluluk bağlantısını kaldırmak istiyor musunuz?`)) {
      return;
    }
    setBanner(null);
    try {
      await unlinkEventFromCommunityOnBackend(slug, {
        eventId: Number(eventId),
        chainId: Number(eventChainId),
        contractAddress: eventContract,
      });
      setBanner({ type: "info", message: `Etkinlik #${eventId} bağlantısı kaldırıldı.` });
      await loadAll();
    } catch (err) {
      setBanner({ type: "error", message: err?.message || "Bağlantı kaldırılamadı." });
    }
  }

  if (loading) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container" style={{ textAlign: "center" }}>
          <span className="material-symbols-outlined pulse-glow" style={{ fontSize: "36px", color: "var(--stitch-primary)" }}>
            sync
          </span>
          <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
            Yönetim paneli yükleniyor...
          </p>
        </div>
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container">
          <button type="button" className="stitch-btn-secondary" onClick={handleBack}>
            ← Geri Dön
          </button>
          <div className="stitch-card" style={{ padding: "3rem", textAlign: "center", marginTop: "2rem", color: "var(--stitch-error)" }}>
            {error || "Yönetim yetkisi doğrulanamadı."}
          </div>
        </div>
      </div>
    );
  }

  const userRole = community.currentUserMembership?.role || "MEMBER";
  const isOwner = userRole === "OWNER";

  return (
    <div className="stitch-shell page-container" style={{ paddingBottom: "5rem" }}>
      {/* Ambient Glows */}
      <div
        className="ambient-glow-primary"
        style={{ top: "0", left: "10%", width: "450px", height: "450px" }}
      />
      <div
        className="ambient-glow-cyan"
        style={{ top: "35%", right: "10%", width: "400px", height: "400px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, paddingTop: "1.5rem" }}>
        {/* Üst Gezinme & Başlık */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <button type="button" className="stitch-btn-secondary" onClick={handleBack} style={{ fontSize: "0.875rem" }}>
            ← Topluluk Sayfasına Dön
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className={`stitch-badge ${isOwner ? "stitch-badge-verified" : "stitch-badge-testnet"}`}>
              {isOwner ? "Topluluk Sahibi (OWNER)" : "Yönetici (ADMIN)"}
            </span>
            <span className="font-label-mono text-outline" style={{ fontSize: "0.75rem" }}>
              {shortenAddress(account)}
            </span>
          </div>
        </div>

        {/* Başlık Kartı */}
        <div
          className="stitch-card"
          style={{
            padding: "1.75rem 2rem",
            borderRadius: "1.25rem",
            marginBottom: "2rem",
            background: "linear-gradient(135deg, rgba(28, 42, 70, 0.95) 0%, rgba(17, 31, 59, 0.95) 100%)",
            border: "1px solid rgba(185, 195, 255, 0.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-secondary-container))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#ffffff",
              }}
            >
              {community.name ? community.name.charAt(0) : "T"}
            </div>
            <div>
              <div className="font-label-badge text-outline">TOPLULUK YÖNETİMİ</div>
              <h1 className="font-headline-lg" style={{ margin: "0.25rem 0" }}>
                {community.name}
              </h1>
              <div className="font-body-sm text-on-surface-variant">
                {community.universityName || "Monad Üniversitesi"} • /{community.slug}
              </div>
            </div>
          </div>
        </div>

        {/* Bildirim Çubuğu */}
        {banner && (
          <div
            className="stitch-card"
            style={{
              padding: "0.875rem 1.25rem",
              marginBottom: "1.5rem",
              backgroundColor: banner.type === "error" ? "rgba(147, 0, 10, 0.25)" : "rgba(16, 185, 129, 0.2)",
              borderColor: banner.type === "error" ? "var(--stitch-error)" : "#6ee7b7",
              color: banner.type === "error" ? "var(--stitch-error)" : "#6ee7b7",
              fontSize: "0.875rem",
            }}
          >
            {banner.message}
          </div>
        )}

        {/* KPI Metrik Kartları */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">AKTİF ÜYE</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-primary)", marginTop: "0.25rem" }}>
              {members.length}
            </div>
          </div>

          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">BEKLEYEN BAŞVURU</div>
            <div className="font-headline-md" style={{ color: applications.length > 0 ? "var(--stitch-tertiary)" : "var(--stitch-outline)", marginTop: "0.25rem" }}>
              {applications.length}
            </div>
          </div>

          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">ETKİNLİK SAYISI</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-secondary)", marginTop: "0.25rem" }}>
              {events.length}
            </div>
          </div>

          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">KATILIM DÖNÜŞÜMÜ</div>
            <div className="font-headline-md" style={{ color: "#6ee7b7", marginTop: "0.25rem" }}>
              %{analytics?.events?.attendanceRate ?? 0}
            </div>
          </div>
        </div>

        {/* Sekme Butonları */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            borderBottom: "1px solid rgba(142, 144, 161, 0.2)",
            paddingBottom: "0.5rem",
            marginBottom: "1.5rem",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            className={activeTab === "members" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("members")}
            style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem", whiteSpace: "nowrap" }}
          >
            Üyeler ({members.length})
          </button>
          <button
            type="button"
            className={activeTab === "applications" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("applications")}
            style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem", whiteSpace: "nowrap" }}
          >
            Başvurular ({applications.length})
          </button>
          <button
            type="button"
            className={activeTab === "events" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("events")}
            style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem", whiteSpace: "nowrap" }}
          >
            Etkinlikler ({events.length})
          </button>
          <button
            type="button"
            className={activeTab === "settings" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("settings")}
            style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem", whiteSpace: "nowrap" }}
          >
            Ayarlar
          </button>
          <button
            type="button"
            className={activeTab === "analytics" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("analytics")}
            style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem", whiteSpace: "nowrap" }}
          >
            Analitik
          </button>
        </div>

        {/* 1. ÜYELER SEKMESİ */}
        {activeTab === "members" && (
          <div className="stitch-card" style={{ padding: "1.5rem" }}>
            <h3 className="font-headline-sm" style={{ margin: "0 0 1rem 0" }}>
              Aktif Topluluk Üyeleri
            </h3>

            {members.length === 0 ? (
              <p className="font-body-sm text-outline">Henüz kayıtlı üye bulunmuyor.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {members.map((m) => {
                  const isMemberOwner = m.role === "OWNER";
                  const isMemberAdmin = m.role === "ADMIN";

                  return (
                    <div
                      key={m.id}
                      className="stitch-card-low"
                      style={{
                        padding: "0.875rem 1.25rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span className="material-symbols-outlined" style={{ color: isMemberOwner ? "var(--stitch-secondary)" : "var(--stitch-primary)" }}>
                          person
                        </span>
                        <div>
                          <div className="font-label-mono" style={{ fontSize: "0.875rem" }}>
                            {m.walletAddress}
                          </div>
                          <div className="font-body-sm text-outline" style={{ fontSize: "0.6875rem" }}>
                            Katılım: {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("tr-TR") : "-"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={`stitch-badge ${isMemberOwner ? "stitch-badge-verified" : isMemberAdmin ? "stitch-badge-testnet" : "stitch-badge-open"}`}>
                          {m.role}
                        </span>

                        {/* Rol Değiştirme (Yalnızca OWNER yapabilir) */}
                        {isOwner && !isMemberOwner && (
                          <button
                            type="button"
                            className="stitch-btn-secondary"
                            onClick={() => handleToggleRole(m.id, m.role)}
                            disabled={busyActionId === m.id}
                            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                          >
                            {isMemberAdmin ? "Adminliği Kaldır" : "Admin Yap"}
                          </button>
                        )}

                        {/* Üye Çıkarma */}
                        {!isMemberOwner && (
                          <button
                            type="button"
                            className="stitch-btn-secondary"
                            onClick={() => handleRemoveMember(m.id)}
                            disabled={busyActionId === m.id}
                            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", color: "var(--stitch-error)" }}
                          >
                            Çıkar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. BAŞVURULAR SEKMESİ */}
        {activeTab === "applications" && (
          <div className="stitch-card" style={{ padding: "1.5rem" }}>
            <h3 className="font-headline-sm" style={{ margin: "0 0 1rem 0" }}>
              Bekleyen Üyelik Başvuruları
            </h3>

            {applications.length === 0 ? (
              <p className="font-body-sm text-outline">Şu anda onay bekleyen başvuru bulunmuyor.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="stitch-card-low"
                    style={{
                      padding: "0.875rem 1.25rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <div className="font-label-mono" style={{ fontSize: "0.875rem" }}>
                        {app.walletAddress}
                      </div>
                      <div className="font-body-sm text-outline" style={{ fontSize: "0.6875rem" }}>
                        Başvuru Tarihi: {new Date(app.createdAt).toLocaleDateString("tr-TR")}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="stitch-btn-primary"
                        onClick={() => handleApproveApplication(app.id)}
                        disabled={busyActionId === app.id}
                        style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                      >
                        ✓ Onayla
                      </button>
                      <button
                        type="button"
                        className="stitch-btn-secondary"
                        onClick={() => handleRejectApplication(app.id)}
                        disabled={busyActionId === app.id}
                        style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem", color: "var(--stitch-error)" }}
                      >
                        ✕ Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. ETKİNLİKLER SEKMESİ */}
        {activeTab === "events" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {/* Mevcut Etkinliği Bağlama Formu */}
            <div className="stitch-card" style={{ padding: "1.5rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 0.5rem 0" }}>
                Mevcut Etkinliği Topluluğa Bağla
              </h3>
              <p className="font-body-sm text-on-surface-variant" style={{ margin: "0 0 1rem 0" }}>
                Kendi cüzdanınızla oluşturduğunuz bir etkinliğin kimliğini (ID) girerek topluluğunuzun
                resmi etkinlikleri arasına ekleyebilirsiniz.
              </p>

              <form onSubmit={handleLinkEvent} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <input
                  type="number"
                  min="1"
                  className="stitch-input"
                  placeholder="Etkinlik ID (örn: 1)"
                  value={linkEventId}
                  onChange={(e) => setLinkEventId(e.target.value)}
                  style={{ width: "160px" }}
                  required
                />
                <button type="submit" className="stitch-btn-primary" style={{ padding: "0.625rem 1.25rem" }}>
                  Etkinliği Bağla
                </button>
              </form>
            </div>

            {/* Bağlı Etkinlikler Listesi */}
            <div className="stitch-card" style={{ padding: "1.5rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 1rem 0" }}>
                Topluluğa Bağlı Etkinlikler ({events.length})
              </h3>

              {events.length === 0 ? (
                <p className="font-body-sm text-outline">Henüz bu topluluğa bağlı bir etkinlik bulunmuyor.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="stitch-card-low"
                      style={{
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span className="font-label-mono text-outline">#{ev.id}</span>
                          <span className="stitch-badge stitch-badge-testnet">{ev.category}</span>
                        </div>
                        <h4 className="font-headline-sm" style={{ margin: "0.25rem 0" }}>
                          {ev.title}
                        </h4>
                        <div className="font-body-sm text-outline" style={{ fontSize: "0.75rem" }}>
                          Kontenjan: {ev.registeredCount || 0} / {ev.capacity} • {ev.campus}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="stitch-btn-secondary"
                          onClick={() => handleOpenEvent(ev.id)}
                          style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem" }}
                        >
                          Detay
                        </button>
                        <button
                          type="button"
                          className="stitch-btn-secondary"
                          onClick={() => handleUnlinkEvent(ev.id, ev.chainId, ev.contractAddress)}
                          style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem", color: "var(--stitch-error)" }}
                        >
                          Bağlantıyı Kaldır
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}


        {/* DUYURULAR SEKMESİ */}
        {activeTab === "announcements" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Yeni Duyuru Formu */}
            <div className="stitch-card" style={{ padding: "1.5rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 0.5rem 0" }}>
                Yeni Topluluk Duyurusu Yayınla
              </h3>
              <p className="font-body-sm text-on-surface-variant" style={{ margin: "0 0 1.25rem 0" }}>
                Yayınladığınız duyuru anında tüm aktif üyelere bildirim merkezi ve canlı bildirim akışı üzerinden iletilir.
              </p>

              <form onSubmit={handlePublishAnnouncement} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label className="font-label-mono text-outline" style={{ display: "block", marginBottom: "0.35rem" }}>
                    DUYURU BAŞLIĞI *
                  </label>
                  <input
                    type="text"
                    className="stitch-input"
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                    placeholder="Örn: Yeni Atölye Çalışmamız Başlıyor!"
                    maxLength={120}
                    required
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label className="font-label-mono text-outline" style={{ display: "block", marginBottom: "0.35rem" }}>
                    DUYURU METNİ *
                  </label>
                  <textarea
                    className="stitch-input"
                    rows={4}
                    value={announcementContent}
                    onChange={(e) => setAnnouncementContent(e.target.value)}
                    placeholder="Topluluk üyelerine aktarmak istediğiniz detayları yazın..."
                    maxLength={2000}
                    required
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--stitch-outline)", marginTop: "0.25rem" }}>
                    {announcementContent.length} / 2000
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    className="stitch-btn-primary"
                    disabled={publishingAnnouncement || !announcementTitle.trim() || !announcementContent.trim()}
                    style={{ padding: "0.6rem 1.5rem" }}
                  >
                    {publishingAnnouncement ? "Yayınlanıyor..." : "📢 Duyuruyu Yayınla"}
                  </button>
                </div>
              </form>
            </div>

            {/* Geçmiş Duyurular */}
            <div className="stitch-card" style={{ padding: "1.5rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 1rem 0" }}>
                Yayınlanan Duyurular ({announcements.length})
              </h3>

              {announcements.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--stitch-outline)" }}>
                  Henüz yayınlanmış bir topluluk duyurusu bulunmuyor.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {announcements.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "1rem 1.25rem",
                        borderRadius: "0.75rem",
                        backgroundColor: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(142, 144, 161, 0.15)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "#ffffff" }}>
                            {item.title}
                          </h4>
                          <span style={{ fontSize: "0.75rem", color: "var(--stitch-outline)" }}>
                            {new Date(item.createdAt).toLocaleString("tr-TR")} • {shortenAddress(item.authorWallet)}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "9999px",
                            backgroundColor: "rgba(111, 136, 255, 0.15)",
                            color: "#b9c3ff",
                            border: "1px solid rgba(111, 136, 255, 0.3)",
                          }}
                        >
                          👥 {item.recipientCount} üyeye ulaştı
                        </span>
                      </div>
                      <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.875rem", color: "var(--stitch-on-surface-variant)", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                        {item.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. AYARLAR SEKMESİ */}
        {activeTab === "settings" && (
          <div className="stitch-card" style={{ padding: "2rem" }}>
            <h3 className="font-headline-sm" style={{ margin: "0 0 1.5rem 0" }}>
              Topluluk Profil Ayarları
            </h3>

            <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="font-label-badge text-outline" htmlFor="setting-short-desc">
                  Kısa Tanıtım (Maks 250 karakter)
                </label>
                <input
                  id="setting-short-desc"
                  type="text"
                  className="stitch-input"
                  value={editShortDesc}
                  onChange={(e) => setEditShortDesc(e.target.value)}
                  maxLength={250}
                  style={{ marginTop: "0.25rem" }}
                />
              </div>

              <div>
                <label className="font-label-badge text-outline" htmlFor="setting-desc">
                  Detaylı Açıklama
                </label>
                <textarea
                  id="setting-desc"
                  rows={4}
                  className="stitch-input"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  style={{ marginTop: "0.25rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="setting-uni">
                    Üniversite
                  </label>
                  <input
                    id="setting-uni"
                    type="text"
                    className="stitch-input"
                    value={editUni}
                    onChange={(e) => setEditUni(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="setting-cat">
                    Kategori
                  </label>
                  <input
                    id="setting-cat"
                    type="text"
                    className="stitch-input"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="setting-logo">
                    Logo Görsel URL
                  </label>
                  <input
                    id="setting-logo"
                    type="url"
                    className="stitch-input"
                    value={editLogo}
                    onChange={(e) => setEditLogo(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="setting-cover">
                    Kapak Görsel URL
                  </label>
                  <input
                    id="setting-cover"
                    type="url"
                    className="stitch-input"
                    value={editCover}
                    onChange={(e) => setEditCover(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="setting-web">
                    Web Sitesi URL
                  </label>
                  <input
                    id="setting-web"
                    type="url"
                    className="stitch-input"
                    value={editWeb}
                    onChange={(e) => setEditWeb(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="setting-email">
                    İletişim E-posta
                  </label>
                  <input
                    id="setting-email"
                    type="email"
                    className="stitch-input"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button type="submit" className="stitch-btn-primary" style={{ padding: "0.625rem 1.5rem" }}>
                  Değişiklikleri Kaydet
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 5. ANALİTİK SEKMESİ */}
        {activeTab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="stitch-card" style={{ padding: "2rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 1.5rem 0" }}>
                Topluluk Katılım ve Performans Analitiği
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
                  <div className="font-label-mono text-outline">TOPLAM ETKİNLİK</div>
                  <div className="font-display-hero" style={{ fontSize: "1.75rem", color: "var(--stitch-tertiary)", marginTop: "0.25rem" }}>
                    {analytics?.events?.totalEvents ?? events.length}
                  </div>
                </div>

                <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
                  <div className="font-label-mono text-outline">TOPLAM KAYIT</div>
                  <div className="font-display-hero" style={{ fontSize: "1.75rem", color: "var(--stitch-primary)", marginTop: "0.25rem" }}>
                    {analytics?.events?.totalRegistrations ?? 0}
                  </div>
                </div>

                <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
                  <div className="font-label-mono text-outline">DOĞRULANAN KATILIM</div>
                  <div className="font-display-hero" style={{ fontSize: "1.75rem", color: "#6ee7b7", marginTop: "0.25rem" }}>
                    {analytics?.events?.totalAttendances ?? 0}
                  </div>
                </div>

                <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
                  <div className="font-label-mono text-outline">KATILIM ORANI</div>
                  <div className="font-display-hero" style={{ fontSize: "1.75rem", color: "var(--stitch-secondary)", marginTop: "0.25rem" }}>
                    %{analytics?.events?.attendanceRate ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
