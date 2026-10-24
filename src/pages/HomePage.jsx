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
        return account && ev.organizer.toLowerCase() === account.toLowerCase();
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

  // Organizatör istatistik özeti
  const organizerEvents = useMemo(
    () =>
      events.filter(
        (ev) => account && ev.organizer.toLowerCase() === account.toLowerCase()
      ),
    [events, account]
  );

  const organizerStats = useMemo(() => {
    const totalEvents = organizerEvents.length;
    const totalRegistrations = organizerEvents.reduce(
      (acc, ev) => acc + ev.registeredCount,
      0
    );
    const totalCapacity = organizerEvents.reduce(
      (acc, ev) => acc + ev.capacity,
      0
    );
    const totalVerified = organizerEvents.reduce(
      (acc, ev) => acc + (ev.verifiedAttendanceCount || 0),
      0
    );
    const avgFill =
      totalCapacity > 0 ? Math.round((totalRegistrations / totalCapacity) * 100) : 0;

    return {
      totalEvents,
      totalRegistrations,
      totalVerified,
      avgFill,
    };
  }, [organizerEvents]);

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

  return (
    <div className="page-container">
      {/* Tanıtım / Özet Alanı */}
      <section className="hero-banner">
        <div className="hero-content">
          <span className="eyebrow">Monad Testnet • Chain ID 10143</span>
          <h1>Kampüs Etkinliklerini Keşfedin, Kaydolun ve Blokzincirde Doğrulayın</h1>
          <p>
            Üniversite kulüplerinin düzenlediği etkinlikleri arayın, kontenjan ve son
            kayıt tarihlerini takip edin, cüzdan imzalı QR kodunuzla katılımınızı Monad
            blokzincirine kaydedin.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-box">
            <span className="stat-number">{events.length}</span>
            <span className="stat-label">Toplam Etkinlik</span>
          </div>
          <div className="stat-box">
            <span className="stat-number">
              {events.filter((e) => e.status === "upcoming" || e.status === "ongoing").length}
            </span>
            <span className="stat-label">Aktif / Yaklaşan</span>
          </div>
          <div className="stat-box">
            <span className="stat-number">
              {events.filter((e) => e.isRegistered).length}
            </span>
            <span className="stat-label">Kayıtlı Olduğunuz</span>
          </div>
          <div className="stat-box">
            <span className="stat-number">
              {events.filter((e) => e.isAttended).length}
            </span>
            <span className="stat-label">Katılım Doğrulanan</span>
          </div>
        </div>
      </section>

      {/* Organizatör Yönetim Özeti (Organizatör Sekmesinde Gösterilir) */}
      {activeTab === "organizer" && (
        <section className="card-panel organizer-dashboard-summary">
          <div className="panel-header">
            <div>
              <h2>Organizatör Yönetim Paneli</h2>
              <p className="panel-subtitle">
                Oluşturduğunuz etkinliklerin kayıt, doluluk ve doğrulanmış katılım
                istatistiklerini buradan takip edebilir; etkinlik detay sayfasından
                cüzdan imzanızla metadata düzenleme veya iptal işlemi yapabilirsiniz.
              </p>
            </div>
          </div>

          <div className="organizer-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-value">{organizerStats.totalEvents}</span>
              <span className="kpi-label">Düzenlediğiniz Etkinlik</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">{organizerStats.totalRegistrations}</span>
              <span className="kpi-label">Toplam Kayıtlı Öğrenci</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">{organizerStats.totalVerified}</span>
              <span className="kpi-label">Doğrulanmış Katılımcı</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-value">%{organizerStats.avgFill}</span>
              <span className="kpi-label">Ortalama Kontenjan Doluluğu</span>
            </div>
          </div>
        </section>
      )}

      {/* Gelişmiş Etkinlik Oluşturma Paneli */}
      {(activeTab === "organizer" || activeTab === "all") && (
        <section className="card-panel create-event-panel">
          <div className="panel-header-flex">
            <div>
              <h2>Yeni Etkinlik Oluştur</h2>
              <p className="panel-subtitle">
                Etkinlik başlığı ve kapasitesi Monad Testnet akıllı sözleşmesine yazılır;
                program, konum ve afiş bilgileri yalnızca blokzincir onayı tamamlandıktan
                sonra `(chainId, contractAddress, eventId)` anahtarıyla kaydedilir.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateForm((prev) => !prev)}
            >
              {showCreateForm ? "Formu Daralt ▲" : "+ Yeni Etkinlik Formunu Aç"}
            </button>
          </div>

          {(showCreateForm || activeTab === "organizer") && (
            <form className="advanced-event-form" onSubmit={handleCreateSubmit}>
              <div className="advanced-form-grid">
                <div className="form-field">
                  <label htmlFor="event-title">Etkinlik Başlığı *</label>
                  <input
                    id="event-title"
                    type="text"
                    placeholder="Örn: Monad & Solidity Akıllı Sözleşme Atölyesi"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-community">Düzenleyen Topluluk / Kulüp *</label>
                  <input
                    id="event-community"
                    type="text"
                    placeholder="Örn: Blockchain & Web3 Topluluğu"
                    value={community}
                    onChange={(e) => setCommunity(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-category">Kategori *</label>
                  <select
                    id="event-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={txState.busy}
                  >
                    {EVENT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="event-capacity">Kontenjan (Kapasite) *</label>
                  <input
                    id="event-capacity"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="50"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-date">Etkinlik Tarihi (TSİ) *</label>
                  <input
                    id="event-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-start-time">Başlangıç Saati (TSİ) *</label>
                  <input
                    id="event-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-end-time">Bitiş Saati (TSİ) *</label>
                  <input
                    id="event-end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-deadline">Kayıt Son Tarihi (TSİ) *</label>
                  <input
                    id="event-deadline"
                    type="datetime-local"
                    value={registrationDeadline}
                    onChange={(e) => setRegistrationDeadline(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-campus">Kampüs *</label>
                  <input
                    id="event-campus"
                    type="text"
                    placeholder="Örn: Merkez Kampüs"
                    value={campus}
                    onChange={(e) => setCampus(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-building">Bina / Fakülte *</label>
                  <input
                    id="event-building"
                    type="text"
                    placeholder="Örn: Mühendislik Fakültesi"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-room">Salon / Amfi *</label>
                  <input
                    id="event-room"
                    type="text"
                    placeholder="Örn: B-204 Konferans Salonu"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    disabled={txState.busy}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="event-poster-url">
                    Afiş Görsel URL (veya Dosya Yükle, Maks 500 KB)
                  </label>
                  <input
                    id="event-poster-url"
                    type="url"
                    placeholder="https://ornek.com/afis.png"
                    value={posterUrl.startsWith("data:") ? "" : posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                    disabled={txState.busy}
                  />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePosterFileChange}
                    disabled={txState.busy}
                    className="file-input-compact"
                  />
                </div>
              </div>

              <div className="form-field full-width">
                <label htmlFor="event-description">Etkinlik Açıklaması ve Program *</label>
                <textarea
                  id="event-description"
                  rows={3}
                  placeholder="Etkinlik içeriği, konuşmacılar, ön koşullar ve katılımcıların yanlarında getirmesi gerekenler..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={txState.busy}
                />
              </div>

              {posterUrl && (
                <div className="poster-preview-container">
                  <div className="poster-preview-header">
                    <span>Afiş Önizlemesi</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPosterUrl("")}
                    >
                      Afişi Kaldır
                    </button>
                  </div>
                  <img
                    src={posterUrl}
                    alt="Etkinlik afiş önizlemesi"
                    className="poster-preview-img"
                  />
                </div>
              )}

              {formError && <div className="inline-alert error">{formError}</div>}

              <div className="form-submit-row">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={txState.busy}
                >
                  {txState.type === "create"
                    ? "Cüzdan / Monad Testnet Onayı Bekleniyor..."
                    : "Etkinliği Blokzincirde Oluştur ve Yayınla"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Etkinlik Keşif, Arama ve Filtreleme Alanı */}
      <section className="events-section">
        <div className="section-toolbar">
          <div className="filter-pills">
            <button
              type="button"
              className={`pill-btn ${activeTab === "all" ? "active" : ""}`}
              onClick={() => onSelectTab("all")}
            >
              Tüm Etkinlikler ({events.length})
            </button>
            <button
              type="button"
              className={`pill-btn ${activeTab === "student" ? "active" : ""}`}
              onClick={() => onSelectTab("student")}
            >
              Kayıt Olduklarım ({events.filter((e) => e.isRegistered).length})
            </button>
            <button
              type="button"
              className={`pill-btn ${activeTab === "organizer" ? "active" : ""}`}
              onClick={() => onSelectTab("organizer")}
            >
              Düzenlediklerim ({organizerEvents.length})
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRefreshEvents}
            disabled={loadingEvents}
          >
            {loadingEvents ? "Yükleniyor..." : "↻ Zincirden Yenile"}
          </button>
        </div>

        {/* Keşif Filtre Çubuğu */}
        <div className="discovery-filter-bar">
          <div className="search-input-wrap">
            <input
              type="search"
              placeholder="Etkinlik adı, topluluk, açıklama veya salon ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
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

          <select
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

          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            aria-label="Etkinlik durumuna göre filtrele"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="UPCOMING">Yaklaşan &amp; Devam Eden</option>
            <option value="PAST">Tamamlanan (Geçmiş)</option>
            <option value="CANCELLED">İptal Edilenler</option>
          </select>

          <select
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

        {loadingEvents ? (
          <div className="empty-state">
            <p>Monad Testnet üzerinden etkinlik kayıtları okunuyor...</p>
          </div>
        ) : discoveredEvents.length === 0 ? (
          <div className="empty-state">
            <p>
              Seçili arama veya filtre kriterlerine uygun etkinlik bulunamadı.
            </p>
            {(searchQuery ||
              selectedCategory !== "ALL" ||
              selectedCommunity !== "ALL" ||
              timeFilter !== "ALL") && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: "0.75rem" }}
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("ALL");
                  setSelectedCommunity("ALL");
                  setTimeFilter("ALL");
                }}
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        ) : (
          <div className="events-grid">
            {discoveredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                account={account}
                onSelectEvent={onSelectEvent}
                onQuickRegister={onRegisterEvent}
                registeringId={
                  txState.type === "register" ? txState.targetId : null
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
