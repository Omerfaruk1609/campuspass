import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import CertificateModal from "../components/CertificateModal";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  getReadOnlyContract,
  parseBlockchainError,
  shortenAddress,
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
  ATTENDANCE_STATE,
  calculateStudentStats,
  fetchStudentProfileData,
} from "../utils/studentProfile";
import { generateQrMatrix } from "../utils/qrMatrix";

const EMPTY_PROFILE = {
  walletAddress: null,
  registeredEvents: [],
  upcomingEvents: [],
  pastEvents: [],
  attendedEvents: [],
  stats: calculateStudentStats([]),
  timeline: [],
};

function QrSvgSmall({ value, size = 130 }) {
  if (!value) return null;
  let matrix;
  try {
    matrix = generateQrMatrix(value);
  } catch {
    return null;
  }

  const modules = matrix.length;
  const quietZone = 2;
  const totalModules = modules + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${totalModules} ${totalModules}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Kampüs Geçiş QR Kodu"
      style={{ borderRadius: "6px" }}
    >
      <rect width={totalModules} height={totalModules} fill="#ffffff" rx="2" />
      {matrix.map((row, rIdx) =>
        Array.from(row).map((cell, cIdx) =>
          cell === 1 ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx + quietZone}
              y={rIdx + quietZone}
              width={1}
              height={1}
              fill="#03122e"
            />
          ) : null
        )
      )}
    </svg>
  );
}

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
  const [activeProfileTab, setActiveProfileTab] = useState("events"); // events | certs | timeline
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
  const [copiedWallet, setCopiedWallet] = useState(false);

  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  const loadCertificatesForAccount = useCallback(async (targetAccount) => {
    if (!targetAccount) {
      setCertificates([]);
      return [];
    }

    setLoadingCertificates(true);
    try {
      const authState = getActiveAuthState();
      let certs = [];
      if (
        authState.authenticated &&
        authState.walletAddress &&
        authState.walletAddress.toLowerCase() === targetAccount.toLowerCase()
      ) {
        certs = await fetchMyCertificatesFromBackend();
      } else {
        certs = await fetchWalletCertificatesFromBackend(targetAccount);
      }
      const safeList = Array.isArray(certs) ? certs : [];
      setCertificates(safeList);
      return safeList;
    } catch {
      setCertificates([]);
      return [];
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
          // Backend çevrimdışı fallback
        }

        const contract = getReadOnlyContract();
        const [data, certList] = await Promise.all([
          fetchStudentProfileData({
            walletAddress: targetAccount,
            contract,
            chainId: MONAD_CHAIN_ID,
            contractAddress: CONTRACT_ADDRESS,
          }),
          loadCertificatesForAccount(targetAccount),
        ]);
        setProfile(data);
        if (Array.isArray(certList)) {
          setCertificates(certList);
        }
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

  function handleCopyAddress() {
    if (!account) return;
    try {
      navigator.clipboard?.writeText(account);
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    } catch {
      // ignore
    }
  }

  // Cüzdan bağlı değil ekranı
  if (!account) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container">
          <section
            className="stitch-card"
            style={{
              padding: "4rem 2rem",
              textAlign: "center",
              borderRadius: "1.5rem",
              background: "linear-gradient(135deg, rgba(17, 31, 59, 0.95) 0%, rgba(3, 18, 46, 0.95) 100%)",
              maxWidth: "680px",
              margin: "0 auto",
            }}
          >
            <span className="stitch-badge stitch-badge-testnet" style={{ marginBottom: "1rem" }}>
              Öğrenci Profili &amp; Katılım Sertifikaları
            </span>
            <h1 className="font-headline-lg" style={{ margin: "0.5rem 0 1rem 0" }}>
              Kayıtlı Etkinliklerinizi ve Sertifikalarınızı Görüntüleyin
            </h1>
            <p className="font-body-md text-on-surface-variant" style={{ margin: "0 0 2rem 0" }}>
              CampusPass kişisel verilerinizi (isim, öğrenci numarası) zorunlu tutmaz veya blokzincire kaydetmez.
              Profiliniz ve katılım sertifikalarınız yalnızca bağlı cüzdan adresinizin Monad Testnet üzerindeki
              doğrulanabilir kayıtlarından oluşturulur.
            </p>
            <button
              type="button"
              className="stitch-btn-primary"
              onClick={onConnectWallet}
              disabled={isConnecting}
              style={{ padding: "0.875rem 2rem", fontSize: "1rem" }}
            >
              <span className="material-symbols-outlined">account_balance_wallet</span>
              {isConnecting ? "Cüzdan Bağlanıyor..." : "Profili Görmek İçin Cüzdan Bağla"}
            </button>
          </section>
        </div>
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

  // Katılınan benzersiz kulüpler
  const studentCommunities = Array.from(
    new Set(registeredEvents.map((e) => e.community).filter(Boolean))
  );

  return (
    <div className="stitch-shell page-container" style={{ paddingBottom: "5rem" }}>
      {/* Ambient Glows */}
      <div
        className="ambient-glow-primary"
        style={{ top: "5%", left: "10%", width: "450px", height: "450px" }}
      />
      <div
        className="ambient-glow-secondary"
        style={{ top: "35%", right: "5%", width: "450px", height: "450px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, paddingTop: "2rem" }}>
        {/* 1. ÖĞRENCİ KİMLİK & BAĞLANTI BANNER'I */}
        <section
          className="stitch-card"
          style={{
            padding: "2rem",
            borderRadius: "1.25rem",
            marginBottom: "2rem",
            background: "linear-gradient(135deg, rgba(22, 38, 76, 0.9) 0%, rgba(12, 27, 54, 0.95) 100%)",
            border: "1px solid rgba(185, 195, 255, 0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-secondary-container))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "#ffffff",
                  boxShadow: "0 8px 20px rgba(111, 136, 255, 0.35)",
                }}
              >
                {account.slice(2, 4).toUpperCase()}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                  <span className="stitch-badge stitch-badge-open">
                    Cüzdan Doğrulandı ✓
                  </span>
                  {isCorrectNetwork ? (
                    <span className="stitch-badge stitch-badge-testnet">
                      Monad Testnet ({MONAD_CHAIN_ID})
                    </span>
                  ) : (
                    <span className="stitch-badge stitch-badge-full">
                      Farklı Ağ ({chainId || "?"})
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <h1 className="font-headline-md font-label-mono" style={{ margin: 0, color: "var(--stitch-on-surface)" }}>
                    {account}
                  </h1>
                  <button
                    type="button"
                    className="stitch-btn-secondary"
                    onClick={handleCopyAddress}
                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                      content_copy
                    </span>
                    {copiedWallet ? "Kopyalandı ✓" : "Adresi Kopyala"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
                  <a
                    href={`${MONAD_EXPLORER_URL}/address/${account}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--stitch-primary)", textDecoration: "none" }}
                  >
                    Cüzdanı Monad Explorer&apos;da Görüntüle ↗
                  </a>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {!isCorrectNetwork && (
                <button
                  type="button"
                  className="stitch-btn-primary"
                  onClick={onSwitchNetwork}
                  style={{ backgroundColor: "var(--stitch-error-container)", fontSize: "0.8125rem" }}
                >
                  Monad Testnet&apos;e Geç (10143)
                </button>
              )}
              <button
                type="button"
                className="stitch-btn-secondary"
                onClick={handleManualRefresh}
                disabled={loading}
                style={{ fontSize: "0.8125rem" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  refresh
                </span>
                {loading ? "Yenileniyor..." : "Verileri Yenile"}
              </button>
            </div>
          </div>
        </section>

        {rpcError && (
          <div
            className="stitch-card"
            style={{
              padding: "1rem 1.25rem",
              backgroundColor: "rgba(147, 0, 10, 0.25)",
              borderColor: "var(--stitch-error)",
              color: "var(--stitch-error)",
              borderRadius: "0.75rem",
              marginBottom: "2rem",
            }}
          >
            <strong>Blokzincir Bağlantı Hatası:</strong> {rpcError}
          </div>
        )}

        {/* 2. 4 HIZLI İSTATİSTİK METRİK KARTI */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1.25rem",
            marginBottom: "2.5rem",
          }}
        >
          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">TOPLAM KAYIT</div>
            <div className="font-display-hero" style={{ fontSize: "2rem", color: "var(--stitch-on-surface)", marginTop: "0.25rem" }}>
              {stats.totalRegistered}
            </div>
            <div className="font-body-sm text-on-surface-variant" style={{ marginTop: "0.25rem" }}>
              Kayıtlı olunan kampüs etkinliği
            </div>
          </div>

          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">DOĞRULANMIŞ KATILIM</div>
            <div className="font-display-hero" style={{ fontSize: "2rem", color: "#6ee7b7", marginTop: "0.25rem" }}>
              {stats.verifiedAttended}
            </div>
            <div className="font-body-sm text-on-surface-variant" style={{ marginTop: "0.25rem" }}>
              Blokzincirde onaylanan etkinlik
            </div>
          </div>

          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">DİJİTAL SERTİFİKA</div>
            <div className="font-display-hero" style={{ fontSize: "2rem", color: "var(--stitch-primary)", marginTop: "0.25rem" }}>
              {certificates.length}
            </div>
            <div className="font-body-sm text-on-surface-variant" style={{ marginTop: "0.25rem" }}>
              Blokzincir doğrulamalı sertifika
            </div>
          </div>

          <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
            <div className="font-label-mono text-outline">KATILIM DÖNÜŞÜMÜ</div>
            <div className="font-display-hero" style={{ fontSize: "2rem", color: "var(--stitch-tertiary)", marginTop: "0.25rem" }}>
              %{stats.attendanceRate}
            </div>
            <div className="font-body-sm text-on-surface-variant" style={{ marginTop: "0.25rem" }}>
              Kayıt / katılım başarı oranı
            </div>
          </div>
        </section>

        {/* 3. ANA GÖVDE: SOLDA SEKMELER / SAĞDA DİNAMİK GEÇİŞ KARTI */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "2rem",
          }}
          className="student-profile-layout"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem" }}>
            {/* SOL ANA KOLON — SEKMELİ İÇERİK */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* Sekme Butonları */}
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  borderBottom: "1px solid rgba(142, 144, 161, 0.2)",
                  paddingBottom: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className={activeProfileTab === "events" ? "stitch-btn-primary" : "stitch-btn-secondary"}
                  onClick={() => setActiveProfileTab("events")}
                  style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    event
                  </span>
                  Etkinliklerim ({registeredEvents.length})
                </button>

                <button
                  type="button"
                  className={activeProfileTab === "certs" ? "stitch-btn-primary" : "stitch-btn-secondary"}
                  onClick={() => setActiveProfileTab("certs")}
                  style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    workspace_premium
                  </span>
                  Sertifikalarım ({certificates.length})
                </button>

                <button
                  type="button"
                  className={activeProfileTab === "timeline" ? "stitch-btn-primary" : "stitch-btn-secondary"}
                  onClick={() => setActiveProfileTab("timeline")}
                  style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    timeline
                  </span>
                  Katılım Zaman Çizelgesi
                </button>
              </div>

              {/* Bildirim Alanı */}
              {certBanner && (
                <div
                  className="stitch-card"
                  style={{
                    padding: "1rem",
                    backgroundColor: certBanner.type === "error" ? "rgba(147, 0, 10, 0.25)" : "rgba(16, 185, 129, 0.2)",
                    borderColor: certBanner.type === "error" ? "var(--stitch-error)" : "#6ee7b7",
                    color: certBanner.type === "error" ? "var(--stitch-error)" : "#6ee7b7",
                    fontSize: "0.875rem",
                  }}
                >
                  {certBanner.message}
                </div>
              )}

              {/* SEKME 1: ETKİNLİKLERİM */}
              {activeProfileTab === "events" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {/* Alt Filtre Hapları */}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`stitch-btn-secondary ${sectionFilter === "all" ? "bg-surface-container-high" : ""}`}
                      onClick={() => setSectionFilter("all")}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                    >
                      Tüm Kayıtlar ({registeredEvents.length})
                    </button>
                    <button
                      type="button"
                      className={`stitch-btn-secondary ${sectionFilter === "upcoming" ? "bg-surface-container-high" : ""}`}
                      onClick={() => setSectionFilter("upcoming")}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                    >
                      Yaklaşanlar ({upcomingEvents.length})
                    </button>
                    <button
                      type="button"
                      className={`stitch-btn-secondary ${sectionFilter === "attended" ? "bg-surface-container-high" : ""}`}
                      onClick={() => setSectionFilter("attended")}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                    >
                      Katıldıklarım ({attendedEvents.length})
                    </button>
                    <button
                      type="button"
                      className={`stitch-btn-secondary ${sectionFilter === "past" ? "bg-surface-container-high" : ""}`}
                      onClick={() => setSectionFilter("past")}
                      style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
                    >
                      Geçmiş ({pastEvents.length})
                    </button>
                  </div>

                  {displayedEvents.length === 0 ? (
                    <div className="stitch-card" style={{ padding: "3rem", textAlign: "center" }}>
                      <p className="font-body-md text-on-surface-variant">Bu filtrede görüntülenecek etkinlik bulunmuyor.</p>
                      {registeredEvents.length === 0 && (
                        <button
                          type="button"
                          className="stitch-btn-primary"
                          onClick={onExploreEvents}
                          style={{ marginTop: "1rem" }}
                        >
                          Etkinlikleri Keşfet ve Kaydol
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {displayedEvents.map((ev) => {
                        const attState = ev.attendanceState;
                        const isVerifiedAttended = Boolean(
                          ev.isAttended ||
                          attState?.code === ATTENDANCE_STATE.ATTENDED_VERIFIED
                        );
                        const existingCert = certificatesByEventId.get(Number(ev.id));
                        const activeCert =
                          existingCert &&
                          (existingCert.status === "ACTIVE" || !existingCert.status)
                            ? existingCert
                            : null;

                        return (
                          <article
                            key={ev.id}
                            className="stitch-card-low event-card"
                            style={{
                              padding: "1.25rem 1.5rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.75rem",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span className="font-label-mono text-outline">#{ev.id}</span>
                                <span className="font-label-badge text-primary">{ev.community}</span>
                              </div>
                              <div style={{ display: "flex", gap: "0.35rem" }}>
                                <span className="stitch-badge stitch-badge-open">Kayıtlı ✓</span>
                                <span className={`stitch-badge ${isVerifiedAttended ? "stitch-badge-completed" : "stitch-badge-testnet"}`}>
                                  {attState?.label || "Bekleniyor"}
                                </span>
                              </div>
                            </div>

                            <h3 className="font-headline-sm" style={{ margin: 0, color: "var(--stitch-on-surface)" }}>
                              {ev.title}
                            </h3>

                            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.8125rem", color: "var(--stitch-on-surface-variant)" }}>
                              <div>📅 {formatTurkeyDateOnly(ev.date)} • {ev.startTime} - {ev.endTime}</div>
                              <div>📍 {ev.location?.campus} / {ev.location?.building} ({ev.location?.room})</div>
                            </div>

                            {/* FAZ 10 DÜZELTMESİ: isVerifiedAttended + activeCert vs !activeCert */}
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                              <button
                                type="button"
                                className="stitch-btn-primary"
                                onClick={() => onSelectEvent(ev.id)}
                                style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem" }}
                              >
                                {isVerifiedAttended ? "Etkinlik Detayını Gör" : "Detay & QR Katılım Kodu"}
                              </button>

                              {isVerifiedAttended && activeCert && (
                                <button
                                  type="button"
                                  className="stitch-btn-secondary"
                                  onClick={() => setSelectedCertificateModal(activeCert)}
                                  style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem" }}
                                >
                                  🎓 Sertifikayı Görüntüle
                                </button>
                              )}

                              {isVerifiedAttended && !activeCert && (
                                <button
                                  type="button"
                                  className="stitch-btn-secondary"
                                  disabled={issuingEventId === ev.id}
                                  onClick={() => handleIssueCertificate(ev.id)}
                                  style={{ fontSize: "0.8125rem", padding: "0.45rem 0.85rem" }}
                                >
                                  {issuingEventId === ev.id ? "Sertifika Üretiliyor..." : "🎓 Sertifika Oluştur"}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SEKME 2: SERTİFİKALARIM */}
              {activeProfileTab === "certs" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div className="stitch-card-low" style={{ padding: "1.25rem" }}>
                    <div style={{ marginBottom: "0.75rem" }}>
                      <h3 className="font-headline-sm" style={{ margin: 0 }}>
                        Blokzincir Doğrulamalı Katılım Sertifikalarım
                      </h3>
                      <p className="font-body-sm text-on-surface-variant" style={{ margin: "0.25rem 0 0" }}>
                        Yalnızca blokzincir üzerinde <code>AttendanceMarked</code> olayıyla katılımı doğrulanmış
                        etkinlikler için sertifika oluşturulabilir.
                      </p>
                    </div>

                    {attendedEvents.length > 0 && (
                      <div style={{ marginTop: "1rem" }}>
                        <label className="font-label-badge text-outline" htmlFor="cert-name-input">
                          İsteğe Bağlı Sertifika Gösterim Adı (Zorunlu Değil):
                        </label>
                        <input
                          id="cert-name-input"
                          type="text"
                          maxLength={80}
                          className="stitch-input"
                          value={optionalDisplayName}
                          onChange={(e) => setOptionalDisplayName(e.target.value)}
                          placeholder="Boş bırakırsanız yalnızca cüzdan adresiniz gösterilir"
                          style={{ marginTop: "0.35rem" }}
                        />
                      </div>
                    )}
                  </div>

                  {loadingCertificates ? (
                    <div className="stitch-card" style={{ padding: "3rem", textAlign: "center" }}>
                      <p className="font-body-md text-on-surface-variant">Sertifika kayıtlarınız kontrol ediliyor...</p>
                    </div>
                  ) : certificates.length === 0 ? (
                    <div className="stitch-card" style={{ padding: "2.5rem", textAlign: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--stitch-outline)" }}>
                        workspace_premium
                      </span>
                      <h4 className="font-headline-sm" style={{ margin: "1rem 0 0.5rem" }}>
                        Henüz Oluşturulmuş Bir Dijital Sertifikanız Yok
                      </h4>
                      <p className="font-body-sm text-on-surface-variant" style={{ maxWidth: "500px", margin: "0 auto" }}>
                        {attendedEvents.length > 0
                          ? "Doğrulanmış katılımlarınız bulunuyor! 'Etkinliklerim' sekmesinden '🎓 Sertifika Oluştur' butonuna tıklayarak hemen üretebilirsiniz."
                          : "Sertifika alabilmek için kayıt olduğunuz bir etkinlikte QR kodunuzun organizatör tarafından blokzincir üzerinde doğrulanması (AttendanceMarked) gerekir."}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
                      {certificates.map((cert) => (
                        <div
                          key={cert.certificateId}
                          className="stitch-card"
                          style={{
                            padding: "1.5rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                            borderRadius: "1rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span className="font-label-mono text-outline" style={{ fontSize: "0.75rem" }}>
                              {cert.certificateId}
                            </span>
                            <span className="stitch-badge stitch-badge-completed">
                              Doğrulandı ✓
                            </span>
                          </div>

                          <div className="font-label-badge text-primary">{cert.community}</div>
                          <h4 className="font-headline-sm" style={{ margin: 0 }}>
                            {cert.eventTitle}
                          </h4>

                          <div className="font-body-sm text-outline" style={{ fontSize: "0.75rem" }}>
                            <div>Veriliş: {formatTurkeyDateTime(cert.issuedAt)}</div>
                            <div>Blok Kanıtı: Blok #{cert.attendanceBlockNumber}</div>
                          </div>

                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "auto" }}>
                            <button
                              type="button"
                              className="stitch-btn-primary"
                              onClick={() => setSelectedCertificateModal(cert)}
                              style={{ flex: 1, fontSize: "0.75rem", padding: "0.4rem" }}
                            >
                              Görüntüle
                            </button>
                            <button
                              type="button"
                              className="stitch-btn-secondary"
                              onClick={() => downloadCertificatePdf(cert)}
                              style={{ flex: 1, fontSize: "0.75rem", padding: "0.4rem" }}
                            >
                              PDF İndir
                            </button>
                            <button
                              type="button"
                              className="stitch-btn-secondary"
                              onClick={() => handleCopyVerifyLink(cert.certificateId)}
                              style={{ flex: 1, fontSize: "0.75rem", padding: "0.4rem" }}
                            >
                              {copiedCertId === cert.certificateId ? "Kopyalandı ✓" : "Bağlantı"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SEKME 3: KATILIM ZAMAN ÇİZELGESİ */}
              {activeProfileTab === "timeline" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="font-body-sm text-outline">Kronolojik Katılım Akışı</span>
                    <button
                      type="button"
                      className="stitch-btn-secondary"
                      onClick={() => setTimelineDirection((prev) => (prev === "DESC" ? "ASC" : "DESC"))}
                      style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                    >
                      {timelineDirection === "DESC" ? "Yeniden Eskiye ↓" : "Eskiden Yeniye ↑"}
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {sortedTimeline.map((item) => (
                      <div
                        key={item.eventId}
                        className="stitch-card-low"
                        style={{
                          padding: "1rem 1.25rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              backgroundColor: item.isAttended ? "#6ee7b7" : "var(--stitch-outline)",
                            }}
                          />
                          <div>
                            <div className="font-label-badge text-primary">{item.community}</div>
                            <h4
                              className="font-headline-sm"
                              style={{ margin: "0.15rem 0", cursor: "pointer" }}
                              onClick={() => onSelectEvent(item.eventId)}
                            >
                              #{item.eventId}: {item.title}
                            </h4>
                            <div className="font-body-sm text-outline" style={{ fontSize: "0.75rem" }}>
                              {formatTurkeyDateTime(item.startAt)} (TSİ)
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span className={`stitch-badge ${item.isAttended ? "stitch-badge-completed" : "stitch-badge-open"}`}>
                            {item.attendanceState.label}
                          </span>

                          {item.isAttended && (
                            <div>
                              {certificatesByEventId.get(Number(item.eventId)) ? (
                                <button
                                  type="button"
                                  className="stitch-btn-secondary"
                                  onClick={() => setSelectedCertificateModal(certificatesByEventId.get(Number(item.eventId)))}
                                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                                >
                                  Sertifika
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="stitch-btn-primary"
                                  disabled={issuingEventId === item.eventId}
                                  onClick={() => handleIssueCertificate(item.eventId)}
                                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                                >
                                  {issuingEventId === item.eventId ? "..." : "Sertifika Üret"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SAĞ YAN KOLON: DİNAMİK KAMPÜS GEÇİŞ KARTI (Pass Card) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div
                className="stitch-card"
                style={{
                  padding: "1.75rem",
                  borderRadius: "1.25rem",
                  background: "linear-gradient(145deg, #16264c 0%, #0c1b36 100%)",
                  border: "1px solid rgba(185, 195, 255, 0.3)",
                  boxShadow: "0 16px 36px rgba(0, 13, 40, 0.7)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "6px",
                        background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-tertiary))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "0.75rem",
                        color: "#ffffff",
                      }}
                    >
                      CP
                    </div>
                    <span className="font-label-badge text-outline">DİNAMİK KAMPÜS KARTI</span>
                  </div>
                  <span className="stitch-badge stitch-badge-testnet" style={{ fontSize: "0.625rem" }}>
                    MONAD
                  </span>
                </div>

                {/* QR Alanı */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    padding: "1rem",
                    backgroundColor: "#ffffff",
                    borderRadius: "10px",
                    marginBottom: "1.25rem",
                  }}
                >
                  <QrSvgSmall value={`CP:STUDENT:${account}:10143`} size={140} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8125rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-outline">Cüzdan ID:</span>
                    <span className="font-label-mono text-primary">{shortenAddress(account)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-outline">Doğrulama Protokolü:</span>
                    <span className="font-label-mono text-tertiary">EIP-191 / SIWE</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-outline">Onaylı Sertifikalar:</span>
                    <span className="font-label-mono" style={{ color: "#6ee7b7" }}>{certificates.length} Adet</span>
                  </div>
                </div>
              </div>

              {/* Katılınan Topluluklar */}
              <div className="stitch-card-low" style={{ padding: "1.5rem", borderRadius: "1rem" }}>
                <h4 className="font-headline-sm" style={{ margin: "0 0 1rem 0" }}>
                  Katıldığınız Topluluklar
                </h4>
                {studentCommunities.length === 0 ? (
                  <p className="font-body-sm text-outline" style={{ margin: 0 }}>
                    Henüz bir topluluğun etkinliğine kayıt olmadınız.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {studentCommunities.map((comm) => (
                      <div
                        key={comm}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontSize: "0.8125rem",
                          color: "var(--stitch-on-surface-variant)",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--stitch-primary)" }}>
                          check_circle
                        </span>
                        {comm}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sertifika Detay / Önizleme Modalı */}
        {selectedCertificateModal && (
          <CertificateModal
            certificate={selectedCertificateModal}
            onClose={() => setSelectedCertificateModal(null)}
            onOpenVerifyPage={onOpenVerifyPage}
          />
        )}
      </div>
    </div>
  );
}
