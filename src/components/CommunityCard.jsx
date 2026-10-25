import { Link } from "react-router-dom";

export default function CommunityCard({ community, onSelectCommunity }) {
  const logoInitial = community.name ? community.name.charAt(0).toUpperCase() : "T";
  const slugOrId = community.slug || community.id;

  const handleSelect = () => {
    if (onSelectCommunity) {
      onSelectCommunity(slugOrId);
    }
  };

  return (
    <article
      className="stitch-card"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: "1rem",
      }}
    >
      {/* Kapak / Banner Alanı */}
      <Link
        to={`/communities/${slugOrId}`}
        onClick={handleSelect}
        style={{
          height: "110px",
          width: "100%",
          position: "relative",
          display: "block",
          textDecoration: "none",
          background: community.coverImageUrl
            ? `url(${community.coverImageUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, rgba(111, 136, 255, 0.3) 0%, rgba(208, 188, 255, 0.2) 50%, rgba(3, 18, 46, 0.95) 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(3, 18, 46, 0.95) 0%, rgba(3, 18, 46, 0.2) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            zIndex: 2,
          }}
        >
          <span className="stitch-badge stitch-badge-testnet" style={{ fontSize: "0.6875rem" }}>
            {community.category || "Genel"}
          </span>
        </div>
      </Link>

      {/* Gövde */}
      <div
        style={{
          padding: "0 1.25rem 1.25rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          marginTop: "-28px",
          position: "relative",
          zIndex: 3,
        }}
      >
        {/* Logo / Avatar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "0.75rem" }}>
          {community.logoUrl ? (
            <img
              src={community.logoUrl}
              alt={community.name}
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                objectFit: "cover",
                border: "2px solid var(--stitch-surface-container-high)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                backgroundColor: "var(--stitch-surface-container)",
              }}
            />
          ) : (
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, var(--stitch-primary-container), var(--stitch-secondary-container))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#ffffff",
                border: "2px solid var(--stitch-surface-container-high)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {logoInitial}
            </div>
          )}

          <span
            className="font-label-badge"
            style={{
              color: "var(--stitch-on-surface-variant)",
              fontSize: "0.6875rem",
              backgroundColor: "rgba(142, 144, 161, 0.15)",
              padding: "0.2rem 0.5rem",
              borderRadius: "4px",
            }}
          >
            {community.universityName || "Monad Üniversitesi"}
          </span>
        </div>

        {/* Başlık */}
        <Link
          to={`/communities/${slugOrId}`}
          onClick={handleSelect}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <h3
            className="font-headline-sm"
            style={{
              margin: "0 0 0.35rem 0",
              cursor: "pointer",
              color: "var(--stitch-on-surface)",
              lineHeight: 1.3,
            }}
          >
            {community.name}
          </h3>
        </Link>

        {/* Kısa Açıklama */}
        <p
          className="font-body-sm text-on-surface-variant"
          style={{
            margin: "0 0 1rem 0",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.5,
          }}
        >
          {community.shortDescription || community.description || "Üniversite topluluğu etkinlikleri ve üye ağı."}
        </p>

        {/* Metrikler (Üye ve Etkinlik Sayısı) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "auto",
            paddingTop: "0.75rem",
            borderTop: "1px solid rgba(142, 144, 161, 0.15)",
            fontSize: "0.75rem",
            color: "var(--stitch-on-surface-variant)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--stitch-primary)" }}>
              group
            </span>
            <span>
              <strong>{community.membersCount ?? 0}</strong> Üye
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--stitch-tertiary)" }}>
              event
            </span>
            <span>
              <strong>{community.eventsCount ?? 0}</strong> Etkinlik
            </span>
          </div>
        </div>

        {/* Aksiyon */}
        <div style={{ marginTop: "0.75rem" }}>
          <Link
            to={`/communities/${slugOrId}`}
            className="stitch-btn-secondary"
            onClick={handleSelect}
            style={{
              width: "100%",
              padding: "0.5rem",
              fontSize: "0.8125rem",
              textDecoration: "none",
              display: "block",
              textAlign: "center",
            }}
          >
            Topluluk Sayfasını Gör →
          </Link>
        </div>
      </div>
    </article>
  );
}
