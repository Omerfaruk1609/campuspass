# CampusPass — Monad Testnet Blokzincir Tabanlı Üniversite Etkinlik, Topluluk ve Katılım Platformu

**CampusPass**, üniversite öğrenci topluluklarının ve etkinlik organizatörlerinin etkinlik oluşturma, cüzdan tabanlı kayıt (`registerForEvent`), dinamik EIP-191 imzalı QR katılım doğrulama (`markAttendance`), **SIWE (Sign-In with Ethereum / EIP-4361)** kimlik doğrulama, rol tabanlı topluluk yönetimi (RBAC), **Topluluk Operasyon Merkezi (Community Operations Hub)**, **Operasyonel Denetim İzi (Audit Visibility)**, **PostgreSQL + Prisma ORM** kalıcı veri katmanı, **Blockchain Event Indexer** ve **4 katmanlı doğrulanabilir dijital katılım sertifikaları** sunan tam yığın Web3 platformudur.

> **Güvenlik Beyanı (Zero-Secret Policy):** Bu depoda hiçbir özel anahtar (private key), gerçek oturum sırrı (`SESSION_SECRET`) veya üretim veritabanı kimlik bilgisi (`.env` / `server/.env`) **commit edilmemiştir**. Yalnızca şablon yapılandırma dosyaları (`.env.example` ve `server/.env.example`) sürüm kontrolünde tutulmaktadır.

---

## 1. Canlı Monad Testnet Dağıtım Bilgileri

| Parametre | Değer |
|---|---|
| **Ağ (Network)** | Monad Testnet |
| **Chain ID** | `10143` (`0x279f`) |
| **RPC Adresi** | `https://testnet-rpc.monad.xyz` |
| **Sözleşme Adı** | `CampusPass` ([`contracts/CampusPass.sol`](contracts/CampusPass.sol)) |
| **Sözleşme Adresi** | `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da` |
| **Dağıtım Tx Hash** | `0xaf95f25446a2f2777d8cf3897d859058a9baff5d55bd4234b515e4023c255ed4` |
| **Monad Explorer** | [0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da](https://testnet.monadexplorer.com/address/0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da) |

---

## 2. Başlıca Özellikler (Feature List)

1. **SIWE (EIP-4361) Kimlik Doğrulama & Cüzdan İzolasyonu:**
   - Tek kullanımlık atomik nonce, `HttpOnly; SameSite=Lax` oturum çerezi, `X-CSRF-Token` koruması ve sekmeler arası (`campuspass_auth_event`) anlık oturum senkronizasyonu.
   - Cüzdan değişiminde (`accountsChanged`) tüm önbellek ve oturum verilerinin sıfır sızıntı garantisiyle temizlenmesi.
2. **Topluluk Operasyon Merkezi & Rol Tabanlı Yetkilendirme (RBAC):**
   - `OWNER`, `ADMIN` ve `MEMBER` rolleri; tek kurucu (`sole OWNER`) ayrılma koruması.
   - Kulüp yöneticileri için `/communities/:slug/manage` altında **Operasyon Merkezi (`hub`)**: aktif üye, bekleyen başvuru, etkinlik ve duyuru KPI sayaçları ile gerçek zamanlı operasyonel aktivite akışı (`GET /api/communities/:idOrSlug/activity`).
   - Katılım başvurusu (`PENDING`), onay (`ACTIVE`), red (`REJECTED`) ve reddedilen adaylar için **"Yeniden Başvur"** iş akışı.
3. **Etkinlik Keşif, Planlama & Zincir Üstü Kayıt:**
   - Türkçe karakter duyarlı arama, kategori/topluluk/durum/kontenjan/tarih aralığı filtreleme, sıralama ve URL query (`?q=&category=&availability=&sort=`) senkronizasyonu.
   - Kişisel veri sızdırmayan RFC 5545 uyumlu `.ics` takvim dosyası indirme ve paylaşım bağlantısı.
   - Monad Testnet üzerinde `createEvent` ve `registerForEvent` işlemleri.
4. **Dinamik EIP-191 İmzalı QR Bilet & Yoklama Güvenliği:**
   - Öğrenciler yalnızca kendi imzalı QR biletlerini görüntüleyebilir; kendi yoklamalarını doğrulayamazlar (**self-scan engeli**).
   - 180 saniye TTL penceresi, tek kullanımlık nonce (**replay engeli**) ve etkinlik/ağ/sözleşme çapraz kullanım koruması.
5. **Organizatör Paneli, Analitik & Denetim İzi (Audit Visibility):**
   - Dönüşüm hunisi, doluluk oranları, zaman serisi grafikleri ve katılımcı durum filtreleri (`ALL`, `ATTENDED`, `REGISTERED_ONLY`, `CERTIFIED`, `NO_SHOW`, `MISSING_PROFILE_NAME`).
   - Başvuruyu kimin değerlendirdiği (`reviewedByWallet`, `reviewedAt`) ve yoklamayı kimin doğruladığı (`verifiedByWallet`) bilgilerinin arayüzde ve formula-injection korumalı CSV dışa aktarımında gösterilmesi (eski kayıtlarda uydurma veri yerine `"kayıt yok"`).
6. **4 Katmanlı Doğrulanabilir Dijital Katılım Sertifikaları (`CP-CERT-V1`):**
   - Doğrulanmış `AttendanceMarked` kanıtı zorunluluğu ve öğrencinin doğrulanmış profil tam adının (`StudentProfile.displayName`) sertifikaya değişmez (**snapshot immutability**) olarak mühürlenmesi.
   - Yatay A4 PDF/SVG indirme ve `/verify/:certificateId` üzerinden cüzdan gerektirmeyen 4 katmanlı doğrulama (Veritabanı Kaydı + Kriptografik Bütünlük Mühürü + İndekslenmiş Katılım Logu + Canlı Blokzincir Sözleşmesi).
7. **Gerçek Zamanlı Bildirim Merkezi & Tercihler:**
   - Server-Sent Events (`GET /api/notifications/stream`) ile canlı bildirim akışı, okunmamış sayaç rozeti, `dedupKey` ile mükerrer bildirim önleme ve `/settings` altında kategori bazlı bildirim tercihleri.

---

## 3. Mimari Özeti ve Proje Yapısı

Detaylı mimari diyagramlar ve güvenlik sınırları için [`ARCHITECTURE.md`](ARCHITECTURE.md) dosyasına bakınız.

```text
campuspass/
├── contracts/                  # CampusPass.sol akıllı sözleşmesi (Monad Testnet)
├── src/                        # React 19 + Vite 8.3 frontend uygulaması
│   ├── components/             # Navbar (duyarlı mobil çekmece dahil), EventCard, AnalyticsCharts
│   │   └── guards/             # ProtectedRoute, OrganizerGuard, CommunityManageGuard
│   ├── context/                # AppContext (Cüzdan, SIWE oturumu, SSE bildirimleri)
│   ├── layouts/                # RootLayout (Paylaşılan kabuk düzeni ve Suspense)
│   ├── pages/                  # HomePage, EventPage, CommunityDiscoveryPage, CommunityProfilePage,
│   │                           # CommunityManagePage, StudentProfile, AccountSettingsPage,
│   │                           # OrganizerDashboardPage, OrganizerEventAnalyticsPage,
│   │                           # CertificateVerificationPage, NotificationsPage, NotFoundPage
│   ├── routes/                 # AppRoutes (React Router v7 & React.lazy kod bölümleme)
│   └── utils/                  # apiClient, eventMetadata, qrVerification, certificatePdf, calendarIcs
├── server/                     # Node.js Backend API, Prisma ORM & Event Indexer
│   ├── prisma/
│   │   ├── schema.prisma       # 13 doğrulanmış PostgreSQL veri modeli
│   │   └── migrations/         # 6 SQL migrasyonu (Faz 19 operasyonel denetim dahil)
│   ├── src/
│   │   ├── app.js              # Bağımlılık enjeksiyonlu HTTP uygulama fabrikası
│   │   ├── index.js            # Sunucu giriş noktası
│   │   ├── routes/             # health, auth, events, students, certificates, organizer, communities, notifications
│   │   ├── controllers/        # İstek denetleyicileri
│   │   ├── services/           # auth, blockchain, certificate, community, event, organizerAnalytics, student, notification
│   │   ├── middleware/         # authMiddleware, security, rateLimiter, errorHandler
│   │   └── indexer/            # eventIndexer.js ve runIndexer.js
│   ├── tests/                  # Gerçek PostgreSQL entegrasyon testleri (9 adım)
│   └── .env.example            # Backend örnek ortam değişkenleri
├── test/                       # 263 Mocha/Chai + Hardhat regresyon ve kabul testi
├── ARCHITECTURE.md             # Sistem mimarisi ve güvenlik sınırları
├── DEMO_SCRIPT.md              # 3–5 dakikalık jüri sunum ve iki cüzdanlı demo rehberi
├── PHASE_20_FINAL_REPORT.md    # Faz 20 nihai kabul ve teslimat raporu
└── .env.example                # Frontend örnek ortam değişkenleri
```

---

## 4. Yerel Kurulum Talimatları (Local Setup)

### 4.1. Gereksinimler
- **Node.js** v20+ (veya v22/v24)
- **Docker Desktop** veya yerel **PostgreSQL 16+**
- **MetaMask** tarayıcı eklentisi (Monad Testnet yapılandırılmış)

### 4.2. Bağımlılıkların Kurulumu
```bash
# Kök dizin (Frontend & Hardhat) bağımlılıkları
npm install

# Backend & Prisma bağımlılıkları
cd server && npm install && cd ..
```

### 4.3. Ortam Değişkenlerinin Hazırlanması (`.env.example`)
Gerçek `.env` dosyaları güvenlik gereği depoda yer almaz. Şablon dosyaları kopyalayarak yerel yapılandırmanızı oluşturun:

```bash
# Kök dizin için:
cp .env.example .env

# Backend sunucusu için:
cp server/.env.example server/.env
```

`server/.env` içindeki temel değişkenler:
```env
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campuspass?schema=public"
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campuspass_test?schema=public"
REQUIRE_REAL_POSTGRES="false"
MONAD_CHAIN_ID=10143
MONAD_RPC_URL="https://testnet-rpc.monad.xyz"
CONTRACT_ADDRESS="0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da"
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
SIWE_DOMAIN="localhost:5173"
SIWE_URI="http://localhost:5173"
SESSION_SECRET="en-az-32-karakterlik-yerel-gelistirme-oturum-anahtari-2026"
```

### 4.4. PostgreSQL Başlatma ve Prisma Migrasyonları
```bash
# 1. Docker üzerinde PostgreSQL konteynerini başlatın (ilk kez çalıştırıyorsanız):
docker run --name campuspass-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=campuspass -p 5432:5432 -d postgres:16-alpine

# (Konteyner zaten mevcutsa yalnızca başlatın):
docker start campuspass-pg

# 2. Prisma şemasını doğrulayın (13 model):
npm run db:validate

# 3. Prisma Client üretin ve tüm migrasyonları (6 migrasyon) uygulayın:
npm run db:generate
npm run db:migrate
```

### 4.5. Servisleri Çalıştırma
```bash
# Terminal 1 — Backend API & Indexer (http://localhost:3001):
npm run start:server

# Terminal 2 — Frontend Vite Sunucusu (http://localhost:5173):
npm run dev
```
- **Uygulama Arayüzü:** `http://localhost:5173`
- **Backend Sağlık Kontrolü:** `GET http://localhost:3001/api/health`

---

## 5. Test ve Doğrulama Komutları

```bash
# 1. Tüm birim, entegrasyon ve regresyon test paketi (263 test)
npm test

# 2. Gerçek PostgreSQL entegrasyon test paketi (9 doğrulama adımı)
npm run test:postgres

# 3. Prisma şema doğrulaması (13 model)
npm run db:validate

# 4. Statik kod analizi (oxlint — 0 hata)
npm run lint

# 5. Üretim derlemesi (Vite production bundle)
npm run build
```
