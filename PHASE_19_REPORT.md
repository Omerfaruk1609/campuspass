# CampusPass — Faz 19: Topluluk ve Organizatör Operasyonları Raporu
**Tarih:** 6 Kasım 2026  
**Aktif Dal:** `feature/phase-19-community-operations`  
**Temel Dal / Önceki Commit:** `13a140f` (Phase 18.5)

---

## 1. Genel Bakış ve Amaç

CampusPass Faz 19, platformun yalnızca tekil etkinlik oluşturan bir sistemden, birden fazla etkinliği ve öğrenci topluluğunu yöneten kulüp başkanları, topluluk yöneticileri ve etkinlik organizatörleri için operasyonel bir yönetim merkezine dönüştürülmesini hedeflemiştir.

Mevcut SIWE oturumu, RBAC (OWNER/ADMIN/MEMBER), QR yoklama, katılım sertifikaları ve bildirim altyapıları korunarak; mükerrer model veya sahte kontrol oluşturulmadan genişletilmiştir.

---

## 2. Gerçekleştirilen Özellikler ve Modüller

### A. Topluluk Operasyon Merkezi (Community Operations Hub)
1. **Operasyon Merkezi Sekmesi (`hub`):**
   - Kulüp yöneticileri (`OWNER` / `ADMIN`) `/communities/:slug/manage` rotasını açtığında varsayılan olarak Operasyon Merkezi ile karşılanır.
   - **Özet Metrik Kartları:** Aktif üye sayısı, bekleyen üyelik başvuruları, topluluk etkinlikleri ve yayınlanan duyurular anlık olarak özetlenir.
   - **Hızlı Operasyon Kısayolları:** "Üyeleri Yönet", "Başvuruları İncele", "Duyuru Yayınla" ve "Etkinlikler" panellerine doğrudan tek tıkla geçiş imkanı sağlandı.
2. **Canlı Operasyonel Aktivite Akışı (`GET /api/communities/:idOrSlug/activity`):**
   - Üyelik onayları (`MEMBERSHIP_APPROVED`), başvurular (`MEMBERSHIP_REQUESTED`), red kararları (`MEMBERSHIP_REJECTED`), yayınlanan duyurular (`ANNOUNCEMENT_PUBLISHED`), QR yoklama doğrulamaları (`ATTENDANCE_VERIFIED`), verilen sertifikalar (`CERTIFICATE_ISSUED`) ve etkinlik kayıtları (`REGISTRATION`) tek bir kronolojik operasyon akışında birleştirildi.
   - Yeni veya hareketsiz topluluklar için bilgilendirici, yönlendirici boş durum (empty-state) sağlandı.
   - Aktör ve hedef kullanıcılar için profil adı (`displayName`), yoksa kısaltılmış cüzdan adresi (`shortenAddress`) gösterildi.

### B. Organizatör Etkinlik Operasyonları (Organizer Event Operations)
1. **Katılımcı Filtreleri ve Durumlar:**
   - Mevcut `ALL`, `ATTENDED`, `REGISTERED_ONLY`, `CERTIFIED` filtrelerine ek olarak:
     - `NO_SHOW`: Etkinlik bitiş saati geçmiş ancak yoklaması onaylanmamış katılımcıları filtreler.
     - `MISSING_PROFILE_NAME`: Profilinde ad-soyad girmemiş (sertifika basımı öncesi eksik profil bildirimine tabi) katılımcıları listeler.
2. **Kapasite ve Katılım Toplamları:**
   - Kalan kontenjan (`remainingCapacity`), no-show sayısı (`noShowCount`) ve profil adı eksik sayısı (`missingProfileNameCount`) anlık hesaplanarak metrik kartlarında ve filtre butonlarında gösterildi.
3. **Denetim İzi (Audit Visibility):**
   - Katılımcı tablosunda yoklamanın kim tarafından onaylandığı (`Doğrulayan: 0x...`) net bir rozetle sunuldu.
   - Sertifikası oluşturulmuş katılımcıların sertifika kimlikleri ve Explorer bağlantıları korundu.
4. **Güvenli CSV Dışa Aktarımı:**
   - Organizatör katılımcı listesini CSV olarak indirdiğinde "Yoklama Dogrulayan Cuzdan", "Sertifika Veren Cuzdan" ve "Sertifika Verilme Tarihi" sütunları dahil edildi. Verisi olmayan geçmiş kayıtlar için `"kayit yok"` varsayılanı uygulandı.
   - Client-side CSV injection (formül enjeksiyonu) ve zararlı karakter kaçışları korundu.

### C. Topluluk Üyelik İş Akışı İyileştirmeleri (Membership Polish)
1. **Reddedilen Başvuru Yönetimi:**
   - Başvurusu reddedilen öğrenciler için topluluk profilinde (`/communities/:slug`) kırmızı `"Başvurunuz Reddedildi"` bilgilendirmesi ve `"Yeniden Başvur"` aksiyon butonu sunuldu.
   - Yeniden başvuru yapıldığında üyelik kaydı `PENDING` statüsüne alınırken eski denetim bilgileri (`reviewedByWallet`, `reviewedAt`) sıfırlanarak taze değerlendirme süreci başlatıldı.
2. **Aktör Denetimi:**
   - Başvuru onaylama (`approveApplication`) ve reddetme (`rejectApplication`) işlemlerinde değerlendiren yetkilinin cüzdan adresi (`reviewedByWallet`) ve karar anı (`reviewedAt`) veritabanına kaydedildi.
   - Kulüp üyeleri listesinde kimin hangi yönetici tarafından onaylandığı bilgisi yer aldı.

### D. Organizatör Paneli Topluluk Entegrasyonu
- `/organizer` rotasındaki Organizatör Paneli'ne "Yönettiğim Topluluklar & Kulüpler" kartları eklendi.
- Organizatörün yetkili olduğu kulüpler için üye, bekleyen başvuru ve etkinlik sayaçlarıyla birlikte doğrudan topluluk yönetim merkezine (`/communities/:slug/manage`) erişim bağlantıları yerleştirildi.

---

## 3. Yeni ve Değiştirilen API Uç Noktaları

| Metot | Uç Nokta | Yetkilendirme | Açıklama |
|---|---|---|---|
| `GET` | `/api/communities/:idOrSlug/activity` | `requireAuthSession` (OWNER/ADMIN) | Topluluğa ait gerçek operasyonel aktiviteleri kronolojik olarak döner. |
| `GET` | `/api/communities/manageable` | `requireAuthSession` | Kullanıcının yönetici olduğu toplulukları KPI özetleriyle (`summary`) döner. |
| `GET` | `/api/organizer/events/:eventId/participants` | `requireAuthSession` + Organizer/Admin | `NO_SHOW` ve `MISSING_PROFILE_NAME` filtrelerini ve ek toplamları (`totals`) destekler. |
| `POST` | `/api/communities/:idOrSlug/applications/:memberId/approve` | `requireAuthSession` (OWNER/ADMIN) | Başvuruyu onaylar; `reviewedByWallet` ve `reviewedAt` atar. |
| `POST` | `/api/communities/:idOrSlug/applications/:memberId/reject` | `requireAuthSession` (OWNER/ADMIN) | Başvuruyu reddeder; `reviewedByWallet` ve `reviewedAt` atar. |
| `GET` | `/api/organizer/events/:eventId/export` | `requireAuthSession` + Organizer | Denetim izi sütunları eklenmiş CSV formatında katılımcı raporu üretir. |

---

## 4. Veri Modeli ve Şema Değişiklikleri

1. **`server/prisma/schema.prisma`:**
   - **`CommunityMember` Modeli:**
     - `reviewedByWallet String?` (Başvuruyu değerlendiren yöneticinin cüzdan adresi)
     - `reviewedAt DateTime?` (Değerlendirme zaman damgası)
   - **`IndexedAttendance` Modeli:**
     - `verifiedByWallet String?` (Yoklamayı doğrulayan organizatörün cüzdan adresi)
2. **Prisma Migration:**
   - `server/prisma/migrations/20261106000000_phase19_operational_audit/migration.sql` oluşturuldu.
   - `npm run db:validate` ile 13 Prisma modelinin tamamı hatasız doğrulandı.

---

## 5. Yetkilendirme ve Denetim (Audit) Semantiği

- **Asla İstemci Taraflı Güven Yok:** Tüm rotalar backend tarafında SIWE çerez oturumu, CSRF token ve Prisma tabanlı `requireRole` kontrolünden geçer.
- **Topluluk İzolasyonu:** Yöneticiler yalnızca `OWNER` veya `ADMIN` oldukları toplulukların başvuru, üye, aktivite ve analitik kayıtlarını görebilir.
- **Sahte Veri Yasağı:** Geçmiş kayıtlarda aktör bilgisi bulunmuyorsa `"kayıt yok"` olarak gösterilir; asla uydurma aktör üretilmez.

---

## 6. Otomasyon ve Test Sonuçları

Aşağıdaki komutlar yerel ortamda çalıştırılmış ve doğrulanmıştır:

| Komut | Sonuç | Açıklama |
|---|---|---|
| `npx hardhat test test/Phase19CommunityOperations.js` | **11 Geçti, 0 Kaldı** | Faz 19 için eklenen özel test paketi |
| `npm test` | **263 Geçti, 0 Kaldı** | Tüm sistem regresyon testi |
| `npm run lint` | **0 Hata** (145 önemsiz uyarı) | oxlint statik kod analizi |
| `npm run build` | **Başarılı (670 ms)** | Vite production bundle üretimi |
| `npm run db:validate` | **Başarılı (13 Model)** | Prisma şema doğrulaması |
| `npm run test:postgres` | **ATLANDI (localhost:5432 kapalı)** | Kurallara uygun olarak atlandı olarak raporlandı |

---

## 7. Faz 19.5 / Faz 20 İçin Ayrılan Manuel Kabul Kontrol Listesi

- [ ] Kulüp kurucusu ve yöneticisi olarak Operasyon Merkezi KPI sayaçlarının yeni başvurular geldikçe anlık güncellenmesi.
- [ ] Başvurusu reddedilen öğrenci hesabıyla giriş yapıp "Başvurunuz Reddedildi" rozetini ve "Yeniden Başvur" akışını tarayıcıda canlı test etme.
- [ ] Organizatör olarak bir etkinlik için CSV indirip Excel / LibreOffice üzerinde UTF-8 Türkçe karakterlerin ve denetim sütunlarının doğruluğunu teyit etme.
- [ ] Tamamlanmış bir etkinlikte `NO_SHOW` filtresine tıklayarak yoklamaya katılmayan öğrencilerin hatasız filtrelenmesini gözlemleme.
- [ ] Mobil ekranda (375px genişlik) Operasyon Merkezi kısayol butonlarının ve aktivite akışının kayma yapmadan görüntülendiğini doğrulama.

---

## 8. Git ve Teslimat Bilgisi

- **Aktif Dal:** `feature/phase-19-community-operations`
- **Yerel Commit:** `cc5c539` (veya `cb67861`)
- **Uzak Depo:** Kurallar gereği hiçbir uzak komut (`git push`, `fetch`, `merge`, `rebase`, `deploy`) çalıştırılmamıştır. Tüm değişiklikler yerel dalda tutulmaktadır.
