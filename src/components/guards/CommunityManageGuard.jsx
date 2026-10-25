import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { fetchCommunityProfileFromBackend } from "../../utils/apiClient";

export default function CommunityManageGuard({ children }) {
  const { account, sessionState, isConnecting, handleConnectWallet } = useAppContext();
  const { slug } = useParams();

  const [community, setCommunity] = useState(null);
  const [checkingRole, setCheckingRole] = useState(() => Boolean(account && slug));
  const [checkError, setCheckError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function verifyMembershipRole() {
      if (!account || !slug) {
        if (isMounted) {
          setCommunity(null);
          setCheckingRole(false);
        }
        return;
      }

      setCheckingRole(true);
      setCheckError(null);
      try {
        const comm = await fetchCommunityProfileFromBackend(slug);
        if (isMounted) {
          setCommunity(comm);
        }
      } catch (err) {
        if (isMounted) {
          setCheckError(err?.message || "Topluluk verisi alınamadı.");
        }
      } finally {
        if (isMounted) {
          setCheckingRole(false);
        }
      }
    }

    verifyMembershipRole();
    return () => {
      isMounted = false;
    };
  }, [account, slug]);

  // Oturum durumu veya yetki sorgulanıyor
  if (sessionState.loading || checkingRole) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "5rem 1rem", textAlign: "center" }}>
        <div className="stitch-container">
          <span
            className="material-symbols-outlined pulse-glow"
            style={{ fontSize: "40px", color: "var(--stitch-primary)" }}
          >
            sync
          </span>
          <p className="font-body-md text-on-surface-variant" style={{ marginTop: "1rem" }}>
            Topluluk yönetim yetkisi kontrol ediliyor...
          </p>
        </div>
      </div>
    );
  }

  // Cüzdan bağlı değil
  if (!account) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container">
          <section
            className="stitch-card"
            style={{
              padding: "4rem 2rem",
              textAlign: "center",
              borderRadius: "1.5rem",
              background:
                "linear-gradient(135deg, rgba(17, 31, 59, 0.95) 0%, rgba(3, 18, 46, 0.95) 100%)",
              border: "1px solid rgba(142, 144, 161, 0.2)",
              maxWidth: "600px",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(111, 136, 255, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-primary)",
                marginBottom: "1.5rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "32px" }}>
                admin_panel_settings
              </span>
            </div>
            <h2 className="font-headline-lg" style={{ margin: "0 0 0.5rem 0", color: "var(--stitch-on-surface)" }}>
              Yönetici Girişi Gerekli
            </h2>
            <p
              className="font-body-md text-on-surface-variant"
              style={{ maxWidth: "480px", margin: "0 auto 2rem auto", lineHeight: 1.6 }}
            >
              Bu topluluğu yönetmek için lütfen topluluk yetkilisi olan Web3 cüzdanınızı bağlayın.
            </p>
            <button
              type="button"
              className="stitch-btn-primary"
              onClick={handleConnectWallet}
              disabled={isConnecting}
              style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
                account_balance_wallet
              </span>
              <span>{isConnecting ? "Cüzdan Bağlanıyor..." : "Cüzdanı Bağla"}</span>
            </button>
          </section>
        </div>
      </div>
    );
  }

  // Topluluk bulunamadı veya hata
  if (checkError || !community) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div
            className="stitch-card"
            style={{
              padding: "3.5rem 2rem",
              textAlign: "center",
              borderRadius: "1.5rem",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <h2 className="font-headline-lg" style={{ color: "var(--stitch-error)", margin: "0 0 0.5rem 0" }}>
              Topluluk Bulunamadı
            </h2>
            <p className="font-body-md text-on-surface-variant" style={{ marginBottom: "2rem" }}>
              {checkError || "Belirtilen topluluk kaydı bulunamadı."}
            </p>
            <Link to="/communities" className="stitch-btn-secondary" style={{ textDecoration: "none" }}>
              ← Topluluklar Listesine Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Rol kontrolü: OWNER veya ADMIN olmalı
  const userRole = community.currentUserMembership?.role;
  const isAuthorized = userRole === "OWNER" || userRole === "ADMIN";

  if (!isAuthorized) {
    return (
      <div className="stitch-shell page-container" style={{ padding: "4rem 1rem" }}>
        <div className="stitch-container" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div
            className="stitch-card"
            style={{
              padding: "3.5rem 2rem",
              textAlign: "center",
              borderRadius: "1.5rem",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--stitch-error)",
                marginBottom: "1.5rem",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "32px" }}>
                lock
              </span>
            </div>
            <h2 className="font-headline-lg" style={{ color: "var(--stitch-error)", margin: "0 0 0.5rem 0" }}>
              Yetkisiz Erişim (403 Forbidden)
            </h2>
            <p className="font-body-md text-on-surface-variant" style={{ marginBottom: "2rem", lineHeight: 1.6 }}>
              Bu topluluğu yönetmek için <strong>OWNER</strong> veya <strong>ADMIN</strong> yetkisine sahip olmalısınız.
              {userRole ? ` Mevcut rolünüz: ${userRole}.` : " Bu topluluğun üyesi değilsiniz."}
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link to={`/communities/${slug}`} className="stitch-btn-primary" style={{ textDecoration: "none" }}>
                Topluluk Sayfasına Git
              </Link>
              <Link to="/communities" className="stitch-btn-secondary" style={{ textDecoration: "none" }}>
                ← Tüm Topluluklar
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
