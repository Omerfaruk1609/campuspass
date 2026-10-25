import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import { useAppContext } from "../context/AppContext";
import { MONAD_EXPLORER_URL } from "../data/events";

export default function RootLayout() {
  const {
    account,
    chainId,
    isConnecting,
    backendStatus,
    pendingSyncItems,
    syncingPending,
    handleSyncPendingMetadataToApi,
    banner,
    setBanner,
    handleConnectWallet,
    handleSwitchNetwork,
  } = useAppContext();

  return (
    <div className="app-shell">
      <ScrollToTop />

      <Navbar
        account={account}
        chainId={chainId}
        onConnectWallet={handleConnectWallet}
        onSwitchNetwork={handleSwitchNetwork}
        isConnecting={isConnecting}
      />

      {/* Backend API Durumu ve Yerel Veri Kurtarma / Senkronizasyon Çubuğu */}
      {!backendStatus.checking && (!backendStatus.online || pendingSyncItems.length > 0) && (
        <div className="global-banner info" style={{ borderLeftColor: "#8b5cf6" }}>
          <div className="banner-content">
            {!backendStatus.online ? (
              <span>
                <strong>Çevrimdışı Yedek Mod:</strong> Backend API sunucusuna şu anda
                ulaşılamıyor. Blokzincir işlemleri (etkinlik oluşturma, kayıt, imzalı QR
                doğrulama, öğrenci profili) ve yerel önbellek kesintisiz çalışmaya devam
                eder.
              </span>
            ) : (
              <span>
                <strong>Bekleyen Metadata Senkronizasyonu ({pendingSyncItems.length} Etkinlik):</strong>{" "}
                Yerel tarayıcıda oluşturduğunuz etkinlik detaylarını tüm cihazlarda görünür
                kılmak için Backend API&apos;ye aktarabilirsiniz.
              </span>
            )}
          </div>
          {backendStatus.online && pendingSyncItems.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSyncPendingMetadataToApi}
              disabled={syncingPending}
            >
              {syncingPending
                ? "Senkronize Ediliyor..."
                : "↻ API'ye Senkronize Et (SIWE)"}
            </button>
          )}
        </div>
      )}

      {/* Global İşlem / Bildirim Banner'ı */}
      {banner && (
        <div className={`global-banner ${banner.type}`}>
          <div className="banner-content">
            <span>{banner.message}</span>
            {banner.txHash && (
              <a
                href={`${MONAD_EXPLORER_URL}/tx/${banner.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="banner-link"
              >
                İşlemi Explorer&apos;da Gör ↗
              </a>
            )}
          </div>
          <button
            type="button"
            className="banner-close"
            onClick={() => setBanner(null)}
            aria-label="Bildirimi kapat"
          >
            ✕
          </button>
        </div>
      )}

      <main className="main-content">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
