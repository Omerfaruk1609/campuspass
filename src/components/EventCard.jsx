import { shortenAddress } from "../data/events";
import { formatTurkeyDateOnly } from "../utils/eventMetadata";

export default function EventCard({
  event,
  account,
  onSelectEvent,
  onQuickRegister,
  registeringId,
}) {
  const isOrganizer =
    account && event.organizer && event.organizer.toLowerCase() === account.toLowerCase();
  const isFull = event.registeredCount >= event.capacity;
  const fillPercent =
    event.capacity > 0
      ? Math.min(100, Math.round((event.registeredCount / event.capacity) * 100))
      : 0;

  const statusClassMap = {
    upcoming: "stitch-badge-open",
    ongoing: "stitch-badge-verified",
    completed: "stitch-badge-completed",
    cancelled: "stitch-badge-full",
  };

  const communityInitial =
    event.community && event.community.length > 0
      ? event.community.charAt(0).toUpperCase()
      : "C";

  return (
    <article
      className={`event-card stitch-card ${event.status === "cancelled" ? "is-cancelled" : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Afiş / Kapak Alanı — 16:9 Oranında Stitch Görsel Alanı */}
      <div
        className="event-poster-banner"
        onClick={() => onSelectEvent(event.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelectEvent(event.id)}
        style={{
          position: "relative",
          width: "100%",
          paddingTop: "52%",
          cursor: "pointer",
          overflow: "hidden",
          backgroundColor: "var(--stitch-surface-container-lowest)",
        }}
      >
        {event.posterUrl ? (
          <img
            src={event.posterUrl}
            alt={event.title}
            className="event-poster-img"
            loading="lazy"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.3s ease",
            }}
          />
        ) : (
          <div
            className="event-poster-placeholder"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              background:
                "radial-gradient(circle at 70% 30%, rgba(111, 136, 255, 0.25), transparent 70%), linear-gradient(135deg, #07193f 0%, #03122e 100%)",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "40px", color: "var(--stitch-primary)", opacity: 0.7 }}
            >
              school
            </span>
            <span
              className="poster-category-watermark font-label-badge"
              style={{ color: "var(--stitch-on-surface-variant)", marginTop: "0.25rem", opacity: 0.8 }}
            >
              {event.category}
            </span>
          </div>
        )}

        {/* Gradient Karartma Katmanı */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(3, 18, 46, 0.95) 0%, rgba(3, 18, 46, 0.4) 60%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Üst Rozetler */}
        <div
          className="poster-overlay-badges"
          style={{
            position: "absolute",
            top: "0.75rem",
            left: "0.75rem",
            right: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 2,
          }}
        >
          <span
            className="category-pill stitch-badge stitch-badge-testnet"
            style={{
              backdropFilter: "blur(8px)",
              backgroundColor: "rgba(12, 27, 54, 0.8)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
              loyalty
            </span>
            {event.category}
          </span>

          <span
            className={`status-badge stitch-badge ${statusClassMap[event.status] || "stitch-badge-open"}`}
            style={{ backdropFilter: "blur(8px)" }}
          >
            {event.statusLabel}
          </span>
        </div>

        {/* Alt Bilgi Rozeti (Tarih) */}
        <div
          style={{
            position: "absolute",
            bottom: "0.75rem",
            left: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            zIndex: 2,
          }}
        >
          <span
            className="stitch-badge"
            style={{
              backgroundColor: "rgba(3, 18, 46, 0.85)",
              color: "var(--stitch-on-surface)",
              border: "1px solid rgba(142, 144, 161, 0.25)",
              backdropFilter: "blur(6px)",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "12px", color: "var(--stitch-tertiary)" }}
            >
              calendar_month
            </span>
            {formatTurkeyDateOnly(event.date)}
          </span>
        </div>
      </div>

      {/* Kart Gövdesi */}
      <div
        className="event-card-body"
        style={{
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: "0.75rem",
        }}
      >
        {/* Üst Satır: Topluluk & ID */}
        <div
          className="event-card-top"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-secondary-container))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: "0.6875rem",
                fontWeight: 700,
              }}
            >
              {communityInitial}
            </div>
            <span
              className="event-community-line font-label-badge"
              style={{ color: "var(--stitch-on-surface-variant)" }}
            >
              {event.community}
            </span>
          </div>

          <div className="badge-group" style={{ display: "flex", gap: "0.35rem" }}>
            <span
              className="event-id-badge font-label-mono text-outline"
              style={{ fontSize: "0.6875rem" }}
            >
              #{event.id}
            </span>
            {isOrganizer && (
              <span className="status-badge organizer stitch-badge stitch-badge-verified">
                Organizatör
              </span>
            )}
            {event.isAttended ? (
              <span className="status-badge attended stitch-badge stitch-badge-completed">
                Katıldınız ✓
              </span>
            ) : event.isRegistered ? (
              <span className="status-badge registered stitch-badge stitch-badge-open">
                Kayıtlısınız
              </span>
            ) : null}
          </div>
        </div>

        {/* Başlık */}
        <h3
          className="event-title font-headline-sm"
          onClick={() => onSelectEvent(event.id)}
          style={{
            cursor: "pointer",
            color: "var(--stitch-on-surface)",
            margin: 0,
            lineHeight: 1.35,
          }}
        >
          {event.title}
        </h3>

        {/* Kısa Açıklama */}
        <p
          className="event-desc-preview font-body-sm text-on-surface-variant"
          style={{
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {event.description}
        </p>

        {/* Meta Bilgileri */}
        <div
          className="event-meta"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
            fontSize: "0.8125rem",
            color: "var(--stitch-on-surface-variant)",
            marginTop: "auto",
          }}
        >
          <div className="meta-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "15px", color: "var(--stitch-tertiary)" }}
            >
              schedule
            </span>
            <span className="meta-value">
              {event.startTime} - {event.endTime} (TSİ)
            </span>
          </div>

          <div className="meta-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "15px", color: "var(--stitch-primary)" }}
            >
              location_on
            </span>
            <span className="meta-value" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {event.location?.campus} / {event.location?.building} ({event.location?.room})
            </span>
          </div>

          <div className="meta-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "15px", color: "var(--stitch-outline)" }}
            >
              person
            </span>
            <span className="meta-value font-label-mono monospace" title={event.organizer}>
              {shortenAddress(event.organizer)}
            </span>
          </div>

          {/* Kontenjan ve Doluluk */}
          <div style={{ marginTop: "0.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.35rem",
                fontSize: "0.75rem",
              }}
            >
              <span>
                Kontenjan: <strong>{event.registeredCount}</strong> / {event.capacity}
              </span>
              <span style={{ color: isFull ? "var(--stitch-error)" : "var(--stitch-tertiary)" }}>
                %{fillPercent} {isFull ? "• Dolu" : ""}
              </span>
            </div>
            <div className="stitch-progress-track">
              <div
                className="stitch-progress-fill"
                style={{
                  width: `${fillPercent}%`,
                  backgroundColor: isFull ? "var(--stitch-error)" : undefined,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Aksiyon Butonları */}
      <div
        className="event-card-actions"
        style={{
          padding: "0 1rem 1rem 1rem",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <button
          type="button"
          className="stitch-btn-secondary"
          onClick={() => onSelectEvent(event.id)}
          style={{ flex: 1, padding: "0.5rem", fontSize: "0.875rem" }}
        >
          Detay &amp; İşlemler
        </button>

        {!event.isRegistered && event.canRegisterByTime && !isFull ? (
          <button
            type="button"
            className="stitch-btn-primary"
            onClick={() => onQuickRegister(event.id)}
            disabled={registeringId === event.id}
            style={{ flex: 1, padding: "0.5rem", fontSize: "0.875rem" }}
          >
            {registeringId === event.id ? "Kaydediliyor..." : "Hemen Kayıt Ol"}
          </button>
        ) : !event.isRegistered && !event.canRegisterByTime ? (
          <button
            type="button"
            className="stitch-btn-secondary"
            disabled
            style={{ flex: 1, padding: "0.5rem", fontSize: "0.875rem", opacity: 0.6 }}
          >
            {event.status === "cancelled"
              ? "İptal Edildi"
              : event.deadlinePassed
              ? "Kayıt Doldu"
              : "Kayıt Kapalı"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
