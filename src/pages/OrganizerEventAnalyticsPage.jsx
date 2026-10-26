import { useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { ethers } from "ethers";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  shortenAddress,
} from "../data/events";
import {
  downloadOrganizerEventCsv,
  ensureOrganizerSiweSession,
  fetchOrganizerEventAnalyticsFromBackend,
  fetchOrganizerEventParticipantsFromBackend,
  getActiveAuthState,
} from "../utils/apiClient";
import { formatTurkeyDateOnly, formatTurkeyDateTime } from "../utils/eventMetadata";

export default function OrganizerEventAnalyticsPage(props) {
  const context = useAppContext();
  const params = useParams();
  const navigate = useNavigate();

  const account = props.account ?? context?.account ?? null;
  const eventId = props.eventId ?? (params.eventId ? Number(params.eventId) : null);
  const handleBack = props.onBack || (() => (navigate ? navigate("/organizer") : null));
  const handleOpenEvent = props.onOpenEventPage || ((id) => (navigate ? navigate(`/events/${id}`) : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [metrics, setMetrics] = useState(null);

  // Participants Table state
  const [participants, setParticipants] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [participantFilter, setParticipantFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [eventAnnouncements, setEventAnnouncements] = useState([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);
  const [announcementBanner, setAnnouncementBanner] = useState(null);

  // SIWE state
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);

  const ensureSiwe = useCallback(async () => {
    if (!account) return false;
    const current = getActiveAuthState();
    if (
      current.authenticated &&
      current.walletAddress &&
      current.walletAddress.toLowerCase() === account.toLowerCase()
    ) {
      return true;
    }

    if (!window.ethereum) {
      setAuthError("SIWE ile giriş yapmak için tarayıcı cüzdanı (MetaMask vb.) gereklidir.");
      return false;
    }

    setAuthenticating(true);
    setAuthError(null);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      await ensureOrganizerSiweSession({ signer, walletAddress: account, chainId: MONAD_CHAIN_ID });
      return true;
    } catch (err) {
      setAuthError(err.message || "Organizatör oturumu doğrulanamadı.");
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [account]);

  const loadEventAnalytics = useCallback(async () => {
    if (!eventId || !account) return;
    setLoading(true);
    setError(null);
    try {
      const isAuthed = await ensureSiwe();
      if (!isAuthed) {
        setLoading(false);
        return;
      }

      const res = await fetchOrganizerEventAnalyticsFromBackend(eventId);
      if (res && res.data) {
        setEventData(res.data.event);
        setMetrics(res.data.metrics);
      }
    } catch (err) {
      setError(
        err.status === 403
          ? "Bu etkinliğin organizatörü değilsiniz. Analitik verileri yalnızca etkinliği oluşturan organizatör görüntüleyebilir."
          : err.message || "Etkinlik analitik verileri yüklenirken bir hata oluştu."
      );
    } finally {
      setLoading(false);
    }
  }, [eventId, account, ensureSiwe]);

  const loadParticipants = useCallback(
    async (pageToLoad = 1) => {
      if (!eventId || !account) return;
      setLoadingParticipants(true);
      try {
        const res = await fetchOrganizerEventParticipantsFromBackend({
          eventId,
          page: pageToLoad,
          limit: 10,
          status: participantFilter,
          search: searchQuery,
        });
        if (res && res.data) {
          setParticipants(res.data.participants || []);
          if (res.data.pagination) {
            setPagination(res.data.pagination);
          }
        }
      } catch (err) {
        console.error("Katılımcılar yüklenirken hata:", err);
      } finally {
        setLoadingParticipants(false);
      }
    },
    [eventId, account, participantFilter, searchQuery]
  );

  useEffect(() => {
    loadEventAnalytics();
  }, [loadEventAnalytics]);

  useEffect(() => {
    if (eventData) {
      loadParticipants(1);
    }
  }, [eventData, loadParticipants]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  function handleFilterChange(newStatus) {
    setParticipantFilter(newStatus);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  async function handleExportCsv(type) {
    setCsvDownloading(true);
    try {
      await downloadOrganizerEventCsv({
        eventId,
        type,
        customFilename: `campuspass-event-${eventId}-${type}.csv`,
      });
    } catch (err) {
      alert("CSV indirme hatası: " + (err.message || "Bilinmeyen hata"));
    } finally {
      setCsvDownloading(false);
    }
  }

  async function handleCopyAddress(addr) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(addr);
      setCopiedAddress(addr);
      setTimeout(() => setCopiedAddress(null), 2000);
    }
  }

  if (!account) {
    return (
      <div className="page-container">
        <section className="card-panel">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleBack}>
            ← Organizatör Paneline Dön
          </button>
          <div className="empty-state" style={{ marginTop: "1rem" }}>
            <h3>Cüzdan Bağlantısı Gerekli</h3>
            <p>Etkinlik analitiklerini görüntülemek için organizatör cüzdanınızı bağlamalısınız.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loading || authenticating) {
    return (
      <div className="page-container">
        <section className="card-panel">
          <div className="empty-state">
            <p>Etkinlik analitiği ve blokzincir kayıtları yükleniyor...</p>
          </div>
        </section>
      </div>
    );
  }

  if (authError || error) {
    return (
      <div className="page-container">
        <section className="card-panel">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleBack}>
            ← Organizatör Paneline Dön
          </button>
          <div className="inline-alert error" style={{ marginTop: "1rem" }}>
            <strong>Erişim Hatası:</strong> {authError || error}
          </div>
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={loadEventAnalytics}
            >
              ↻ Tekrar Dene
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
              Panoya Dön
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Üst Navigasyon & Aksiyon Barı */}
      <div className="analytics-top-bar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Organizatör Paneline Dön
        </button>
        <div className="analytics-top-actions">
          {handleOpenEvent && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleOpenEvent(eventId)}
            >
              Etkinlik Sayfasını Aç ↗
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleExportCsv("summary")}
            disabled={csvDownloading}
          >
            📊 Etkinlik Özeti CSV
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => handleExportCsv("participants")}
            disabled={csvDownloading}
          >
            📥 Katılımcı Listesi CSV
          </button>
        </div>
      </div>

      {/* Etkinlik Başlık ve Özet Paneli */}
      {eventData && (
        <section className="card-panel event-analytics-header">
          <div className="panel-header-flex">
            <div>
              <div className="badge-group" style={{ marginBottom: "0.4rem" }}>
                <span className="event-id-badge">Etkinlik #{eventData.id}</span>
                <span className="status-badge organizer">{eventData.community}</span>
                <span
                  className={`status-badge ${
                    eventData.status === "completed"
                      ? "active"
                      : eventData.status === "cancelled"
                      ? "cancelled"
                      : "registered"
                  }`}
                >
                  {eventData.statusLabel || eventData.status}
                </span>
                <span className="status-badge inactive">{eventData.category}</span>
              </div>
              <h1 className="event-title" style={{ fontSize: "1.6rem", margin: "0.3rem 0" }}>
                {eventData.title}
              </h1>
              <p className="panel-subtitle" style={{ margin: 0 }}>
                📅 {formatTurkeyDateOnly(eventData.date)} • {eventData.startTime} - {eventData.endTime} (TSİ) | 📍{" "}
                {eventData.location?.campus} / {eventData.location?.building} ({eventData.location?.room})
              </p>
            </div>
            <div className="organizer-badge-box">
              <span className="organizer-badge-label">Organizatör</span>
              <a
                href={`${MONAD_EXPLORER_URL}/address/${eventData.organizer}`}
                target="_blank"
                rel="noreferrer"
                className="monospace"
                style={{ fontSize: "0.82rem", color: "var(--color-primary-light)" }}
              >
                {shortenAddress(eventData.organizer)} ↗
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Detaylı Oran ve Performans KPI Kartları */}
      {metrics && (
        <section className="card-panel" style={{ marginTop: "1rem" }}>
          <div className="panel-header">
            <h2>Dönüşüm ve Katılım Metrikleri</h2>
            <p className="panel-subtitle">
              Tüm metrikler Monad Testnet blokzincir kayıtları ve doğrulanmış log verilerine dayanır.
            </p>
          </div>

          <div className="student-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div className="kpi-card">
              <span className="kpi-value">{metrics.capacity}</span>
              <span className="kpi-label">Toplam Kapasite</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-value">{metrics.registeredCount}</span>
              <span className="kpi-label">Alınan Kayıt</span>
            </div>

            <div className="kpi-card highlight-success">
              <span className="kpi-value">{metrics.verifiedAttendanceCount}</span>
              <span className="kpi-label">Doğrulanmış Katılım</span>
            </div>

            <div className="kpi-card highlight-primary">
              <span className="kpi-value">%{metrics.occupancyRate}</span>
              <span className="kpi-label">Doluluk Oranı (Kapasite)</span>
            </div>

            <div className="kpi-card highlight-primary">
              <span className="kpi-value">%{metrics.attendanceRate}</span>
              <span className="kpi-label">Katılım Oranı (Kayıt/Katılım)</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-value">{metrics.certificateCount}</span>
              <span className="kpi-label">Verilen Sertifika</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-value">%{metrics.certificateRate}</span>
              <span className="kpi-label">Sertifika Dönüşümü</span>
            </div>

            <div className="kpi-card" style={{ borderLeft: "3px solid #f87171" }}>
              <span className="kpi-value">%{metrics.dropOffRate}</span>
              <span className="kpi-label">Vazgeçme / Kayıp Oranı</span>
            </div>
          </div>
        </section>
      )}

      {/* Katılımcı Yönetimi Tablosu */}
      <section className="card-panel" style={{ marginTop: "1.25rem" }}>
        <div className="panel-header-flex" style={{ flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2>Katılımcı Yönetimi &amp; Durum Listesi</h2>
            <p className="panel-subtitle">
              Kayıtlı öğrencilerin katılım ve sertifika durumları. Toplam {pagination.totalCount} katılımcı.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="search-form" style={{ minWidth: "260px" }}>
            <div className="search-box">
              <input
                type="text"
                placeholder="Cüzdan adresi ile ara (0x...)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="search-input"
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Ara
              </button>
            </div>
          </form>
        </div>

        {/* Katılımcı Durum Filtre Hapları */}
        <div className="section-toolbar" style={{ marginTop: "1rem" }}>
          <div className="filter-pills">
            <button
              type="button"
              className={`pill-btn ${participantFilter === "ALL" ? "active" : ""}`}
              onClick={() => handleFilterChange("ALL")}
            >
              Tümü ({metrics?.registeredCount ?? 0})
            </button>
            <button
              type="button"
              className={`pill-btn ${participantFilter === "ATTENDED" ? "active" : ""}`}
              onClick={() => handleFilterChange("ATTENDED")}
            >
              Katılımı Doğrulandı ({metrics?.verifiedAttendanceCount ?? 0})
            </button>
            <button
              type="button"
              className={`pill-btn ${participantFilter === "REGISTERED_ONLY" ? "active" : ""}`}
              onClick={() => handleFilterChange("REGISTERED_ONLY")}
            >
              Yalnızca Kayıtlı ({(metrics?.registeredCount ?? 0) - (metrics?.verifiedAttendanceCount ?? 0)})
            </button>
            <button
              type="button"
              className={`pill-btn ${participantFilter === "CERTIFIED" ? "active" : ""}`}
              onClick={() => handleFilterChange("CERTIFIED")}
            >
              Sertifikalı ({metrics?.certificateCount ?? 0})
            </button>
          </div>
        </div>

        {/* Katılımcı Tablosu */}
        {loadingParticipants ? (
          <div className="empty-state">
            <p>Katılımcı kayıtları listeleniyor...</p>
          </div>
        ) : participants.length === 0 ? (
          <div className="empty-state">
            <p>Seçilen filtre veya arama kriterine uygun katılımcı bulunamadı.</p>
          </div>
        ) : (
          <div className="table-responsive" style={{ marginTop: "1rem" }}>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Katılımcı Cüzdan</th>
                  <th>Kayıt Zamanı (TSİ)</th>
                  <th>Kayıt Onayı</th>
                  <th>Katılım Durumu</th>
                  <th>Sertifika</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.walletAddress}>
                    <td>
                      <div className="participant-wallet-cell">
                        <span className="monospace" title={p.walletAddress}>
                          {shortenAddress(p.walletAddress)}
                        </span>
                        <button
                          type="button"
                          className="copy-mini-btn"
                          title="Cüzdan adresini kopyala"
                          onClick={() => handleCopyAddress(p.walletAddress)}
                        >
                          {copiedAddress === p.walletAddress ? "✓" : "📋"}
                        </button>
                        <a
                          href={`${MONAD_EXPLORER_URL}/address/${p.walletAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="explorer-mini-link"
                          title="Monad Explorer'da gör"
                        >
                          ↗
                        </a>
                      </div>
                    </td>
                    <td>
                      {p.registeredAt ? formatTurkeyDateTime(p.registeredAt) : "—"}
                    </td>
                    <td>
                      {p.registrationTxHash ? (
                        <a
                          href={`${MONAD_EXPLORER_URL}/tx/${p.registrationTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="explorer-tx-pill"
                        >
                          Blok #{p.registrationBlockNumber || "?"} ↗
                        </a>
                      ) : (
                        <span className="status-badge registered">Kayıtlı</span>
                      )}
                    </td>
                    <td>
                      {p.isAttended ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span className="status-badge attended">Doğrulandı ✓</span>
                          {p.attendanceTxHash && (
                            <a
                              href={`${MONAD_EXPLORER_URL}/tx/${p.attendanceTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="explorer-tx-pill"
                              title="Katılım tx hash"
                            >
                              Tx ↗
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="status-badge inactive">Doğrulanmadı</span>
                      )}
                    </td>
                    <td>
                      {p.hasCertificate ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span className="status-badge active">🎓 Sertifikalı</span>
                          <span
                            className="monospace"
                            style={{ fontSize: "0.75rem", opacity: 0.8 }}
                            title={p.certificateId}
                          >
                            {p.certificateId ? p.certificateId.slice(-8) : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="status-badge inactive">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sayfalama Kontrolleri */}
        {pagination.totalPages > 1 && (
          <div className="pagination-bar" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => loadParticipants(pagination.page - 1)}
            >
              ← Önceki Sayfa
            </button>
            <span className="pagination-info">
              Sayfa {pagination.page} / {pagination.totalPages} ({pagination.totalCount} Katılımcı)
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!pagination.hasMore}
              onClick={() => loadParticipants(pagination.page + 1)}
            >
              Sonraki Sayfa →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
