import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="stitch-shell page-container" style={{ padding: "5rem 1rem", minHeight: "60vh" }}>
      {/* Ambient vector glow */}
      <div
        className="ambient-glow-primary"
        style={{ top: "10%", left: "20%", width: "450px", height: "450px" }}
      />
      <div
        className="ambient-glow-secondary"
        style={{ bottom: "10%", right: "20%", width: "400px", height: "400px" }}
      />

      <div className="stitch-container" style={{ position: "relative", zIndex: 1, maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
        <div
          className="stitch-card"
          style={{
            padding: "3.5rem 2rem",
            borderRadius: "1.5rem",
            background: "linear-gradient(135deg, rgba(17, 31, 59, 0.95) 0%, rgba(3, 18, 46, 0.95) 100%)",
            border: "1px solid rgba(142, 144, 161, 0.2)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              backgroundColor: "rgba(111, 136, 255, 0.15)",
              color: "var(--stitch-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "38px" }}>
              travel_explore
            </span>
          </div>

          <span className="font-label-mono" style={{ color: "var(--stitch-tertiary)", letterSpacing: "0.08em" }}>
            HATA 404
          </span>

          <h1 className="font-headline-lg" style={{ margin: 0, color: "var(--stitch-on-surface)" }}>
            Sayfa Bulunamadı
          </h1>

          <p className="font-body-md text-on-surface-variant" style={{ margin: 0, lineHeight: 1.6 }}>
            Aradığınız sayfa silinmiş, adı değiştirilmiş veya geçici olarak kullanım dışı kalmış olabilir.
            Aşağıdaki bağlantıları kullanarak güvenle gezintiye devam edebilirsiniz.
          </p>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginTop: "1rem",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              to="/"
              className="stitch-btn-primary"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 1.25rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                home
              </span>
              <span>Ana Sayfaya Dön</span>
            </Link>

            <Link
              to="/events"
              className="stitch-btn-secondary"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 1.25rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                explore
              </span>
              <span>Etkinlikleri Keşfet</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
