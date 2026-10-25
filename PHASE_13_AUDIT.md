# CampusPass — Phase 13: Kapsamlı Teknik Borç, Güvenlik ve Entegrasyon Denetim Raporu (PHASE_13_AUDIT.md)

Bu belge, CampusPass platformunun (React 19, Vite, Express, Prisma, Monad Testnet EIP-4361 SIWE) önceki fazlar boyunca (Faz 8 - Faz 12.5) biriken teknik borçlarının, güvenlik zafiyetlerinin, entegrasyon kusurlarının ve mimari tutarsızlıklarının önceliklendirilmiş denetim listesidir.

---

## Bulguların Özeti

| ID | Seviye | Kategori | Başlık |
|---|---|---|---|
| **SEC-01** | **CRITICAL** | Güvenlik / Entegrasyon | Topluluk Profilinde Anonim Kalma ve Rol Tespiti Hatası (Eksik `optionalAuthSession` ve `credentials` header hatası) |
| **SEC-02** | **CRITICAL** | Kimlik Doğrulama / SIWE | Ön Yüzde Topluluk İşlemlerinde (Oluşturma/Katılma/Ayrılma) SIWE Oturumu Güvenceye Alınmaması |
| **INT-01** | **HIGH** | Güvenlik / Çoklu Kiracılık (Tenant) | `unlinkEventFromCommunity` İçinde Çapraz Topluluk Etkinlik Bağlantısı Koparma Zafiyeti |
| **UX-01** | **HIGH** | Kullanıcı Deneyimi / Oturum | Kullanıcı Oturum Kontrolleri Eksikliği: Cüzdan Bağlantısını Kesme, SIWE Logout Butonu ve Sekmeler Arası Eşitleme |
| **DEBT-01** | **MEDIUM** | React 19 Mimarisi | `useEffect` İçi Senkron `setState` Çağrıları (Cascading Renders) ve Fast Refresh İhlalleri |
| **UX-02** | **MEDIUM** | Usability / UI | Arama/Filtre Boş Durumlarında "Filtreleri Temizle" Eksikliği ve Mobil Görünüm İyileştirmeleri |
| **DOC-01** | **MEDIUM** | Dokümantasyon | README, Ortam Değişkenleri ve Kurulum Kılavuzundaki Eksiklikler |
| **LINT-01** | **LOW** | Kod Kalitesi / Test | Test Dosyalarındaki Chai Property Assertion Linter Uyarıları (`no-unused-expressions`) |

---

## Detaylı Denetim Bulguları

### 1. [CRITICAL] SEC-01: Topluluk Profilinde Anonim Kalma ve Rol Tespiti Hatası

- **Etkilenen Dosyalar:**
  - `server/src/routes/communityRoutes.js`
  - `server/src/middleware/authMiddleware.js`
  - `src/utils/apiClient.js`
- **Kök Neden:**
  1. `router.get("/:idOrSlug", communityController.getCommunityProfile)` uç noktasında hiçbir oturum middleware'i (`requireAuthSession` veya `optionalAuthSession`) tanımlı değildir. Sunucu tarafında `req.session` her zaman tanımsız kalmakta, dolayısıyla `callerWallet` null gitmektedir.
  2. `src/utils/apiClient.js` dosyasındaki `fetchCommunityProfileFromBackend` fonksiyonunda `credentials: "include"` seçeneği fetch `options` yerine yanlışlıkla `options.headers` içerisine yazılmıştır (`{ headers: { credentials: "include", Accept: "application/json" } }`). Bu nedenle tarayıcı HttpOnly çerezini göndermemekte, geçersiz bir HTTP başlığı yollamaktadır.
  3. Bu iki kusur sebebiyle topluluğu oluşturan `OWNER` dahi profil sayfasına girdiğinde backend tarafından `myRole: "NON-MEMBER"` olarak tanımlanmakta ve "Yönet" butonu yerine "Katıl" butonu gösterilmektedir.
- **Yeniden Üretme Adımları:**
  1. SIWE ile cüzdan girişi yapın.
  2. Yeni bir topluluk oluşturun veya sahip olduğunuz topluluğun `/communities/:slug` sayfasına gidin.
  3. Sayfada "Yönet" butonunun çıkmadığını, üye rolünüzün "NON-MEMBER" döndüğünü gözlemleyin.
- **Önerilen Düzeltme:**
  1. `server/src/middleware/authMiddleware.js` dosyasına isteğe bağlı oturum doğrulayan `optionalAuthSession` middleware'i ekleyin. (Çerez varsa oturumu çözer ve `req.session`'a atar; yoksa hata fırlatmadan anonim geçirir).
  2. `server/src/routes/communityRoutes.js` rotasında `GET /:idOrSlug` ve `GET /:idOrSlug/events` uç noktalarına `optionalAuthSession` bağlayın.
  3. `src/utils/apiClient.js` içindeki `fetchCommunityProfileFromBackend` fonksiyonunu `apiRequest` wrapper'ına veya doğru `credentials: "include"` yapısına geçirin.
- **Regresyon Test Gereksinimleri:**
  - Oturumlu kullanıcının `GET /api/communities/:slug` çağrısında gerçek rolünü (`OWNER`/`ADMIN`/`MEMBER`) aldığını test edin.
  - Anonim kullanıcının `GET /api/communities/:slug` çağrısında `"NON-MEMBER"` aldığını doğrulayın.

---

### 2. [CRITICAL] SEC-02: Ön Yüzde Topluluk Eylemlerinde SIWE Oturumunun Güvenceye Alınmaması

- **Etkilenen Dosyalar:**
  - `src/pages/CommunityDiscoveryPage.jsx`
  - `src/pages/CommunityProfilePage.jsx`
  - `src/pages/StudentProfile.jsx`
  - `src/utils/apiClient.js`
- **Kök Neden:**
  - `handleCreateCommunitySubmit`, `handleJoin` ve `handleLeave` fonksiyonlarında kullanıcı cüzdanını bağlamış olsa bile henüz SIWE imza oturumu açmamış veya sayfa yenilenmiş olabilir.
  - `createCommunityOnBackend`, `joinCommunityOnBackend` ve `leaveCommunityOnBackend` fonksiyonları doğrudan API çağrısı yapmakta; `activeAuthState.csrfToken` bulunmadığında backend haklı olarak `401 Unauthorized` (`SESSION_REQUIRED`) döndürmektedir.
  - Ayrıca `StudentProfile.jsx:205` satırında `ensureStudentSiweSession(account)` çağrılırken string parametre geçilmiş, bu da obje bekleyen fonksiyonda runtime hatasına neden olmuştur.
- **Yeniden Üretme Adımları:**
  1. Cüzdanı bağlayın fakat organizatör paneline girmeyin (SIWE mesajı imzalanmamış durum).
  2. `/communities` sayfasına gidip "Yeni Topluluk Oluştur" formunu doldurup Gönder'e basın.
  3. İşlem `401 Unauthorized (SESSION_REQUIRED)` ile çöker ve topluluk oluşturulamaz.
- **Önerilen Düzeltme:**
  1. `src/utils/apiClient.js` dosyasındaki `ensureStudentSiweSession` ve `ensureOrganizerSiweSession` fonksiyonlarını tek bir esnek ve birleşik `ensureSiweSession({ signer, walletAddress, chainId })` mantığı ile güçlendirin; hem obje hem doğrudan string adres parametresi alabilmesini sağlayın. Mevcut oturum geçerliyse imza sormadan hızlıca geçsin; oturum yoksa MetaMask BrowserProvider üzerinden kullanıcıdan imza talep etsin.
  2. `CommunityDiscoveryPage.jsx`, `CommunityProfilePage.jsx` ve `StudentProfile.jsx` bileşenlerindeki durum değiştiren eylemler öncesinde `ensureSiweSession` çağrısını zorunlu kılın.
- **Regresyon Test Gereksinimleri:**
  - Aktif oturum yokken topluluk oluşturma / katılma / ayrılma butonuna basıldığında oturum kontrolünün tetiklendiğini ve geçerli oturumla işlemin 201/200 döndüğünü test edin.

---

### 3. [HIGH] INT-01: `unlinkEventFromCommunity` İçinde Çapraz Topluluk Etkinlik Bağlantısı Koparma Zafiyeti

- **Etkilenen Dosyalar:**
  - `server/src/services/communityService.js`
- **Kök Neden:**
  - `unlinkEventFromCommunity(idOrSlug, eventId, chainId, contractAddress, callerWallet)` fonksiyonunda çağıran kullanıcının hedef toplulukta yetkili olup olmadığı kontrol edilmektedir (`requireRole`).
  - Ancak bulunan `eventMetadata` kaydının `communityId` alanının gerçekten o topluluğa ait olup olmadığı (`event.communityId === community.id`) kontrol edilmemektedir.
  - Sonuç olarak B Topluluğunun yöneticisi, A Topluluğuna bağlı bir etkinliğin kimliğini belirterek kendi topluluğundan `DELETE /events/unlink` çağrısı yaptığında, A Topluluğunun etkinliğinin `communityId` değerini `null` yapabilmektedir!
- **Yeniden Üretme Adımları:**
  1. Topluluk A'ya bağlı bir Etkinlik 1 olsun.
  2. Topluluk B'nin Admini olarak `DELETE /api/communities/topluluk-b/events/unlink` uç noktasına Etkinlik 1 bilgileriyle istek gönderin.
  3. Etkinlik 1'in topluluk bağlantısının koptuğunu gözlemleyin.
- **Önerilen Düzeltme:**
  - `unlinkEventFromCommunity` içerisine `if (event.communityId !== community.id) throw ApiError.badRequest("Bu etkinlik belirtilen topluluğa bağlı değil.");` güvenlik doğrulaması ekleyin.
- **Regresyon Test Gereksinimleri:**
  - Başka bir topluluğa ait etkinliği unlink etmeye çalışan yetkiliye `400 Bad Request` veya `403 Forbidden` yanıtı döndüğünü test edin.

---

### 4. [HIGH] UX-01: Kullanıcı Oturum Kontrolleri Eksikliği ve Sekmeler Arası Eşitleme

- **Etkilenen Dosyalar:**
  - `src/components/Navbar.jsx`
  - `src/context/AppContext.jsx`
  - `src/utils/apiClient.js`
- **Kök Neden:**
  1. `Navbar.jsx` bileşeni cüzdan bağlandığında yalnızca `/profile` linki göstermektedir. Kullanıcının cüzdan bağlantısını istemli olarak kesmesi ("Disconnect Wallet") veya SIWE oturumunu sunucu tarafında geçersiz kılması ("SIWE Logout") için herhangi bir arayüz elemanı yoktur.
  2. Kullanıcı başka bir sekmede çıkış yaptığında veya oturumu sonlandırdığında, açık olan diğer sekmeler bu durumdan haberdar olmamaktadır (Cross-tab sync eksikliği).
  3. Cüzdan bağlantısının kesilmesi (ön yüz istemci durumu) ile sunucu SIWE oturumunun kapatılması (HttpOnly çerezinin temizlenmesi ve veritabanında `revokedAt` işaretlenmesi) birbirinden kavramsal olarak ayırt edilmemiştir.
- **Önerilen Düzeltme:**
  1. `Navbar.jsx` içinde bağlı cüzdana tıklandığında açılan şık bir Stitch Hesap / Oturum Menüsü (Dropdown/Modal) ekleyin:
     - Cüzdan adresi, kopyalama butonu ve Monad Testnet durumu.
     - SIWE Oturum Durumu rozeti (Aktif SIWE Oturumu vs. Salt Cüzdan Bağlantısı).
     - "SIWE Oturumunu Kapat" butonu: Sunucu tarafında `POST /api/auth/logout` çağırır, çerezi siler, veritabanında oturumu iptal eder ve `localStorage` event'i ile tüm sekmeleri senkronize eder.
     - "Cüzdanı Ayır (Disconnect)" butonu: İstemci tarafındaki Web3 cüzdan bağlantı durumunu sıfırlar.
  2. `AppContext.jsx` içine `window.addEventListener("storage", ...)` ile sekmeler arası oturum kapatma senkronizasyonunu (`campuspass_auth_event`) entegre edin.
- **Regresyon Test Gereksinimleri:**
  - Cüzdan bağlantısını kesme ve sunucu oturumunu kapatma eylemlerinin bağımsız çalıştığını ve sekmeler arası oturum kapanışının doğru tetiklendiğini test edin.

---

### 5. [MEDIUM] DEBT-01: React 19 Cascading Renders ve Fast Refresh İhlalleri

- **Etkilenen Dosyalar:**
  - `src/pages/CertificateVerificationPage.jsx`
  - `src/pages/OrganizerEventAnalyticsPage.jsx`
  - `src/pages/OrganizerDashboardPage.jsx`
  - `src/pages/CommunityDiscoveryPage.jsx`
  - `src/pages/CommunityManagePage.jsx`
  - `src/pages/StudentProfile.jsx`
  - `src/context/AppContext.jsx`
- **Kök Neden:**
  - `useEffect` içerisinde senkron olarak çağrılan `setState` fonksiyonları (`setInputCertId`, `loadDashboard`, `setActiveProfileTab` vb.) React 19'da ardışık gereksiz render turlarına (cascading renders) yol açmakta ve oxlint linter'ı tarafından `react(set-state-in-effect)` uyarısı vermektedir.
  - `StudentProfile.jsx` bileşeninde `/profile` ile `/profile/certificates` geçişi gereksiz bir `useEffect` ile senkronize edilmeye çalışılmıştır. Oysa aktif sekme doğrudan `location.pathname` üzerinden türetilebilir.
  - `AppContext.jsx` dosyasında provider ile birlikte custom hook `useAppContext` fonksiyonunun aynı dosyadan export edilmesi Vite Fast Refresh uyarısına yol açmaktadır.
- **Önerilen Düzeltme:**
  - Sayfa bileşenlerinde efekt içi senkron durum güncellemelerini kaldırıp render anında türetmeye (derived state) geçin.
  - `useAppContext` hook'unu standartlaştırın ve React 19 derleyici kurallarıyla tam uyumlu hale getirin.
- **Regresyon Test Gereksinimleri:**
  - `npm run lint` komutunun 0 hata ve minimum uyarı ile tamamlandığını doğrulayın.

---

### 6. [MEDIUM] UX-02: Arama/Filtre Boş Durumları ve Mobil Uyumluluk

- **Etkilenen Dosyalar:**
  - `src/pages/CommunityDiscoveryPage.jsx`
  - `src/pages/HomePage.jsx`
  - `src/components/Navbar.jsx`
- **Kök Neden:**
  - Topluluk ve etkinlik filtrelemelerinde 0 sonuç döndüğünde kullanıcıya filtreleri tek tıkla sıfırlama seçeneği sunulmamaktadır.
  - Dar ekranlı mobil cihazlarda (360px) navigasyon sekmeleri ve sağ üst cüzdan kapsayıcısı daralma/taşma yapabilmektedir.
- **Önerilen Düzeltme:**
  - "Sonuç bulunamadı" boş durumlarına "Filtreleri Temizle" eylemi ekleyin.
  - Mobil CSS stillerini gözden geçirip yatay taşmaları engelleyin.
- **Regresyon Test Gereksinimleri:**
  - Boş arama sonuçlarında temizleme butonunun filtreleri başarıyla sıfırladığını doğrulayın.

---

### 7. [MEDIUM] DOC-01: README ve Geliştirici Ortamı Eksiklikleri

- **Etkilenen Dosyalar:**
  - `README.md`
  - `.env.example`
  - `server/.env.example`
- **Kök Neden:**
  - Faz 12 (Topluluk Yönetimi), Faz 12.5 (React Router mimarisi) ve Faz 13 güvenlik/stabilizasyon adımları `README.md` dosyasında yer almamaktadır.
  - Ortam değişkenleri örnek dosyalarında PostgreSQL bağlantısı, Prisma migration'ları ve SIWE oturum parametreleri detaylandırılmamıştır.
- **Önerilen Düzeltme:**
  - `README.md` ve `.env.example` dosyalarını eksiksiz olarak güncelleyin.
- **Regresyon Test Gereksinimleri:**
  - Dokümantasyonun gerçek sistem yapılandırmasıyla birebir örtüştüğünü kontrol edin.

---

### 8. [LOW] LINT-01: Test Dosyalarındaki Chai Property Assertion Linter Uyarıları

- **Etkilenen Dosyalar:**
  - `test/ReactRouterPhase12_5.js`
  - `test/CommunityManagementPhase12.js`
- **Kök Neden:**
  - Chai kütüphanesinin `expect(...).to.be.true`, `expect(...).to.be.false` gibi getter biçimli kontrolleri, oxlint/eslint tarafından `no-unused-expressions` uyarısı vermektedir.
- **Önerilen Düzeltme:**
  - Test ifadelerini `expect(...).to.equal(true)`, `expect(...).to.equal(false)` ve `expect(...).to.be.undefined` biçimine çevirin.
- **Regresyon Test Gereksinimleri:**
  - Testlerin tamamının başarıyla geçmeye devam ettiğini (`npm test`) ve linter uyarılarının temizlendiğini doğrulayın.
