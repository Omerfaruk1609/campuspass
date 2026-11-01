# CampusPass — Faz 15: Bildirim Merkezi, Topluluk İletişimi ve Gerçek Zamanlı Güncellemeler Raporu

**Tarih:** 25 Ekim 2026  
**Dal (Branch):** `feature/phase-15-notifications`  
**Ağ:** Monad Testnet (Chain ID `10143`)  
**Akıllı Sözleşme:** `0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da`  

---

## 1. Yönetici Özeti ve Amaç

CampusPass Faz 15 kapsamında; üniversite etkinlik ve topluluk ekosisteminde kullanıcı etkileşimini, anlık bilgilendirmeyi ve organizatör-öğrenci iletişimini sağlayan **Kalıcı Bildirim Merkezi**, **Server-Sent Events (SSE) Gerçek Zamanlı Akış Mimarisi**, **Kategori Bazlı Bildirim Tercihleri** ve **Topluluk/Etkinlik Duyuru Yayınlama (Broadcast)** altyapısı başarıyla geliştirilmiş ve tüm güvenlik/entegrasyon kontrollerinden geçirilmiştir.

---

## 2. Mimari ve Veritabanı Modelleri

PostgreSQL 16 ve Prisma ORM 6 üzerinde 3 yeni veri modeli tanımlanmış ve `20261025180000_phase15_notifications` migrasyonu ile veritabanına uygulanmıştır:

### 2.1. `Notification` Modeli
* `id` (UUIDv4)
* `recipientWallet` (Küçük harfe normalize edilmiş cüzdan adresi, indeksli)
* `type` (12 farklı bildirim türü: `EVENT_REGISTRATION_CONFIRMED`, `EVENT_CANCELLED`, `COMMUNITY_ANNOUNCEMENT`, vb.)
* `title` (Maks. 120 karakter)
* `message` (Maks. 500 karakter)
* `destinationUrl` (Sterilize edilmiş iç yönlendirme bağlantısı)
* `read` (Boolean, varsayılan `false`)
* `readAt` (Tarih damgası)
* `dedupKey` (İdempotency anahtarı, mükerrer bildirim önleyici)
* `metadata` (JSON string ek bağlam verileri)
* `createdAt` (Tarih damgası)

### 2.2. `Announcement` Modeli
* `id` (UUIDv4)
* `targetType` (`COMMUNITY` veya `EVENT`)
* `communityId` / `eventId` (İlgili hedef kimliği)
* `authorWallet` (Duyuruyu yayınlayan yetkili cüzdan adresi)
* `title` ve `content` (XSS temizlenmiş duyuru başlığı ve metni)
* `recipientCount` (Duyurunun iletildiği toplam kullanıcı sayısı)
* `createdAt` (Tarih damgası)

### 2.3. `NotificationPreference` Modeli
* `id` (UUIDv4)
* `walletAddress` (Benzersiz `@unique` indeks)
* `eventUpdates` (Varsayılan `true`)
* `community` (Varsayılan `true`)
* `announcements` (Varsayılan `true`)
* `certificates` (Varsayılan `true`)
* `updatedAt` (Tarih damgası)

---

## 3. Gerçek Zamanlı Dağıtım: Server-Sent Events (SSE)

* **Uç Nokta:** `GET /api/notifications/stream`
* **Protokol:** HTTP/1.1 `text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
* **Güvenlik:** EIP-4361 SIWE oturum doğrulaması zorunludur. Oturumu olmayan istemciler anında `401 SESSION_REQUIRED` ile reddedilir.
* **Olaylar:**
  * `connected`: Bağlantı kurulduğunda istemciye iletilen karşılama olayı (`{ status: "connected", walletAddress, timestamp }`)
  * `notification`: Kullanıcıya yeni bir bildirim düştüğünde anında fırlatılan bildirim yükü
  * `keep-alive`: Bağlantının canlı kalmasını sağlayan 25 saniyelik SSE yorum satırı pingleri
* **İstemci Yaşam Döngüsü:** Ön yüzde `AppContext` üzerinden cüzdan oturumu açıldığında otomatik bağlanır, sekme kapandığında veya çıkış yapıldığında kaynak tüketimi olmaksızın bağlantıyı sonlandırır.

---

## 4. Güvenlik ve İzolasyon Önlemleri

1. **Kullanıcı İzolasyonu:** Hiçbir kullanıcı başka bir cüzdana ait bildirimleri okuyamaz, okundu olarak işaretleyemez veya silemez (`404 NOT_FOUND / Yetkisiz`).
2. **CSRF Koruması:** `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`, `DELETE /api/notifications/:id` gibi durum değiştiren isteklerde `X-CSRF-Token` başlığı doğrulanır.
3. **Open Redirect Önlemi:** `sanitizeDestinationUrl()` yardımcısıyla yalnızca iç rotalar (`/events/...`, `/communities/...`, `/profile...`) kabul edilir; `http://`, `https://`, `//` veya `javascript:` protokolleri sterilize edilir.
4. **DedupKey İdempotency:** Kısa süre içinde aynı olaya ait mükerrer bildirimlerin (örneğin birden fazla tıklama) üretilmesi `dedupKey` kontrolüyle engellenir.
5. **Duyuru RBAC Koruması:**
   * Topluluk duyurusu yayınlayabilmek için kullanıcının toplulukta `OWNER` veya `ADMIN` rolüne sahip olması zorunludur (`403 FORBIDDEN`).
   * Etkinlik duyurusu yayınlayabilmek için cüzdanın Monad Testnet üzerindeki akıllı sözleşmede ilgili etkinliğin organizatörü olduğu canlı RPC sorgusu ile doğrulanır (`403 FORBIDDEN`).

---

## 5. Otomatik Yaşam Döngüsü Bildirim Tetikleyicileri

* `EVENT_REGISTRATION_CONFIRMED`: Katılımcı etkinliğe kaydolduğunda
* `EVENT_CANCELLED`: Organizatör etkinliği iptal ettiğinde tüm kayıtlı katılımcılara gerekçesiyle birlikte
* `COMMUNITY_JOIN_REQUEST`: Yeni bir üye topluluğa başvurduğunda
* `COMMUNITY_MEMBERSHIP_APPROVED`: Başvuru onaylandığında öğrenciye
* `COMMUNITY_MEMBERSHIP_REJECTED`: Başvuru reddedildiğinde öğrenciye
* `COMMUNITY_ROLE_CHANGED`: Üye rolü (örn. ADMIN) güncellendiğinde ilgili üyeye
* `CERTIFICATE_ISSUED`: Katılım sertifikası üretildiğinde

---

## 6. Ön Yüz Entegrasyonu ve Kullanıcı Deneyimi

1. **Bildirim Merkezi (`/notifications`):**
   * Tümü / Okunmamış sekme filtreleri
   * Tek tıkla "Tümünü Okundu İşaretle" aksiyonu
   * Bildirim kartı üzerinden doğrudan etkinliğe/topluluğa yönlenme
   * Bildirim silme ve okunma durumu anlık görsel geri bildirimi
2. **Navbar Bildirim Göstergesi:**
   * Dinamik çan simgesi ve okunmamış bildirim sayacı rozeti (Badge)
   * Açılır bildirim menüsü ve tam bildirim merkezine doğrudan bağlantı
3. **Hesap Ayarları (`/settings`):**
   * "Bildirim Tercihleri" 4. sekme olarak entegre edildi.
   * Etkinlik Güncellemeleri, Topluluk Bildirimleri, Organizatör Duyuruları ve Sertifika Bildirimleri bağımsız toggle butonları ile yönetilir.
4. **Topluluk ve Organizatör Duyuru Arayüzü:**
   * Topluluk Yönetim Sayfası (`/communities/:slug/manage`) "Duyurular" sekmesi
   * Organizatör Etkinlik Analitik Sayfası (`/organizer/events/:eventId`) "Katılımcılara Duyuru Gönder" kartı

---

## 7. Faz 15 Manuel Test Bulguları ve İş Akışı Düzeltmeleri (1 Kasım 2026 Güncellemesi)

SIWE oturum açma akışının manuel olarak doğrulanmasının ardından tespit edilen 5 iş akışı ve güvenlik bulgusu mevcut `feature/phase-15-notifications` dalı üzerinde giderilmiştir:

### 7.1. Organizatör Paneli `onCreateEventClick is not defined` Çalışma Zamanı Hatası
* **Kök Neden:** `src/pages/OrganizerDashboardPage.jsx` bileşeninde önceki refaktör sırasında `handleCreate` ve `handleSelectEvent` tanımlandığı halde JSX içinde 4 noktada tanımsız `onCreateEventClick` ve `onSelectEvent` referansları bırakılmıştı. Benzer şekilde `src/pages/OrganizerEventAnalyticsPage.jsx` içinde `handleBack` tanımlı olduğu halde `onBack` referansı kalmıştı.
* **Düzeltme:** `const onCreateEventClick = props.onCreateEventClick || handleCreate;`, `const onSelectEvent = props.onSelectEvent || handleSelectEvent;` ve `const onBack = handleBack;` bağlamaları eklendi; `handleCreate` aksiyonunun `/events?create=1` rotasına yönlendirerek oluşturma formunu otomatik açması sağlandı.

### 7.2. Organizatör Topluluk Seçimi ve Sunucu Yetkilendirmesi
* **Kontrollü Seçim:** `src/pages/HomePage.jsx` ve `src/pages/EventPage.jsx` içindeki serbest metin (`<input type="text">`) topluluk alanı kaldırılarak kullanıcının yalnızca yetkili olduğu kayıtlı toplulukları listeleyen kontrollü `<select>` bileşenine dönüştürüldü (`GET /api/communities/manageable`).
* **Yetki Kuralları:** Yalnızca `status === "ACTIVE"` olan bir toplulukta `ACTIVE` üyeliğe ve `OWNER` (Kurucu) veya `ADMIN` (Yönetici) rolüne sahip cüzdanlar o topluluk adına etkinlik oluşturabilir veya güncelleyebilir.
* **Sunucu Doğrulaması:** `server/src/services/eventService.js` içindeki `resolveAndAuthorizeEventCommunity` fonksiyonu gönderilen `communityId` ve SIWE oturum cüzdanının yetkisini doğrular; istemcinin gönderdiği topluluk adını dikkate almayarak doğrudan veritabanındaki resmi topluluk adını yazar (`403 COMMUNITY_UNAUTHORIZED`, `404 COMMUNITY_NOT_FOUND`, `400 COMMUNITY_SELECTION_REQUIRED`).

### 7.3. Öğrenci Paneli (`StudentProfile`) Kayıt Görünürlüğü ve İzolasyon
* **Kök Neden:** `StudentProfile.jsx` yalnızca tarayıcı RPC üzerinden `fetchStudentProfileData` çağırıyor ve bu fonksiyon Monad Testnet'in 100 blokluk `eth_getLogs` sınırını aşan 5.000 blokluk tarama yaptığı için kayıt okumasına geçemeden hata alıyordu; ayrıca backend indeks uç noktası (`GET /api/students/:walletAddress/events`) sorgulanmıyordu.
* **Düzeltme:** `src/utils/studentProfile.js` içinde `queryContractEventsChunked` varsayılanı 90 bloğa düşürüldü ve log taraması yalnızca `contract.registered` ile kayıtlı etkinlik bulunduktan sonra çalışacak şekilde yeniden sıralandı. `StudentProfile.jsx` hem backend API (`fetchStudentEventsFromBackend`) hem de canlı zincir verisini birleştirerek kayıt durumu, katılım durumu ve sertifika durumunu cüzdan bazında tam izole şekilde gösterir hale getirildi. Kayıt sonrası anlık indeks senkronizasyonu için `POST /api/events/:eventId/registrations/sync` eklendi.

### 7.4. Katılım QR Güvenliği ve Self-Scan Engeli
* **Arayüz Ayrımı:** `src/pages/EventPage.jsx` içinde öğrenci QR üretim paneli yalnızca organizatör olmayan kayıtlı öğrencilere (`!isOrganizer && isRegistered && !isAttended`), QR tarama ve doğrulama paneli ise yalnızca organizatöre (`isOrganizer`) gösterilir.
* **İstemci & Sunucu Koruması:** `src/utils/qrVerification.js` ve `POST /api/events/:eventId/attendance/verify` uç noktası; doğrulayıcının SIWE kimliğini, etkinlik organizatörü veya topluluk `OWNER`/`ADMIN` yetkisini (`403 ATTENDANCE_VERIFIER_UNAUTHORIZED`), kendi QR kodunu okutma girişimini (`verifier === participant` veya `participant === event.organizer` -> `403 SELF_ATTENDANCE_FORBIDDEN`), farklı etkinlik QR kodlarını (`400 QR_CROSS_EVENT_REJECTED`), süresi dolmuş/manipüle edilmiş TTL değerlerini (`400 QR_EXPIRED_OR_INVALID_TTL`) ve tek kullanımlık nonce tekrarını (`409 QR_NONCE_REPLAY_DETECTED`) reddeder.
* **Durum Ayrımı:** Doğrulama sonucunda `"Kayıt Durumu (registrationExists)"` ile `"Katılım Durumu (attendanceVerified)"` açıkça ayrıştırılmıştır.

### 7.5. Katılım Doğrulaması Sonrası Sertifika Üretimi, Alıcı Kimliği Snapshot ve Bildirim
* **Yetki ve Koşul:** `server/src/services/certificateService.js` yalnızca blokzincir/indeks üzerinde katılımı doğrulanmış (`AttendanceMarked`) katılımcılar için sertifika üretir (`403 ATTENDANCE_NOT_VERIFIED_ONCHAIN`). Sertifika hem katılımcı öğrenci tarafından hem de yetkili organizatör/topluluk yöneticisi tarafından (`OrganizerEventAnalyticsPage` üzerindeki `"🎓 Sertifika Ver"` aksiyonu ile) üretilebilir; mükerrer üretim idempotent olarak engellenir (`200 OK`, `created: false`).
* **Sunucu Güvenliğinde Profil Tam Adı Snapshotting (Final Polish):** Sertifika üzerindeki alıcı ismi ASLA sadece istek gövdesinden (request body) gelen veriye dayandırılmaz; katılımcının sunucu tarafında doğrulanmış `StudentProfile.displayName` kaydı sorgulanarak sertifika oluşturulduğu anda `AttendanceCertificate.displayName` alanına mühürlenir (snapshot). Öğrencinin sonradan profil adını değiştirmesi, önceden düzenlenmiş sertifikadaki resmi adı sessizce değiştiremez (Snapshot Immutability).
* **Birincil Alıcı Sunumu & Cüzdan Bağı:** SVG ve PDF sertifikalarında birincil alıcı olarak doğrulanmış profil tam adı büyük ve prestijli puntoyla (`SERTİFİKA SAHİBİ / DOĞRULANMIŞ KATILIMCI`) sunulur; katılımcı cüzdan adresi ise altta zincir üstü bağlayıcı kimlik (`Doğrulanmış Cüzdan Kimliği`) olarak gösterilir. Ham cüzdan adresi artık birincil görsel alıcı kimliği olarak kullanılmaz.
* **İsim Eksikliği & Sahte İsim Engeli:** Profilde geçerli tam ad yoksa hiçbir sahte isim uydurulmaz (do not fabricate one); onaylanmış ürün kuralları uyarınca cüzdan adresi deliberate fallback olarak saklanır veya arayüzden tetiklenen `requireProfileName` ile `400 PROFILE_NAME_REQUIRED` dönülerek kullanıcı Hesap Ayarları'na yönlendirilir.
* **Bildirim:** Yeni sertifika üretildiğinde Faz 15 bildirim servisi üzerinden katılımcıya otomatik `CERTIFICATE_ISSUED` bildirimi iletilir.

---

## 8. Doğrulama ve Test Sonuçları

| Test Paketi | Test Sayısı | Başarılı | Başarısız | Açıklama |
|---|---|---|---|---|
| **Hardhat + Mocha / Chai Regresyon Testleri** | 207 | 207 | 0 | %100 Başarı (Faz 8–15 + 8 yeni Alıcı Kimliği Snapshot regresyon testi) |
| **Gerçek PostgreSQL Entegrasyon Testi** | 8 | 8 | 0 | Canlı PostgreSQL container'ı üzerinde CRUD, P2002 ve model doğrulama |
| **Prisma Şema Doğrulaması** | 13 Model | 13 | 0 | `prisma validate` hatasız |
| **Oxlint Kod Kalitesi** | 93+ Dosya | Tümü | 0 Hata | Statik analiz doğrulaması |
| **Vite Üretim Derlemesi (`npm run build`)** | 21 Çıktı | 21 | 0 | Kod bölümleme (code-splitting) hatasız |

---

## 9. Faz 16 İçin Hazırlık

Faz 15 hedefleri, manuel test düzeltmeleri ve Final Polish (Sertifika Alıcı Kimliği Snapshot ve Doğrulanmış Profil Tam Adı Sunumu) eksiksiz tamamlanmış olup kod tabanı Monad Testnet ve yerel PostgreSQL üzerinde stabil çalışmaktadır. Faz 16'ya geçilmemiştir.
