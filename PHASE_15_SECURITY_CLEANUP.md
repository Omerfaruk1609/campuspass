# Faz 15 — Güvenlik, Kimlik Bilgisi Hijyeni ve Yapılandırma Temizliği Raporu
(`PHASE_15_SECURITY_CLEANUP.md`)

**CampusPass Platformu**  
**Tarih:** 1 Kasım 2026  
**Dizin:** `campuspass/`  
**Kapsam:** Güvenlik hijyeni, Git takip listesi denetimi, ortam değişkenleri ayrımı, `.gitignore` katılaştırması ve geçmiş analizi.

---

## 1. Temizliğin Amacı ve Kapsamı (Purpose and Scope)

Bu güvenlik ve yapılandırma temizliğinin temel amaçları şunlardır:
1. **Kimlik ve Sır İzolasyonu:** Gerçek gizli anahtarların (`private key`), oturum sırlarının (`SESSION_SECRET`), veritabanı parolalarının ve yerel kimlik bilgilerinin Git deposuna girmesini kalıcı olarak engellemek.
2. **Değişken Ayrımı:** İstemci tarafı (Frontend / Vite) ortam değişkenleri ile sunucu tarafı (Backend / Node.js) ortam değişkenlerini kesin çizgilerle birbirinden ayırmak; istemciye sızabilecek değişkenlerin (`VITE_*`) backend örnek dosyalarında bulunmasını engellemek.
3. **.gitignore Katılaştırması:** Standart `.env` kurallarının ötesine geçerek `.env.local`, `.env.*.local`, sertifikalar (`*.pem`, `*.key`, `*.crt`, `*.pfx`), SSH anahtarları (`id_rsa*`, `id_ed25519*`) ve servis hesapları (`service-account*.json`) için kapsamlı kurallar tanımlamak.
4. **Git Geçmişi Denetimi:** Ulaşılabilir tüm Git commit geçmişini tarayarak herhangi bir gerçek özel anahtar veya üretim parolasının sızıp sızmadığını doğrulamak.

---

## 2. Temizlik Öncesinde Takip Edilen Dosyalar (Tracked Files Before Cleanup)

Temizlik öncesinde Git deposunda takip edilen (tracked) dosyaların tam listesi (114 dosya):

```text
.env.example
.gitignore
.oxlintrc.json
PHASE_13_AUDIT.md
PHASE_13_REPORT.md
PHASE_14_PERFORMANCE.md
PHASE_14_PREFLIGHT.md
PHASE_14_REPORT.md
PHASE_15_BLOCKCHAIN_WALLET_FIX.md
PHASE_15_REPORT.md
README.md
artifacts/artifacts.d.ts
artifacts/build-info/solc-0_8_34-fbc1099d9eaf974943e38126a37cd7c986da14e7.json
artifacts/build-info/solc-0_8_34-fbc1099d9eaf974943e38126a37cd7c986da14e7.output.json
artifacts/contracts/CampusPass.sol/CampusPass.json
artifacts/contracts/CampusPass.sol/artifacts.d.ts
cache/compile-cache.json
contracts/CampusPass.sol
hardhat.config.ts
index.html
package-lock.json
package.json
public/favicon.svg
public/icons.svg
scripts/check-balance.js
scripts/deploy.js
server/.env.example
server/package-lock.json
server/package.json
server/prisma/migrations/20261024000000_init/migration.sql
server/prisma/migrations/20261024120000_phase10_attendance_certificates/migration.sql
server/prisma/migrations/20261024220000_phase12_community_management/migration.sql
server/prisma/migrations/20261025170000_phase14_student_profile/migration.sql
server/prisma/migrations/20261025180000_phase15_notifications/migration.sql
server/prisma/migrations/migration_lock.toml
server/prisma/schema.prisma
server/src/app.js
server/src/controllers/authController.js
server/src/controllers/certificateController.js
server/src/controllers/communityController.js
server/src/controllers/eventController.js
server/src/controllers/healthController.js
server/src/controllers/notificationController.js
server/src/controllers/organizerAnalyticsController.js
server/src/controllers/studentController.js
server/src/index.js
server/src/indexer/eventIndexer.js
server/src/indexer/runIndexer.js
server/src/middleware/authMiddleware.js
server/src/middleware/errorHandler.js
server/src/middleware/rateLimiter.js
server/src/middleware/securityMiddleware.js
server/src/routes/authRoutes.js
server/src/routes/certificateRoutes.js
server/src/routes/communityRoutes.js
server/src/routes/eventRoutes.js
server/src/routes/healthRoutes.js
server/src/routes/notificationRoutes.js
server/src/routes/organizerAnalyticsRoutes.js
server/src/routes/studentRoutes.js
server/src/services/authService.js
server/src/services/blockchainService.js
server/src/services/certificateService.js
server/src/services/communityService.js
server/src/services/eventService.js
server/src/services/notificationService.js
server/src/services/organizerAnalyticsService.js
server/src/services/prismaClient.js
server/src/services/studentService.js
server/src/utils/env.js
server/src/utils/errors.js
server/src/utils/expressAdapter.js
server/src/utils/logger.js
server/src/utils/notifications.js
server/src/utils/prismaSchemaValidator.js
server/src/utils/validation.js
server/tests/postgres.integration.test.js
src/App.css
src/App.jsx
src/components/AnalyticsCharts.jsx
src/components/CertificateModal.jsx
src/components/CommunityCard.jsx
src/components/ErrorBoundary.jsx
src/components/EventCard.jsx
src/components/Footer.jsx
src/components/Navbar.jsx
src/components/RouteLoadingFallback.jsx
src/components/ScrollToTop.jsx
src/components/guards/CommunityManageGuard.jsx
src/components/guards/OrganizerGuard.jsx
src/components/guards/ProtectedRoute.jsx
src/context/AppContext.jsx
src/data/deployment.json
src/data/events.js
src/index.css
src/layouts/RootLayout.jsx
src/main.jsx
src/pages/AccountSettingsPage.jsx
src/pages/CertificateVerificationPage.jsx
src/pages/CommunityDiscoveryPage.jsx
src/pages/CommunityManagePage.jsx
src/pages/CommunityProfilePage.jsx
src/pages/EventPage.jsx
src/pages/HomePage.jsx
src/pages/NotFoundPage.jsx
src/pages/NotificationsPage.jsx
src/pages/OrganizerDashboardPage.jsx
src/pages/OrganizerEventAnalyticsPage.jsx
src/pages/StudentProfile.jsx
src/routes/AppRoutes.jsx
src/stitch.css
src/utils/apiClient.js
src/utils/certificatePdf.js
src/utils/eventMetadata.js
src/utils/notifications.js
src/utils/qrMatrix.js
src/utils/qrVerification.js
src/utils/studentProfile.js
test/BackendAndIndexer.js
test/CampusPass.js
test/CertificatesPhase10.js
test/CommunityManagementPhase12.js
test/EventManagement.js
test/OrganizerAnalyticsPhase11.js
test/Phase13Stabilization.js
test/Phase14PerformanceAndProfile.js
test/Phase15BlockchainAndWalletFix.js
test/Phase15CertificateRecipientPolish.js
test/Phase15ManualTestingFixes.js
test/Phase15Notifications.js
test/QrSecurity.js
test/ReactRouterPhase12_5.js
test/StudentProfile.js
tsconfig.json
types/ethers-contracts/CampusPass.ts
types/ethers-contracts/common.ts
types/ethers-contracts/factories/CampusPass__factory.ts
types/ethers-contracts/factories/index.ts
types/ethers-contracts/hardhat.d.ts
types/ethers-contracts/index.ts
vite.config.js
```

> **Önemli Not:** Gerçek ortam değişkeni içeren `.env` veya `server/.env` dosyaları temizlik öncesinde de Git tarafından **takip edilmemekteydi** (untracked).

---

## 3. Temizlik Sonrasında Takip Edilen Dosyalar (Tracked Files After Cleanup)

Temizlik sonrasında depoda takip edilen dosyaların tam listesi (115 dosya — `PHASE_15_SECURITY_CLEANUP.md` eklenmiştir):

```text
.env.example
.gitignore
.oxlintrc.json
PHASE_13_AUDIT.md
PHASE_13_REPORT.md
PHASE_14_PERFORMANCE.md
PHASE_14_PREFLIGHT.md
PHASE_14_REPORT.md
PHASE_15_BLOCKCHAIN_WALLET_FIX.md
PHASE_15_REPORT.md
PHASE_15_SECURITY_CLEANUP.md
README.md
artifacts/artifacts.d.ts
artifacts/build-info/solc-0_8_34-fbc1099d9eaf974943e38126a37cd7c986da14e7.json
artifacts/build-info/solc-0_8_34-fbc1099d9eaf974943e38126a37cd7c986da14e7.output.json
artifacts/contracts/CampusPass.sol/CampusPass.json
artifacts/contracts/CampusPass.sol/artifacts.d.ts
cache/compile-cache.json
contracts/CampusPass.sol
hardhat.config.ts
index.html
package-lock.json
package.json
public/favicon.svg
public/icons.svg
scripts/check-balance.js
scripts/deploy.js
server/.env.example
server/package-lock.json
server/package.json
server/prisma/migrations/20261024000000_init/migration.sql
server/prisma/migrations/20261024120000_phase10_attendance_certificates/migration.sql
server/prisma/migrations/20261024220000_phase12_community_management/migration.sql
server/prisma/migrations/20261025170000_phase14_student_profile/migration.sql
server/prisma/migrations/20261025180000_phase15_notifications/migration.sql
server/prisma/migrations/migration_lock.toml
server/prisma/schema.prisma
server/src/app.js
server/src/controllers/authController.js
server/src/controllers/certificateController.js
server/src/controllers/communityController.js
server/src/controllers/eventController.js
server/src/controllers/healthController.js
server/src/controllers/notificationController.js
server/src/controllers/organizerAnalyticsController.js
server/src/controllers/studentController.js
server/src/index.js
server/src/indexer/eventIndexer.js
server/src/indexer/runIndexer.js
server/src/middleware/authMiddleware.js
server/src/middleware/errorHandler.js
server/src/middleware/rateLimiter.js
server/src/middleware/securityMiddleware.js
server/src/routes/authRoutes.js
server/src/routes/certificateRoutes.js
server/src/routes/communityRoutes.js
server/src/routes/eventRoutes.js
server/src/routes/healthRoutes.js
server/src/routes/notificationRoutes.js
server/src/routes/organizerAnalyticsRoutes.js
server/src/routes/studentRoutes.js
server/src/services/authService.js
server/src/services/blockchainService.js
server/src/services/certificateService.js
server/src/services/communityService.js
server/src/services/eventService.js
server/src/services/notificationService.js
server/src/services/organizerAnalyticsService.js
server/src/services/prismaClient.js
server/src/services/studentService.js
server/src/utils/env.js
server/src/utils/errors.js
server/src/utils/expressAdapter.js
server/src/utils/logger.js
server/src/utils/notifications.js
server/src/utils/prismaSchemaValidator.js
server/src/utils/validation.js
server/tests/postgres.integration.test.js
src/App.css
src/App.jsx
src/components/AnalyticsCharts.jsx
src/components/CertificateModal.jsx
src/components/CommunityCard.jsx
src/components/ErrorBoundary.jsx
src/components/EventCard.jsx
src/components/Footer.jsx
src/components/Navbar.jsx
src/components/RouteLoadingFallback.jsx
src/components/ScrollToTop.jsx
src/components/guards/CommunityManageGuard.jsx
src/components/guards/OrganizerGuard.jsx
src/components/guards/ProtectedRoute.jsx
src/context/AppContext.jsx
src/data/deployment.json
src/data/events.js
src/index.css
src/layouts/RootLayout.jsx
src/main.jsx
src/pages/AccountSettingsPage.jsx
src/pages/CertificateVerificationPage.jsx
src/pages/CommunityDiscoveryPage.jsx
src/pages/CommunityManagePage.jsx
src/pages/CommunityProfilePage.jsx
src/pages/EventPage.jsx
src/pages/HomePage.jsx
src/pages/NotFoundPage.jsx
src/pages/NotificationsPage.jsx
src/pages/OrganizerDashboardPage.jsx
src/pages/OrganizerEventAnalyticsPage.jsx
src/pages/StudentProfile.jsx
src/routes/AppRoutes.jsx
src/stitch.css
src/utils/apiClient.js
src/utils/certificatePdf.js
src/utils/eventMetadata.js
src/utils/notifications.js
src/utils/qrMatrix.js
src/utils/qrVerification.js
src/utils/studentProfile.js
test/BackendAndIndexer.js
test/CampusPass.js
test/CertificatesPhase10.js
test/CommunityManagementPhase12.js
test/EventManagement.js
test/OrganizerAnalyticsPhase11.js
test/Phase13Stabilization.js
test/Phase14PerformanceAndProfile.js
test/Phase15BlockchainAndWalletFix.js
test/Phase15CertificateRecipientPolish.js
test/Phase15ManualTestingFixes.js
test/Phase15Notifications.js
test/QrSecurity.js
test/ReactRouterPhase12_5.js
test/StudentProfile.js
tsconfig.json
types/ethers-contracts/CampusPass.ts
types/ethers-contracts/common.ts
types/ethers-contracts/factories/CampusPass__factory.ts
types/ethers-contracts/factories/index.ts
types/ethers-contracts/hardhat.d.ts
types/ethers-contracts/index.ts
vite.config.js
```

---

## 4. Eklenen ve Katılaştırılan `.gitignore` Kuralları

`.gitignore` dosyası aşağıdaki kurallar eklenerek katılaştırılmıştır:

```gitignore
# Environment, Keystore & Secrets (Never commit private keys, passwords, or credentials)
.env
.env.*
.env.local
.env.*.local
!.env.example
server/.env
server/.env.*
server/.env.local
server/.env.*.local
!server/.env.example
*.pem
*.key
*.keystore
keystore/
secrets.json
credentials.json
service-account*.json
*.cert
*.crt
*.pfx
*.p12
id_rsa*
id_ed25519*
```

### Eklenen Kuralların Açıklaması:
* `.env.local` ve `.env.*.local`: Geliştiricilerin yerel Vite ortam değişkenlerini override etmek için kullandığı ve kazara commit edilebilecek yerel dosyaları engeller.
* `server/.env.local` ve `server/.env.*.local`: Backend tarafındaki yerel geçersiz kılma dosyalarını engeller.
* `credentials.json` & `service-account*.json`: Bulut veya OAuth kimlik sağlayıcılarının JSON anahtarlarını engeller.
* `*.cert`, `*.crt`, `*.pfx`, `*.p12`: SSL/TLS dijital sertifikalarını ve PKCS#12 anahtar depolarını engeller.
* `id_rsa*` & `id_ed25519*`: Yanlışlıkla proje klasörüne kopyalanabilecek kişisel SSH anahtarlarını engeller.

---

## 5. Güvenli Örnek Dosyalar (Safe Example Files)

İki adet güvenli şablon dosyası bulunmaktadır ve hassas veri içermez:

### 5.1. Kök Dizin Ön Yüz Şablonu (`.env.example`)
Yalnızca tarayıcıya açık olması amaçlanan `VITE_*` önekli değişkenleri barındırır:
```env
# CampusPass Frontend & Hardhat Ortam Değişkenleri Örneği
# Gerçek .env dosyasını asla Git'e eklemeyin!
# Monad Testnet özel anahtarı için .env yerine Hardhat Keystore önerilir:
# npx hardhat keystore set MONAD_PRIVATE_KEY

VITE_API_BASE_URL=http://localhost:3001/api
VITE_MONAD_CHAIN_ID=10143
VITE_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
VITE_CONTRACT_ADDRESS=0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da
```

### 5.2. Sunucu Şablonu (`server/.env.example`)
Temizlik kapsamında `server/.env.example` içerisindeki gereksiz `VITE_MONAD_RPC_URL` ve `VITE_CONTRACT_ADDRESS` satırları kaldırılarak tam ayrım sağlanmıştır:
```env
# CampusPass Backend & Blockchain Indexer Ortam Değişkenleri Örneği
# Bu dosyayı server/.env olarak kopyalayın ve kendi yerel PostgreSQL bilgilerinizle güncelleyin.
# Gerçek veritabanı parolalarını veya özel anahtarları asla Git'e eklemeyin!

NODE_ENV=development
PORT=3001

# PostgreSQL Bağlantı Adresi (Prisma ORM)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campuspass?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campuspass_test?schema=public"
REQUIRE_REAL_POSTGRES="false"

# Monad Testnet Blokzincir Ayarları (Salt-Okunur RPC — Private Key Gerekmez)
MONAD_CHAIN_ID=10143
MONAD_RPC_URL="https://testnet-rpc.monad.xyz"
CONTRACT_ADDRESS="0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da"

# Indexer Yapılandırması
INDEXER_START_BLOCK=0
INDEXER_BATCH_SIZE=100
INDEXER_POLL_INTERVAL_MS=15000
INDEXER_CONFIRMATIONS=2
INDEXER_REORG_LOOKBACK_BLOCKS=10
INDEXER_MAX_RETRIES=4
INDEXER_RETRY_BASE_DELAY_MS=1000

# Güvenlik, SIWE, Oturum ve CORS Yapılandırması
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
SIWE_DOMAIN="localhost:5173"
SIWE_URI="http://localhost:5173"
SESSION_SECRET="degistirin-en-az-32-karakterlik-kriptografik-gizli-anahtar-2026"
SESSION_TTL_SECONDS=86400
NONCE_TTL_SECONDS=300
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
AUTH_RATE_LIMIT_MAX_REQUESTS=30
```

---

## 6. Ön Yüz (Vite) ve Arka Yüz (Backend) Değişkenlerinin Ayrımı

| Kategori | Ön Yüz (Frontend / Vite) | Arka Yüz (Backend / Express & Node.js) |
|---|---|---|
| **Dosya Konumu** | Kök dizin `.env` (şablon: `.env.example`) | Sunucu dizini `server/.env` (şablon: `server/.env.example`) |
| **Erişim Mekanizması** | `import.meta.env.VITE_*` | `process.env.*` & `server/src/utils/env.js` |
| **Güvenlik Sınırı** | Tarayıcıda derlenir ve son kullanıcıya açıktır | Yalnızca sunucu belleğinde kalır, asla tarayıcıya iletilmez |
| **Değişkenler** | `VITE_API_BASE_URL`<br>`VITE_MONAD_CHAIN_ID`<br>`VITE_MONAD_RPC_URL`<br>`VITE_CONTRACT_ADDRESS` | `DATABASE_URL`, `TEST_DATABASE_URL`<br>`SESSION_SECRET`, `PORT`, `NODE_ENV`<br>`INDEXER_*`, `CORS_ALLOWED_ORIGINS`<br>`SIWE_DOMAIN`, `SIWE_URI` |
| **Yapılan İyileştirme** | Yalnızca `VITE_` önekli genel ayarlar tutulmaktadır | Yanlışlıkla eklenmiş `VITE_*` kopyaları kaldırılmıştır |

---

## 7. Git Geçmişinde Kimlik ve Sır Taraması Bulguları (Reachable Git History Findings)

Tüm commit geçmişi (`git log --all -p`) üzerinde regex ve string desenleriyle güvenlik taraması yapılmıştır:

1. **Özel Anahtarlar (`Private Keys`):**
   * Hiçbir `BEGIN PRIVATE KEY`, `BEGIN RSA PRIVATE KEY` veya 64-hex blokzincir cüzdan özel anahtarı commit geçmişinde **bulunmamıştır**.
   * `hardhat.config.ts`, `scripts/check-balance.js` ve `scripts/deploy.js` dosyalarında `configVariable("MONAD_PRIVATE_KEY")` (Hardhat Configuration Variable / Keystore) mekanizması kullanılmıştır.
2. **Akıllı Sözleşme Adresi & İşlem Özeti:**
   * `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da` (Canlı Monad Testnet CampusPass sözleşme adresi). Bu değer kamuya açık (public) dağıtım adresidir; gizli bilgi değildir.
   * `0xaf95f25446a2f2777d8cf3897d859058a9baff5d55bd4234b515e4023c255ed4` (Kamuya açık deployment işlem özeti / tx hash).
3. **Veritabanı URL'si:**
   * Geçmişte ve örnek dosyalarda yalnızca yerel Docker geliştirme konteynerine ait varsayılan kimlik bilgisi (`postgresql://postgres:postgres@localhost:5432/...`) yer almaktadır. Üretim veritabanı parolası bulunmamaktadır.
4. **Oturum Sırrı (`SESSION_SECRET`):**
   * Örnek dosyalarda yalnızca yer tutucu (`degistirin-en-az-32-karakterlik...`) bulunmaktadır.
   * `server/src/utils/env.js` içerisinde üretim ortamı muhafazası (`loadAndValidateEnv`) aktif olup, `NODE_ENV=production` durumunda varsayılan geliştirme sırrını reddetmektedir.

---

## 8. Değer Döndürme (Rotation) Gereklilik Analizi

* **Blokzincir Özel Anahtarları:** Git geçmişine herhangi bir gerçek özel anahtar (`private key`) eklenmediği için blokzincir hesabı döndürme (rotation) işlemi **gerekli değildir**.
* **Monad Testnet Akıllı Sözleşmesi:** Sözleşme adresi halka açık testnet sözleşmesidir; yeniden dağıtım veya anahtar iptali **gerekmemektedir**.
* **Yerel PostgreSQL Kimlikleri:** `postgres:postgres` bilgisi yalnızca yerel Docker geliştirme ortamı içindir. Canlı üretime (production) geçildiğinde güvenli, rastgele üretilmiş bir DB parolası atanmalıdır.
* **SESSION_SECRET:** Üretim dağıtımında bağımsız olarak en az 32 karakterlik rastgele bir sır (`openssl rand -hex 32`) atanmalıdır.

---

## 9. Git Geçmişi ve GitHub Uzak Deposu Uyarısı (Explicit Statement)

> [!WARNING]
> **ÖNEMLİ GÜVENLİK BEYANI (Explicit Statement):**
> Bir dosyanın veya gizli bilginin mevcut Git dalından (`current branch`) silinmesi ya da `.gitignore` dosyasına eklenmesi, o dosyanın **önceki Git geçmişinden ve GitHub üzerindeki geçmiş commit nesnelerinden silindiği anlamına GELMEZ.**
> 
> Eğer bir depoya gerçek bir özel anahtar (private key) veya üretim kimlik bilgisi kazara commit edilmiş olsaydı; yalnızca dosyayı silmek yeterli olmayacak, `git filter-repo` veya `BFG Repo-Cleaner` gibi araçlarla tüm commit geçmişinin yeniden yazılması ve uzak depoya zorla push (`git push --force`) yapılması gerekirdi.
> 
> CampusPass deposunda yapılan denetimde geçmiş commit'lerde gerçek bir özel anahtar veya üretim sırrına **rastlanmamıştır**.

---

## 10. Yürütülen Komutlar ve Sonuçları

| Komut | Amaç | Sonuç |
|---|---|---|
| `git ls-files \| Select-String "\.env"` | Takip edilen `.env` dosyalarını kontrol etme | Yalnızca `.env.example` ve `server/.env.example` takip ediliyor (Gerçek `.env` dosyaları temiz) |
| `git log --all --full-history -- ".env" "server/.env"` | Geçmişte `.env` commit'i yapılıp yapılmadığını sorgulama | Çıktı boş — Gerçek `.env` geçmişte de hiç commit edilmemiş |
| `git log -S "PRIVATE_KEY" --oneline` | Özel anahtar referanslarını inceleme | Yalnızca Hardhat Keystore `configVariable` referansları bulundu; açık anahtar yok |
| `git log -p \| Select-String "BEGIN (RSA\|EC)? PRIVATE KEY"` | PEM formatında anahtar bloklarını arama | Çıktı boş — Sıfır sızıntı |
| `node server/src/utils/prismaSchemaValidator.js` | Şema bütünlük doğrulaması | Başarılı (13 Model doğrulandı) |
| `npx hardhat test test/Phase15CertificateRecipientPolish.js --no-compile` | Yeni sertifika snapshot testleri | 8 passing (266ms) |
| `npm test` | Tam regresyon testi | 207 passing (7s) — Sıfır regresyon |
| `npm run lint` | Statik kod analizi (Oxlint) | 0 Hata |
| `npm run build` | Vite üretim derlemesi | 21 Çıktı hatasız oluşturuldu |

---

## 11. Temizlik Değişiklikleri Commit Özeti (Commit Hash)

* **İlgili Dal:** `feature/phase-15-notifications`
* **Yapılan Değişiklikler:**
  * `.gitignore` güvenlik kuralları genişletildi (`.env.local`, `*.cert`, `*.key`, `id_rsa*` vb.).
  * `server/.env.example` içerisindeki gereksiz `VITE_*` ön yüz değişkenleri temizlendi.
  * `PHASE_15_SECURITY_CLEANUP.md` raporu oluşturuldu.
* **Commit Hash:** `993f47e` (`docs(security): Phase 15 security and configuration hygiene cleanup`)

---

*Bu rapor, Faz 15 kapsamında gerçekleştirilen güvenlik ve konfigürasyon hijyeni çalışmalarını belgeler.*
