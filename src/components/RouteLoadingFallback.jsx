export default function RouteLoadingFallback({ message = "Sayfa Yükleniyor..." }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "50vh",
        padding: "3rem 1rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "44px",
          height: "44px",
          border: "3px solid rgba(124, 58, 237, 0.2)",
          borderTopColor: "var(--primary, #7c3aed)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          marginBottom: "1rem",
        }}
      />
      <p style={{ color: "var(--text-muted, #94a3b8)", fontSize: "0.95rem", fontWeight: 500 }}>
        {message}
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
