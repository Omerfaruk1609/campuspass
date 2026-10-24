# CampusPass — Blokzincir Tabanlı Etkinlik Kayıt, Katılım Doğrulama ve İndeksleme Platformu

**CampusPass**, üniversite topluluklarının düzenlediği etkinlikler için **Monad Testnet** üzerinde çalışan, cüzdan tabanlı kayıt (`registerForEvent`), kriptografik imzalı QR katılım doğrulama (`markAttendance`), **SIWE (EIP-4361)** organizatör yetkilendirmesi, **PostgreSQL + Prisma ORM** kalıcı veri katmanı ve **Blockchain Event Indexer** mimarisine sahip çok kullanıcılı bir Web3 platformudur.

---

## 1. Canlı Monad Testnet Dağıtım Bilgileri

| Bilgi | Değer |
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

* **Frontend:** React 19 + Vite 8 (ESM)
* **Backend API:** Node.js + Express Uyumlu HTTP Katmanı + Zod Doğrulaması
* **Veritabanı & ORM:** PostgreSQL + Prisma ORM (`server/prisma/schema.prisma`)
* **Kimlik Doğrulama:** SIWE (Sign-In with Ethereum / EIP-4361) + Tek Kullanımlık Atomik Nonce + `HttpOnly; SameSite=Lax` Oturum Çerezi + `X-CSRF-Token`
* **Blokzincir Etkileşimi & Indexer:** Ethers.js v6 (Salt-okunur RPC provider ile `EventCreated`, `UserRegistered`, `AttendanceMarked` indeksleme ve reorg koruması)
* **Dijital Katılım Sertifikaları (Faz 10):** `AttendanceMarked` doğrulamalı, `CP-CERT-V1` SHA-256 + HMAC bütünlük mühürlü, yatay A4 PDF indirilebilir ve cüzdan bağlantısı gerektirmeden `/verify/:certificateId` üzerinden doğrulanabilir sertifika sistemi
* **Organizatör Yönetim Paneli & Analitik (Faz 11):** Üniversite topluluklarının etkinliklerini, dönüşüm ve katılım oranlarını, tekil öğrenci erişimlerini yönetebildiği KPI kartları, trend grafikleri, sayfalanmış katılımcı tablosu, formula injection korumalı CSV dışa aktarımı ve anlık indexer senkronizasyon göstergesi
* **Üniversite Topluluk Yönetim Sistemi (Faz 12):** Üniversite kulüp ve topluluklarının oluşturulması, profilleri, rol tabanlı yetkilendirme (OWNER, ADMIN, MEMBER), üyelik başvuru ve onay döngüsü, tek kurucu ayrılma koruması, güvenli etkinlik-topluluk ilişkilendirmesi (anti-hijacking) ve topluluk analitiği
* **Akıllı Sözleşme & Test:** Solidity `0.8.34` + Hardhat 3 + Mocha/Chai (103 kapsamlı Mocha testi + 6 gerçek PostgreSQL entegrasyon testi)

```text
campuspass/
├── contracts/                  # CampusPass.sol akıllı sözleşmesi
├── src/                        # React 19 + Vite frontend uygulaması
│   ├── components/             # Navbar, EventCard
│   ├── pages/                  # HomePage, EventPage, StudentProfile
│   ├── utils/                  # apiClient, eventMetadata, qrVerification, qrMatrix, studentProfile
│   └── data/                   # Monad Testnet ABI ve dağıtım adresleri
├── server/                     # Faz 9 Backend API, Prisma & Event Indexer
│   ├── prisma/
│   │   ├── schema.prisma       # PostgreSQL veri modeli
│   │   └── migrations/         # PostgreSQL SQL migration dosyaları
│   ├── src/
│   │   ├── app.js              # API uygulama fabrikası ve middleware zinciri
│   │   ├── index.js            # Sunucu giriş noktası
│   │   ├── routes/             # health, auth, events, students rotaları
│   │   ├── controllers/        # İstek/yanıt denetleyicileri
│   │   ├── services/           # prismaClient, blockchainService, authService, eventService, studentService
│   │   ├── middleware/         # CORS, CSRF, SIWE oturum, Rate Limiter, Error Handler
│   │   ├── indexer/            # Monad Testnet Event Indexer (eventIndexer.js, runIndexer.js)
│   │   └── utils/              # Zod şemaları, ortam doğrulama, hassas log maskeleme
│   ├── tests/                  # Gerçek PostgreSQL bağlantı ve entegrasyon testi
│   ├── .env.example            # Backend örnek ortam değişkenleri
│   └── package.json
├── test/                       # 61 Mocha testi (Sözleşme, QR, Metadata, Profil, Backend & Indexer)
├── .env.example                # Frontend örnek ortam değişkenleri
└── README.md
```

---

## 3. PostgreSQL Kurulumu ve Prisma Migration

### 3.1. PostgreSQL Veritabanı Başlatma (Docker veya Yerel Kurulum)
**Seçenek A — Docker ile Hızlı Başlatma (Önerilen):**
```bash
# Docker Desktop açıkken geliştirme ve test veritabanı konteynerini başlatın:
docker run --name campuspass-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=campuspass -p 5432:5432 -d postgres:16-alpine

# Testler için ayrı bir veritabanı oluşturun (mevcut verileri korur):
docker exec -it campuspass-pg psql -U postgres -c "CREATE DATABASE campuspass_test;"
```

**Seçenek B — Yerel PostgreSQL 15+ Servisi:**
```sql
CREATE DATABASE campuspass;
CREATE DATABASE campuspass_test;
```

### 3.2. Ortam Değişkenlerini Yapılandırma
Örnek ortam dosyalarını kopyalayın (gerçek `.env` dosyaları `.gitignore` ile korunur ve Git'e eklenmez):
```bash
cp .env.example .env
cp server/.env.example server/.env
```

`server/.env` içindeki temel değişkenler:
* `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/campuspass?schema=public`
* `TEST_DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/campuspass_test?schema=public`
* `MONAD_CHAIN_ID`: `10143`
* `MONAD_RPC_URL`: `https://testnet-rpc.monad.xyz`
* `CONTRACT_ADDRESS`: `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`
* `SESSION_SECRET`: En az 32 karakterlik kriptografik gizli anahtar
* `CORS_ALLOWED_ORIGINS`: `http://localhost:5173,http://127.0.0.1:5173`

> **Güvenlik Notu:** Veritabanı bağlantı bilgileri (`DATABASE_URL`) ve oturum sırları yalnızca `server/.env` içinde bulunur; frontend paketine (`VITE_*`) asla eklenmez. `NODE_ENV=production` ortamında sahte/in-memory veritabanı geri dönüşü (`fallback`) ve varsayılan `SESSION_SECRET` kullanımı kesin olarak engellenmiştir.

### 3.3. Prisma Paket Kurulumu, Şema Doğrulama ve Migration
```bash
# Backend Prisma bağımlılıklarını yükleyin
cd server && npm install && cd ..

# Prisma şema yapısını, benzersiz indeksleri ve SQL migration dosyalarını doğrula
npm run db:validate

# Prisma Client üret ve PostgreSQL tablolarını oluştur (PostgreSQL çalışırken)
npm run db:generate
npm run db:migrate
```

---

## 4. Yerel Geliştirme Akışı (Başlatma Komutları)

### 1. Backend API Sunucusunu Başlatma
```bash
npm run dev:server
```
Sunucu varsayılan olarak `http://localhost:3001` adresinde çalışır (`GET http://localhost:3001/api/health`).

### 2. Blockchain Event Indexer'ı Başlatma
```bash
# Sürekli dinleme modunda başlatma
npm run dev:indexer

# Tek seferlik senkronizasyon turu çalıştırma
node server/src/indexer/runIndexer.js --once
```

### 3. Frontend Uygulamasını Başlatma
```bash
npm run dev
```
Tarayıcıda `http://localhost:5173` adresini açın.

### Backend Çevrimdışı Olduğunda (Yedek Mod) Davranışı
Backend sunucusu kapalıyken uygulama çökmez ve veri kaybı yaşanmaz:
* **Çalışmaya Devam Eden Özellikler:** Monad Testnet üzerinden etkinlik listeleme, yeni etkinlik oluşturma (`createEvent`), etkinliğe kaydolma (`registerForEvent`), imzalı QR üretme ve 5 aşamalı doğrulama (`markAttendance`), öğrenci profili zincir üstü sorgulama ve yerel `localStorage` metadata önbelleği.
* **Kurtarma ve Senkronizasyon:** Zincir üstü etkinlik oluşturulduğunda Backend API kapalıysa metadata yerel kuyrukta saklanır; API tekrar açıldığında üst bildirim çubuğundaki **"↻ API'ye Senkronize Et (SIWE)"** butonuyla tek tıkla sunucuya aktarılır.

---

## 5. REST API Endpoint Özeti

### Herkese Açık Endpoint'ler
* `GET /api/health` — Servis, veritabanı, sözleşme ve indexer son blok (`lastProcessedBlock`) durumu.
* `GET /api/events` — Sayfalama (`page`, `limit`), filtreleme (`search`, `category`, `community`, `status`, `organizer`) ve sıralama (`sortBy`: `NEWEST`, `DATE_ASC`, `DATE_DESC`, `FILL_DESC`) destekli etkinlik listesi.
* `GET /api/events/:eventId` — Zincir üstü etkinlik + PostgreSQL metadata + indekslenmiş katılım sayısı.
* `GET /api/events/:eventId/metadata` — Etkinliğe ait zincir dışı metadata kaydı.
* `GET /api/students/:walletAddress/events` — Öğrencinin kayıtlı olduğu etkinlikler ve istatistikleri *(yalnızca herkese açık blokzincir verilerini döndürür)*.
* `GET /api/students/:walletAddress/attendance` — Öğrencinin doğrulanmış katılımları ve gerçek `txHash` içeren zaman çizelgesi *(yalnızca herkese açık blokzincir verilerini döndürür)*.

### Kimlik Doğrulama (SIWE / EIP-4361) Endpoint'leri
* `GET /api/auth/nonce` — Tek kullanımlık kriptografik giriş nonce'u üretir.
* `POST /api/auth/verify` — SIWE mesajını ve imzayı doğrular, nonce'u atomik tüketir, `HttpOnly` oturum çerezi ve `csrfToken` üretir.
* `GET /api/auth/session` — Aktif oturum durumunu döndürür.
* `POST /api/auth/logout` — Oturumu sonlandırır ve çerezi temizler.

### Organizatör Yetkisi Gerektiren Endpoint'ler (`HttpOnly Cookie` + `X-CSRF-Token` + Canlı Zincir Üstü `organizer` Kontrolü)
* `POST /api/events/:eventId/metadata` — İlk metadata kaydı oluşturma veya yerel veriyi taşıma.
* `PATCH /api/events/:eventId/metadata` — Mevcut etkinlik metadata'sını güncelleme.
* `POST /api/events/:eventId/cancel` — Etkinliği organizatör yetkisiyle iptal etme.
* `POST /api/events/:eventId/reactivate` — İptal edilmiş etkinliği yeniden aktifleştirme.

### Dijital Katılım Sertifikası (Faz 10) Endpoint'leri
* `POST /api/certificates` — Giriş yapmış (SIWE + CSRF) ve blokzincir üzerinde katılımı (`AttendanceMarked`) doğrulanmış öğrenci için idempotent dijital katılım sertifikası oluşturur (`201 Created` veya mükerrer istekte `200 OK`).
* `GET /api/certificates/me` — Giriş yapmış öğrencinin kendi sertifikalarını listeler.
* `GET /api/certificates/wallet/:walletAddress` — Öğrencinin herkese açık sertifikalarını (`displayName` hariç) listeler.
* `GET /api/certificates/:certificateId` — Sertifika detaylarını (`displayName` hariç) döndürür (Cüzdan bağlantısı gerektirmez).
* `GET /api/certificates/:certificateId/verify` — Sertifikayı 4 katmanda (PostgreSQL kaydı, `CP-CERT-V1` kriptografik bütünlük mührü, `IndexedAttendance` log kanıtı ve canlı Monad Testnet `CampusPass.sol` sözleşmesi) doğrular (`VERIFIED`, `NOT_FOUND`, `INVALID`, `UNVERIFIABLE_NOW`).

### Organizatör Yönetim Paneli ve Analitik (Faz 11) Endpoint'leri
* `GET /api/organizer/dashboard` — Giriş yapmış organizatörün (SIWE oturumu zorunlu) toplu KPI metriklerini, genel katılım oranını, tekil katılımcı sayısını ve etkinlik listesini döner.
* `GET /api/organizer/events` — Organizatörün düzenlediği etkinliklerin güncel durum ve katılım özetlerini listeler.
* `GET /api/organizer/events/:eventId/analytics` — Belirli bir etkinliğe ait detaylı dönüşüm oranlarını (doluluk, katılım, sertifika dönüşümü, vazgeçme/drop-off) döner (Canlı blokzincir organizatör kontrolü ile korunur).
* `GET /api/organizer/events/:eventId/participants` — Etkinliğe kayıtlı öğrencilerin sayfalanmış ve filtrelenebilir (`ALL`, `ATTENDED`, `REGISTERED_ONLY`, `CERTIFIED`, `search`) durum tablosunu döner.
* `GET /api/organizer/events/:eventId/export` — Etkinlik katılımcı listesini veya etkinlik özetini CSV formatında indirir. Spreadsheet Formula Injection saldırılarına karşı güvenli kaçış mekanizması içerir (`=`, `+`, `-`, `@` ön ekleri güvenli formatlanır).
* `GET /api/organizer/timeseries` — Organizatörün etkinlikleri arasındaki kayıt ve katılım sayılarını karşılaştırmalı zaman serisi grafiği için döner.

### Üniversite Topluluk Yönetim Sistemi (Faz 12) Endpoint'leri
* `GET /api/communities` — Aktif toplulukları sayfalanmış, kategori ve arama filtreleriyle listeler (Herkese açık).
* `GET /api/communities/:idOrSlug` — Topluluk detay profili, üye sayısı, etkinlik sayısı ve çağıran cüzdanın rolünü döner (Herkese açık).
* `GET /api/communities/:idOrSlug/events` — Toplulukla ilişkilendirilmiş güncel ve geçmiş etkinlikleri listeler (Herkese açık).
* `GET /api/communities/me` — Oturum açmış öğrencinin üye olduğu ve başvuru yaptığı toplulukları döner (SIWE oturumu zorunlu).
* `POST /api/communities` — Yeni üniversite topluluğu oluşturur; oluşturan cüzdan otomatik `OWNER` atanır (SIWE oturumu zorunlu).
* `POST /api/communities/:idOrSlug/join` — Topluluğa katılım başvurusu yapar (`PENDING` durumu, SIWE oturumu zorunlu).
* `POST /api/communities/:idOrSlug/leave` — Topluluktan ayrılır; topluluğun tek kurucusu/sahibi (`OWNER`) topluluğu sahipsiz bırakarak ayrılamaz.
* `PATCH /api/communities/:idOrSlug` — Topluluk bilgilerini günceller (`OWNER` veya `ADMIN` yetkisi gerektirir).
* `GET /api/communities/:idOrSlug/members` — Topluluk üyelerini listeler (`OWNER` veya `ADMIN` yetkisi gerektirir).
* `GET /api/communities/:idOrSlug/applications` — Onay bekleyen üyelik başvurularını listeler (`OWNER` veya `ADMIN` yetkisi gerektirir).
* `POST /api/communities/:idOrSlug/applications/:memberId/approve` — Üyelik başvurusunu onaylar (`ACTIVE` yapar).
* `POST /api/communities/:idOrSlug/applications/:memberId/reject` — Üyelik başvurusunu reddeder (`REJECTED` yapar).
* `PATCH /api/communities/:idOrSlug/members/:memberId/role` — Üyenin rolünü değiştirir (`OWNER` yetkisi gerektirir; `ADMIN` veya `MEMBER` atanabilir).
* `DELETE /api/communities/:idOrSlug/members/:memberId` — Üyeyi topluluktan çıkarır (`ADMIN`, `OWNER`'ı veya başka bir `ADMIN`'i çıkaramaz).
* `POST /api/communities/:idOrSlug/events/link` — Etkinliği toplulukla ilişkilendirir (Anti-Hijacking: Çağıran kişi topluluk yöneticisi ve etkinliğin zincir üstü organizatörü olmalıdır).
* `DELETE /api/communities/:idOrSlug/events/unlink` — Etkinlik ile topluluk arasındaki ilişkiyi kaldırır.
* `GET /api/communities/:idOrSlug/analytics` — Topluluğun etkinlik katılım, doluluk ve üye performans analitiğini döner (`OWNER` veya `ADMIN` yetkisi gerektirir).

---

## 6. Test ve Doğrulama Komutları

```bash
# Tüm Mocha testlerini çalıştır (92 mevcut + 11 Faz 12 Topluluk Yönetim testi = 103 test)
npm test

# Yalnızca Faz 12 Topluluk Yönetim Sistemi testlerini çalıştır
npx hardhat test test/CommunityManagementPhase12.js

# Yalnızca Faz 9 Backend, SIWE ve Indexer testlerini çalıştır
npm run test:backend

# Prisma şema doğrulaması
npm run db:validate
npm --prefix server run db:validate

# Gerçek PostgreSQL bağlantı ve entegrasyon kontrolü (Mock testlerden ayrı, 6 entegrasyon testi)
npm run test:postgres

# Gerçek PostgreSQL bağlantı ve entegrasyon kontrolü (Mock testlerden ayrı)
npm run test:postgres

# Kod kalitesi (Oxlint) ve üretim derlemesi (Vite build)
npm run lint
npm run build
```

---

## 7. Üretim Ortamı (Production) Güvenlik Gereksinimleri

1. **HTTPS Zorunluluğu:** API internete açıldığında TLS/HTTPS (Reverse Proxy: Nginx / Cloudflare) zorunlu olmalıdır. `NODE_ENV=production` olduğunda oturum çerezlerine `Secure` bayrağı otomatik eklenir.
2. **CORS ve CSRF:** `CORS_ALLOWED_ORIGINS` yalnızca gerçek üretim alan adına ayarlanmalı, durum değiştiren tüm isteklerde `X-CSRF-Token` doğrulaması korunmalıdır.
3. **Veritabanı Güvenliği:** PostgreSQL bağlantısı özel ağda (VPC) tutulmalı, en az yetki ilkesine sahip bir veritabanı kullanıcısı ve SSL (`?sslmode=require`) kullanılmalıdır.
4. **Blokzincir Doğruluk Kaynağı:** İndekslenmiş veritabanı kayıtları ile blokzincir arasında gecikme veya çelişki oluştuğunda her zaman canlı Monad Testnet sözleşmesi (`0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`) temel doğruluk kaynağı olarak kabul edilir.
