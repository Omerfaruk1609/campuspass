# CampusPass — 3–5 Dakikalık Hackathon Jüri Sunum ve Demo Rehberi

Bu belge, **CampusPass** platformunun Monad Testnet (`Chain ID: 10143`), PostgreSQL ve SIWE altyapısı üzerinde uçtan uca yeteneklerini **3–5 dakika** içinde jüriye sergilemek için hazırlanmış adım adım sunum akışıdır.

---

## Hazırlık (Demo Öncesi 30 Saniye)

1. **Servislerin Açık Olduğunu Doğrulayın:**
   - PostgreSQL (`campuspass-pg`), Backend (`http://localhost:3001`) ve Frontend (`http://localhost:5173`) çalışır durumda olmalıdır.
   - Sağlık kontrolü: `http://localhost:3001/api/health` (`status: "healthy"`, `mode: "postgresql-prisma"`).
2. **İki Cüzdan Hesabı Hazırlayın (MetaMask — Monad Testnet `10143`):**
   - **Hesap A (Organizatör / Kulüp Başkanı):** Topluluk kuracak, etkinliği yayınlayacak, QR yoklama alacak ve sertifika basacak hesap.
   - **Hesap B (Öğrenci):** Topluluğa başvuracak, etkinliğe kaydolacak, imzalı QR bilet üretecek ve sertifikasını indirecek hesap.

---

## Adım Adım Sunum Akışı (3–5 Dakika)

### Bölüm 1: Kimlik Doğrulama (SIWE) ve Topluluk Operasyon Merkezi (0:00 – 1:00)
- **Aktör:** **Hesap A (Kulüp Başkanı)**
- **Eylem:**
  1. `http://localhost:5173` adresinde cüzdanı bağlayın ve **SIWE ile Giriş Yap** butonuna tıklayarak EIP-4361 mesajını imzalayın.
  2. `/communities` sayfasına gidip yeni bir kulüp oluşturun (ör. *"Monad Blockchain Topluluğu"*) ve `/communities/:slug/manage` yönetim merkezine geçin.
  3. Varsayılan olarak açılan **Operasyon Merkezi (`hub`)** sekmesindeki KPI sayaçlarını ve kısayolları gösterin.
- **Bu Adım Neyi Kanıtlar?**
  - Parolasız, tek kullanımlık atomik nonce ve `HttpOnly` çerez + CSRF korumalı gerçek SIWE oturumunu.
  - Topluluk kurucusuna otomatik `OWNER` rolü atanmasını ve RBAC korumalı yönetim merkezini.

---

### Bölüm 2: Cüzdan İzolasyonu, Öğrenci Profili ve Üyelik Başvurusu (1:00 – 2:00)
- **Aktör:** **Hesap B (Öğrenci)** -> **Hesap A (Kulüp Başkanı)**
- **Eylem:**
  1. MetaMask'ta **Hesap B**'ye geçin. Üst menüde Hesap A oturumunun anında sıfırlandığını vurgulayın.
  2. Hesap B ile SIWE girişi yapın, `/settings` sayfasından **Ad Soyad** bilginizi (ör. *"Zeynep Kaya"*) kaydedin.
  3. Topluluk sayfasına (`/communities/:slug`) gidip **Topluluğa Katıl** butonuna tıklayın (`Başvurun Değerlendiriliyor ⏳` rozetini gösterin).
  4. **Hesap A**'ya geçip Topluluk Yönetim Merkezi -> **Başvurular** sekmesinden başvuruyu onaylayın (veya önce reddedip Hesap B'de `"Başvurunuz Reddedildi"` + `"Yeniden Başvur"` döngüsünü gösterip ardından onaylayın).
  5. **Operasyon Merkezi** sekmesinde `"Zeynep Kaya üye olarak onaylandı (Değerlendiren: ...)"` denetim kaydını gösterin.
- **Bu Adım Neyi Kanıtlar?**
  - Cüzdan değişiminde sıfır veri sızıntısı (Zero Cross-Wallet Leakage) garantisini.
  - Başvuru onay/red kararlarının kim tarafından ve ne zaman verildiğinin (`reviewedByWallet`, `reviewedAt`) denetim iziyle kaydedildiğini.

---

### Bölüm 3: Etkinlik Oluşturma, Keşif Filtreleri ve `.ics` Takvim İhracı (2:00 – 3:00)
- **Aktör:** **Hesap A (Organizatör)** -> **Hesap B (Öğrenci)**
- **Eylem:**
  1. **Hesap A** ile `/events?create=1` ekranından yalnızca yetkili olduğunuz topluluğu (`<select>`) seçerek Monad Testnet üzerinde yeni bir etkinlik oluşturun.
  2. **Hesap B**'ye geçin. Bildirim zilinde üyelik onay bildirimini gösterin.
  3. `/events` keşif sayfasında arama, kategori ve kontenjan filtrelerini kullanın; URL parametrelerinin (`?q=...&availability=AVAILABLE`) anlık güncellendiğini gösterin.
  4. Etkinlik detay sayfasına (`/events/:eventId`) girip **Takvime Ekle (.ics)** butonunu ve blokzincir üzerinden **Etkinliğe Kaydol (`registerForEvent`)** işlemini çalıştırın.
- **Bu Adım Neyi Kanıtlar?**
  - Serbest metin topluluk sahteciliğinin engellendiğini (yalnızca `OWNER`/`ADMIN` olunan topluluk adına etkinlik açılabilir).
  - Kişisel veri sızdırmayan RFC 5545 `.ics` üretimini ve zincir üstü kayıt senkronizasyonunu.

---

### Bölüm 4: İmzalı QR Bilet, Yoklama Doğrulama ve Denetim İzi (3:00 – 4:00)
- **Aktör:** **Hesap B (Öğrenci)** -> **Hesap A (Organizatör)**
- **Eylem:**
  1. **Hesap B** etkinlik sayfasında yalnızca kendi **EIP-191 İmzalı QR Biletini** görür (doğrulama kutusu öğrenciye görünmez). İmzalı QR verisini kopyalayın.
  2. **Hesap A**'ya geçin. Etkinlik sayfasındaki organizatör panelinden QR verisini doğrulayın ve zincir üstü yoklamayı (`markAttendance`) onaylayın.
  3. `/organizer/events/:eventId/analytics` sayfasına geçin:
     - Katılımcı tablosunda öğrencinin profil adının (*"Zeynep Kaya"*), `Doğrulandı ✓` rozetinin ve `Doğrulayan: 0x...` denetim bilgisinin göründüğünü gösterin.
     - `Katılmadı / No-show` ve `Profil Adı Eksik` filtre haplarını ve **CSV İndir** çıktısındaki denetim sütunlarını gösterin.
- **Bu Adım Neyi Kanıtlar?**
  - Öğrencinin kendi QR kodunu okutamamasını (**self-scan engeli**), 180 sn TTL ve tek kullanımlık nonce (**replay engeli**) korumasını.
  - Yoklamayı kimin doğruladığının (`verifiedByWallet`) hem tabloda hem CSV raporunda kayıt altına alındığını.

---

### Bölüm 5: Mühürlü Dijital Sertifika (`CP-CERT-V1`) ve 4 Katmanlı Doğrulama (4:00 – 5:00)
- **Aktör:** **Hesap A (Organizatör)** -> **Hesap B (Öğrenci)**
- **Eylem:**
  1. **Hesap A** katılımcı tablosunda **🎓 Sertifika Ver** butonuna tıklayarak sertifikayı oluşturur.
  2. **Hesap B**'ye geçin: Bildirim merkezine düşen `"Sertifikanız Hazır"` bildirimine tıklayın veya `/profile/certificates` sayfasına gidin.
  3. Yatay A4 **PDF Sertifikasını** indirin (üzerinde öğrencinin doğrulanmış tam adının büyük puntoyla mühürlendiğini gösterin).
  4. `/verify/:certificateId` sayfasını açın (cüzdan bağlantısı gerekmez) ve **4 katmanlı doğrulamanın** (Veritabanı Kaydı, SHA-256 + HMAC Bütünlük Mühürü, İndekslenmiş Katılım Logu, Canlı Monad Sözleşmesi) tamamının yeşil (`DOĞRULANDI`) olduğunu gösterin.
  5. Son olarak tarayıcı genişliğini `375px` (mobil) boyutuna küçülterek duyarlı Navbar çekmecesini gösterip sunumu tamamlayın.
- **Bu Adım Neyi Kanıtlar?**
  - Doğrulanmış yoklama olmadan sertifika üretilemeyeceğini, profil adının sertifikaya değişmez (*snapshot*) olarak mühürlendiğini ve üçüncü taraflarca bağımsız doğrulanabildiğini.

---

## Yedek Plan (Canlı Testnet / RPC Geçici Kesinti Senaryosu — Fallback Path)

Canlı sunum sırasında Monad Testnet genel RPC uç noktasında (`https://testnet-rpc.monad.xyz`) anlık gecikme veya hız sınırı (`-32011 rate limit`) yaşanırsa:

1. **İndekslenmiş Veritabanı Görünümleri:**
   - Organizatör Paneli (`/organizer`), Etkinlik Analitiği (`/organizer/events/:id/analytics`), Topluluk Operasyon Merkezi (`/communities/:slug/manage`) ve Öğrenci Profili (`/profile`) verilerini PostgreSQL indeks tablolarından (`EventMetadata`, `IndexedRegistration`, `IndexedAttendance`, `AttendanceCertificate`) okuduğu için RPC yavaşlasa dahi arayüz kesintisiz çalışmaya devam eder.
2. **Sertifika Doğrulama Graceful Degradation (`UNVERIFIABLE_NOW`):**
   - RPC tamamen erişilemez olduğunda `/verify/:certificateId` sayfası geçerli bir sertifikayı yanlışlıkla *"Geçersiz"* olarak işaretlemez; ilk 3 katmanı (Veritabanı + Kriptografik Mühür + İndekslenmiş Log) doğrular ve 4. katman için `"Doğrulama şu anda yapılamıyor (UNVERIFIABLE_NOW)"` durumunu şeffaf biçimde raporlar.
3. **Yerel Otomatik Kanıt Paketi:**
   - Jüriye terminalden `npm test` (Hardhat yerel EVM üzerinde 263 uçtan uca test, ~17 saniye) ve `npm run test:postgres` (gerçek PostgreSQL üzerinde 9 entegrasyon adımı) çalıştırılarak tüm akıllı sözleşme ve API akışları dış ağdan bağımsız olarak canlı kanıtlanabilir.
