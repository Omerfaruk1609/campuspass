import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import CertificateModal from "../components/CertificateModal";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  getReadOnlyContract,
  parseBlockchainError,
} from "../data/events";
import {
  formatTurkeyDateOnly,
  formatTurkeyDateTime,
  hydrateMetadataStoreFromServerMap,
} from "../utils/eventMetadata";
import {
  ensureStudentSiweSession,
  fetchEventsMetadataFromBackend,
  fetchMyCertificatesFromBackend,
  fetchWalletCertificatesFromBackend,
  getActiveAuthState,
  issueCertificateOnBackend,
} from "../utils/apiClient";
import {
  buildVerificationUrl,
  downloadCertificatePdf,
} from "../utils/certificatePdf";
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
  onOpenVerifyPage,
  isConnecting,
}) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(() => Boolean(account));
  const [rpcError, setRpcError] = useState(null);
  const [sectionFilter, setSectionFilter] = useState("all"); // all | upcoming | attended | past
  const [timelineDirection, setTimelineDirection] = useState("DESC");

  // Faz 10 — Dijital Katılım Sertifikaları Durumu
  const [certificates, setCertificates] = useState([]);
  const [loadingCertificates, setLoadingCertificates] = useState(false);
  const [certBanner, setCertBanner] = useState(null);
  const [issuingEventId, setIssuingEventId] = useState(null);
  const [optionalDisplayName, setOptionalDisplayName] = useState("");
  const [selectedCertificateModal, setSelectedCertificateModal] = useState(null);
  const [copiedCertId, setCopiedCertId] = useState(null);

  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  const loadCertificatesForAccount = useCallback(async (targetAccount) => {
    if (!targetAccount) {
      setCertificates([]);
      return;
    }

    setLoadingCertificates(true);
    try {
      const authState = getActiveAuthState();
      if (
        authState.authenticated &&
        authState.walletAddress &&
        authState.walletAddress.toLowerCase() === targetAccount.toLowerCase()
      ) {
        const myCerts = await fetchMyCertificatesFromBackend();
        setCertificates(myCerts);
      } else {
        const publicCerts = await fetchWalletCertificatesFromBackend(targetAccount);
        setCertificates(publicCerts);
      }
    } catch {
      // Backend çevrimdışıysa sertifika listesini boş tut, profil akışını bozma
      setCertificates([]);
    } finally {
      setLoadingCertificates(false);
    }
  }, []);

  const fetchAndSetProfile = useCallback(
    async (targetAccount) => {
      if (!targetAccount) {
        setProfile(EMPTY_PROFILE);
        setCertificates([]);
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
        const [data] = await Promise.all([
          fetchStudentProfileData({
            walletAddress: targetAccount,
            contract,
            chainId: MONAD_CHAIN_ID,
            contractAddress: CONTRACT_ADDRESS,
          }),
          loadCertificatesForAccount(targetAccount),
        ]);
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
    },
    [loadCertificatesForAccount]
  );

  async function handleManualRefresh() {
    if (!account) return;
    setLoading(true);
    setRpcError(null);
    setCertBanner(null);
    await fetchAndSetProfile(account);
  }

  useEffect(() => {
    async function initProfile() {
      await fetchAndSetProfile(account);
    }
    initProfile();
  }, [account, fetchAndSetProfile]);

  async function handleIssueCertificate(eventId) {
    if (!account) return;
    setCertBanner(null);
    setIssuingEventId(eventId);

    try {
      if (!window.ethereum) {
        throw new Error(
          "Sertifika talebini SIWE ile imzalamak için tarayıcı cüzdanı (MetaMask vb.) gereklidir."
        );
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      await ensureStudentSiweSession({
        signer,
        walletAddress: account,
        chainId: MONAD_CHAIN_ID,
      });

      const result = await issueCertificateOnBackend({
        eventId,
        walletAddress: account,
        displayName: optionalDisplayName.trim(),
      });

      await loadCertificatesForAccount(account);
      setSelectedCertificateModal(result.certificate);

      setCertBanner({
        type: "success",
        message: result.idempotent
          ? `Etkinlik #${eventId} için mevcut doğrulanmış sertifikanız yüklendi (${result.certificate.certificateId}).`
          : `Etkinlik #${eventId} için blokzincir doğrulamalı dijital katılım sertifikanız oluşturuldu! (${result.certificate.certificateId})`,
      });
    } catch (err) {
      setCertBanner({
        type: "error",
        message:
          err?.message ||
          "Sertifika oluşturulurken hata oluştu: " + parseBlockchainError(err),
      });
    } finally {
      setIssuingEventId(null);
    }
  }

  async function handleCopyVerifyLink(certificateId) {
    const url = buildVerificationUrl(certificateId);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopiedCertId(certificateId);
        setTimeout(() => setCopiedCertId(null), 2500);
      }
    } catch {
      setCertBanner({
        type: "info",
        message: `Doğrulama bağlantısı: ${url}`,
      });
    }
  }

  // Ekran 1: Cüzdan bağlı değil
  if (!account) {
    return (
      <div className="page-container">
        <section className="card-panel profile-empty-hero">
          <span className="eyebrow">Öğrenci Profili &amp; Katılım Sertifikaları</span>
          <h1>Kayıtlı Etkinliklerinizi ve Doğrulanmış Sertifikalarınızı Görüntüleyin</h1>
          <p
            className="panel-subtitle"
            style={{ maxWidth: "640px", margin: "0.5rem auto 1.25rem" }}
          >
            CampusPass kişisel verilerinizi (isim, öğrenci numarası vb.) zorunlu tutmaz veya
            blokzincire kaydetmez. Profiliniz ve katılım sertifikalarınız yalnızca bağlı
            cüzdan adresinizin Monad Testnet üzerindeki doğrulanabilir kayıtlarından
            oluşturulur.
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

  const certificatesByEventId = new Map(
    certificates.map((c) => [Number(c.eventId), c])
  );

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
          Gizlilik Notu: Bu profilde birincil kimlik olarak yalnızca cüzdan adresiniz ve
          `CampusPass.sol` üzerindeki herkese açık blokzincir kayıtları kullanılır.
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
            <span className="kpi-value">{certificates.length}</span>
            <span className="kpi-label">Dijital Sertifika</span>
          </div>

          <div className="kpi-card">
            <span className="kpi-value">{stats.upcomingCount}</span>
            <span className="kpi-label">Yaklaşan Etkinlik</span>
          </div>

          <div className="kpi-card highlight-primary">
            <span className="kpi-value">%{stats.attendanceRate}</span>
            <span className="kpi-label">Katılım Doğrulama Oranı</span>
          </div>
        </div>
      </section>

      {/* Faz 10 — Sertifikalarım Bölümü */}
      <section className="card-panel certificates-panel">
        <div className="panel-header-flex">
          <div>
            <h2>🎓 Sertifikalarım (Blokzincir Doğrulamalı)</h2>
            <p className="panel-subtitle">
              Yalnızca blokzincir üzerinde <code>AttendanceMarked</code> olayıyla katılımı
              doğrulanmış etkinlikler için sertifika oluşturulabilir. Cüzdan adresiniz
              birincil kimliktir; dilerseniz sertifika PDF önizlemesi için isteğe bağlı
              gösterim adı ekleyebilirsiniz.
            </p>
          </div>
        </div>

        {attendedEvents.length > 0 && (
          <div className="cert-displayname-bar">
            <label htmlFor="cert-display-name-input" className="cert-displayname-label">
              İsteğe Bağlı Sertifika Gösterim Adı (Zorunlu Değil):
            </label>
            <input
              id="cert-display-name-input"
              type="text"
              maxLength={80}
              className="cert-displayname-input"
              value={optionalDisplayName}
              onChange={(e) => setOptionalDisplayName(e.target.value)}
              placeholder="Boş bırakırsanız yalnızca cüzdan adresiniz gösterilir"
            />
          </div>
        )}

        {certBanner && (
          <div
            className={`inline-alert ${certBanner.type === "error" ? "error" : "info-subtle"}`}
            style={{ marginBottom: "1rem" }}
          >
            {certBanner.message}
          </div>
        )}

        {loadingCertificates ? (
          <div className="empty-state">
            <p>Sertifika kayıtlarınız kontrol ediliyor...</p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="empty-state" style={{ padding: "1.5rem" }}>
            <h4>Henüz Oluşturulmuş Bir Dijital Sertifikanız Yok</h4>
            <p style={{ marginTop: "0.4rem" }}>
              {attendedEvents.length > 0
                ? "Doğrulanmış katılımlarınız bulunuyor! Aşağıdaki etkinlik kartlarından '🎓 Sertifika Oluştur' düğmesine tıklayarak sertifikanızı hemen üretebilirsiniz."
                : "Sertifika alabilmek için kayıt olduğunuz bir etkinlikte QR kodunuzun organizatör tarafından blokzincir üzerinde doğrulanması (AttendanceMarked) gerekir."}
            </p>
          </div>
        ) : (
          <div className="cert-cards-grid">
            {certificates.map((cert) => (
              <article key={cert.certificateId} className="cert-card">
                <div className="cert-card-top">
                  <span className="cert-card-id monospace">{cert.certificateId}</span>
                  <span
                    className={`status-badge ${
                      cert.status === "ACTIVE" ? "active" : "cancelled"
                    }`}
                  >
                    {cert.status === "ACTIVE"
                      ? "Doğrulanmış Sertifika ✓"
                      : "Geçersizleşti (Reorg)"}
                  </span>
                </div>

                <div className="event-community-line">{cert.community}</div>
                <h3 className="cert-card-title">{cert.eventTitle}</h3>

                <div className="cert-card-meta">
                  <div>
                    <strong>Veriliş Tarihi:</strong>{" "}
                    {formatTurkeyDateTime(cert.issuedAt)} (TSİ)
                  </div>
                  <div>
                    <strong>Blok Kanıtı:</strong> Blok #{cert.attendanceBlockNumber} • Log #
                    {cert.attendanceLogIndex}
                  </div>
                  <div className="monospace" style={{ fontSize: "0.78rem", opacity: 0.85 }}>
                    Tx: {cert.attendanceTxHash.slice(0, 18)}...
                  </div>
                </div>

                <div className="cert-card-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setSelectedCertificateModal(cert)}
                  >
                    🎓 Sertifikayı Görüntüle
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => downloadCertificatePdf(cert)}
                  >
                    📥 PDF İndir
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleCopyVerifyLink(cert.certificateId)}
                  >
                    {copiedCertId === cert.certificateId
                      ? "✓ Bağlantı Kopyalandı"
                      : "🔗 Doğrulama Bağlantısı"}
                  </button>
                  {onOpenVerifyPage && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onOpenVerifyPage(cert.certificateId)}
                    >
                      🔍 Doğrula
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
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
                  const existingCert = certificatesByEventId.get(Number(ev.id));
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

                      <div className="event-card-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => onSelectEvent(ev.id)}
                        >
                          {ev.isAttended
                            ? "Etkinlik Detayını Gör"
                            : "Detay & QR Katılım Kodu"}
                        </button>

                        {ev.isAttended && existingCert && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setSelectedCertificateModal(existingCert)}
                          >
                            🎓 Sertifikayı Görüntüle
                          </button>
                        )}

                        {ev.isAttended && !existingCert && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={issuingEventId === ev.id}
                            onClick={() => handleIssueCertificate(ev.id)}
                          >
                            {issuingEventId === ev.id
                              ? "Sertifika Üretiliyor..."
                              : "🎓 Sertifika Oluştur"}
                          </button>
                        )}
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

      {/* Yatay A4 Sertifika Önizleme ve PDF İndirme Modalı */}
      {selectedCertificateModal && (
        <CertificateModal
          certificate={selectedCertificateModal}
          onClose={() => setSelectedCertificateModal(null)}
          onOpenVerifyPage={onOpenVerifyPage}
        />
      )}
    </div>
  );
}
