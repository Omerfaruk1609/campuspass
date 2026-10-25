# CampusPass — Monad Testnet Blokzincir Tabanlı Üniversite Etkinlik, Topluluk ve Katılım Platformu

**CampusPass**, üniversite öğrenci topluluklarının ve etkinlik organizatörlerinin etkinlik oluşturma, biletleme, cüzdan tabanlı kayıt (`registerForEvent`), dinamik EIP-191 imzalı QR katılım doğrulama (`markAttendance`), **SIWE (Sign-In with Ethereum / EIP-4361)** kimlik doğrulama, rol tabanlı topluluk yönetimi (RBAC), **PostgreSQL + Prisma ORM** kalıcı veri katmanı, **Blockchain Event Indexer**, **React Router DOM v7** ve **React 19 rota düzeyinde kod bölümleme (code-splitting)** mimarisine sahip tam yığın Web3 platformudur.

---

## 1. Canlı Monad Testnet Dağıtım Bilgileri

| Parametre | Değer |
|---|---|
| **Ağ (Network)** | Monad Testnet |
| **Chain ID** | `10143` (`0x279f`) |
| **RPC Adresi** | `https://testnet-rpc.monad.xyz` |
| **Sözleşme Adı** | `CampusPass` (`contracts/CampusPass.sol`) |
| **Sözleşme Adresi** | `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da` |
| **Dağıtım Tx Hash** | `0xaf95f25446a2f2777d8cf3897d859058a9baff5d55bd4234b515e4023c255ed4` |
| **Monad Explorer** | [0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da](https://testnet.monadexplorer.com/address/0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da) |

---

## 2. Teknoloji Yığını ve Mimari

* **Ön Yüz (Frontend):** React 19 + Vite 8.3 (ESM) + Google Stitch Cosmic Navy Tasarım Sistemi
* **Performans & Kod Bölümleme (Faz 14):** `React.lazy` ve dinamik `import()` ile ayrıştırılmış rota öbekleri, `vendor-ethers` ve `vendor-react` satıcı demetleri, erişilebilir `<Suspense>` yükleme katmanı (%90.9 ana JS küçülmesi)
* **Yönlendirme (Routing):** React Router DOM v7 (Bildirimsel Rota Ağacı, Route Guards, Deep Linking, 404 Sayfası)
* **Öğrenci Profili & Hesap Ayarları (Faz 14):** Kişisel isim, üniversite, bölüm, biyografi, avatar ve gizlilik (`isPublic`) tercihlerini yöneten `/settings` rotası ve SIWE korumalı REST API uç noktaları
* **Backend API:** Node.js + Express Uyumlu HTTP Katmanı + Zod Giriş Validasyonu
* **Veritabanı & ORM:** PostgreSQL 16 + Prisma ORM 6 (`server/prisma/schema.prisma` — 10 doğrulanmış veri modeli)
* **Kimlik Doğrulama:** EIP-4361 (SIWE) + Tek Kullanımlık Atomik Nonce + `HttpOnly; SameSite=Lax` Oturum Çerezi + `X-CSRF-Token` + Sekmeler Arası Eşitleme (`campuspass_auth_event`)
* **Blokzincir Entegrasyonu:** Ethers.js v6 + Salt-Okunur RPC ve İmzacı Sağlayıcı
* **Event Indexer:** Blokzincir olaylarını (`EventCreated`, `UserRegistered`, `AttendanceMarked`) aralıksız tarayan ve reorg korumalı checkpoint tablosunda saklayan indeksleyici servis
* **Dijital Katılım Sertifikaları (Faz 10):** `AttendanceMarked` kanıtlı, `CP-CERT-V1` SHA-256 + HMAC-SHA256 bütünlük mühürlü, yatay A4 PDF indirilebilir ve `/verify/:certificateId` üzerinden kamuya açık doğrulanabilir sertifika motoru
* **Organizatör Analitiği (Faz 11):** Dönüşüm hunisi, doluluk oranları, tekil erişim, zaman serisi grafikleri ve formula injection korumalı CSV ihracı
* **Üniversite Topluluk Yönetimi (Faz 12):** Kulüp profilleri, rol tabanlı yetkilendirme (`OWNER`, `ADMIN`, `MEMBER`), üyelik onay döngüsü, güvenli etkinlik-topluluk bağlama
* **Güvenlik ve Entegrasyon Stabilizasyonu (Faz 13):** Çoklu kiracılık korumalı etkinlik bağlantı yönetimi, isteğe bağlı oturum çözme (`optionalAuthSession`), cüzdan ayırma (disconnect) ile SIWE logout ayrımı, merkezi oturum menüsü

```text
campuspass/
├── contracts/                  # CampusPass.sol akıllı sözleşmesi
├── src/                        # React 19 + Vite frontend uygulaması
│   ├── components/             # Navbar, Footer, EventCard, CommunityCard, ScrollToTop, RouteLoadingFallback
│   │   └── guards/             # ProtectedRoute, OrganizerGuard, CommunityManageGuard
│   ├── context/                # AppContext (Merkezi durum, cüzdan, oturum ve işlemler)
│   ├── layouts/                # RootLayout (Paylaşılan kabuk düzeni, Suspense ve Outlet)
│   ├── pages/                  # HomePage, EventPage, CommunityDiscovery, CommunityProfile,
│   │                           # CommunityManage, StudentProfile, AccountSettingsPage, OrganizerDashboard,
│   │                           # OrganizerEventAnalytics, CertificateVerification, NotFound
│   ├── routes/                 # AppRoutes (Merkezi bildirimsel rota yapılandırması ve React.lazy)
│   ├── utils/                  # apiClient, eventMetadata, qrVerification, certificatePdf, studentProfile
│   └── data/                   # Monad Testnet ABI, sabitler ve deployment bilgisi
├── server/                     # Backend API, Prisma & Event Indexer
│   ├── prisma/
│   │   ├── schema.prisma       # 10 doğrulanmış PostgreSQL veri modeli (StudentProfile dahil)
│   │   └── migrations/         # SQL migration geçmişi (Faz 14 dahil)
│   ├── src/
│   │   ├── app.js              # Bağımlılık enjeksiyonlu API fabrika fonksiyonu
│   │   ├── index.js            # Sunucu giriş noktası
│   │   ├── routes/             # health, auth, events, students, certificates, organizer, communities
│   │   ├── controllers/        # İstek denetleyicileri
│   │   ├── services/           # authService, blockchainService, certificateService, communityService, eventService, studentService
│   │   ├── middleware/         # authMiddleware (require & optional), security, rateLimiter, errorHandler
│   │   └── indexer/            # eventIndexer.js ve runIndexer.js
│   ├── tests/                  # PostgreSQL entegrasyon testleri (7 test)
│   └── .env.example
├── test/                       # 134 Mocha/Chai regresyon testi
└── README.md
```

---

## 3. Ön Yüz Rota Haritası (Application Route Map)

Tüm rotalar `src/routes/AppRoutes.jsx` dosyasında bildirimsel olarak tanımlanmış olup `React.lazy()` ile talep üzerine asenkron yüklenir:

| URL Yolu | Sayfa Bileşeni | Erişim Muhafızı (Guard) | Açıklama |
|---|---|---|---|
| `/` | `HomePage` (`viewMode="landing"`) | Herkese Açık | Açılış sayfası, Bento Grid ve vitrin etkinlikleri |
| `/events` | `HomePage` (`viewMode="discovery"`) | Herkese Açık | Kapsamlı etkinlik keşif ve filtreleme arayüzü |
| `/events/:eventId` | `EventPage` | Herkese Açık | Parametrik etkinlik detay, kayıt ve imzalı QR bileti |
| `/communities` | `CommunityDiscoveryPage` | Herkese Açık | Üniversite topluluklarını keşfetme ve oluşturma |
| `/communities/:slug` | `CommunityProfilePage` | İsteğe Bağlı Oturum | Topluluk profili, üyelik butonları ve etkinlikleri |
| `/communities/:slug/manage` | `CommunityManagePage` | `CommunityManageGuard` (`OWNER`/`ADMIN`) | Topluluk yönetim paneli (Roller, başvurular, etkinlik bağlama) |
| `/profile` | `StudentProfile` | `ProtectedRoute` (Cüzdan Zorunlu) | Öğrenci profili, kayıtlı etkinlikler, rozetler ve geçmiş |
| `/profile/certificates` | `StudentProfile` | `ProtectedRoute` (Cüzdan Zorunlu) | Kazanılan blokzincir dijital katılım sertifikaları |
| `/settings` | `AccountSettingsPage` | `ProtectedRoute` (Cüzdan Zorunlu) | Öğrenci profili düzenleme, gizlilik ve SIWE oturum ayarları |
| `/organizer` | `OrganizerDashboardPage` | `OrganizerGuard` (Cüzdan Zorunlu) | Organizatör panosu, QR okutma ve katılım işaretleme |
| `/organizer/events/:eventId` | `OrganizerEventAnalyticsPage` | `OrganizerGuard` (Sahiplik Zorunlu) | Belirli bir etkinliğe ait katılım hunisi ve zaman serisi |
| `/verify` | `CertificateVerificationPage` | Herkese Açık | Sertifika doğrulama arama ekranı |
| `/verify/:certificateId` | `CertificateVerificationPage` | Herkese Açık | Doğrudan QR / derin bağlantı ile 4 katmanlı sertifika doğrulama |
| `*` | `NotFoundPage` | Herkese Açık | Tanımsız yollar için Stitch temalı 404 sayfası |

---

## 4. PostgreSQL Kurulumu ve Prisma Migration

### 4.1. Veritabanı Başlatma (Docker veya Yerel Kurulum)
```bash
# Docker Desktop ile PostgreSQL 16 başlatma:
docker run --name campuspass-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=campuspass -p 5432:5432 -d postgres:16-alpine

# Test veritabanını oluşturma:
docker exec -it campuspass-pg psql -U postgres -c "CREATE DATABASE campuspass_test;"
```

### 4.2. Ortam Değişkenleri (`server/.env`)
```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campuspass?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campuspass_test?schema=public"
MONAD_CHAIN_ID=10143
MONAD_RPC_URL="https://testnet-rpc.monad.xyz"
CONTRACT_ADDRESS="0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da"
SESSION_SECRET="kriptografik-en-az-32-karakter-uzunlugunda-guvenli-oturum-anahtari"
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
SIWE_DOMAIN="localhost:5173"
SIWE_URI="http://localhost:5173"
```

### 4.3. Prisma Paketleri, Doğrulama ve Migration
```bash
# Backend bağımlılıklarını kurun
cd server && npm install && cd ..

# Prisma şemasını ve modelleri (10 model) doğrula
npm run db:validate

# Prisma Client üret ve veritabanı tablolarını senkronize et
npm run db:generate
npm run db:migrate
```

---

## 5. Yerel Geliştirme Akışı

### 1. Backend API Sunucusunu Başlatma
```bash
npm run dev:server
```
API `http://localhost:3001` adresinde ayağa kalkar. Sağlık kontrolü: `GET http://localhost:3001/api/health`.

### 2. Blockchain Event Indexer'ı Başlatma
```bash
# Sürekli dinleme modu
npm run dev:indexer

# Tek seferlik blok tarama ve checkpoint güncelleme
node server/src/indexer/runIndexer.js --once
```

### 3. Frontend Uygulamasını Başlatma
```bash
npm run dev
```
Uygulamayı tarayıcınızda `http://localhost:5173` adresinden açabilirsiniz.

---

## 6. Kimlik Doğrulama (SIWE) ve Hesap Ayarları

1. **Nonce Talebi:** Ön yüz, `GET /api/auth/nonce?walletAddress=0x...` çağrısı yaparak 128-bit kriptografik rastgele tek kullanımlık bir nonce edinir.
2. **Mesaj İmzası:** EIP-4361 standart metni derlenir ve kullanıcının cüzdanına (MetaMask vb.) kişisel imza (`personal_sign` / EIP-191) için sunulur. Özel anahtar istemciden asla ayrılmaz.
3. **Doğrulama ve Oturum Açma:** `POST /api/auth/verify` mesajı ve imzayı doğrular, nonce'u atomik tüketir (`NONCE_REPLAY_DETECTED` koruması), veritabanında oturum kaydı oluşturur, `HttpOnly; SameSite=Lax` güvenlikli çerez ve durum değiştiren işlemler için `csrfToken` döndürür.
4. **Öğrenci Profili ve Tercihler (`/settings`):** Kullanıcı display name, üniversite, bölüm, biyografi, avatar URL ve genel gizlilik (`isPublic`) ayarlarını `PATCH /api/students/profile` üzerinden güvenle güncelleyebilir.
5. **Cüzdan Ayırma vs. SIWE Logout:**
   - **Cüzdanı Ayır (Disconnect):** Yalnızca tarayıcıdaki cüzdan bağlantı durumunu sıfırlar.
   - **SIWE Oturumunu Kapat (Logout):** Sunucuda `POST /api/auth/logout` çağrılır, veritabanında `revokedAt` işaretlenir, HttpOnly çerez temizlenir ve `campuspass_auth_event` üzerinden açık olan tüm sekmelerde oturum kapatma anında senkronize edilir.

---

## 7. Test ve Doğrulama Komutları

```bash
# Tüm Mocha ve Solidity testlerini çalıştır (134 test)
npm test

# Gerçek PostgreSQL entegrasyon testlerini çalıştır (7 test)
npm run test:postgres

# Prisma veri şeması bütünlük kontrolü (10 model)
npm run db:validate

# Oxlint statik kod analizi (0 hata)
npm run lint

# Üretim derlemesi (Vite build - kod bölümleme doğrulaması)
npm run build
```

---

## 8. Üretim Dağıtım (Production Deployment) Gereksinimleri

> **Önemli:** Uygulama henüz üretime dağıtılmamıştır. Canlıya alma aşamasında aşağıdaki gereksinimler uygulanmalıdır:

1. **TLS / HTTPS:** Üretim ortamında tüm trafik HTTPS üzerinden sunulmalıdır. `NODE_ENV=production` aktif olduğunda oturum çerezi otomatik olarak `Secure: true` bayrağı kazanır.
2. **SPA URL Rewrite (Fallback):** React Router alt rotalarının (`/events/1`, `/communities/slug`, `/settings`, `/verify/CERT-1`) doğrudan sayfa yenilemelerinde veya derin bağlantılarda 404 vermemesi için web sunucusunda `index.html` fallback kuralı tanımlanmalıdır:
   - **Nginx:** `location / { try_files $uri $uri/ /index.html; }`
   - **Vercel / Netlify:** Rewrite kuralı `/* -> /index.html 200`
3. **CORS Allowlist:** `CORS_ALLOWED_ORIGINS` ortam değişkeni yalnızca uygulamanın resmi alan adı ile sınırlandırılmalıdır.
4. **PostgreSQL İzolasyonu:** Veritabanı yalnızca API sunucusunun erişebileceği özel ağda (VPC) barındırılmalı, SSL (`sslmode=require`) ile bağlanılmalıdır.
5. **Indexer Daemon:** `runIndexer.js` süreci Systemd, PM2 veya bir Docker konteyneri içinde sürekli çalışan bir arka plan servisi olarak yapılandırılmalıdır.

---

## 9. Sorun Giderme (Troubleshooting)

* **MetaMask Yanlış Ağ Uyarısı:** Sağ üstteki "Ağı Değiştir (10143)" butonuna tıklayarak cüzdanınızın Monad Testnet'e geçmesini sağlayın. Otomatik eklenemezse Chain ID: `10143`, RPC: `https://testnet-rpc.monad.xyz`, Sembol: `MON` bilgilerini manuel girin.
* **Topluluk Yönetim Paneline Girişte 403 Hatası:** Yalnızca topluluğun `OWNER` veya `ADMIN` rolüne sahip üyeleri `/communities/:slug/manage` rotasına erişebilir. Topluluk profilinden rolünüzü kontrol edin.
* **PostgreSQL "EACCES / Connection Refused" Hatası:** PostgreSQL servisinin çalıştığından ve `server/.env` içindeki `DATABASE_URL` port/şifre bilgilerinin doğru olduğundan emin olun. Docker container'ını kontrol etmek için `docker ps` komutunu kullanın.
* **Windows Git EPERM / Lock Hatası:** Windows ortamında terminal kilitlenmelerini önlemek için komutların yönetici izinleriyle veya ilgili klasör kilitleri temizlenerek çalıştırılması önerilir.
