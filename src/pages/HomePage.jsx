import { useMemo, useState } from "react";
import EventCard from "../components/EventCard";
import { MONAD_CHAIN_ID } from "../data/events";
import {
  EVENT_CATEGORIES,
  filterAndSortEvents,
  validateEventMetadataInput,
  validatePosterFile,
} from "../utils/eventMetadata";

function getDefaultDates() {
  const tomorrow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  return {
    date: dateStr,
    startTime: "14:00",
    endTime: "17:00",
    registrationDeadline: `${dateStr}T12:00`,
  };
}

export default function HomePage({
  events,
  loadingEvents,
  account,
  chainId,
  activeTab,
  onSelectTab,
  onSelectEvent,
  onCreateEvent,
  onRegisterEvent,
  onRefreshEvents,
  txState,
}) {
  const defaults = useMemo(() => getDefaultDates(), []);

  // Gelişmiş Etkinlik Oluşturma Formu State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("50");
  const [community, setCommunity] = useState("");
  const [category, setCategory] = useState("Blockchain");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [registrationDeadline, setRegistrationDeadline] = useState(
    defaults.registrationDeadline
  );
  const [campus, setCampus] = useState("Merkez Kampüs");
  const [building, setBuilding] = useState("Mühendislik Fakültesi");
  const [room, setRoom] = useState("B-204 Konferans Salonu");
  const [posterUrl, setPosterUrl] = useState("");
  const [formError, setFormError] = useState("");

  // Keşif & Filtreleme State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedCommunity, setSelectedCommunity] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("NEWEST");

  const isCorrectNetwork = chainId === MONAD_CHAIN_ID;

  // Mevcut toplulukların benzersiz listesi
  const availableCommunities = useMemo(() => {
    const setObj = new Set();
    for (const ev of events) {
      if (ev.community) setObj.add(ev.community);
    }
    return Array.from(setObj);
  }, [events]);

  // Sekme + Arama + Kategori + Topluluk + Zaman + Sıralama
  const tabEvents = useMemo(() => {
    return events.filter((ev) => {
      if (activeTab === "student") return ev.isRegistered;
      if (activeTab === "organizer") {
        return account && ev.organizer && ev.organizer.toLowerCase() === account.toLowerCase();
      }
      return true;
    });
  }, [events, activeTab, account]);

  const discoveredEvents = useMemo(() => {
    return filterAndSortEvents(tabEvents, {
      searchQuery,
      category: selectedCategory,
      community: selectedCommunity,
      timeFilter,
      sortBy,
    });
  }, [
    tabEvents,
    searchQuery,
    selectedCategory,
    selectedCommunity,
    timeFilter,
    sortBy,
  ]);

  // Öne Çıkan Etkinlikler (Landing view için ilk 3 aktif etkinlik)
  const featuredEvents = useMemo(() => {
    const upcoming = events.filter((e) => e.status === "upcoming" || e.status === "ongoing");
    return upcoming.length > 0 ? upcoming.slice(0, 3) : events.slice(0, 3);
  }, [events]);

  // Aktif İstatistikler
  const stats = useMemo(() => {
    const totalEvents = events.length;
    const activeEvents = events.filter(
      (e) => e.status === "upcoming" || e.status === "ongoing"
    ).length;
    const registeredCount = events.filter((e) => e.isRegistered).length;
    const attendedCount = events.filter((e) => e.isAttended).length;
    return { totalEvents, activeEvents, registeredCount, attendedCount };
  }, [events]);

  function handlePosterFileChange(e) {
    setFormError("");
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validatePosterFile(file);
    } catch (err) {
      setFormError(err.message);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPosterUrl(reader.result);
      }
    };
    reader.onerror = () => {
      setFormError("Afiş dosyası okunurken bir hata oluştu.");
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!account) {
      setFormError("Etkinlik oluşturmak için önce cüzdanınızı bağlamalısınız.");
      return;
    }
    if (!isCorrectNetwork) {
      setFormError("Lütfen önce Monad Testnet (Chain ID: 10143) ağına geçiş yapın.");
      return;
    }

    const payload = {
      title,
      capacity: Number(capacity),
      community,
      category,
      description,
      date,
      startTime,
      endTime,
      registrationDeadline,
      location: {
        campus,
        building,
        room,
      },
      posterUrl,
    };

    try {
      validateEventMetadataInput(payload, { requireTitleAndCapacity: true });
    } catch (err) {
      setFormError(err.message);
      return;
    }

    const createdId = await onCreateEvent(payload);
    if (createdId) {
      setTitle("");
      setCapacity("50");
      setCommunity("");
      setDescription("");
      setPosterUrl("");
      setShowCreateForm(false);
    }
  }

  const isLandingView = activeTab === "home";

  return (
    <div className="stitch-shell page-container" style={{ paddingBottom: "4rem" }}>
      {/* Ambient Vector Glow Orbları */}
      <div
        className="ambient-glow-primary"
        style={{ top: "0", left: "10%", width: "500px", height: "400px" }}
      />
      <div
        className="ambient-glow-secondary"
        style={{ top: "35%", right: "5%", width: "450px", height: "450px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1 }}>
        {/* ===================================================================
            GÖRÜNÜM 1: ANA SAYFA (LANDING PAGE VIEW)
            =================================================================== */}
        {isLandingView && (
          <div style={{ display: "flex", flexDirection: "column", gap: "5rem", paddingTop: "2rem" }}>
            {/* HERO SECTION */}
            <section
              className="hero-banner stitch-card"
              style={{
                padding: "3.5rem 2rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "3rem",
                alignItems: "center",
                borderRadius: "1.5rem",
                background: "linear-gradient(135deg, rgba(17, 31, 59, 0.9) 0%, rgba(3, 18, 46, 0.95) 100%)",
                border: "1px solid rgba(142, 144, 161, 0.2)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <span className="stitch-badge stitch-badge-testnet">
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "var(--stitch-tertiary)",
                        boxShadow: "0 0 8px var(--stitch-tertiary)",
                      }}
                      className="pulse-glow"
                    />
                    Monad Testnet • Chain ID 10143
                  </span>
                  <span className="stitch-badge stitch-badge-verified">
                    EIP-191 İmzalı QR Katılım
                  </span>
                </div>

                <h1 className="font-display-hero" style={{ margin: 0, color: "var(--stitch-on-surface)" }}>
                  Kampüs Deneyiminin <span style={{ color: "var(--stitch-primary)" }}>Yeni Nesli</span>
                </h1>

                <p className="font-body-lg text-on-surface-variant" style={{ margin: 0, maxWidth: "600px" }}>
                  Üniversite kulüp etkinliklerini keşfedin, şeffaf kontenjana tek tıkla kaydolun,
                  etkinlik alanında cüzdan imzalı QR kodunuzla katılımınızı doğrulayın ve Monad
                  blokzincirinde doğrulanabilir dijital başarı sertifikanızı alın.
                </p>

                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="stitch-btn-primary"
                    onClick={() => onSelectTab("all")}
                    style={{ padding: "0.875rem 1.75rem", fontSize: "1rem" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                      explore
                    </span>
                    Etkinlikleri Keşfet
                  </button>
                  <button
                    type="button"
                    className="stitch-btn-secondary"
                    onClick={() => onSelectTab("organizer")}
                    style={{ padding: "0.875rem 1.75rem", fontSize: "1rem" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                      hub
                    </span>
                    Topluluk Paneli
                  </button>
                </div>

                {/* Hızlı Sayaçlar */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "1rem",
                    paddingTop: "1.5rem",
                    borderTop: "1px solid rgba(142, 144, 161, 0.15)",
                  }}
                >
                  <div>
                    <div className="font-headline-md" style={{ color: "var(--stitch-tertiary)" }}>
                      {stats.totalEvents}
                    </div>
                    <div className="font-body-sm text-outline">Toplam Etkinlik</div>
                  </div>
                  <div>
                    <div className="font-headline-md" style={{ color: "var(--stitch-primary)" }}>
                      {availableCommunities.length || "12+"}
                    </div>
                    <div className="font-body-sm text-outline">Aktif Topluluk</div>
                  </div>
                  <div>
                    <div className="font-headline-md" style={{ color: "var(--stitch-secondary)" }}>
                      {stats.attendedCount}
                    </div>
                    <div className="font-body-sm text-outline">Onaylı Katılım</div>
                  </div>
                </div>
              </div>

              {/* Sağ Taraf: Mockup ID Card */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <div
                  className="stitch-card"
                  style={{
                    width: "100%",
                    maxWidth: "380px",
                    padding: "1.75rem",
                    background: "linear-gradient(145deg, #16264c 0%, #0c1b36 100%)",
                    border: "1px solid rgba(185, 195, 255, 0.3)",
                    boxShadow: "0 20px 40px rgba(0, 13, 40, 0.8)",
                    borderRadius: "1.25rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-tertiary))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: "0.875rem",
                          color: "#ffffff",
                        }}
                      >
                        CP
                      </div>
                      <div>
                        <div className="font-headline-sm" style={{ fontSize: "0.875rem", lineHeight: 1.2 }}>
                          CampusPass Pass
                        </div>
                        <div className="font-label-mono text-outline" style={{ fontSize: "0.6875rem" }}>
                          Monad Verified
                        </div>
                      </div>
                    </div>
                    <span className="stitch-badge stitch-badge-testnet" style={{ fontSize: "0.625rem" }}>
                      10143
                    </span>
                  </div>

                  <div
                    style={{
                      background: "rgba(3, 18, 46, 0.7)",
                      borderRadius: "0.75rem",
                      padding: "1rem",
                      marginBottom: "1rem",
                      border: "1px dashed rgba(142, 144, 161, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #6f88ff, #d0bcff)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.5rem",
                      }}
                    >
                      🎓
                    </div>
                    <div>
                      <div className="font-label-badge text-outline">KİMLİK TÜRÜ</div>
                      <div className="font-headline-sm" style={{ fontSize: "0.9375rem" }}>
                        Öğrenci &amp; Katılımcı
                      </div>
                      <div className="font-label-mono text-primary" style={{ fontSize: "0.6875rem" }}>
                        {account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Cüzdan Doğrulanmadı"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem" }}>
                    <div className="text-on-surface-variant">
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", verticalAlign: "middle", marginRight: "4px" }}>
                        verified_user
                      </span>
                      Kriptografik Bilet &amp; Sertifika
                    </div>
                    <span className="font-label-mono" style={{ color: "var(--stitch-tertiary)" }}>
                      AKTİF
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* BENTO GRID: CAMPUSPASS NASIL ÇALIŞIR? */}
            <section style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div style={{ textAlign: "center", maxWidth: "650px", margin: "0 auto" }}>
                <span className="stitch-badge stitch-badge-testnet" style={{ marginBottom: "0.75rem" }}>
                  Adım Adım Web3 Kampüs Akışı
                </span>
                <h2 className="font-headline-lg" style={{ margin: "0.5rem 0" }}>
                  CampusPass Nasıl Çalışır?
                </h2>
                <p className="font-body-md text-on-surface-variant" style={{ margin: 0 }}>
                  Merkeziyetsiz kimlik ve Monad blokzincir mimarisi sayesinde tüm süreç şeffaf,
                  sahteciliğe karşı korumalı ve saniyeler içinde gerçekleşir.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "1.5rem",
                }}
              >
                {/* 1. Adım */}
                <div className="stitch-card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(111, 136, 255, 0.2)",
                      color: "var(--stitch-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span className="material-symbols-outlined">account_balance_wallet</span>
                  </div>
                  <div>
                    <span className="font-label-mono text-outline">01. ADIM</span>
                    <h3 className="font-headline-md" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                      Cüzdanını Bağla
                    </h3>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      MetaMask veya uyumlu cüzdanınızı bağlayın. EIP-4361 (SIWE) ile şifre veya e-posta
                      gerekmeden anında güvenli oturum açın.
                    </p>
                  </div>
                </div>

                {/* 2. Adım */}
                <div className="stitch-card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(208, 188, 255, 0.2)",
                      color: "var(--stitch-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span className="material-symbols-outlined">how_to_reg</span>
                  </div>
                  <div>
                    <span className="font-label-mono text-outline">02. ADIM</span>
                    <h3 className="font-headline-md" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                      Etkinliğe Kaydol
                    </h3>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      İstediğiniz etkinliği seçin ve tek tıkla kaydolun. Kontenjan Monad akıllı sözleşmesinde
                      şeffaf biçimde anlık rezerve edilir.
                    </p>
                  </div>
                </div>

                {/* 3. Adım */}
                <div className="stitch-card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(123, 208, 255, 0.2)",
                      color: "var(--stitch-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span className="material-symbols-outlined">qr_code_scanner</span>
                  </div>
                  <div>
                    <span className="font-label-mono text-outline">03. ADIM</span>
                    <h3 className="font-headline-md" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                      QR ile Katılım Doğrula
                    </h3>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      Etkinlik alanında cüzdanınızla ürettiğiniz EIP-191 imzalı QR kodunu organizatöre
                      okutun; katılımınız zincire işlensin.
                    </p>
                  </div>
                </div>

                {/* 4. Adım */}
                <div className="stitch-card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(16, 185, 129, 0.2)",
                      color: "#6ee7b7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span className="material-symbols-outlined">workspace_premium</span>
                  </div>
                  <div>
                    <span className="font-label-mono text-outline">04. ADIM</span>
                    <h3 className="font-headline-md" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                      Sertifikanı Al
                    </h3>
                    <p className="font-body-sm text-on-surface-variant" style={{ margin: 0 }}>
                      Doğrulanmış katılımınızın ardından kriptografik dijital katılım sertifikanızı üretin,
                      indirip CV&apos;nizde ve LinkedIn&apos;de paylaşın.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ÖNE ÇIKAN ETKİNLİKLER */}
            <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <span className="font-label-mono text-tertiary">GÜNCEL AJANDA</span>
                  <h2 className="font-headline-lg" style={{ margin: "0.25rem 0 0" }}>
                    Kampüste Neler Oluyor?
                  </h2>
                </div>
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={() => onSelectTab("all")}
                >
                  Tüm Etkinlikleri Keşfet ({events.length}) →
                </button>
              </div>

              {featuredEvents.length === 0 ? (
                <div className="stitch-card" style={{ padding: "2rem", textAlign: "center" }}>
                  <p className="text-on-surface-variant">Henüz yayınlanmış aktif etkinlik bulunmuyor.</p>
                </div>
              ) : (
                <div className="stitch-events-grid">
                  {featuredEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      account={account}
                      onSelectEvent={onSelectEvent}
                      onQuickRegister={onRegisterEvent}
                      registeringId={txState.type === "register" ? txState.targetId : null}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* TOPLULUKLARI KEŞFET */}
            <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div>
                <span className="font-label-mono text-primary">EKOSİSTEM</span>
                <h2 className="font-headline-lg" style={{ margin: "0.25rem 0 0" }}>
                  Üniversite Toplulukları
                </h2>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                {(availableCommunities.length > 0
                  ? availableCommunities
                  : ["Blockchain & Web3 Topluluğu", "Yapay Zeka ve Veri Kulübü", "Girişimcilik ve İnovasyon", "Yazılım Geliştirme Topluluğu"]
                ).map((commName, idx) => {
                  const commCount = events.filter((e) => e.community === commName).length;
                  return (
                    <div
                      key={idx}
                      className="stitch-card-low"
                      style={{
                        padding: "1.25rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setSelectedCommunity(commName);
                        onSelectTab("all");
                      }}
                    >
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "12px",
                          background: "linear-gradient(135deg, #1c2a46, #273451)",
                          border: "1px solid rgba(185, 195, 255, 0.2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "1.125rem",
                          color: "var(--stitch-primary)",
                        }}
                      >
                        {commName.charAt(0)}
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <h4 className="font-headline-sm" style={{ margin: 0, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {commName}
                        </h4>
                        <span className="font-body-sm text-outline">
                          {commCount > 0 ? `${commCount} Etkinlik` : "Aktif Kulüp"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* GÜVENLİK VE PROTOKOL BANNER */}
            <section
              className="stitch-card"
              style={{
                padding: "2.5rem 2rem",
                borderRadius: "1.25rem",
                background: "linear-gradient(135deg, rgba(87, 27, 193, 0.15) 0%, rgba(3, 18, 46, 0.95) 100%)",
                border: "1px solid rgba(208, 188, 255, 0.25)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "2rem",
                alignItems: "center",
              }}
            >
              <div>
                <span className="stitch-badge stitch-badge-verified" style={{ marginBottom: "0.75rem" }}>
                  Kriptografik Güvenlik Protokolü
                </span>
                <h3 className="font-headline-lg" style={{ margin: "0.5rem 0" }}>
                  Blokzincir Onaylı Katılım ve Sahtecilik Önleme
                </h3>
                <p className="font-body-md text-on-surface-variant" style={{ margin: 0 }}>
                  CampusPass, her katılım kaydını EIP-191 kriptografik cüzdan imzasıyla doğrular.
                  Monad Testnet üzerindeki `AttendanceMarked` olayıyla mühürlenen veriler, sahte imza
                  veya mükerrer katılımı tamamen engeller.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--stitch-tertiary)" }}>
                    check_circle
                  </span>
                  <span className="font-body-sm">Monad Testnet (10143) Yüksek Hızlı Mutabakat</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--stitch-primary)" }}>
                    check_circle
                  </span>
                  <span className="font-body-sm">EIP-4361 (SIWE) Cüzdan Yetkilendirmesi</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--stitch-secondary)" }}>
                    check_circle
                  </span>
                  <span className="font-body-sm">SHA-256 + HMAC Sertifika Doğrulama Kodu</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ===================================================================
            GÖRÜNÜM 2: ETKİNLİKLERİ KEŞFET (DISCOVERY / ALL EVENTS VIEW)
            =================================================================== */}
        {!isLandingView && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem", paddingTop: "2rem" }}>
            {/* Keşif Başlık & Sayaç Bölgesi */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: "1.5rem",
              }}
            >
              <div>
                <span className="font-label-mono text-tertiary">ETKİNLİK DİZİNİ</span>
                <h1 className="font-display-hero" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                  Etkinlikleri Keşfet
                </h1>
                <p className="font-body-md text-on-surface-variant" style={{ margin: 0, maxWidth: "600px" }}>
                  Kampüsteki tüm akademik, teknolojik ve sosyal etkinlikleri filtreleyin, kontenjan durumunu
                  canlı takip edin ve yerinizi ayırtın.
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={onRefreshEvents}
                  disabled={loadingEvents}
                  style={{ fontSize: "0.875rem", padding: "0.625rem 1rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    refresh
                  </span>
                  {loadingEvents ? "Yenileniyor..." : "Zincirden Yenile"}
                </button>

                <button
                  type="button"
                  className="stitch-btn-primary"
                  onClick={() => setShowCreateForm((prev) => !prev)}
                  style={{ fontSize: "0.875rem", padding: "0.625rem 1.25rem" }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                    {showCreateForm ? "close" : "add_circle"}
                  </span>
                  {showCreateForm ? "Formu Kapat" : "Yeni Etkinlik Oluştur"}
                </button>
              </div>
            </div>

            {/* Metrik Rozetleri Çubuğu */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1rem",
              }}
            >
              <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
                <div className="font-label-mono text-outline">TOPLAM ETKİNLİK</div>
                <div className="font-headline-md" style={{ color: "var(--stitch-tertiary)", marginTop: "0.25rem" }}>
                  {stats.totalEvents}
                </div>
              </div>
              <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
                <div className="font-label-mono text-outline">AKTİF &amp; YAKLAŞAN</div>
                <div className="font-headline-md" style={{ color: "var(--stitch-primary)", marginTop: "0.25rem" }}>
                  {stats.activeEvents}
                </div>
              </div>
              <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
                <div className="font-label-mono text-outline">AKTİF TOPLULUK</div>
                <div className="font-headline-md" style={{ color: "var(--stitch-secondary)", marginTop: "0.25rem" }}>
                  {availableCommunities.length}
                </div>
              </div>
              <div className="stitch-card-low" style={{ padding: "1rem 1.25rem" }}>
                <div className="font-label-mono text-outline">DOĞRULANMIŞ KATILIM</div>
                <div className="font-headline-md" style={{ color: "#6ee7b7", marginTop: "0.25rem" }}>
                  {stats.attendedCount}
                </div>
              </div>
            </div>

            {/* GELİŞMİŞ ETKİNLİK OLUŞTURMA FORMU (Açılır Panel) */}
            {showCreateForm && (
              <section
                className="stitch-card"
                style={{
                  padding: "2rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(185, 195, 255, 0.35)",
                  background: "linear-gradient(135deg, rgba(17, 31, 59, 0.95) 0%, rgba(12, 27, 54, 0.95) 100%)",
                }}
              >
                <div style={{ marginBottom: "1.5rem" }}>
                  <h2 className="font-headline-md" style={{ margin: 0 }}>
                    Yeni Etkinlik Oluştur (Monad Testnet)
                  </h2>
                  <p className="font-body-sm text-on-surface-variant" style={{ margin: "0.25rem 0 0" }}>
                    Etkinlik başlığı ve kapasitesi Monad Testnet akıllı sözleşmesine işlenir; program,
                    konum ve afiş bilgileri blokzincir işlem onayının ardından kalıcı olarak saklanır.
                  </p>
                </div>

                <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-title">
                        Etkinlik Başlığı *
                      </label>
                      <input
                        id="event-title"
                        type="text"
                        className="stitch-input"
                        placeholder="Örn: Monad & Solidity Akıllı Sözleşme Atölyesi"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-community">
                        Düzenleyen Topluluk / Kulüp *
                      </label>
                      <input
                        id="event-community"
                        type="text"
                        className="stitch-input"
                        placeholder="Örn: Blockchain & Web3 Topluluğu"
                        value={community}
                        onChange={(e) => setCommunity(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-category">
                        Kategori *
                      </label>
                      <select
                        id="event-category"
                        className="stitch-select"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      >
                        {EVENT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-capacity">
                        Kontenjan (Kapasite) *
                      </label>
                      <input
                        id="event-capacity"
                        type="number"
                        min="1"
                        step="1"
                        className="stitch-input"
                        placeholder="50"
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-date">
                        Etkinlik Tarihi (TSİ) *
                      </label>
                      <input
                        id="event-date"
                        type="date"
                        className="stitch-input"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-start-time">
                        Başlangıç Saati (TSİ) *
                      </label>
                      <input
                        id="event-start-time"
                        type="time"
                        className="stitch-input"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-end-time">
                        Bitiş Saati (TSİ) *
                      </label>
                      <input
                        id="event-end-time"
                        type="time"
                        className="stitch-input"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-deadline">
                        Son Kayıt Tarihi (TSİ) *
                      </label>
                      <input
                        id="event-deadline"
                        type="datetime-local"
                        className="stitch-input"
                        value={registrationDeadline}
                        onChange={(e) => setRegistrationDeadline(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-campus">
                        Kampüs *
                      </label>
                      <input
                        id="event-campus"
                        type="text"
                        className="stitch-input"
                        placeholder="Örn: Merkez Kampüs"
                        value={campus}
                        onChange={(e) => setCampus(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-building">
                        Bina / Fakülte *
                      </label>
                      <input
                        id="event-building"
                        type="text"
                        className="stitch-input"
                        placeholder="Örn: Mühendislik Fakültesi"
                        value={building}
                        onChange={(e) => setBuilding(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-room">
                        Salon / Amfi *
                      </label>
                      <input
                        id="event-room"
                        type="text"
                        className="stitch-input"
                        placeholder="Örn: B-204 Konferans Salonu"
                        value={room}
                        onChange={(e) => setRoom(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                    </div>

                    <div>
                      <label className="font-label-badge text-on-surface-variant" htmlFor="event-poster-url">
                        Afiş Görsel URL (Maks 500 KB)
                      </label>
                      <input
                        id="event-poster-url"
                        type="url"
                        className="stitch-input"
                        placeholder="https://ornek.com/afis.png"
                        value={posterUrl.startsWith("data:") ? "" : posterUrl}
                        onChange={(e) => setPosterUrl(e.target.value)}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem" }}
                      />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handlePosterFileChange}
                        disabled={txState.busy}
                        style={{ marginTop: "0.35rem", fontSize: "0.75rem" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-label-badge text-on-surface-variant" htmlFor="event-description">
                      Etkinlik Açıklaması ve Program *
                    </label>
                    <textarea
                      id="event-description"
                      rows={3}
                      className="stitch-input"
                      placeholder="Etkinlik içeriği, konuşmacılar, ön koşullar ve katılımcıların yanlarında getirmesi gerekenler..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={txState.busy}
                      style={{ marginTop: "0.35rem", resize: "vertical" }}
                    />
                  </div>

                  {formError && (
                    <div
                      className="stitch-card"
                      style={{
                        padding: "0.75rem 1rem",
                        backgroundColor: "rgba(147, 0, 10, 0.2)",
                        borderColor: "var(--stitch-error)",
                        color: "var(--stitch-error)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {formError}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                    <button
                      type="button"
                      className="stitch-btn-secondary"
                      onClick={() => setShowCreateForm(false)}
                      disabled={txState.busy}
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      className="stitch-btn-primary"
                      disabled={txState.busy}
                    >
                      {txState.type === "create"
                        ? "Cüzdan / Monad Onayı Bekleniyor..."
                        : "Etkinliği Blokzincirde Yayınla"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* ARAMA VE ÇOKLU FİLTRELEME ÇUBUĞU */}
            <div
              className="stitch-card-low"
              style={{
                padding: "1rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              {/* Arama Input (⌘K İpuçlu) */}
              <div style={{ position: "relative", gridColumn: "span 2" }}>
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
                  placeholder="Etkinlik adı, topluluk, açıklama veya salon ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: "2.5rem", paddingRight: "3rem" }}
                />
                <span
                  className="font-label-mono"
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    backgroundColor: "rgba(142, 144, 161, 0.2)",
                    padding: "0.15rem 0.4rem",
                    borderRadius: "4px",
                    fontSize: "0.6875rem",
                    color: "var(--stitch-outline)",
                  }}
                >
                  ⌘K
                </span>
              </div>

              {/* Kategori Seçici */}
              <select
                className="stitch-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Kategoriye göre filtrele"
              >
                <option value="ALL">Tüm Kategoriler</option>
                {EVENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Topluluk Seçici */}
              <select
                className="stitch-select"
                value={selectedCommunity}
                onChange={(e) => setSelectedCommunity(e.target.value)}
                aria-label="Topluluğa göre filtrele"
              >
                <option value="ALL">Tüm Topluluklar</option>
                {availableCommunities.map((comm) => (
                  <option key={comm} value={comm}>
                    {comm}
                  </option>
                ))}
              </select>

              {/* Durum / Zaman Seçici */}
              <select
                className="stitch-select"
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                aria-label="Etkinlik durumuna göre filtrele"
              >
                <option value="ALL">Tüm Durumlar</option>
                <option value="UPCOMING">Yaklaşan &amp; Devam Eden</option>
                <option value="PAST">Tamamlanan (Geçmiş)</option>
                <option value="CANCELLED">İptal Edilenler</option>
              </select>

              {/* Sıralama Seçici */}
              <select
                className="stitch-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sıralama ölçütü"
              >
                <option value="NEWEST">En Yeni Oluşturulan</option>
                <option value="DATE_ASC">Tarihe Göre (Yakından Uzağa)</option>
                <option value="DATE_DESC">Tarihe Göre (Uzaktan Yakına)</option>
                <option value="FILL_DESC">Doluluk Oranına Göre</option>
              </select>
            </div>

            {/* Aktif Filtre Bilgisi ve Temizle Butonu */}
            {(searchQuery ||
              selectedCategory !== "ALL" ||
              selectedCommunity !== "ALL" ||
              timeFilter !== "ALL") && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="font-body-sm text-outline">Filtrelenmiş Sonuçlar:</span>
                <span className="stitch-badge stitch-badge-testnet">
                  {discoveredEvents.length} Etkinlik Bulundu
                </span>
                <button
                  type="button"
                  className="stitch-btn-secondary"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("ALL");
                    setSelectedCommunity("ALL");
                    setTimeFilter("ALL");
                  }}
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                >
                  ✕ Filtreleri Sıfırla
                </button>
              </div>
            )}

            {/* ETKİNLİK KARTLARI IZGARASI */}
            {loadingEvents ? (
              <div className="stitch-card" style={{ padding: "4rem", textAlign: "center" }}>
                <span className="material-symbols-outlined pulse-glow" style={{ fontSize: "36px", color: "var(--stitch-primary)" }}>
                  sync
                </span>
                <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
                  Monad Testnet üzerinden etkinlik kayıtları okunuyor...
                </p>
              </div>
            ) : discoveredEvents.length === 0 ? (
              <div className="stitch-card" style={{ padding: "4rem", textAlign: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--stitch-outline)" }}>
                  event_busy
                </span>
                <h3 className="font-headline-sm" style={{ marginTop: "1rem", color: "var(--stitch-on-surface)" }}>
                  Aradığınız kriterlere uygun etkinlik bulunamadı
                </h3>
                <p className="font-body-sm text-on-surface-variant">
                  Farklı arama kelimeleri deneyebilir veya filtreleri sıfırlayabilirsiniz.
                </p>
              </div>
            ) : (
              <div className="stitch-events-grid events-grid">
                {discoveredEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    account={account}
                    onSelectEvent={onSelectEvent}
                    onQuickRegister={onRegisterEvent}
                    registeringId={txState.type === "register" ? txState.targetId : null}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
