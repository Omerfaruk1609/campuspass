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

## 7. Doğrulama ve Test Sonuçları

| Test Paketi | Test Sayısı | Başarılı | Başarısız | Açıklama |
|---|---|---|---|---|
| **Hardhat + Mocha / Chai Regresyon Testleri** | 156 | 156 | 0 | %100 Başarı (Faz 8, 9, 10, 11, 12, 12.5, 13, 14 ve 15 testleri) |
| **Gerçek PostgreSQL Entegrasyon Testi** | 8 | 8 | 0 | Canlı PostgreSQL container'ı üzerinde CRUD, P2002 ve model doğrulama |
| **Prisma Şema Doğrulaması** | 13 Model | 13 | 0 | `prisma validate` hatasız |
| **Oxlint Kod Kalitesi** | 93 Dosya | 93 | 0 Hata | Statik analiz doğrulaması |
| **Vite Üretim Derlemesi (`npm run build`)** | 21 Çıktı | 21 | 0 | Kod bölümleme (code-splitting) hatasız (291ms) |

---

## 8. Faz 16 İçin Hazırlık

Faz 15 hedefleri eksiksiz tamamlanmış olup kod tabanı Monad Testnet ve yerel PostgreSQL üzerinde stabil çalışmaktadır. Faz 16'da etkinlik geri bildirimleri, puanlama ve değerlendirme sistemlerine geçiş için zemin hazırdır.
