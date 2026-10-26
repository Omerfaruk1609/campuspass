import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#030a1c",
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "540px",
              width: "100%",
              backgroundColor: "#0b152e",
              borderRadius: "16px",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              padding: "32px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                fontSize: "28px",
              }}
            >
              ⚠
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "8px" }}>
              Beklenmeyen Bir Hata Oluştu
            </h2>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#94a3b8",
                marginBottom: "20px",
                lineHeight: "1.5",
              }}
            >
              Uygulama çalışırken beklenmeyen bir hata meydana geldi. Sayfayı yenileyerek tekrar deneyebilirsiniz.
            </p>

            {this.state.error && (
              <pre
                style={{
                  backgroundColor: "#050c1e",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  color: "#f87171",
                  textAlign: "left",
                  overflowX: "auto",
                  marginBottom: "20px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  maxHeight: "120px",
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#6366f1",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Sayfayı Yenile
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Tekrar Dene
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
