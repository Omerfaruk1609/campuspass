import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import EventCard from "../components/EventCard";
import {
  ensureSiweSession,
  fetchCommunityEventsFromBackend,
  fetchCommunityProfileFromBackend,
  joinCommunityOnBackend,
  leaveCommunityOnBackend,
} from "../utils/apiClient";
import { shortenAddress } from "../data/events";

export default function CommunityProfilePage({
  slug: propSlug,
  account,
  onBack,
  onSelectEvent,
  onManageCommunity,
  onConnectWallet,
}) {
  const params = useParams();
  const navigate = useNavigate();

  const slug = propSlug ?? params.slug;
  const handleBack = onBack || (() => (navigate ? navigate("/communities") : null));
  const handleManage = onManageCommunity || ((s) => (navigate ? navigate(`/communities/${s}/manage`) : null));
  const handleSelectEvent = onSelectEvent || ((id) => (navigate ? navigate(`/events/${id}`) : null));
  const [community, setCommunity] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("events"); // events | about

  // İşlem durumları
  const [actionBusy, setActionBusy] = useState(false);
  const [actionBanner, setActionBanner] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [commData, eventsData] = await Promise.all([
        fetchCommunityProfileFromBackend(slug),
        fetchCommunityEventsFromBackend(slug),
      ]);
      setCommunity(commData);
      setEvents(eventsData.items || []);
    } catch (err) {
      setError(err?.message || "Topluluk bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) {
      loadData();
    }
  }, [slug, loadData]);

  async function handleJoin() {
    if (!account) {
      if (onConnectWallet) onConnectWallet();
      return;
    }
    setActionBusy(true);
    setActionBanner(null);
    try {
      await ensureSiweSession({
        walletAddress: account,
        statement: "CampusPass topluluk uyelik basvurusu icin cuzdaninizi dogrulayin.",
      });
      await joinCommunityOnBackend(slug);
      setActionBanner({ type: "success", message: "Topluluk üyelik başvurunuz alındı!" });
      await loadData();
    } catch (err) {
      setActionBanner({ type: "error", message: err?.message || "Başvuru yapılamadı." });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm("Bu topluluktan ayrılmak istediğinizden emin misiniz?")) {
      return;
    }
    setActionBusy(true);
    setActionBanner(null);
    try {
      await ensureSiweSession({
        walletAddress: account,
        statement: "CampusPass topluluk ayrilma islemi icin cuzdaninizi dogrulayin.",
      });
      await leaveCommunityOnBackend(slug);
      setActionBanner({ type: "info", message: "Topluluk üyeliğinden ayrıldınız." });
      await loadData();
    } catch (err) {
      setActionBanner({ type: "error", message: err?.message || "Ayrılma işlemi başarısız." });
    } finally {
      setActionBusy(false);
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
            Topluluk profili yükleniyor...
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
            ← Topluluklara Dön
          </button>
          <div className="stitch-card" style={{ padding: "3rem", textAlign: "center", marginTop: "2rem", color: "var(--stitch-error)" }}>
            {error || "Topluluk bulunamadı."}
          </div>
        </div>
      </div>
    );
  }

  const membership = community.currentUserMembership;
  const isOwner = membership?.role === "OWNER";
  const isAdmin = membership?.role === "ADMIN";
  const isMember = membership?.status === "ACTIVE";
  const isPending = membership?.status === "PENDING";
  const canManage = isOwner || isAdmin;

  const logoInitial = community.name ? community.name.charAt(0).toUpperCase() : "T";

  return (
    <div className="stitch-shell page-container" style={{ paddingBottom: "5rem" }}>
      {/* Ambient Glows */}
      <div
        className="ambient-glow-primary"
        style={{ top: "0", left: "10%", width: "500px", height: "450px" }}
      />
      <div
        className="ambient-glow-secondary"
        style={{ top: "35%", right: "5%", width: "450px", height: "450px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, paddingTop: "1.5rem" }}>
        {/* Üst Gezinme */}
        <div style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="stitch-btn-secondary" onClick={handleBack} style={{ fontSize: "0.875rem" }}>
            ← Tüm Topluluklara Dön
          </button>
        </div>

        {/* HERO KAPAK VE PROFİL BANNER'I */}
        <div
          className="stitch-card"
          style={{
            position: "relative",
            width: "100%",
            borderRadius: "1.25rem",
            overflow: "hidden",
            marginBottom: "2rem",
            backgroundColor: "var(--stitch-surface-container-lowest)",
            border: "1px solid rgba(142, 144, 161, 0.2)",
          }}
        >
          {/* Kapak Görseli */}
          <div
            style={{
              height: "220px",
              width: "100%",
              position: "relative",
              background: community.coverImageUrl
                ? `url(${community.coverImageUrl}) center/cover no-repeat`
                : "radial-gradient(circle at 80% 20%, rgba(111, 136, 255, 0.35), transparent 70%), linear-gradient(135deg, #0c1b36 0%, #03122e 100%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(3, 18, 46, 0.95) 0%, rgba(3, 18, 46, 0.3) 100%)",
              }}
            />
          </div>

          {/* Profil Bilgisi ve Aksiyon Satırı */}
          <div
            style={{
              padding: "0 2rem 2rem 2rem",
              marginTop: "-50px",
              position: "relative",
              zIndex: 3,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: "1.5rem",
            }}
          >
            {/* Sol: Logo + Başlık + Üniversite */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", flexWrap: "wrap" }}>
              {community.logoUrl ? (
                <img
                  src={community.logoUrl}
                  alt={community.name}
                  style={{
                    width: "100px",
                    height: "100px",
                    borderRadius: "24px",
                    objectFit: "cover",
                    border: "3px solid var(--stitch-surface-container)",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                    backgroundColor: "var(--stitch-surface-container)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100px",
                    height: "100px",
                    borderRadius: "24px",
                    background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-secondary-container))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2.5rem",
                    fontWeight: 800,
                    color: "#ffffff",
                    border: "3px solid var(--stitch-surface-container)",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                  }}
                >
                  {logoInitial}
                </div>
              )}

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                  <span className="stitch-badge stitch-badge-testnet">
                    Topluluk Profili
                  </span>
                  <span className="stitch-badge" style={{ backgroundColor: "rgba(142, 144, 161, 0.2)", color: "var(--stitch-on-surface)" }}>
                    {community.category || "Genel"}
                  </span>
                  <span className="stitch-badge" style={{ backgroundColor: "rgba(142, 144, 161, 0.15)", color: "var(--stitch-outline)" }}>
                    {community.universityName || "Monad Üniversitesi"}
                  </span>
                </div>

                <h1 className="font-display-hero" style={{ margin: "0 0 0.25rem 0", fontSize: "2rem" }}>
                  {community.name}
                </h1>

                <div className="font-body-sm text-on-surface-variant">
                  Kurucu Cüzdan:{" "}
                  <span className="font-label-mono text-outline">
                    {shortenAddress(community.createdByWallet || community.leadOrganizerAddress)}
                  </span>
                </div>
              </div>
            </div>

            {/* Sağ: Katılım / Yönetim Aksiyonları */}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              {canManage && (
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={() => handleManage(community.slug || community.id)}
                  style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    admin_panel_settings
                  </span>
                  Topluluğu Yönet
                </button>
              )}

              {!account ? (
                <button
                  type="button"
                  className="stitch-btn-primary"
                  onClick={onConnectWallet}
                  style={{ fontSize: "0.875rem" }}
                >
                  Katılmak İçin Cüzdan Bağla
                </button>
              ) : isMember ? (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="stitch-badge stitch-badge-completed" style={{ padding: "0.5rem 0.85rem", fontSize: "0.8125rem" }}>
                    ✓ Topluluk Üyesisin ({membership?.role})
                  </span>
                  {!isOwner && (
                    <button
                      type="button"
                      className="stitch-btn-secondary"
                      onClick={handleLeave}
                      disabled={actionBusy}
                      style={{ fontSize: "0.75rem", padding: "0.4rem 0.75rem" }}
                    >
                      Ayrıl
                    </button>
                  )}
                </div>
              ) : isPending ? (
                <button type="button" className="stitch-btn-secondary" disabled style={{ opacity: 0.8, fontSize: "0.875rem" }}>
                  Başvurun Değerlendiriliyor ⏳
                </button>
              ) : (
                <button
                  type="button"
                  className="stitch-btn-primary"
                  onClick={handleJoin}
                  disabled={actionBusy}
                  style={{ fontSize: "0.875rem", padding: "0.625rem 1.5rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    person_add
                  </span>
                  {actionBusy ? "İşleniyor..." : "Topluluğa Katıl"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bildirim Çubuğu */}
        {actionBanner && (
          <div
            className="stitch-card"
            style={{
              padding: "0.875rem 1.25rem",
              marginBottom: "1.5rem",
              backgroundColor: actionBanner.type === "error" ? "rgba(147, 0, 10, 0.25)" : "rgba(16, 185, 129, 0.2)",
              borderColor: actionBanner.type === "error" ? "var(--stitch-error)" : "#6ee7b7",
              color: actionBanner.type === "error" ? "var(--stitch-error)" : "#6ee7b7",
              fontSize: "0.875rem",
            }}
          >
            {actionBanner.message}
          </div>
        )}

        {/* Hızlı Sayaç Şeridi */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
            <div className="font-label-mono text-outline">TOPLULUK ÜYESİ</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-primary)", marginTop: "0.25rem" }}>
              {community.membersCount || 0}
            </div>
          </div>
          <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
            <div className="font-label-mono text-outline">DÜZENLENEN ETKİNLİK</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-tertiary)", marginTop: "0.25rem" }}>
              {events.length}
            </div>
          </div>
          <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
            <div className="font-label-mono text-outline">KAMPÜS BAĞLANTISI</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-secondary)", marginTop: "0.25rem" }}>
              {community.universityName || "Monad Üniversitesi"}
            </div>
          </div>
        </div>

        {/* Sekme Butonları */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            borderBottom: "1px solid rgba(142, 144, 161, 0.2)",
            paddingBottom: "0.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <button
            type="button"
            className={activeTab === "events" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("events")}
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              event
            </span>
            Topluluk Etkinlikleri ({events.length})
          </button>
          <button
            type="button"
            className={activeTab === "about" ? "stitch-btn-primary" : "stitch-btn-secondary"}
            onClick={() => setActiveTab("about")}
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              info
            </span>
            Hakkında &amp; İletişim
          </button>
        </div>

        {/* SEKME 1: ETKİNLİKLER */}
        {activeTab === "events" && (
          <div>
            {events.length === 0 ? (
              <div className="stitch-card" style={{ padding: "3rem", textAlign: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "40px", color: "var(--stitch-outline)" }}>
                  event_busy
                </span>
                <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
                  Bu topluluğa ait yayınlanmış aktif etkinlik bulunmuyor.
                </p>
              </div>
            ) : (
              <div className="stitch-events-grid">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    account={account}
                    onSelectEvent={handleSelectEvent}
                    onQuickRegister={() => onSelectEvent(event.id)}
                    registeringId={null}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* SEKME 2: HAKKINDA & İLETİŞİM */}
        {activeTab === "about" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            <div className="stitch-card" style={{ padding: "2rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 1rem 0" }}>
                Topluluk Hakkında
              </h3>
              <p className="font-body-md text-on-surface-variant" style={{ margin: 0, whiteSpace: "pre-line", lineHeight: 1.7 }}>
                {community.description || community.shortDescription || "Topluluk hakkında detaylı bilgi bulunmuyor."}
              </p>
            </div>

            <div className="stitch-card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h3 className="font-headline-sm" style={{ margin: "0 0 0.5rem 0" }}>
                İletişim &amp; Bağlantılar
              </h3>

              {community.contactEmail && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--stitch-primary)" }}>
                    mail
                  </span>
                  <a href={`mailto:${community.contactEmail}`} style={{ color: "var(--stitch-primary)", textDecoration: "none" }}>
                    {community.contactEmail}
                  </a>
                </div>
              )}

              {community.websiteUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--stitch-tertiary)" }}>
                    language
                  </span>
                  <a href={community.websiteUrl} target="_blank" rel="noreferrer" style={{ color: "var(--stitch-tertiary)", textDecoration: "none" }}>
                    {community.websiteUrl} ↗
                  </a>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem" }}>
                <span className="material-symbols-outlined" style={{ color: "var(--stitch-outline)" }}>
                  school
                </span>
                <span>{community.universityName || "Monad Üniversitesi"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem" }}>
                <span className="material-symbols-outlined" style={{ color: "var(--stitch-outline)" }}>
                  category
                </span>
                <span>{community.category || "Genel"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
