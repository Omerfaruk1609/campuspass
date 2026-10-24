import { useEffect, useMemo, useState } from "react";
import CommunityCard from "../components/CommunityCard";
import {
  createCommunityOnBackend,
  fetchCommunitiesFromBackend,
} from "../utils/apiClient";

const COMMUNITY_CATEGORIES = [
  "ALL",
  "Blockchain & Web3",
  "Yazılım & Teknoloji",
  "Yapay Zekâ ve Veri",
  "Kariyer & Girişimcilik",
  "Mühendislik & Bilim",
  "Kültür & Sanat",
  "Sosyal & Spor",
];

export default function CommunityDiscoveryPage({
  account,
  onSelectCommunity,
  onConnectWallet,
}) {
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtreler
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

  // Yeni Topluluk Oluşturma Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createUniversity, setCreateUniversity] = useState("Monad Üniversitesi");
  const [createCategory, setCreateCategory] = useState("Blockchain & Web3");
  const [createShortDesc, setCreateShortDesc] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createLogoUrl, setCreateLogoUrl] = useState("");
  const [createCoverUrl, setCreateCoverUrl] = useState("");
  const [createWebsite, setCreateWebsite] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadCommunities = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCommunitiesFromBackend({
        search: searchQuery,
        category: selectedCategory,
        page: pageNum,
        limit: 12,
      });
      setCommunities(data.items || []);
      setMeta(data.meta || { total: 0, totalPages: 1 });
      setPage(pageNum);
    } catch (err) {
      setError(err?.message || "Topluluklar listelenirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    loadCommunities(1);
  }, [selectedCategory, loadCommunities]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadCommunities(1);
  }

  async function handleCreateCommunitySubmit(e) {
    e.preventDefault();
    setCreateError("");

    if (!account) {
      setCreateError("Topluluk oluşturmak için lütfen önce cüzdanınızı bağlayın.");
      return;
    }

    if (!createName.trim() || createName.trim().length < 3) {
      setCreateError("Topluluk adı en az 3 karakter olmalıdır.");
      return;
    }

    setCreateBusy(true);
    try {
      const created = await createCommunityOnBackend({
        name: createName.trim(),
        universityName: createUniversity.trim(),
        category: createCategory,
        shortDescription: createShortDesc.trim(),
        description: createDesc.trim(),
        logoUrl: createLogoUrl.trim() || undefined,
        coverImageUrl: createCoverUrl.trim() || undefined,
        websiteUrl: createWebsite.trim() || undefined,
        contactEmail: createEmail.trim() || undefined,
      });

      setShowCreateModal(false);
      setCreateName("");
      setCreateShortDesc("");
      setCreateDesc("");
      setCreateLogoUrl("");
      setCreateCoverUrl("");
      setCreateWebsite("");
      setCreateEmail("");

      // Yeni oluşturulan topluluk profiline yönlendir
      if (created?.slug) {
        onSelectCommunity(created.slug);
      } else {
        await loadCommunities(1);
      }
    } catch (err) {
      setCreateError(err?.message || "Topluluk oluşturulurken bir hata oluştu.");
    } finally {
      setCreateBusy(false);
    }
  }

  // Toplam üye sayısı özeti
  const totalMemberCount = useMemo(() => {
    return communities.reduce((acc, c) => acc + (c.membersCount || 0), 0);
  }, [communities]);

  return (
    <div className="stitch-shell page-container" style={{ paddingBottom: "5rem" }}>
      {/* Ambient Glows */}
      <div
        className="ambient-glow-primary"
        style={{ top: "0", left: "10%", width: "500px", height: "400px" }}
      />
      <div
        className="ambient-glow-cyan"
        style={{ top: "30%", right: "10%", width: "450px", height: "450px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, paddingTop: "2rem" }}>
        {/* Üst Başlık & Eylem Çubuğu */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <div>
            <span className="font-label-mono text-tertiary">ÜNİVERSİTE EKOSİSTEMİ</span>
            <h1 className="font-display-hero" style={{ margin: "0.25rem 0 0.5rem 0" }}>
              Toplulukları Keşfet
            </h1>
            <p className="font-body-md text-on-surface-variant" style={{ margin: 0, maxWidth: "600px" }}>
              Üniversite kulüplerini ve topluluklarını keşfedin, üye olun, etkinliklerine katılın ve
              kampüs içi ağınızı genişletin.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="stitch-btn-primary"
              onClick={() => {
                if (!account) {
                  if (onConnectWallet) onConnectWallet();
                } else {
                  setShowCreateModal(true);
                }
              }}
              style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                add_circle
              </span>
              Topluluk Kur
            </button>
          </div>
        </div>

        {/* Sayaç Rozetleri */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
            <div className="font-label-mono text-outline">TOPLAM TOPLULUK</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-tertiary)", marginTop: "0.25rem" }}>
              {meta.total}
            </div>
          </div>
          <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
            <div className="font-label-mono text-outline">TOPLULUK ÜYESİ</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-primary)", marginTop: "0.25rem" }}>
              {totalMemberCount}
            </div>
          </div>
          <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
            <div className="font-label-mono text-outline">AĞ / ÜNİVERSİTE</div>
            <div className="font-headline-md" style={{ color: "var(--stitch-secondary)", marginTop: "0.25rem" }}>
              Monad Testnet
            </div>
          </div>
        </div>

        {/* Arama ve Kategori Filtresi */}
        <div
          className="stitch-card-low"
          style={{
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          {/* Arama Formu */}
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <div style={{ position: "relative", flexGrow: 1 }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--stitch-outline)",
                  fontSize: "18px",
                }}
              >
                search
              </span>
              <input
                type="search"
                className="stitch-input"
                placeholder="Topluluk adı, üniversite veya ilgi alanı ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "2.5rem" }}
              />
            </div>

            <button type="submit" className="stitch-btn-secondary" style={{ padding: "0.625rem 1.25rem" }}>
              Ara
            </button>
          </form>

          {/* Kategori Hapları */}
          <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem" }}>
            {COMMUNITY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`stitch-btn-secondary ${selectedCategory === cat ? "bg-surface-container-high" : ""}`}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.35rem 0.75rem",
                  whiteSpace: "nowrap",
                  borderColor: selectedCategory === cat ? "var(--stitch-primary)" : undefined,
                  color: selectedCategory === cat ? "#ffffff" : undefined,
                }}
              >
                {cat === "ALL" ? "Tüm Kategoriler" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Topluluk Kartları Izgarası */}
        {loading ? (
          <div className="stitch-card" style={{ padding: "4rem", textAlign: "center" }}>
            <span className="material-symbols-outlined pulse-glow" style={{ fontSize: "36px", color: "var(--stitch-primary)" }}>
              sync
            </span>
            <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
              Üniversite toplulukları yükleniyor...
            </p>
          </div>
        ) : error ? (
          <div className="stitch-card" style={{ padding: "3rem", textAlign: "center", color: "var(--stitch-error)" }}>
            <p>{error}</p>
            <button
              type="button"
              className="stitch-btn-secondary"
              onClick={() => loadCommunities(page)}
              style={{ marginTop: "1rem" }}
            >
              Tekrar Dene
            </button>
          </div>
        ) : communities.length === 0 ? (
          <div className="stitch-card" style={{ padding: "4rem", textAlign: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--stitch-outline)" }}>
              groups
            </span>
            <h3 className="font-headline-sm" style={{ marginTop: "1rem" }}>
              Henüz bir topluluk bulunamadı
            </h3>
            <p className="font-body-sm text-on-surface-variant" style={{ maxWidth: "500px", margin: "0.5rem auto 1.5rem" }}>
              Arama kriterlerinizi değiştirebilir veya üniversiteniz için ilk topluluğu siz kurabilirsiniz.
            </p>
            <button
              type="button"
              className="stitch-btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + İlk Topluluğu Kur
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {communities.map((comm) => (
              <CommunityCard
                key={comm.id}
                community={comm}
                onSelectCommunity={onSelectCommunity}
              />
            ))}
          </div>
        )}

        {/* Sayfalama */}
        {meta.totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "2.5rem" }}>
            <button
              type="button"
              className="stitch-btn-secondary"
              disabled={page <= 1}
              onClick={() => loadCommunities(page - 1)}
              style={{ fontSize: "0.75rem", padding: "0.4rem 0.75rem" }}
            >
              ← Önceki
            </button>
            <span className="font-body-sm" style={{ display: "flex", alignItems: "center", padding: "0 0.5rem" }}>
              Sayfa {page} / {meta.totalPages}
            </span>
            <button
              type="button"
              className="stitch-btn-secondary"
              disabled={page >= meta.totalPages}
              onClick={() => loadCommunities(page + 1)}
              style={{ fontSize: "0.75rem", padding: "0.4rem 0.75rem" }}
            >
              Sonraki →
            </button>
          </div>
        )}
      </div>

      {/* YENİ TOPLULUK KURMA MODALI */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 13, 40, 0.8)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="stitch-card"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "2rem",
              borderRadius: "1.25rem",
              background: "linear-gradient(135deg, rgba(17, 31, 59, 0.98) 0%, rgba(12, 27, 54, 0.98) 100%)",
              border: "1px solid rgba(185, 195, 255, 0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <h2 className="font-headline-md" style={{ margin: 0 }}>
                  Yeni Üniversite Topluluğu Kur
                </h2>
                <span className="font-label-badge text-outline">
                  CampusPass Topluluk Profili
                </span>
              </div>
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={() => setShowCreateModal(false)}
                style={{ padding: "0.35rem 0.6rem" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCommunitySubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="font-label-badge text-outline" htmlFor="create-name">
                  Topluluk Adı * (3-60 karakter)
                </label>
                <input
                  id="create-name"
                  type="text"
                  className="stitch-input"
                  placeholder="Örn: Blockchain & Web3 Kulübü"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  disabled={createBusy}
                  style={{ marginTop: "0.25rem" }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="create-uni">
                    Üniversite
                  </label>
                  <input
                    id="create-uni"
                    type="text"
                    className="stitch-input"
                    placeholder="Örn: Monad Üniversitesi"
                    value={createUniversity}
                    onChange={(e) => setCreateUniversity(e.target.value)}
                    disabled={createBusy}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="create-cat">
                    Kategori
                  </label>
                  <select
                    id="create-cat"
                    className="stitch-select"
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    disabled={createBusy}
                    style={{ marginTop: "0.25rem" }}
                  >
                    {COMMUNITY_CATEGORIES.filter((c) => c !== "ALL").map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-label-badge text-outline" htmlFor="create-short-desc">
                  Kısa Tanıtım (Maks 250 karakter)
                </label>
                <input
                  id="create-short-desc"
                  type="text"
                  className="stitch-input"
                  placeholder="Topluluğun ana odağını anlatan bir cümle..."
                  value={createShortDesc}
                  onChange={(e) => setCreateShortDesc(e.target.value)}
                  disabled={createBusy}
                  style={{ marginTop: "0.25rem" }}
                  maxLength={250}
                />
              </div>

              <div>
                <label className="font-label-badge text-outline" htmlFor="create-desc">
                  Detaylı Açıklama
                </label>
                <textarea
                  id="create-desc"
                  rows={3}
                  className="stitch-input"
                  placeholder="Topluluk faaliyetleri, misyonu ve üyelik şartları..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  disabled={createBusy}
                  style={{ marginTop: "0.25rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="create-logo">
                    Logo Görsel URL
                  </label>
                  <input
                    id="create-logo"
                    type="url"
                    className="stitch-input"
                    placeholder="https://..."
                    value={createLogoUrl}
                    onChange={(e) => setCreateLogoUrl(e.target.value)}
                    disabled={createBusy}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="create-cover">
                    Kapak Görsel URL
                  </label>
                  <input
                    id="create-cover"
                    type="url"
                    className="stitch-input"
                    placeholder="https://..."
                    value={createCoverUrl}
                    onChange={(e) => setCreateCoverUrl(e.target.value)}
                    disabled={createBusy}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="font-label-badge text-outline" htmlFor="create-web">
                    Web Sitesi
                  </label>
                  <input
                    id="create-web"
                    type="url"
                    className="stitch-input"
                    placeholder="https://..."
                    value={createWebsite}
                    onChange={(e) => setCreateWebsite(e.target.value)}
                    disabled={createBusy}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>

                <div>
                  <label className="font-label-badge text-outline" htmlFor="create-email">
                    İletişim E-posta
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    className="stitch-input"
                    placeholder="kulup@universite.edu.tr"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    disabled={createBusy}
                    style={{ marginTop: "0.25rem" }}
                  />
                </div>
              </div>

              {createError && (
                <div style={{ color: "var(--stitch-error)", fontSize: "0.8125rem" }}>
                  {createError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={createBusy}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="stitch-btn-primary"
                  disabled={createBusy}
                >
                  {createBusy ? "Oluşturuluyor..." : "Topluluğu Kur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
