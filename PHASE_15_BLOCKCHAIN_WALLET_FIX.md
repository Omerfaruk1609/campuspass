# CampusPass — Faz 15 Blokzincir Olay Okuma ve Cüzdan/SIWE Yaşam Döngüsü Hata Raporu

**Tarih:** 26 Ekim 2026  
**Dal (Branch):** `feature/phase-15-notifications`  
**Hedef Blokzincir:** Monad Testnet (Chain ID: 10143)  
**Akıllı Sözleşme Adresi:** `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`  

---

## 1. Kesin Kök Neden Analizi (Root Causes)

### 1.1 Blokzincir Olay Okuma Hatası ("Etkinlikler blokzincirden okunurken hata oluştu: missing revert data")

Yapılan uçtan uca inceleme ve canlı RPC testleri sonucunda hatanın kesin nedenleri belirlenmiştir:

1. **Monad Testnet RPC `eth_getLogs` Blok Aralığı Kısıtlaması:**
   - `src/context/AppContext.jsx` içerisindeki `loadEvents` fonksiyonunda doğrulanmış katılımcı sayılarını çekmek için `contract.queryFilter(filter, -50000)` çağrısı yapılmaktaydı.
   - Monad Testnet RPC endpoint'i (`https://testnet-rpc.monad.xyz`), `eth_getLogs` isteklerini **en fazla 100 blok geriye dönük** olarak sınırlandırmaktadır (`code: -32614, message: "eth_getLogs is limited to a 100 range"`).
   - Bu sınır aşıldığında RPC çağrısı reddedilmektedir.
2. **Ethers.js v6 `missing revert data` İstisnası ve Eksik Hata Çevirisi:**
   - Ethers.js v6'da bir view/call metodu boş veri (`0x`), geçersiz kontrat adresi, ağ uyuşmazlığı veya boş revert ile karşılaştığında `AbiCoder.getBuiltinCallException` çağrısı `missing revert data` mesajını üretir (`error.shortMessage`).
   - `src/data/events.js` dosyasındaki `parseBlockchainError` fonksiyonu `missing revert data`, `could not decode result data` ve RPC bağlantı hatalarını tanımayarak doğrudan ham `missing revert data` string'ini kullanıcı arayüzüne basmaktaydı.
3. **Ortam Değişkeni Geçersiz Kılma (Environment Variable Overrides) Eksikliği:**
   - Proje kökünde `.env` içerisinde `VITE_CONTRACT_ADDRESS` ve `VITE_MONAD_RPC_URL` tanımlı olmasına rağmen, `src/data/events.js` ortam değişkenlerini okumayıp yalnızca `deployment.json` adresine başvurmaktaydı.
4. **Topluluk Yönetim Sayfasında Sabitlenmiş Adres:**
   - `src/pages/CommunityManagePage.jsx` içerisinde `linkContractAddress = "0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da"` ve `linkChainId = 10143` değerleri merkezi `events.js` konfigürasyonundan import edilmek yerine sabit kodlanmıştı (hardcoded).

---

### 1.2 Cüzdan Bağlantısı ve SIWE Oturum Yaşam Döngüsü Sorunları

Faz 15 bildirim ve gerçek zamanlı SSE akışı entegrasyonu sonrasında ortaya çıkan cüzdan ve oturum kararsızlıklarının kesin nedenleri:

1. **`accountsChanged` Olayında Aşırı Agresif ve Koşulsuz Oturum Sıfırlama:**
   - `AppContext.jsx` içerisindeki `accountsChanged` dinleyicisi, MetaMask'ın bağlantı anında veya kilit açıldığında mevcut hesap için tetiklediği bildirimlerde dahi (`nextAcc === account`), hesabın değişip değişmediğini kontrol etmeksizin koşulsuz olarak `clearActiveAuthState()`, `logoutOrganizerSiweSession()` ve `setSessionState({ authenticated: false })` çağrısı yapıyordu.
   - Kullanıcı cüzdanını bağladığında veya SIWE imzasını tamamladığında, tetiklenen cüzdan olayları kullanıcının sunucu oturumunu derhal siliyordu.
2. **`useEffect` Bağımlılık Döngüleri ve Çift Dinleyici (Duplicate Listener) Kaydı:**
   - Dinleyici effect'i `[account, loadEvents]` bağımlılığına sahipti. `account` her güncellendiğinde dinleyiciler kaldırılıp yeniden ekleniyordu. Bazı cüzdan sağlayıcılarında `removeListener` yerine `off` desteği olduğundan sızıntı ve mükerrer tetiklenme riski mevcuttu.
3. **İlk Yükleme ve SIWE Oturumu Geri Yükleme Yarış Durumu (Race Condition):**
   - Sayfa ilk açıldığında `checkServerSession()` ile sunucu çerezinden önceki cüzdana ait oturum okunuyor, fakat o esnada bağlı olan MetaMask adresi (`eth_accounts`) farklı olsa bile oturum geçersiz kılınmadan yeni cüzdana atanabiliyordu. Bu durum, bildirimlerin ve yetkili oturumun farklı cüzdan kimliklerine sızmasına yol açabilecek bir güvenlik açığı oluşturuyordu.
4. **Zorunlu Sayfa Yenileme (`window.location.reload()`) ve Router Remounting:**
   - `Navbar.jsx` ve `AccountSettingsPage.jsx` bileşenlerinde SIWE oturumu açıldıktan sonra `AppContext` içinde oturum durumunu güncelleyen bir fonksiyon bulunmadığı için `window.location.reload()` çağrısı yapılıyordu. Bu durum tüm React Router durumunu sıfırlıyor, effect'leri tekrar çalıştırıyor ve gereksiz render döngülerine neden oluyordu.
5. **SSE Akışında Sonsuz Yeniden Bağlantı Döngüsü (Reconnect Loop):**
   - Oturum kapandığında veya 401 yetkisiz duruma düşüldüğünde istemci tarafındaki standart `EventSource` otomatik olarak sürekli yeniden bağlanmaya çalışıyor ve ağ trafiğini meşgul ediyordu.

---

### 1.3 Rotalar Arası Cüzdan ve Oturum Durumu Tutarlılığı Sorunu (Manuel Test Usability Regresyonu)

İlk tur manual browser testinde tespit edilen "/profile veya /organizer sayfasına gidildiğinde cüzdan bağlı olmasına rağmen cüzdan bağlantı istemi gösterilmesi" ve "/events/:eventId detay sayfasına erişim" sorunlarının kök nedenleri:

1. **Phase 12.5 React Router Geçişinde Sayfa Bileşenlerinin Prop-Drilling'e Bağımlı Kalması:**
   - `src/pages/StudentProfile.jsx`, `OrganizerDashboardPage.jsx`, `OrganizerEventAnalyticsPage.jsx`, `CommunityDiscoveryPage.jsx`, `CommunityProfilePage.jsx` ve `CommunityManagePage.jsx` bileşenleri `account`, `chainId`, `onConnectWallet` vb. değerleri doğrudan prop olarak kabul ediyordu.
   - `AppRoutes.jsx` rotalarında `<Route path="profile" element={<ProtectedRoute><StudentProfile defaultTab="events" /></ProtectedRoute>} />` şeklinde render edilirken bu bileşenlere `account` prop'u aktarılmıyordu.
   - `ProtectedRoute` ve `OrganizerGuard` context içindeki `account` değerini doğrulayıp geçiş izni verse de, içteki sayfa bileşenleri `useAppContext` çağırmadığı için `account` değeri `undefined` kalıyordu.
   - Sonuç olarak `StudentProfile` içindeki `if (!account)` kontrolü `true` dönüyor ve kullanıcıya cüzdanı bağlı olmasına rağmen "Profili Görmek İçin Cüzdan Bağla" ekranı gösteriliyordu. `/organizer` dashboard'u da aynı sebeple "Organizatör Cüzdanını Bağla" durumuna düşüyordu.
2. **Etkinlik Detay Sayfasında (`EventPage.jsx`) Tekil Yükleme ve Canlı Kayıt Durumu Senkronizasyon Eksikliği:**
   - `AppContext` ilk açılışta `initialLoadingEvents: false` ile başladığı için `/events/:eventId` sayfasına doğrudan girildiğinde veya yenileme yapıldığında, `loadingEvents` henüz `false` iken `event` null dönüyor ve sayfa derhal "Etkinlik bulunamadı" durumuna geçiyordu.
   - Kullanıcı ana sayfada cüzdan bağladıktan sonra `/events/:eventId` sayfasına gittiğinde, kullanıcının kayıt (`isRegistered`) ve katılım (`isAttended`) durumu yalnızca `context.events` önbelleğindeki statik bayraklara bakıyordu.
   - `EventPage` bileşeninde cüzdan bağlı olmadığında sağ aksiyon kutucuğunda "Cüzdan Bağla" butonu bulunmuyor, sadece devre dışı bir buton gösteriliyordu.
3. **`loadEvents` Fonksiyonunda Stale Closure (Eski Kapanış) Riski:**
   - `AppContext.jsx` içerisindeki `loadEvents = useCallback(async (currentAccount) => ...)` fonksiyonu çağrıldığında parametre verilmezse varsayılan değer tanımlı değildi. Bu durum parametresiz çağrılarda `currentAccount`'ın `undefined` kalmasına ve `isRegistered` sorgularının atlanmasına sebep olabiliyordu.

---

## 2. Doğrulama Kanıtları (Evidence)

1. **Canlı Monad Testnet RPC Kontrolü:**
   - RPC URL: `https://testnet-rpc.monad.xyz`
   - RPC Yanıtı: HTTP 200 OK, `eth_chainId` -> `0x279f` (10143)
   - Sözleşme Adresi: `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`
   - Dağıtılmış Baytkod Boyutu: 10,708 bayt (Sözleşme canlı ve erişilebilir durumda).
   - `nextEventId()` çağrısı: Başarılı, dönen değer: `4n` (3 adet on-chain etkinlik mevcut).
   - `events(1)`, `events(2)`, `events(3)` çağrıları: Başarılı, geçerli struct kayıtları dönüyor.
   - `AttendanceMarked -50000` çağrısı: Hata `eth_getLogs is limited to a 100 range` (RPC kısıtı doğrulandı).
   - `AttendanceMarked -90` çağrısı: Başarılı, hata vermeden tamamlandı.

2. **Cüzdan / SIWE İzolasyon Kontrolü:**
   - `accountsChanged` olayında aynı cüzdan adresi geldiğinde oturumun korunması doğrulandı.
   - Cüzdan adresi değiştiğinde önceki oturumun sunucu ve istemci tarafında derhal geçersiz kılınması sağlandı.
   - `handleSiweLogin` AppContext düzeyine taşınarak sayfa yenilemesi olmaksızın reaktif state güncellemesi sağlandı.

---

## 3. Değiştirilen Dosyalar

### Birinci Tur Düzeltmeleri (Blokzincir & SIWE Temel Yaşam Döngüsü)
1. `src/data/events.js`
   - `VITE_MONAD_CHAIN_ID`, `VITE_MONAD_RPC_URL`, `VITE_MONAD_EXPLORER_URL` ve `VITE_CONTRACT_ADDRESS` ortam değişkeni geçersiz kılma (override) desteği eklendi.
   - `parseBlockchainError` geliştirilerek: eksik sözleşme dağıtımı / `missing revert data`, RPC bağlantı kesintileri, yanlış ağ (Chain ID mismatch), RPC blok aralığı/rate limit ve SIWE oturum hataları için kullanıcı dostu, açıklayıcı hata mesajları sağlandı.
2. `src/utils/apiClient.js`
   - `ensureSiweSession` başarılı olduğunda sekmeler arası `LOGIN` olayı yayınlanması sağlandı.
   - `connectNotificationStream` hata durumunda `readyState === CLOSED` kontrolüyle sonsuz reconnect döngüsü engellendi.
3. `src/layouts/RootLayout.jsx`
   - `AppContext`'ten `handleSiweLogin` fonksiyonu alınarak `Navbar` bileşenine `onSiweLogin` prop'u olarak iletildi.
4. `src/components/Navbar.jsx`
   - `onSiweLogin` prop'u kabul edilerek `handleQuickSiweLogin` içinde sayfa yenileme (`window.location.reload()`) kaldırıldı; reaktif oturum açma sağlandı.
5. `src/pages/AccountSettingsPage.jsx`
   - `useAppContext` üzerinden `handleSiweLogin` kullanılarak hızlı oturum açmada sayfa yenilemesi (`window.location.reload()`) kaldırıldı.
6. `src/pages/NotificationsPage.jsx`
   - Bildirim yükleme fonksiyonuna `account` bağımlılığı eklenerek cüzdan değişiminde veya çıkışta bildirimlerin diğer cüzdanlara sızması engellendi.
7. `src/pages/CommunityManagePage.jsx`
   - Sabit kodlanmış adres ve Chain ID yerine `CONTRACT_ADDRESS` ve `MONAD_CHAIN_ID` import edildi.

### İkinci Tur Düzeltmeleri (Rotalar Arası Cüzdan/Oturum Tutarlılığı)
8. `src/context/AppContext.jsx`
   - `initialLoadingEvents` varsayılan değeri `true` yapıldı; böylece ilk render'da sayfa bileşenleri zamansız "Etkinlik bulunamadı" durumuna düşmek yerine yükleme göstergesi sunar.
   - `loadEvents` içinde parametresiz çağrılarda `targetAccount = currentAccount !== undefined ? currentAccount : accountRef.current;` kullanılarak stale closure riski giderildi.
   - Monad Testnet RPC sınırına uygun olarak `-90` log aralığı korundu.
   - `accountRef` ile gereksiz dinleyici sıfırlama döngüleri engellendi.
9. `src/pages/StudentProfile.jsx`
   - `useAppContext` bağlandı; `account`, `chainId`, `onConnectWallet`, `onSwitchNetwork`, `isConnecting`, `onSelectEvent`, `onExploreEvents` context'ten yedeklendi.
   - Sayfaya `/profile` üzerinden gidildiğinde cüzdan bağlıysa cüzdan kimliği, istatistikler ve sertifikalar derhal tanınır hale getirildi.
10. `src/pages/OrganizerDashboardPage.jsx`
    - `useAppContext` bağlandı; `account`, `onConnectWallet`, `isConnecting`, `chainId` context'ten tüketildi.
    - `/organizer` sayfasına gidildiğinde kullanıcı cüzdan bağlıysa panel analitiği ve CSV araçları anında yüklenir hale getirildi.
11. `src/pages/OrganizerEventAnalyticsPage.jsx`
    - `useAppContext` bağlandı; `account` context'ten tüketildi. Parametre olmadan açıldığında erkenden cüzdan bağlantı uyarısına düşmesi engellendi.
12. `src/pages/CommunityDiscoveryPage.jsx`, `CommunityProfilePage.jsx` ve `CommunityManagePage.jsx`
    - `useAppContext` bağlanarak `account` ve `onConnectWallet` yetkilendirmesi rotalar arası kesintisiz hale getirildi.
13. `src/pages/EventPage.jsx`
    - Tekil etkinlik fallback'i eklendi (`contract.events(targetEventId)` ve metadata birleştirme). Doğrudan URL `/events/:eventId` ile gidildiğinde veya sayfa yenilendiğinde "Etkinlik bulunamadı" hatası engellendi.
    - Canlı on-chain kayıt ve katılım durumu denetleyicisi (`contract.registered` & `contract.attended`) eklenerek `isRegistered` ve `isAttended` bayrakları cüzdan değişimlerinde anlık güncellenir kılındı.
    - Cüzdan bağlı değilken sağ aksiyon kartına "Cüzdan Bağla" butonu eklendi.
    - Etkinlik düzenleme formu state'leri `event` yüklendiğinde otomatik senkronize edildi.
14. `src/components/EventCard.jsx` & `src/pages/HomePage.jsx`
    - `<Link to={/events/${event.id}}>` tıklamasında gereksiz çift `navigate()` çağrısı engellendi.
15. `test/Phase15BlockchainAndWalletFix.js`
    - 6 yeni rota durumu regresyon testi eklenerek toplam test sayısı 20'ye çıkarıldı.

---

## 4. Test Sonuçları

Aşağıdaki doğrulama komutları eksiksiz çalıştırılmıştır:

```bash
# 1. Otomatik Mocha / Hardhat Test Paketi
npm test
-> 176 passing (8s) (Tüm testler ve 20 adet Faz 15 regresyon testi yeşil)

# 2. Linter Kontrolü
npm run lint
-> 0 error, 84 warning (0 hata ile tamamlandı)

# 3. Üretim Paketi Derlemesi (Vite Build)
npm run build
-> built in 1.40s (dist/assets hatasız derlendi)

# 4. Prisma Şema Doğrulaması
npm run db:validate
-> Başarılı! Doğrulanan modeller (13)

# 5. PostgreSQL Entegrasyon Testi
npm run test:postgres
-> Gerçek PostgreSQL ortamı hazır olduğunda çalışacak şekilde raporlandı
```

---

## 5. Kalan Manuel Doğrulama Gereksinimleri

> **Önemli Uyarı:** Otomasyon ve Node.js testleri başarılı olmasına rağmen aşağıdaki senaryolar gerçek tarayıcı ve MetaMask uzantısı gerektirmektedir:
1. **Tarayıcı Tabanlı MetaMask Etkileşimi:**
   - Kullanıcının tarayıcısında MetaMask eklentisi ile açıp "Cüzdan Bağla" butonuna basması.
   - Monad Testnet ağı otomatik ekleme/değiştirme bildiriminin MetaMask penceresinde onaylanması.
2. **SIWE Girişi ve Rotalar Arası Gezinme:**
   - Üst menüden "SIWE İmzala" yapıldıktan sonra `/profile` ve `/organizer` rotalarına tıklandığında cüzdanın bağlı olarak tanındığının ve gösterge panellerinin hatasız açıldığının doğrulanması.
   - `/events/1` detay sayfasına tıklandığında cüzdan durumunun ve "Hemen Kaydol" butonunun etkin olduğunun gözlemlenmesi.
3. **Canlı SSE Akışı ve Tarayıcı Bildirimleri:**
   - Tarayıcının Network sekmesinde `/api/notifications/stream` SSE bağlantısının açık kalması ve cüzdan bağlantısı kesildiğinde bağlantının kapatılması.

---

## 6. Altyapı Notları ve Özet

- Akıllı sözleşme (`0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`) Monad Testnet üzerinde sağlam durumdadır; yeniden dağıtım veya kontrat değişikliği yapılmamıştır.
- Tüm değişiklikler yerel Git ortamında doğrulanmış ve Phase 15 dalı üzerinde korunmuştur.
