import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import RouteLoadingFallback from "../components/RouteLoadingFallback";
import { useAppContext } from "../context/AppContext";
import { MONAD_CHAIN_ID, MONAD_EXPLORER_URL } from "../data/events";

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
    sessionState,
    handleLogout,
    handleDisconnectWallet,
    handleConnectWallet,
    handleSwitchNetwork,
    handleSiweLogin,
    unreadNotificationCount,
  } = useAppContext();

  return (
    <div className="app-shell">
      <ScrollToTop />

      <Navbar
        account={account}
        chainId={chainId}
        sessionState={sessionState}
        onLogout={handleLogout}
        onDisconnectWallet={handleDisconnectWallet}
        onConnectWallet={handleConnectWallet}
        onSwitchNetwork={handleSwitchNetwork}
        onSiweLogin={handleSiweLogin}
        isConnecting={isConnecting}
        unreadNotificationCount={unreadNotificationCount}
      />

      {/* Yanlış Ağ (Wrong Network) Uyarı Çubuğu */}
      {account && chainId && Number(chainId) !== MONAD_CHAIN_ID && (
        <div
          className="global-banner error"
          role="alert"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            borderLeft: "4px solid #ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div className="banner-content">
            <span>
              <strong>Yanlış Ağ Uyarısı:</strong> CampusPass, Monad Testnet (Chain ID:{" "}
              {MONAD_CHAIN_ID}) üzerinde çalışmaktadır. Bağlı olduğunuz ağ ID: {chainId}.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSwitchNetwork}
            style={{
              backgroundColor: "#ef4444",
              borderColor: "#ef4444",
              whiteSpace: "nowrap",
            }}
          >
            Monad Testnet Ağına Geç (10143)
          </button>
        </div>
      )}

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
        <Suspense fallback={<RouteLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
