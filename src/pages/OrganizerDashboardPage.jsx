import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
} from "../data/events";
import {
  downloadOrganizerEventCsv,
  ensureOrganizerSiweSession,
  fetchOrganizerDashboardFromBackend,
  fetchOrganizerTimeseriesFromBackend,
  getActiveAuthState,
} from "../utils/apiClient";
import { SimpleBarChart } from "../components/AnalyticsCharts";
import { formatTurkeyDateOnly } from "../utils/eventMetadata";

export default function OrganizerDashboardPage({
  account,
  onConnectWallet,
  onSelectEvent,
  onSelectEventAnalytics,
  onCreateEventClick,
  isConnecting,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [timeseriesData, setTimeseriesData] = useState([]);

  // Filtreleme & Arama state
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // SIWE state
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [downloadingCsvId, setDownloadingCsvId] = useState(null);

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
      setAuthError("Organizatör oturumu için tarayıcı cüzdanı (MetaMask vb.) gereklidir.");
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
      setAuthError(err.message || "SIWE oturumu doğrulanamadı.");
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [account]);

  const loadDashboard = useCallback(async () => {
    if (!account) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setAuthError(null);

    try {
      const isAuthed = await ensureSiwe();
      if (!isAuthed) {
        setLoading(false);
        return;
      }

      const [dashRes, timeRes] = await Promise.all([
        fetchOrganizerDashboardFromBackend(),
        fetchOrganizerTimeseriesFromBackend({ interval: "DAY" }).catch(() => null),
      ]);

      if (dashRes && dashRes.data) {
        setDashboardData(dashRes.data);
      }
      if (timeRes && timeRes.data && Array.isArray(timeRes.data.eventsSeries)) {
        setTimeseriesData(timeRes.data.eventsSeries);
      }
    } catch (err) {
      setError(err.message || "Organizatör paneli verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [account, ensureSiwe]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Hızlı CSV indirme
  async function handleQuickCsvDownload(eventId) {
    setDownloadingCsvId(eventId);
    try {
      await downloadOrganizerEventCsv({
        eventId,
        type: "participants",
        customFilename: `campuspass-event-${eventId}-participants.csv`,
      });
    } catch (err) {
      alert("CSV indirme hatası: " + (err.message || "Bilinmeyen hata"));
    } finally {
      setDownloadingCsvId(null);
    }
  }

  // Filtrelenmiş etkinlikler
  const filteredEvents = useMemo(() => {
    if (!dashboardData || !Array.isArray(dashboardData.events)) return [];
    let list = dashboardData.events;

    if (statusFilter !== "ALL") {
      list = list.filter((e) => {
        const s = (e.status || "").toUpperCase();
        if (statusFilter === "UPCOMING") return s === "UPCOMING";
        if (statusFilter === "ONGOING") return s === "ONGOING";
        if (statusFilter === "COMPLETED") return s === "COMPLETED";
        if (statusFilter === "CANCELLED") return s === "CANCELLED";
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (e) =>
          String(e.id).includes(q) ||
          (e.title || "").toLowerCase().includes(q) ||
          (e.community || "").toLowerCase().includes(q) ||
          (e.category || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [dashboardData, statusFilter, searchQuery]);

  // Durum 1: Cüzdan bağlı değil
  if (!account) {
    return (
      <div className="page-container">
        <section className="card-panel profile-empty-hero">
          <span className="eyebrow">Organizatör Yönetim Paneli</span>
          <h1>Üniversite Topluluğunuzun Etkinliklerini ve Katılım Analitiğini Yönetin</h1>
          <p
            className="panel-subtitle"
            style={{ maxWidth: "680px", margin: "0.5rem auto 1.25rem" }}
          >
            Organizatör paneli, oluşturduğunuz etkinliklerin anlık katılım oranlarını,
            blokzincir onaylı kayıtlarını, dijital sertifika dönüşümlerini ve katılımcı
            listelerini güvenli SIWE oturumuyla sunar.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConnectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? "Cüzdan Bağlanıyor..." : "Organizatör Cüzdanını Bağla"}
          </button>
        </section>
      </div>
    );
  }

  // Durum 2: SIWE doğrulanıyor veya veri yükleniyor
  if (loading || authenticating) {
    return (
      <div className="page-container">
        <section className="card-panel">
          <div className="empty-state">
            <p>
              {authenticating
                ? "Organizatör SIWE oturumu imzalanıyor..."
                : "Monad Testnet ve veritabanı analitikleri yükleniyor..."}
            </p>
          </div>
        </section>
      </div>
    );
  }

  // Durum 3: Kimlik doğrulama veya sunucu hatası
  if (authError || error) {
    return (
      <div className="page-container">
        <section className="card-panel">
          <div className="inline-alert error">
            <strong>Bağlantı / Yetkilendirme Hatası:</strong> {authError || error}
          </div>
          <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Organizatör verilerini görüntülemek için bağlı cüzdan adresinizle SIWE mesajını
            imzalamanız gerekmektedir.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={loadDashboard}
            >
              ↻ Yeniden Giriş Yap ve Yükle
            </button>
          </div>
        </section>
      </div>
    );
  }

  const kpis = dashboardData?.kpis || {};
  const indexerStatus = dashboardData?.indexerStatus || {};
  const isSynced = indexerStatus.isSynced ?? true;

  return (
    <div className="page-container">
      {/* 1. Üst Kimlik ve Senkronizasyon Durum Çubuğu */}
      <section className="card-panel student-profile-header">
        <div className="profile-identity-row">
          <div className="profile-avatar-badge" aria-hidden="true" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            ORG
          </div>

          <div className="profile-identity-info">
            <div className="badge-group">
              <span className="status-badge organizer">Organizatör Paneli ✓</span>
              <span className={`status-badge ${isSynced ? "active" : "warning"}`}>
                {isSynced
                  ? "Indexer Senkronize ✓"
                  : `Gecikme Var (${indexerStatus.lagBlocks || 0} blok geride)`}
              </span>
            </div>

            <h1 className="profile-wallet-title monospace">{account}</h1>

            <div className="profile-links-row">
              <a
                href={`${MONAD_EXPLORER_URL}/address/${account}`}
                target="_blank"
                rel="noreferrer"
                className="detail-value link"
              >
                Cüzdanı Monad Explorer&apos;da Gör ↗
              </a>
              <span className="meta-separator">•</span>
              <span style={{ fontSize: "0.82rem", opacity: 0.8 }}>
                Son Blok: #{indexerStatus.checkpointBlock ?? "—"} (Zincir: #{indexerStatus.headBlock ?? "—"})
              </span>
            </div>
          </div>

          <div className="profile-header-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {onCreateEventClick && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onCreateEventClick}
              >
                + Yeni Etkinlik Oluştur
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadDashboard}
              disabled={loading}
            >
              {loading ? "Yenileniyor..." : "↻ Verileri Yenile"}
            </button>
          </div>
        </div>
      </section>

      {/* 2. KPI Metrik Kartları */}
      <section className="card-panel" style={{ marginTop: "1rem" }}>
        <div className="panel-header">
          <h2>Topluluk Performans Göstergeleri (KPI)</h2>
          <p className="panel-subtitle">
            Düzenlediğiniz tüm etkinliklerin toplam kapasite, katılım ve dijital sertifika verileri.
          </p>
        </div>

        <div className="student-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <div className="kpi-card">
            <span className="kpi-value">{kpis.totalEvents ?? 0}</span>
            <span className="kpi-label">Toplam Etkinlik</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{kpis.totalCapacity ?? 0}</span>
            <span className="kpi-label">Toplam Kapasite</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{kpis.totalRegistrations ?? 0}</span>
            <span className="kpi-label">Alınan Kayıt</span>
          </div>

          <div className="kpi-card highlight-success">
            <span className="kpi-value">{kpis.totalVerifiedAttendances ?? 0}</span>
            <span className="kpi-label">Doğrulanmış Katılım</span>
          </div>

          <div className="kpi-card highlight-primary">
            <span className="kpi-value">%{kpis.overallAttendanceRate ?? 0}</span>
            <span className="kpi-label">Genel Katılım Oranı</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{kpis.activeCertificates ?? 0}</span>
            <span className="kpi-label">Aktif Sertifika</span>
          </div>

          <div className="kpi-card highlight-primary">
            <span className="kpi-value">{kpis.uniqueAttendedStudents ?? 0}</span>
            <span className="kpi-label">Ulaşılan Tekil Öğrenci</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{kpis.upcomingCount ?? 0}</span>
            <span className="kpi-label">Yaklaşan Etkinlik</span>
          </div>
        </div>
      </section>

      {/* 3. Etkinlik Karşılaştırma & Trend Grafiği */}
      {timeseriesData.length > 0 && (
        <section className="card-panel" style={{ marginTop: "1.25rem" }}>
          <div className="panel-header">
            <h2>Etkinlik Performans Karşılaştırması</h2>
            <p className="panel-subtitle">
              Etkinlikler bazında Kayıt vs Doğrulanmış Katılım sayıları
            </p>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <SimpleBarChart
              data={timeseriesData.slice(-8).map((ev) => ({
                label: `#${ev.id} ${ev.title.length > 14 ? ev.title.slice(0, 12) + "..." : ev.title}`,
                registered: ev.registeredCount,
                attended: ev.verifiedAttendanceCount,
              }))}
            />
          </div>
        </section>
      )}

      {/* 4. Etkinlikler Listesi ve Aksiyonlar */}
      <section className="card-panel" style={{ marginTop: "1.25rem" }}>
        <div className="panel-header-flex" style={{ flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h2>Düzenlediğim Etkinlikler</h2>
            <p className="panel-subtitle">
              Yöneticisi olduğunuz etkinliklerin listesi, anlık doluluk oranları ve analitik bağlantıları.
            </p>
          </div>

          <div className="search-box" style={{ minWidth: "260px" }}>
            <input
              type="text"
              placeholder="Etkinlik ara (Başlık, ID, topluluk)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* Durum Filtre Hapları */}
        <div className="section-toolbar" style={{ marginTop: "1rem" }}>
          <div className="filter-pills">
            <button
              type="button"
              className={`pill-btn ${statusFilter === "ALL" ? "active" : ""}`}
              onClick={() => setStatusFilter("ALL")}
            >
              Tümü ({dashboardData?.events?.length || 0})
            </button>
            <button
              type="button"
              className={`pill-btn ${statusFilter === "UPCOMING" ? "active" : ""}`}
              onClick={() => setStatusFilter("UPCOMING")}
            >
              Yaklaşan ({kpis.upcomingCount || 0})
            </button>
            <button
              type="button"
              className={`pill-btn ${statusFilter === "ONGOING" ? "active" : ""}`}
              onClick={() => setStatusFilter("ONGOING")}
            >
              Devam Eden ({kpis.ongoingCount || 0})
            </button>
            <button
              type="button"
              className={`pill-btn ${statusFilter === "COMPLETED" ? "active" : ""}`}
              onClick={() => setStatusFilter("COMPLETED")}
            >
              Tamamlanan ({kpis.completedCount || 0})
            </button>
            <button
              type="button"
              className={`pill-btn ${statusFilter === "CANCELLED" ? "active" : ""}`}
              onClick={() => setStatusFilter("CANCELLED")}
            >
              İptal Edilen ({kpis.cancelledCount || 0})
            </button>
          </div>
        </div>

        {/* Tablo */}
        {filteredEvents.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem" }}>
            <h4>Görüntülenecek Etkinlik Bulunamadı</h4>
            <p style={{ marginTop: "0.5rem" }}>
              {dashboardData?.events?.length === 0
                ? "Henüz düzenlediğiniz bir etkinlik bulunmuyor. Yeni bir etkinlik oluşturarak başlayabilirsiniz."
                : "Seçilen filtre veya arama kriterine uygun etkinlik bulunamadı."}
            </p>
            {dashboardData?.events?.length === 0 && onCreateEventClick && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: "1rem" }}
                onClick={onCreateEventClick}
              >
                + İlk Etkinliğini Oluştur
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive" style={{ marginTop: "1rem" }}>
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Etkinlik</th>
                  <th>Tarih (TSİ)</th>
                  <th>Durum</th>
                  <th>Kapasite &amp; Kayıt</th>
                  <th>Katılım</th>
                  <th>Katılım Oranı</th>
                  <th>Sertifikalar</th>
                  <th style={{ textAlign: "right" }}>Aksiyonlar</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <div>
                        <span className="event-id-badge" style={{ fontSize: "0.72rem" }}>
                          #{ev.id}
                        </span>{" "}
                        <strong
                          style={{ cursor: "pointer", color: "var(--color-primary-light)" }}
                          onClick={() => onSelectEventAnalytics(ev.id)}
                        >
                          {ev.title}
                        </strong>
                        <div style={{ fontSize: "0.75rem", opacity: 0.75, marginTop: "2px" }}>
                          {ev.community} • {ev.category}
                        </div>
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatTurkeyDateOnly(ev.date)}
                      <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                        {ev.startTime} - {ev.endTime}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          ev.status === "completed"
                            ? "active"
                            : ev.status === "cancelled"
                            ? "cancelled"
                            : ev.status === "ongoing"
                            ? "ongoing"
                            : "registered"
                        }`}
                      >
                        {ev.statusLabel || ev.status}
                      </span>
                    </td>
                    <td>
                      <div>
                        <strong>{ev.registeredCount}</strong> / {ev.capacity}
                      </div>
                      <div className="mini-progress-bar">
                        <div
                          className="mini-progress-fill"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((ev.registeredCount / (ev.capacity || 1)) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <span className="status-badge attended" style={{ fontSize: "0.82rem" }}>
                        {ev.verifiedAttendanceCount} Katılımcı
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: "var(--color-primary-light)" }}>
                        %{ev.attendanceRate}
                      </strong>
                    </td>
                    <td>
                      <span>{ev.certificateCount} Sertifika</span>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ marginRight: "0.4rem" }}
                        onClick={() => onSelectEventAnalytics(ev.id)}
                      >
                        Detay Analitiği
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginRight: "0.4rem" }}
                        onClick={() => handleQuickCsvDownload(ev.id)}
                        disabled={downloadingCsvId === ev.id}
                        title="Katılımcı Listesi CSV İndir"
                      >
                        {downloadingCsvId === ev.id ? "İndiriliyor..." : "CSV"}
                      </button>
                      {onSelectEvent && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onSelectEvent(ev.id)}
                          title="Etkinlik Genel Sayfası"
                        >
                          ↗
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
