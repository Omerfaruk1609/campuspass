# CampusPass — Faz 15 Blokzincir Olay Okuma ve Cüzdan/SIWE Yaşam Döngüsü Hata Raporu

**Tarih:** 29 Ekim 2026  
**Dal (Branch):** `feature/phase-15-notifications`  
**Hedef Blokzincir:** Monad Testnet (Chain ID: 10143)  
**Akıllı Sözleşme Adresi:** `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da` (Monad Vision Explorer üzerinde doğrulanmış ve canlı)  
**RPC URL:** `https://testnet-rpc.monad.xyz`  

---

## 1. Kesin Kök Neden Analizi (Root Causes)

### 1.1 Blokzincir Hatası: "Akıllı sözleşmeye ulaşılamadı veya belirtilen adreste sözleşme kodu bulunamadı"

Kullanıcının tarayıcısında etkinlik listesi veya profil verileri yüklenirken ara sıra çıkan bu hatanın kök nedenleri canlı RPC testleri, Ethers v6 davranışı ve kod izleme ile kesinleştirilmiştir:

1. **Monad Public RPC Hız Limiti (Rate Limiting - 15 req/sec):**
   - Monad Testnet genel RPC endpoint'i (`https://testnet-rpc.monad.xyz`), IP başına saniyede en fazla **15 istek** (`requests limited to 15/sec`, RPC hata kodu: `-32011`) sınırını katı şekilde uygulamaktadır.
   - Sayfa ilk açıldığında veya rota geçişlerinde `loadEvents`, `fetchStudentProfileData` veya sayfa bileşenleri birden fazla paralel çağrı (`eth_chainId`, `nextEventId`, `contract.events`, `contract.registered`, `contract.attended`, `queryFilter`) başlattığında bu 15 req/sn sınırı anında aşılmaktadır.
2. **Ethers.js v6 `CALL_EXCEPTION` ve `missing revert data` Sarmalaması:**
   - Ethers v6, RPC sunucusundan `-32011` rate limit JSON-RPC hatası aldığında bunu dahili olarak bir `CALL_EXCEPTION` istisnasına sarmalamakta ve hata nesnesinin `shortMessage` alanına `"missing revert data"` yazmaktadır.
   - Ham RPC hatası ise nesnenin derinliklerinde `error.info.error.code = -32011` ve `error.info.error.message = "requests limited to 15/sec"` olarak kalmaktadır.
3. **`parseBlockchainError` Önceliklendirme Hatası (False Positive Translation):**
   - Eski `parseBlockchainError` mantığı, rate limit ve ağ kontrolünden önce doğrudan `rawMessage.includes("missing revert data")` kontrolünü çalıştırmaktaydı.
   - Sonuç olarak, RPC aslında sözleşmenin yokluğundan değil, **hız sınırı aşıldığından** isteği reddettiği halde, kullanıcıya yanıltıcı bir şekilde:
     > *"Akıllı sözleşmeye ulaşılamadı veya belirtilen adreste sözleşme kodu bulunamadı. Lütfen ağın Monad Testnet (10143) olduğunu ve sözleşme adresini kontrol edin."*
     mesajı gösterilmekteydi.
4. **Önbelleklenmeyen JsonRpcProvider ve Gereksiz `eth_chainId` İstekleri:**
   - Her sözleşme çağrısında yeni `new ethers.JsonRpcProvider(rpcUrl)` oluşturulduğunda Ethers otomatik olarak `eth_chainId` ağ tespit isteği göndererek RPC kotasını ikiye katlamaktaydı.

---

### 1.2 Cüzdan Bağlantısı, SIWE ve Rotalar Arası Durum Tutarsızlığı

Navbar bağlı bir cüzdan gösterirken `/profile` ve `/organizer` sayfalarında "Cüzdan Bağla" çıkmasının kesin nedenleri:

1. **SIWE Oturumu ile Canlı Web3 Sağlayıcı Cüzdanının Karıştırılması:**
   - `AppContext.jsx` içerisindeki `restoreServerSession`, sayfa yenilendiğinde sunucudaki SIWE çerezinden gelen adresi `setAccount(serverAuth.walletAddress)` ile doğrudan `account` state'ine yazıyordu.
   - Ancak o anda tarayıcıda MetaMask bağlı olmayabilirdi (veya kilitliydi). Navbar `account` değerine bakarak cüzdanı bağlı gösteriyor, fakat sayfa bileşenleri (`StudentProfile`, `OrganizerDashboardPage`) Web3 signer veya live provider üzerinden işlem yapmaya kalktığında başarısız oluyordu.
2. **`sessionState.loading` Sırasında Erken Render (Race Condition):**
   - Sayfa ilk açıldığında `sessionState.loading = true` iken `account` başlangıçta `null` olmaktadır.
   - `StudentProfile`, `OrganizerDashboardPage` ve `OrganizerEventAnalyticsPage` bileşenleri `sessionState.loading` durumunu kontrol etmeyip derhal `if (!account)` koşulunu değerlendiriyor ve kullanıcıya milisaniyelerce "Cüzdan Bağla" boş durumunu flaşlatıyordu.
3. **Organizatör Sayfasında Mount Anında Otomatik İstenmeyen SIWE İmzası:**
   - `OrganizerDashboardPage` bileşeni mount olduğunda `loadDashboard` doğrudan `ensureSiwe()` fonksiyonunu tetikliyor, bu da kullanıcının onayına veya buton tıklamasına bağlı olmaksızın anında MetaMask imza popup'ı açmaya çalışıyordu. İmza reddedildiğinde veya oturum yokken sayfa hata vererek kilitleniyordu.
4. **5 Temel Durumun Ayrımının Net Olmaması:**
   - Uygulama şu 5 durumu birbirinden ayrı değerlendirmelidir:
     1. *Oturum yükleme devam ediyor:* (`sessionState.loading === true`)
     2. *Cüzdan bağlı değil:* (`!account`)
     3. *Yanlış ağ:* (`account && chainId !== 10143`)
     4. *SIWE oturumu açılmamış:* (`account && !sessionState.authenticated`)
     5. *Yetkisiz organizatör:* (Başkasına ait etkinlik analitiği - 403 Forbidden)

---

## 2. Doğrulama Kanıtları (Evidence)

1. **Canlı Monad Testnet RPC Kotası ve Bytecode Doğrulaması:**
   - RPC URL: `https://testnet-rpc.monad.xyz`
   - Sözleşme Adresi: `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`
   - Dağıtılmış Baytkod: `0x608060...` (10,708 bayt uzunluğunda, kontrat aktif).
   - Eşzamanlı 30 çağrı yapıldığında alınan ham RPC cevabı:
     `{ code: -32011, message: "requests limited to 15/sec" }`
   - Ethers.js v6 istisnası:
     `code: "CALL_EXCEPTION", shortMessage: "missing revert data", info: { error: { code: -32011, message: "requests limited to 15/sec" } }`
   - Böylece `missing revert data` hatasının sözleşme yokluğundan değil, rate limit'ten kaynaklandığı ampirik olarak ispatlandı.
2. **CORS ve HTTP Başlıkları:**
   - `OPTIONS` ve `POST` isteklerinde `http://localhost:5173` için `Access-Control-Allow-Origin: *` cevabı alınarak CORS engeli olmadığı doğrulandı.

---

## 3. Yapılan Düzeltmeler

### 3.1 Blokzincir Katmanı (`src/data/events.js` & `src/utils/studentProfile.js`)
1. **Statik Sağlayıcı ve Sözleşme Önbellekleme:**
   - `getReadOnlyProvider()` fonksiyonunda `new ethers.JsonRpcProvider(MONAD_RPC_URL, { chainId: 10143, name: "monad-testnet" }, { staticNetwork: true })` yapılandırması kullanılarak gereksiz `eth_chainId` istekleri sıfırlandı.
   - `getReadOnlyContract()` ile sözleşme nesnesi tekil (singleton) olarak önbelleklendi.
2. **`callWithRetry` ile Üstel Geri Çekilme (Exponential Backoff):**
   - `-32011` (rate limit) ve `429` hatalarını otomatik yakalayıp 3 defaya kadar üstel gecikmeyle (200ms, 400ms, 800ms) yeniden deneyen mekanizma eklendi.
3. **Sıralı / Korumalı Olay ve Kayıt Okuması:**
   - `AppContext.jsx` içerisindeki `loadEvents` ve `studentProfile.js` içerisindeki `fetchStudentProfileData`, paralel `Promise.all` yerine sıralı ve retry korumalı döngülere dönüştürüldü.
   - İsteğe bağlı `queryFilter` log taramalarının başarısız olması durumunda ana etkinlik veya profil akışının kesilmesi engellendi (`try-catch` koruması).
4. **Doğru Hata Çevirisi (`parseBlockchainError`):**
   - Rate limit `-32011`, `requests limited to`, `429` ve ağ bağlantı hataları, `missing revert data` kontrolünden **önce** değerlendirildi.
   - Rate limit durumunda doğru Türkçe hata mesajı:
     > *"Monad Testnet RPC istek veya blok aralığı sınırı aşıldı (en fazla 15 istek/sn). Lütfen birkaç saniye sonra tekrar deneyin."*
     dönmesi sağlandı.

### 3.2 Cüzdan ve SIWE Durum Ayrımı (`AppContext.jsx`, Guards, Pages)
1. **Canlı Cüzdan ve SIWE Oturumu Ayrımı:**
   - `init()` ve `handleAccountsChanged` fonksiyonlarında `account` yalnızca `window.ethereum` sağlayıcısının canlı `eth_accounts` değerine bağlandı.
   - Sunucu SIWE oturumu ise bağımsız olarak `sessionState` (`authenticated`, `walletAddress`, `csrfToken`, `loading`) altında tutuldu. Cüzdan adresi ile oturum adresi eşleşmiyorsa eski oturum güvenle temizlendi.
2. **`sessionState.loading` Desteği:**
   - `ProtectedRoute.jsx`, `OrganizerGuard.jsx`, `StudentProfile.jsx`, `OrganizerDashboardPage.jsx` ve `OrganizerEventAnalyticsPage.jsx` bileşenlerinde `sessionState.loading` süresince yükleme animasyonu gösterilerek erken "Cüzdan Bağla" flaşlaması önlendi.
3. **5 Durumun Görsel Ayrımı:**
   - `OrganizerGuard`:
     - Oturum yüklenirken -> Yükleme göstergesi
     - Cüzdan yokken -> "Organizatör Cüzdan Bağlantısı Gerekli"
     - Yanlış ağdayken -> "Monad Testnet (10143) Ağına Geçin"
     - SIWE yokken -> "SIWE ile Giriş Yapın" butonu
     - Etkinlik başkasına aitse -> "403 Forbidden"
4. **Kimlik Temizliği (Cross-Wallet Leakage Protection):**
   - `handleLogout` ve `handleDisconnectWallet` fonksiyonlarında `unreadNotificationCount = 0` ve `liveNotification = null` sıfırlanarak SSE akışının bağlantısı koparıldı; cüzdan değişiminde bildirim sızıntısı engellendi.

---

## 3.5 SIWE Oturum Açma Regresyonu — Kök Neden, HTTP İzleme ve Düzeltme

### A. Belirti (Symptom)
Manuel test sırasında `/organizer` koruma ekranındaki **"SIWE ile Giriş Yap"** butonuna tıklandığında (veya doğrudan `ensureSiweSession` tetiklendiğinde) MetaMask imza penceresi açılmıyor veya SIWE oturumu aktif hale gelmiyordu.

### B. Uçtan Uca SIWE HTTP ve İstemci İzlemesi (Exact Trace)
1. **Sunucu Tarafı (Backend API & PostgreSQL Doğrulaması):**
   - `GET http://localhost:3001/api/auth/nonce?walletAddress=0x...`
     - **Durum Kodu:** `200 OK`
     - **Yanıt Gövdesi:** `{"success":true,"data":{"nonce":"...","domain":"localhost:5173","uri":"http://localhost:5173","chainId":10143,"issuedAt":"...","expiresAt":"..."}}`
   - `POST http://localhost:3001/api/auth/verify`
     - **Durum Kodu:** `200 OK`
     - **Set-Cookie Başlığı:** `campuspass_session=<64-hex-token>; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax` (`secure: false` development ortamında)
     - **CORS Başlıkları:** `Access-Control-Allow-Origin: http://localhost:5173`, `Access-Control-Allow-Credentials: true`
     - **Yanıt Gövdesi:** `{"success":true,"data":{"authenticated":true,"walletAddress":"0x...","chainId":10143,"csrfToken":"...","expiresAt":"..."}}`
   - `GET http://localhost:3001/api/auth/session` (Cookie ile)
     - **Durum Kodu:** `200 OK`
     - **Yanıt Gövdesi:** `{"success":true,"data":{"authenticated":true,"walletAddress":"0x...","chainId":10143,"csrfToken":"...","expiresAt":"..."}}`

2. **İstemci Tarafı Kesin Kök Nedenler (Exact Root Causes):**
   - **Kök Neden 1 (`OrganizerGuard.jsx` -> `handleSiweLogin` -> `ensureSiweSession` Signer Parametresi Kirliliği):**
     - `375998b` commit'inde `src/components/guards/OrganizerGuard.jsx` içine eklenen `<button onClick={handleSiweLogin}>` ifadesi, butona tıklandığında React'in `SyntheticBaseEvent` nesnesini (`{ _reactName: "onClick", type: "click", ... }`) `handleSiweLogin(customSigner = null)` fonksiyonuna birinci parametre (`customSigner`) olarak geçiriyordu.
     - `AppContext.jsx` içindeki `if (!signer && ...)` ve `src/utils/apiClient.js` içindeki `if (!effectiveSigner && ...)` kontrollerinde `SyntheticBaseEvent` nesnesi `truthy` olduğu için `new ethers.BrowserProvider(window.ethereum).getSigner()` çağrısı **tamamen atlanıyordu**.
     - `GET /api/auth/session` (`200 OK`) ve `GET /api/auth/nonce` (`200 OK`) tamamlandıktan hemen sonra `src/utils/apiClient.js:348` satırındaki `await effectiveSigner.signMessage(siweMessage)` çağrısı **`TypeError: effectiveSigner.signMessage is not a function`** hatası fırlatıyordu. Bu nedenle MetaMask imza penceresi hiç açılmıyor ve `POST /api/auth/verify` isteği hiç gönderilemiyordu.
   - **Kök Neden 2 (Aynı Sekme İçi `sessionState` Senkronizasyon Eksikliği):**
     - `ensureSiweSession` doğrudan sayfa bileşenlerinden (`AccountSettingsPage`, `OrganizerDashboardPage`, `StudentProfile` vb.) çağrıldığında `broadcastAuthEvent("LOGIN", ...)` yalnızca `window.localStorage.setItem(...)` çalıştırıyordu.
     - Web Storage standardı gereği `"storage"` olayı yalnızca **diğer sekmelerde** tetiklenir, aynı sekmede tetiklenmez. Bu yüzden `AppContext.jsx` içindeki `sessionState.authenticated` aynı sekmede `false` kalabiliyordu.

### C. Uygulanan Düzeltmeler
1. **`isValidSiweSigner` Doğrulaması (`src/utils/apiClient.js` & `src/context/AppContext.jsx`):**
   - Bir nesnenin geçerli bir Ethers `Signer` olup olmadığı `Boolean(candidate && typeof candidate.signMessage === "function")` ile kontrol edildi. React `SyntheticBaseEvent` veya DOM `Event` nesneleri kesin olarak reddedilip `BrowserProvider(window.ethereum).getSigner()` üzerinden gerçek cüzdan imzacısı alındı.
2. **`OrganizerGuard.jsx` ve `Navbar.jsx` SIWE Tetikleyici Sertleştirmesi:**
   - `OrganizerGuard.jsx` içinde `onClick={onTriggerSiwe}` sarmalayıcısı ile `await handleSiweLogin()` parametresiz çağrıldı; işlem süresince `"İmzalanıyor..."` durumu ve olası hata mesajı (`siweError`) kullanıcıya görünür kılındı.
   - `Navbar.jsx` içindeki hızlı SIWE giriş butonuna da açık hata geri bildirimi (`siweError`) eklendi.
3. **Aynı Sekme + Sekmeler Arası Oturum Senkronizasyonu (`broadcastAuthEvent` & `AppContext.jsx`):**
   - `broadcastAuthEvent` fonksiyonu `localStorage.setItem` yanında aynı sekmede `window.dispatchEvent(new CustomEvent(AUTH_STORAGE_EVENT_KEY, { detail: eventData }))` yayınlayacak şekilde güncellendi; `AppContext.jsx` her iki olayı da dinleyerek `sessionState`'i anında günceller hale getirildi.

---

## 4. Değiştirilen Dosyalar

1. `src/data/events.js`
   - `callWithRetry` eklendi.
   - `getReadOnlyProvider` (`staticNetwork: true`) ve `getReadOnlyContract` önbelleklendi.
   - `parseBlockchainError` hata öncelikleri düzeltildi.
2. `src/utils/apiClient.js`
   - `isValidSiweSigner` eklendi ve `ensureSiweSession` içinde React `SyntheticBaseEvent` / geçersiz signer koruması uygulandı.
   - `broadcastAuthEvent` içine aynı sekme `CustomEvent` yayını eklendi.
3. `src/context/AppContext.jsx`
   - `account` ve `sessionState` yaşam döngüleri ayrıştırıldı.
   - `handleSiweLogin` içine `isValidSiweSigner` kontrolü ve aynı sekme `AUTH_STORAGE_EVENT_KEY` dinleyicisi eklendi.
   - `loadEvents` sıralı ve `callWithRetry` korumalı hale getirildi.
   - `handleLogout` ve `handleDisconnectWallet` bildirim durumlarını sıfırlar kılındı.
4. `src/components/guards/OrganizerGuard.jsx`
   - 5 durum ayrımı uygulandı (loading, no wallet, wrong network, no SIWE, 403 forbidden).
   - SIWE giriş butonu `onTriggerSiwe` ile parametresiz çağrılacak ve yükleme/hata durumunu gösterecek şekilde düzeltildi.
5. `src/components/Navbar.jsx`
   - Hızlı SIWE giriş akışına hata geri bildirimi (`siweError`) eklendi.
6. `src/components/guards/ProtectedRoute.jsx`
   - `sessionState.loading` koruması sağlandı.
7. `src/pages/StudentProfile.jsx`
   - `sessionState.loading` durumunda erken "Cüzdan Bağla" görünümü engellendi.
8. `src/pages/OrganizerDashboardPage.jsx`
   - `sessionState.loading` koruması eklendi.
9. `src/pages/OrganizerEventAnalyticsPage.jsx`
   - `sessionState.loading` koruması eklendi.
10. `src/pages/EventPage.jsx`
    - Tekil etkinlik ve kayıt durumu sorguları `callWithRetry` ile korundu.
11. `src/utils/studentProfile.js`
    - `callWithRetry` entegrasyonu, sıralı/kontrollü zincir sorguları ve hata korumalı log taraması uygulandı.
12. `server/.env.example`
    - Standart RPC ve kontrat yapılandırması belgelendi.
13. `test/Phase15BlockchainAndWalletFix.js`
    - Rate limit (-32011) çevirisi, `callWithRetry`, `OrganizerGuard` 5 durum ayrımı, `isValidSiweSigner`, `SyntheticBaseEvent` signer koruması ile uçtan uca SIWE oturum açma ve aynı sekme `broadcastAuthEvent` senkronizasyonunu doğrulayan 30 regresyon testi eklendi.

---

## 5. Test ve Doğrulama Çıktıları

```bash
# 1. Test Paketi (Mocha / Hardhat)
npm test
-> 186 passing (7s) (Tüm testler ve 30 adet Faz 15 regresyon testi yeşil)

# 2. Linter Denetimi
npm run lint
-> 0 error, 93 warning (0 hata)

# 3. Üretim Derlemesi (Vite Build)
npm run build
-> built in 311ms (dist/assets hatasız üretildi)

# 4. Prisma Şema Doğrulaması
npm run db:validate
-> [PRISMA VALIDATE] Başarılı! Doğrulanan modeller (13)

# 5. PostgreSQL Entegrasyon Testi
npm run test:postgres
-> 1..8 [BAŞARILI] Tüm Gerçek PostgreSQL Entegrasyon Testleri Başarıyla Tamamlandı
```

---

## 6. Kalan Manuel Doğrulama Adımları (Short Manual Test Sequence)

Otomasyon testleri eksiksiz geçmiştir. Tarayıcı ve MetaMask ortamında sırayla şu test adımları gerçekleştirilmelidir:

1. **Ana Sayfa Etkinlik Listesi:**
   - Tarayıcıda `http://localhost:5173` açılır.
   - Ana sayfadaki 3 etkinliğin ("Monad Blokzincir Hackathonu", "Web3 AI Ajanları Atölyesi", "Sıfır Bilgi İspatları Semineri") Monad Testnet'ten hatasız yüklendiği ve "sözleşme kodu bulunamadı" uyarısının çıkmadığı görülür.
2. **MetaMask Cüzdan Bağlantısı:**
   - Sağ üstteki "Cüzdanı Bağla" butonuna basılır ve MetaMask'ta Monad Testnet (10143) seçilerek bağlanılır.
   - Navbar'da cüzdan adresinin kısaltılmış hali (`0x...`) ve yeşil testnet rozeti görüntülenir.
3. **Rotalar Arası Gezinme:**
   - Navbar'dan sırasıyla `Öğrenci Paneli` (`/profile`), `Organizatör` (`/organizer`) ve bir etkinliğin detayına (`/events/1`) tıklanır.
   - Sayfalarda cüzdanın bağlı kalmaya devam ettiği, zamansız "Cüzdan Bağla" flaşlaması yaşanmadığı doğrulanır.
4. **Organizatör SIWE Girişi:**
   - `/organizer` rotasında SIWE imza butonu tıklandığında MetaMask popup'ının açıldığı, imza onaylandıktan sonra sayfa yenilenmeden dashboard verilerinin yüklendiği görülür.
5. **Cüzdan Değişimi ve Çıkış:**
   - MetaMask'tan farklı bir hesaba geçildiğinde veya "Çıkış Yap" dendiğinde bildirim sayacının sıfırlandığı ve önceki oturuma ait hiçbir verinin kalmadığı gözlemlenir.
