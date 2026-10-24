import { useCallback, useEffect, useState } from "react";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  getReadOnlyContract,
} from "../data/events";
import {
  formatTurkeyDateOnly,
  formatTurkeyDateTime,
  hydrateMetadataStoreFromServerMap,
} from "../utils/eventMetadata";
import { fetchEventsMetadataFromBackend } from "../utils/apiClient";
import {
  calculateStudentStats,
  fetchStudentProfileData,
} from "../utils/studentProfile";

const EMPTY_PROFILE = {
  walletAddress: null,
  registeredEvents: [],
  upcomingEvents: [],
  pastEvents: [],
  attendedEvents: [],
  stats: calculateStudentStats([]),
  timeline: [],
};

export default function StudentProfile({
  account,
  chainId,
  onConnectWallet,
  onSwitchNetwork,
  onSelectEvent,
  onExploreEvents,
  isConnecting,
}) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(() => Boolean(account));
  const [rpcError, setRpcError] = useState(null);
  const [sectionFilter, setSectionFilter] = useState("all"); // all | upcoming | attended | past
  const [timelineDirection, setTimelineDirection] = useState("DESC");

  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  const fetchAndSetProfile = useCallback(async (targetAccount) => {
    if (!targetAccount) {
      return;
    }

    try {
      try {
        const backendData = await fetchEventsMetadataFromBackend();
        if (backendData && backendData.metadataMap) {
          hydrateMetadataStoreFromServerMap(backendData.metadataMap);
        }
      } catch {
        // Backend çevrimdışıysa yerel/zincir üstü verilerle kesintisiz devam et
      }

      const contract = getReadOnlyContract();
      const data = await fetchStudentProfileData({
        walletAddress: targetAccount,
        contract,
        chainId: MONAD_CHAIN_ID,
        contractAddress: CONTRACT_ADDRESS,
      });
      setProfile(data);
      setRpcError(null);
    } catch (err) {
      setProfile(EMPTY_PROFILE);
      setRpcError(
        err?.message ||
          "Monad Testnet üzerinden profil verileri okunurken bağlantı hatası oluştu."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleManualRefresh() {
    if (!account) return;
    setLoading(true);
    setRpcError(null);
    await fetchAndSetProfile(account);
  }

  useEffect(() => {
    async function initProfile() {
      await fetchAndSetProfile(account);
    }
    initProfile();
  }, [account, fetchAndSetProfile]);

  // Ekran 1: Cüzdan bağlı değil
  if (!account) {
    return (
      <div className="page-container">
        <section className="card-panel profile-empty-hero">
          <span className="eyebrow">Öğrenci Profili &amp; Katılım Geçmişi</span>
          <h1>Kayıtlı Etkinliklerinizi ve Doğrulanmış Katılımlarınızı Görüntüleyin</h1>
          <p className="panel-subtitle" style={{ maxWidth: "640px", margin: "0.5rem auto 1.25rem" }}>
            CampusPass kişisel verilerinizi (isim, öğrenci numarası vb.) talep etmez veya
            blokzincire kaydetmez. Profiliniz yalnızca bağlı cüzdan adresinizin Monad
            Testnet üzerindeki doğrulanabilir kayıtlarından oluşturulur.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConnectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? "Cüzdan Bağlanıyor..." : "Profili Görmek İçin Cüzdan Bağla"}
          </button>
        </section>
      </div>
    );
  }

  const {
    registeredEvents,
    upcomingEvents,
    pastEvents,
    attendedEvents,
    stats,
    timeline,
  } = profile;

  const displayedEvents = (() => {
    if (sectionFilter === "upcoming") return upcomingEvents;
    if (sectionFilter === "attended") return attendedEvents;
    if (sectionFilter === "past") return pastEvents;
    return registeredEvents;
  })();

  const sortedTimeline =
    timelineDirection === "ASC" ? [...timeline].reverse() : timeline;

  return (
    <div className="page-container">
      {/* 1. Öğrenci Cüzdan ve Bağlantı Durumu Başlığı */}
      <section className="card-panel student-profile-header">
        <div className="profile-identity-row">
          <div className="profile-avatar-badge" aria-hidden="true">
            {account.slice(2, 4).toUpperCase()}
          </div>

          <div className="profile-identity-info">
            <div className="badge-group">
              <span className="status-badge active">Cüzdan Bağlı ✓</span>
              {isCorrectNetwork ? (
                <span className="status-badge registered">
                  Monad Testnet ({MONAD_CHAIN_ID})
                </span>
              ) : (
                <span className="status-badge cancelled">
                  Farklı Ağ (Chain ID: {chainId || "?"})
                </span>
              )}
            </div>

            <h1 className="profile-wallet-title monospace">{account}</h1>

            <div className="profile-links-row">
              <a
                href={`${MONAD_EXPLORER_URL}/address/${account}`}
                target="_blank"
                rel="noreferrer"
                className="detail-value link"
              >
                Cüzdanı Monad Explorer&apos;da Görüntüle ↗
              </a>
            </div>
          </div>

          <div className="profile-header-actions">
            {!isCorrectNetwork && (
              <button
                type="button"
                className="btn btn-warning btn-sm"
                onClick={onSwitchNetwork}
              >
                Monad Testnet&apos;e Geç (10143)
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleManualRefresh}
              disabled={loading}
            >
              {loading ? "Yenileniyor..." : "↻ Verileri Yenile"}
            </button>
          </div>
        </div>

        <p className="privacy-footnote">
          Gizlilik Notu: Bu profilde yalnızca cüzdan adresiniz ve `CampusPass.sol`
          üzerindeki herkese açık blokzincir kayıtları gösterilir.
        </p>
      </section>

      {/* 4. Öğrenci İstatistik Kartları */}
      <section className="card-panel">
        <div className="panel-header">
          <h2>Katılım ve Kayıt İstatistiklerim</h2>
          <p className="panel-subtitle">{stats.scopeDescription}</p>
        </div>

        <div className="student-stats-grid">
          <div className="kpi-card">
            <span className="kpi-value">{stats.totalRegistered}</span>
            <span className="kpi-label">Toplam Kayıt</span>
          </div>

          <div className="kpi-card highlight-success">
            <span className="kpi-value">{stats.verifiedAttended}</span>
            <span className="kpi-label">Doğrulanmış Katılım</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{stats.upcomingCount}</span>
            <span className="kpi-label">Yaklaşan Etkinlik</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{stats.completedCount}</span>
            <span className="kpi-label">Tamamlanan Etkinlik</span>
          </div>

          <div className="kpi-card highlight-primary">
            <span className="kpi-value">%{stats.attendanceRate}</span>
            <span className="kpi-label">Katılım Doğrulama Oranı</span>
          </div>
        </div>
      </section>

      {/* Ekran Durumları: Yükleniyor / RPC Hatası / Boş Durum / Etkinlik Listesi */}
      {loading ? (
        <div className="empty-state">
          <p>Monad Testnet üzerinden öğrenci kayıt ve katılım geçmişiniz okunuyor...</p>
        </div>
      ) : rpcError ? (
        <div className="card-panel">
          <div className="inline-alert error">
            <strong>Blokzincir Bağlantı Hatası:</strong> {rpcError}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleManualRefresh}
            >
              ↻ Tekrar Dene
            </button>
          </div>
        </div>
      ) : registeredEvents.length === 0 ? (
        <div className="empty-state">
          <h3>Henüz Kayıt Olduğunuz Bir Etkinlik Bulunmuyor</h3>
          <p style={{ margin: "0.5rem 0 1.25rem" }}>
            Bu cüzdan adresiyle (`registered(eventId, wallet)`) eşleşen bir etkinlik
            kaydı bulunamadı.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onExploreEvents}
          >
            Etkinlikleri Keşfet ve Kaydol
          </button>
        </div>
      ) : (
        <>
          {/* 2 & 3. Kayıtlı Etkinliklerim ve Katılım Geçmişim */}
          <section className="events-section">
            <div className="section-toolbar">
              <div className="filter-pills">
                <button
                  type="button"
                  className={`pill-btn ${sectionFilter === "all" ? "active" : ""}`}
                  onClick={() => setSectionFilter("all")}
                >
                  Tüm Kayıtlarım ({registeredEvents.length})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${
                    sectionFilter === "upcoming" ? "active" : ""
                  }`}
                  onClick={() => setSectionFilter("upcoming")}
                >
                  Yaklaşan Etkinlikler ({upcomingEvents.length})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${
                    sectionFilter === "attended" ? "active" : ""
                  }`}
                  onClick={() => setSectionFilter("attended")}
                >
                  Doğrulanmış Katılımlarım ({attendedEvents.length})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${sectionFilter === "past" ? "active" : ""}`}
                  onClick={() => setSectionFilter("past")}
                >
                  Geçmiş Etkinlikler ({pastEvents.length})
                </button>
              </div>
            </div>

            {stats.verifiedAttended === 0 && (
              <div className="inline-alert info-subtle" style={{ marginBottom: "1rem" }}>
                Kayıtlı olduğunuz etkinlikler bulunuyor ancak henüz blokzincir üzerinde
                doğrulanmış (`attended`) bir katılımınız yok. Etkinlik günü detay
                sayfasından imzalı QR kodunuzu organizatöre okutabilirsiniz.
              </div>
            )}

            {displayedEvents.length === 0 ? (
              <div className="empty-state">
                <p>Bu filtrede görüntülenecek etkinlik bulunmuyor.</p>
              </div>
            ) : (
              <div className="events-grid">
                {displayedEvents.map((ev) => {
                  const attState = ev.attendanceState;
                  return (
                    <article key={ev.id} className="event-card">
                      <div className="event-card-body">
                        <div className="event-card-top">
                          <span className="event-id-badge">Etkinlik #{ev.id}</span>
                          <div className="badge-group">
                            <span className="status-badge registered">Kayıtlı ✓</span>
                            <span
                              className={`status-badge ${
                                attState?.badgeClass || "inactive"
                              }`}
                            >
                              {attState?.label}
                            </span>
                          </div>
                        </div>

                        <div className="event-community-line">{ev.community}</div>
                        <h3 className="event-title">{ev.title}</h3>

                        <div className="event-meta">
                          <div className="meta-row">
                            <span className="meta-label">📅 Tarih &amp; Saat (TSİ):</span>
                            <span className="meta-value">
                              {formatTurkeyDateOnly(ev.date)} • {ev.startTime} -{" "}
                              {ev.endTime}
                            </span>
                          </div>

                          <div className="meta-row">
                            <span className="meta-label">📍 Konum:</span>
                            <span className="meta-value">
                              {ev.location?.campus} / {ev.location?.building} (
                              {ev.location?.room})
                            </span>
                          </div>

                          <div className="meta-row">
                            <span className="meta-label">📌 Etkinlik Durumu:</span>
                            <span className="meta-value">{ev.statusLabel}</span>
                          </div>
                        </div>
                      </div>

                      <div className="event-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => onSelectEvent(ev.id)}
                        >
                          {ev.isAttended
                            ? "Etkinlik Detayını Gör"
                            : "Detay & QR Katılım Kodu"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* 5. Kronolojik Katılım Zaman Çizelgesi */}
          <section className="card-panel timeline-panel">
            <div className="panel-header-flex">
              <div>
                <h2>Katılım Zaman Çizelgesi</h2>
                <p className="panel-subtitle">
                  Etkinlik geçmişiniz kronolojik olarak listelenir. Yalnızca blokzincir
                  üzerinde işlem özeti (`txHash`) doğrulanmış işlemler için Monad Explorer
                  bağlantısı gösterilir.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setTimelineDirection((prev) => (prev === "DESC" ? "ASC" : "DESC"))
                }
              >
                {timelineDirection === "DESC"
                  ? "Sıralama: Yeniden Eskiye ↓"
                  : "Sıralama: Eskiden Yeniye ↑"}
              </button>
            </div>

            <div className="timeline-list">
              {sortedTimeline.map((item) => (
                <div key={item.eventId} className="timeline-item">
                  <div
                    className={`timeline-dot ${
                      item.isAttended ? "verified" : "pending"
                    }`}
                  />
                  <div className="timeline-content">
                    <div className="timeline-top-row">
                      <div>
                        <span className="timeline-community">{item.community}</span>
                        <h4
                          className="timeline-title"
                          onClick={() => onSelectEvent(item.eventId)}
                        >
                          Etkinlik #{item.eventId}: {item.title}
                        </h4>
                      </div>
                      <span
                        className={`status-badge ${
                          item.attendanceState.badgeClass
                        }`}
                      >
                        {item.attendanceState.label}
                      </span>
                    </div>

                    <div className="timeline-meta-row">
                      <span>
                        📅 {formatTurkeyDateTime(item.startAt)} (TSİ)
                      </span>
                      {item.explorerTxUrl && (
                        <a
                          href={item.explorerTxUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="timeline-explorer-link"
                        >
                          Monad Explorer&apos;da İşlemi Gör ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
