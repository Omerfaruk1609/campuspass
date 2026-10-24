import { shortenAddress } from "../data/events";
import { formatTurkeyDateOnly, formatTurkeyDateTime } from "../utils/eventMetadata";

export default function EventCard({
  event,
  account,
  onSelectEvent,
  onQuickRegister,
  registeringId,
}) {
  const isOrganizer =
    account && event.organizer.toLowerCase() === account.toLowerCase();
  const isFull = event.registeredCount >= event.capacity;
  const fillPercent =
    event.capacity > 0
      ? Math.min(100, Math.round((event.registeredCount / event.capacity) * 100))
      : 0;

  const statusClassMap = {
    upcoming: "active",
    ongoing: "ongoing",
    completed: "inactive",
    cancelled: "cancelled",
  };

  return (
    <article className={`event-card ${event.status === "cancelled" ? "is-cancelled" : ""}`}>
      {/* Afiş / Kapak Alanı */}
      <div
        className="event-poster-banner"
        onClick={() => onSelectEvent(event.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelectEvent(event.id)}
      >
        {event.posterUrl ? (
          <img
            src={event.posterUrl}
            alt={event.title}
            className="event-poster-img"
            loading="lazy"
          />
        ) : (
          <div className="event-poster-placeholder">
            <span className="poster-category-watermark">{event.category}</span>
            <span className="poster-community-tag">{event.community}</span>
          </div>
        )}

        <div className="poster-overlay-badges">
          <span className="category-pill">{event.category}</span>
          <span className={`status-badge ${statusClassMap[event.status] || "active"}`}>
            {event.statusLabel}
          </span>
        </div>
      </div>

      <div className="event-card-body">
        <div className="event-card-top">
          <span className="event-id-badge">Etkinlik #{event.id}</span>
          <div className="badge-group">
            {isOrganizer && (
              <span className="status-badge organizer">Organizatörsünüz</span>
            )}
            {event.isAttended ? (
              <span className="status-badge attended">Katılım Doğrulandı ✓</span>
            ) : event.isRegistered ? (
              <span className="status-badge registered">Kayıtlısınız</span>
            ) : null}
          </div>
        </div>

        <div className="event-community-line">{event.community}</div>
        <h3 className="event-title">{event.title}</h3>
        <p className="event-desc-preview">{event.description}</p>

        <div className="event-meta">
          <div className="meta-row">
            <span className="meta-label">📅 Tarih &amp; Saat (TSİ):</span>
            <span className="meta-value">
              {formatTurkeyDateOnly(event.date)} • {event.startTime} - {event.endTime}
            </span>
          </div>

          <div className="meta-row">
            <span className="meta-label">📍 Konum:</span>
            <span className="meta-value">
              {event.location?.campus} / {event.location?.building} ({event.location?.room})
            </span>
          </div>

          <div className="meta-row">
            <span className="meta-label">⏳ Son Kayıt:</span>
            <span className={`meta-value ${event.deadlinePassed ? "text-danger" : ""}`}>
              {formatTurkeyDateTime(event.registrationDeadline)}
              {event.deadlinePassed && " (Süre Doldu)"}
            </span>
          </div>

          <div className="meta-row">
            <span className="meta-label">👤 Organizatör:</span>
            <span className="meta-value monospace" title={event.organizer}>
              {shortenAddress(event.organizer)}
            </span>
          </div>

          <div className="meta-row">
            <span className="meta-label">👥 Kontenjan / Doluluk:</span>
            <span className="meta-value">
              <strong>{event.registeredCount}</strong> / {event.capacity} kişi ({fillPercent}%)
              {isFull && <span className="full-tag"> • Dolu</span>}
            </span>
          </div>

          <div className="progress-track" aria-label="Kontenjan doluluk oranı">
            <div
              className={`progress-fill ${isFull ? "full" : ""}`}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="event-card-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onSelectEvent(event.id)}
        >
          Detay &amp; İşlemler
        </button>

        {!event.isRegistered && event.canRegisterByTime && !isFull ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onQuickRegister(event.id)}
            disabled={registeringId === event.id}
          >
            {registeringId === event.id ? "Kaydediliyor..." : "Hemen Kayıt Ol"}
          </button>
        ) : !event.isRegistered && !event.canRegisterByTime ? (
          <button type="button" className="btn btn-secondary" disabled>
            {event.status === "cancelled"
              ? "İptal Edildi"
              : event.deadlinePassed
              ? "Kayıt Süresi Doldu"
              : "Kayıt Kapalı"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
