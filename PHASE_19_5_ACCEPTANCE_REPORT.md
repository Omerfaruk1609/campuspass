# CampusPass — Phase 19.5: Consolidated Acceptance & Regression Testing Report

**Tarih:** 7 Kasım 2026  
**Aktif Dal (Branch):** `feature/phase-19-community-operations`  
**Önceki Commit:** `a628bcf`  
**Hedef Kapsam:** Faz 15 – Faz 19 Birleştirilmiş Kabul, Regresyon ve Gerçek PostgreSQL Doğrulaması

---

## 1. Ortam, Veritabanı ve Migrasyon Durumu

### 1.1. Git ve Güvenlik Durumu
- **Aktif Dal:** `feature/phase-19-community-operations`
- **Uzak Git İşlemleri:** Hiçbir uzak komut (`git push`, `pull`, `fetch`, `merge`, `rebase`, `deploy`) çalıştırılmamıştır.
- **İzlenen `.env` Dosyaları Kontrolü (`git ls-files | Select-String "\.env"`):**
  ```text
  .env.example
  server/.env.example
  ```
  Gerçek `.env` veya `server/.env` dosyaları Git tarafından **takip edilmemektedir** (gizli anahtar ve oturum sırları güvendedir).

### 1.2. PostgreSQL ve Prisma Migrasyon Durumu
- **Docker Konteyneri:** `campuspass-pg` (`localhost:5432` üzerinde aktif).
- **Migrasyon Çıktısı (`npm --prefix server run db:migrate`):**
  ```text
  Environment variables loaded from .env
  Prisma schema loaded from prisma\schema.prisma
  Datasource "db": PostgreSQL database "campuspass", schema "public" at "localhost:5432"

  6 migrations found in prisma/migrations

  No pending migrations to apply.
  ```
  Faz 19 migrasyonu (`20261106000000_phase19_operational_audit`) dahil olmak üzere toplam **6 migrasyonun tamamı** gerçek PostgreSQL veritabanına uygulanmış durumdadır.

### 1.3. Canlı Backend Sağlık Durumu (`GET /api/health`)
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "service": "campuspass-backend",
    "environment": "development",
    "database": {
      "status": "ok",
      "mode": "postgresql-prisma"
    },
    "blockchain": {
      "chainId": 10143,
      "contractAddress": "0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da"
    },
    "indexer": {
      "lastProcessedBlock": 77753926,
      "updatedAt": "2026-11-07T13:29:31.077Z",
      "metrics": {
        "batchesProcessed": 27,
        "eventsCreatedIndexed": 0,
        "registrationsIndexed": 0,
        "attendancesIndexed": 0,
        "duplicatesSkipped": 0,
        "reorgRemovedCount": 0,
        "retriesCount": 0,
        "lastProcessedBlock": 77753926,
        "lastRunAt": "2026-11-07T13:29:31.079Z",
        "lastError": null
      }
    },
    "timestamp": "2026-11-07T13:29:45.377Z"
  }
}
```

---

## 2. Otomatik Doğrulama Komutları ve Kesin Çıktıları

### 2.1. `npm test`
- **Sonuç:** **PASS** (`263 passing (17s)`, `0 failing`)
- **Özet Çıktı:**
  ```text
  > campuspass@0.0.0 test
  > hardhat test --no-compile

  Running Solidity tests
  Running Mocha tests

    Faz 9 — Backend API, SIWE Kimlik Doğrulama, Prisma Veri Bütünlüğü ve Event Indexer Testleri (20 test geçti)
    CampusPass — Akıllı Sözleşme Birim Testleri (15 test geçti)
    Faz 10 — Blockchain Doğrulamalı Dijital Katılım Sertifikaları Test Paketi (14 test geçti)
    Faz 12 — Üniversite Topluluk Yönetim Sistemi, Rol Tabanlı Yetkilendirme ve Üyelik Test Paketi (11 test geçti)
    Faz 7 — Gelişmiş Etkinlik Yönetimi ve Metadata Testleri (9 test geçti)
    Faz 11 — Organizatör Yönetim Paneli, Etkinlik Analitiği ve Topluluk Performansı Test Paketi (16 test geçti)
    Faz 13 — Teknik Borç, Güvenlik ve Entegrasyon Stabilizasyonu Test Paketi (7 test geçti)
    Faz 14 — Performans, Öğrenci Profili, Hesap Ayarları ve Güvenlik Test Paketi (8 test geçti)
    Faz 15 — Blokzincir Olay Okuma ve Cüzdan/SIWE Yaşam Döngüsü Regresyon Test Paketi (30 test geçti)
    Faz 15 Final Polish — Sertifika Alıcı Kimliği & Doğrulanmış Profil Tam Adı Snapshot Testleri (8 test geçti)
    Faz 15 Manuel Test Bulguları & İş Akışı Düzeltmeleri Regresyon Paketi (13 test geçti)
    Faz 15 — Bildirim Merkezi, Topluluk İletişimi ve Gerçek Zamanlı Güncellemeler Test Paketi (22 test geçti)
    Faz 16 — Product Flow & UX Completion Test Paketi (8 test geçti)
    Phase 18: Event Discovery, URL State Sync & Planning Helpers (24 test geçti)
    Phase 18.5 — Manual Defect Fixes Regression Suite (13 test geçti)
    Faz 19 — Community & Organizer Operations Test Paketi (11 test geçti)
    QR Güvenlik ve Uçtan Uca Doğrulama Testleri (7 test geçti)
    Faz 12.5 — React Router Mimarisi, URL Tabanlı Navigasyon ve Güvenlik Test Paketi (16 test geçti)
    Faz 8 — Öğrenci Profili ve Katılım Geçmişi Testleri (11 test geçti)

    263 passing (17s)
  ```

### 2.2. `npm run lint`
- **Sonuç:** **PASS** (`0 errors`, `145 warnings`, çıkış kodu `0`)
- **Kesin Çıktı:**
  ```text
  > campuspass@0.0.0 lint
  > oxlint

  Found 145 warnings and 0 errors.
  Finished in 715ms on 102 files with 104 rules using 16 threads.
  ```

### 2.3. `npm run build`
- **Sonuç:** **PASS** (`built in 1.27s`, çıkış kodu `0`)
- **Kesin Çıktı:**
  ```text
  > campuspass@0.0.0 build
  > vite build

  vite v8.3.5 building client environment for production...
  transforming...
  ✓ 210 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                                        1.38 kB │ gzip:  0.68 kB
  dist/assets/index-9uDW7I7L.css                        41.39 kB │ gzip:  8.08 kB
  dist/assets/rolldown-runtime-XKyaHtl9.js               0.72 kB │ gzip:  0.42 kB
  dist/assets/calendarIcs-BOIvCgWa.js                    2.52 kB │ gzip:  1.31 kB
  dist/assets/NotFoundPage-C08ewkk1.js                   2.56 kB │ gzip:  1.03 kB
  dist/assets/qrMatrix-DFS6Gg7f.js                       3.50 kB │ gzip:  1.64 kB
  dist/assets/EventCard-BQg5HoGY.js                      8.88 kB │ gzip:  2.62 kB
  dist/assets/NotificationsPage-bAV0FnTW.js             12.44 kB │ gzip:  3.60 kB
  dist/assets/CertificateVerificationPage-CnWIzZhM.js   12.84 kB │ gzip:  3.72 kB
  dist/assets/CommunityProfilePage-BH8ggZnD.js          13.18 kB │ gzip:  3.61 kB
  dist/assets/OrganizerEventAnalyticsPage-rrW_yQ6C.js   16.91 kB │ gzip:  4.84 kB
  dist/assets/certificatePdf-bVa26eXD.js                17.06 kB │ gzip:  6.00 kB
  dist/assets/CommunityDiscoveryPage-FhWv71RP.js        17.11 kB │ gzip:  4.49 kB
  dist/assets/OrganizerDashboardPage-C_Fh2r72.js        19.44 kB │ gzip:  5.99 kB
  dist/assets/AccountSettingsPage-Bhbac8iJ.js           27.44 kB │ gzip:  5.91 kB
  dist/assets/CommunityManagePage-CyQC1UHN.js           31.27 kB │ gzip:  6.40 kB
  dist/assets/HomePage-DKf_kzpI.js                      37.16 kB │ gzip:  8.85 kB
  dist/assets/StudentProfile-CZZ9YBIx.js                41.89 kB │ gzip:  9.79 kB
  dist/assets/EventPage-Ce8sJ2WS.js                     50.15 kB │ gzip: 12.53 kB
  dist/assets/index-DYzFSijE.js                        103.54 kB │ gzip: 26.01 kB
  dist/assets/vendor-ethers-f2YmiUcL.js                253.09 kB │ gzip: 93.75 kB
  dist/assets/vendor-react-CgMG4P4_.js                 257.28 kB │ gzip: 81.70 kB

  ✓ built in 1.27s
  ```

### 2.4. `npm run db:validate`
- **Sonuç:** **PASS** (13 model doğrulandı)
- **Kesin Çıktı:**
  ```text
  > campuspass@0.0.0 db:validate
  > node server/src/utils/prismaSchemaValidator.js

  [PRISMA VALIDATE] Başarılı! Doğrulanan modeller (13): Community, CommunityMember, EventMetadata, IndexedRegistration, IndexedAttendance, IndexerCheckpoint, AuthNonce, OrganizerSession, AttendanceCertificate, StudentProfile, Notification, Announcement, NotificationPreference
  ```

### 2.5. `npm run test:postgres`
- **Sonuç:** **PASS** (Gerçek PostgreSQL üzerinde 9 entegrasyon adımı tamamlandı)
- **Kesin Çıktı:**
  ```text
  > campuspass@0.0.0 test:postgres
  > node server/tests/postgres.integration.test.js

  === CampusPass Gerçek PostgreSQL Entegrasyon Test Kontrolü ===
  1. [BAŞARILI] Gerçek PostgreSQL bağlantısı doğrulandı: [ { connected: 1 } ]
  2. [BAŞARILI] Gerçek PostgreSQL CRUD işlemleri doğrulandı.
  3. [BAŞARILI] Unique constraint (P2002) davranışı doğrulandı.
  4. [BAŞARILI] Atomik $transaction rollback davranışı doğrulandı.
  5. [BAŞARILI] Faz 10 AttendanceCertificate CRUD ve Unique Constraint (P2002) doğrulandı.
  6. [BAŞARILI] Faz 12 Community & CommunityMember CRUD, P2002 Unique Constraint ve Rol/Durum döngüsü doğrulandı.
  7. [BAŞARILI] Faz 14 StudentProfile CRUD, P2002 Unique Constraint ve Gizlilik (isPublic) güncellemeleri doğrulandı.
  8. [BAŞARILI] Faz 15 Notification, Announcement ve NotificationPreference (P2002) CRUD testleri doğrulandı.
  9. [BAŞARILI] Faz 19 Operasyonel Denetim İzi (reviewedByWallet, reviewedAt, verifiedByWallet) PostgreSQL şemasında doğrulandı.
  === Tüm Gerçek PostgreSQL Entegrasyon Testleri Başarıyla Tamamlandı ===
  ```

---

## 3. PASS / FAIL / BLOCKED / MANUAL REQUIRED Matrisi

| Kategori | Kontrol Kalemi | Durum | Kanıt / Açıklama |
|---|---|---|---|
| **Kimlik & Güvenlik** | SIWE oturum açma, nonce tekillik (replay koruması), oturum yenileme ve sunucu taraflı logout | **PASS** | `BackendAndIndexer.js` (Test 5, 6, 15, 18), `Phase13Stabilization.js` (Test 3.1–3.3) |
| **Kimlik & Güvenlik** | Cüzdan değişiminde (wallet switch) oturum, profil, kayıt, sertifika ve bildirim izolasyonu | **PASS** | `BackendAndIndexer.js` (Test 10, 20), `Phase18_5ManualDefectFixes.js` (C.2–C.4), `ReactRouterPhase12_5.js` (9.1) |
| **Kimlik & Güvenlik** | Hassas uç noktalarda CSRF token ve HttpOnly oturum çerezi zorunluluğu | **PASS** | `BackendAndIndexer.js` (Test 15), `Phase14PerformanceAndProfile.js` (1.1, 1.2), `Phase15Notifications.js` (1.1–1.3) |
| **Kimlik & Güvenlik** | Yanlış ağ (wrong-network) algılama ve korumalı ekranlarda uyarı gösterimi | **PASS** | `Phase15BlockchainAndWalletFix.js` (1.4, 3.9) |
| **Kimlik & Güvenlik** | Gerçek tarayıcıda MetaMask uzantısı üzerinden canlı cüzdan hesap değişimi (`accountsChanged`) | **MANUAL REQUIRED** | Otomatik testlerde simüle edildi; tarayıcıda MetaMask eklentisiyle canlı etkileşim gerektirir. |
| **Topluluklar & RBAC** | Topluluk oluşturma, otomatik OWNER ataması, benzersiz slug ve yönetilebilir topluluk seçimi | **PASS** | `CommunityManagementPhase12.js` (Test 1–5), `Phase15ManualTestingFixes.js` (2.1–2.3) |
| **Topluluklar & RBAC** | Katılım başvurusu (`PENDING`), onay (`ACTIVE`), red (`REJECTED`) ve yeniden başvuru (`reapply`) döngüsü | **PASS** | `CommunityManagementPhase12.js` (Test 6, 7), `Phase19CommunityOperations.js` (B.1, D.3) |
| **Topluluklar & RBAC** | `OWNER` / `ADMIN` / `MEMBER` yetki sınırları ve tek kurucu (sole OWNER) ayrılma koruması | **PASS** | `CommunityManagementPhase12.js` (Test 8, 9), `Phase15Notifications.js` (5.1, 5.2) |
| **Topluluklar & RBAC** | Çapraz topluluk (cross-community) yetkisiz işlem ve etkinlik koparma engeli | **PASS** | `CommunityManagementPhase12.js` (Test 10), `Phase13Stabilization.js` (2.1, 2.2) |
| **Topluluklar & RBAC** | Topluluk Operasyon Merkezi (`hub`), aktivite akışı ve denetim izi (`reviewedByWallet`, `reviewedAt`) | **PASS** | `Phase19CommunityOperations.js` (A.1–A.4, B.1, D.1) ve `postgres.integration.test.js` (Adım 9) |
| **Etkinlikler & Keşif** | Yalnızca yetkili organizatör ve yönetilen topluluk adına etkinlik oluşturabilme | **PASS** | `CampusPass.js`, `BackendAndIndexer.js` (Test 2, 4), `Phase15ManualTestingFixes.js` (2.3) |
| **Etkinlikler & Keşif** | Etkinliğe kayıt, mükerrer kayıt engeli ve kontenjan doluluk kontrolü | **PASS** | `CampusPass.js`, `Phase18EventDiscoveryAndPlanning.js` (Bölüm 5) |
| **Etkinlikler & Keşif** | Arama, kategori/topluluk/durum/kontenjan/tarih filtreleme, sıralama ve URL query senkronizasyonu | **PASS** | `Phase18EventDiscoveryAndPlanning.js` (Bölüm 1, 2, 3) |
| **Etkinlikler & Keşif** | Paylaşım bağlantısı ve kişisel veri sızdırmayan RFC 5545 `.ics` takvim çıktısı | **PASS** | `Phase18EventDiscoveryAndPlanning.js` (Bölüm 4) |
| **Etkinlikler & Keşif** | Organizatör paneli, analitik, `NO_SHOW` / `MISSING_PROFILE_NAME` filtreleri ve CSV dışa aktarım güvenliği | **PASS** | `OrganizerAnalyticsPhase11.js` (Test 1–16), `Phase18_5ManualDefectFixes.js` (A.1–A.4), `Phase19CommunityOperations.js` (C.1, C.2, D.2) |
| **Yoklama & Sertifika** | Öğrencinin QR bilet göstermesi fakat kendi yoklamasını doğrulayamaması (self-scan engeli) | **PASS** | `Phase15ManualTestingFixes.js` (4.1, 4.2), `Phase16ProductFlowAndUx.js` (3.2) |
| **Yoklama & Sertifika** | Yalnızca yetkili organizatör veya topluluk yöneticisinin yoklama doğrulayabilmesi ve `verifiedByWallet` kaydı | **PASS** | `Phase15ManualTestingFixes.js` (4.3), `Phase19CommunityOperations.js` (B.2) |
| **Yoklama & Sertifika** | Replay, süresi dolmuş (`>180sn`) ve farklı etkinlik/ağ QR kodlarının reddedilmesi | **PASS** | `QrSecurity.js` (Test 1–7), `Phase15ManualTestingFixes.js` (4.3) |
| **Yoklama & Sertifika** | Sertifika basımı için doğrulanmış yoklama şartı, sahiplik kontrolü, idempotent tekillik | **PASS** | `CertificatesPhase10.js` (Test 1–5), `Phase15ManualTestingFixes.js` (5.1) |
| **Yoklama & Sertifika** | Sertifika alıcı adı snapshot değişmezliği (immutability), PDF/SVG üretimi ve 4 katmanlı doğrulama sayfası | **PASS** | `Phase15CertificateRecipientPolish.js` (Test 1–8), `CertificatesPhase10.js` (Test 6–14) |
| **Yoklama & Sertifika** | Fiziksel kamera ile canlı QR okutma | **MANUAL REQUIRED** | Kamera donanımı ve tarayıcı medya izni gerektirir. |
| **Bildirimler** | Bildirim sahipliği, cüzdanlar arası izolasyon, okundu işaretleme, silme ve okunmamış sayaç | **PASS** | `Phase15Notifications.js` (Bölüm 1, 2) |
| **Bildirimler** | Üyelik kararları, etkinlik iptali, duyuru ve sertifika basımı bildirim tetikleyicileri + `dedupKey` koruması | **PASS** | `Phase15Notifications.js` (Bölüm 4, 5, 6, 7), `Phase16ProductFlowAndUx.js` (1.2) |
| **Bildirimler** | İsteğe bağlı bildirim tercihleri (`NotificationPreference`) filtrelemesi | **PASS** | `Phase15Notifications.js` (Bölüm 3) |
| **UX & Performans** | Masaüstü ve mobil duyarlı (responsive) Navbar, mobil çekmece (drawer) ve erişilebilirlik nitelikleri | **PASS** | `Phase18_5ManualDefectFixes.js` (B.1–B.4) |
| **UX & Performans** | Öğrenci panelinde sınırlı eşzamanlılık (`runBoundedConcurrency`) ve 30 sn TTL izole önbellek | **PASS** | `Phase18_5ManualDefectFixes.js` (C.1–C.5) |
| **UX & Performans** | Boş durum (empty), yükleniyor (loading), hata ve yetki reddi (403) görünümleri; ham hata/sır sızdırmama | **PASS** | `ReactRouterPhase12_5.js` (Bölüm 2, 3, 4, 5, 7), `Phase19CommunityOperations.js` (D.1–D.3) |

---

## 4. Bu Fazda Tespit Edilen ve Düzeltilen Engelleyici Hatalar (Confirmed Defects Fixed)

### Hata #1: `IndexedRegistration` Modelinde Fazladan `verifiedByWallet` Alanı ve `@prisma/client` Senkronizasyonu
- **Belirti:** Gerçek PostgreSQL üzerinde `npm run test:postgres` çalıştırıldığında ve `@prisma/client` yeniden üretildiğinde `prisma.indexedRegistration.create()` çağrısı şu hatayı verdi:
  `The column IndexedRegistration.verifiedByWallet does not exist in the current database.`
- **Kök Neden:** Faz 19'da `schema.prisma` düzenlenirken `verifiedByWallet String?` alanı hem `IndexedAttendance` hem de yanlışlıkla `IndexedRegistration` modeline eklenmişti; oysa SQL migrasyonu (`20261106000000_phase19_operational_audit/migration.sql`) haklı olarak bu sütunu yalnızca `"IndexedAttendance"` tablosuna eklemişti.
- **Çözüm:**
  1. [`server/prisma/schema.prisma`](file:///c:/Users/ÖMER%20FARUK/Desktop/Dosyalar/VSCODE(1)/campuspass/server/prisma/schema.prisma) içindeki `IndexedRegistration` modelinden fazladan `verifiedByWallet` satırı kaldırıldı (`IndexedAttendance` modelinde korundu).
  2. `npm run db:generate` çalıştırılarak `@prisma/client` gerçek PostgreSQL şemasıyla birebir uyumlu hale getirildi.
  3. [`server/tests/postgres.integration.test.js`](file:///c:/Users/ÖMER%20FARUK/Desktop/Dosyalar/VSCODE(1)/campuspass/server/tests/postgres.integration.test.js) dosyasına **Adım 9** eklenerek `CommunityMember` (`reviewedByWallet`, `reviewedAt`) ve `IndexedAttendance` (`verifiedByWallet`) alanlarının gerçek PostgreSQL üzerinde yazılması ve okunması doğrulandı.

---

## 5. İki Cüzdanlı Manuel Kabul Kontrol Listesi (Manual Two-Wallet Checklist)

Aşağıdaki adımlar tarayıcıda (`http://localhost:5173`) **Hesap A (Organizatör / Topluluk Yöneticisi)** ve **Hesap B (Öğrenci)** ile sırasıyla uygulanmak üzere hazırlanmıştır:

1. **[Hesap A — Kurulum & Topluluk Oluşturma]:** MetaMask'ta Hesap A'yı seçin, Monad Testnet (`10143`) ağında olduğunuzu doğrulayın, SIWE ile giriş yapın. `/communities` sayfasından yeni bir topluluk oluşturun ve `/communities/:slug/manage` yönetim merkezinde **Operasyon Merkezi** sekmesinin açıldığını kontrol edin.
2. **[Hesap B — Cüzdan Değişimi & Topluluğa Başvuru]:** MetaMask üzerinden **Hesap B**'ye geçin. Üst menüde önceki oturumun kapandığını doğrulayın. Hesap B ile SIWE girişi yapın, `/settings` sayfasından Ad Soyad profil bilginizi kaydedin ve Hesap A'nın kurduğu topluluğa katılma başvurusu gönderin (`Başvurun Değerlendiriliyor` rozetini görün).
3. **[Hesap A — Başvuru Onayı & Etkinlik Oluşturma]:** Tekrar **Hesap A**'ya geçin. Topluluk yönetim merkezinde bekleyen başvuru sayısının `1` olduğunu görün, başvuruyu onaylayın ve **Operasyon Merkezi** aktivite akışında onay kaydının (`Değerlendiren: ...`) belirdiğini doğrulayın. Ardından `/events?create=1` üzerinden bu topluluğu seçerek yeni bir etkinlik oluşturun (Monad Testnet işlemi onaylayın).
4. **[Hesap B — Bildirim Kontrolü, Etkinlik Kaydı & QR Bilet]:** **Hesap B**'ye geçin. Bildirim zilinde `"Topluluk Üyeliğiniz Onaylandı!"` bildirimini görün. Yeni oluşturulan etkinliğin detay sayfasına (`/events/:id`) gidin, `.ics` takvim dosyasını indirin, ardından etkinliğe blokzincir üzerinden kaydolun ve imzalı **Katılım QR Kodunuzu** oluşturup kopyalayın.
5. **[Hesap A — Yoklama Doğrulama & Sertifika Basımı]:** **Hesap A**'ya geçin. Etkinlik sayfasında veya `/organizer/events/:id/analytics` ekranında Hesap B'nin imzalı QR verisini doğrulayın ve zincir üstü yoklama işlemini (`markAttendance`) tamamlayın. Analitik tablosunda `Doğrulandı ✓` ve `Doğrulayan: 0x...` bilgisini görün; ardından **🎓 Sertifika Ver** butonuna tıklayarak sertifikayı oluşturun ve CSV dışa aktarımını indirip denetim sütunlarını kontrol edin.
6. **[Hesap B — Sertifika Görüntüleme & Doğrulama]:** **Hesap B**'ye geçin. Bildirimlerden sertifika hazır bildirimine tıklayın veya `/profile/certificates` sekmesine gidin. Ad soyadınızın mühürlendiği sertifikanın PDF'ini indirin ve `/verify/:certificateId` sayfasında 4 katmanlı doğrulamanın tamamının yeşil (`DOĞRULANDI`) olduğunu teyit edin.
7. **[Mobil Görünüm Kontrolü]:** Tarayıcı geliştirici araçlarında ekran genişliğini `375px` (mobil) boyutuna getirin; üst menüdeki hamburger butonunun (`Menüyü aç`) çekmeceyi düzgün açtığını, bildirim rozetinin ve cüzdan kontrollerinin taşma yapmadan çalıştığını doğrulayın.

---

## 6. Bilinen Sınırlamalar (Known Limitations)

1. **Monad Testnet RPC Hız Sınırları (Rate Limits):** Genel Monad Testnet RPC uç noktası (`https://testnet-rpc.monad.xyz`) saniyede 15 istek ve `eth_getLogs` için 100 blok aralığı sınırına sahiptir. Sistemde üstel geri çekilme (`exponential backoff`), 100 blokluk batch indeksleme ve 30 saniyelik istemci önbelleği ile bu sınır güvenli şekilde yönetilmektedir.
2. **Geçmiş Verilerde Denetim Aktörü:** Faz 19 öncesinde oluşturulmuş üyelik veya yoklama kayıtlarında `reviewedByWallet` / `verifiedByWallet` sütunları `null` olduğundan, arayüzde ve CSV çıktılarında uydurma veri üretilmeyip `"kayıt yok"` olarak gösterilir.

---

## 7. Dal ve Yerel Commit Bilgisi

- **Aktif Dal:** `feature/phase-19-community-operations`
- **Yerel Commit:** `b711c97` (Rapor ve şema düzeltmesi yerel olarak commit edilmiştir; uzak depoya push yapılmamıştır).
