import { expect } from "chai";
import {
  filterAndSortEvents,
  mergeOnChainEventWithMetadata,
} from "../src/utils/eventMetadata.js";
import {
  escapeIcsText,
  formatIcsDateTimeUtc,
  generateEventIcs,
} from "../src/utils/calendarIcs.js";
import { eventsQuerySchema } from "../server/src/utils/validation.js";

describe("Phase 18: Event Discovery, URL State Sync & Planning Helpers", function () {
  const mockEvents = [
    {
      id: 1,
      title: "Monad Akıllı Sözleşme Atölyesi",
      capacity: 50,
      registeredCount: 50, // DOLU
      active: true,
      organizer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      community: "Blockchain & Web3 Topluluğu",
      category: "Blockchain",
      date: "2026-11-20",
      startTime: "14:00",
      endTime: "16:00",
      startAt: "2026-11-20T14:00:00+03:00",
      endAt: "2026-11-20T16:00:00+03:00",
      registrationDeadline: "2026-11-20T12:00:00+03:00",
      location: {
        campus: "Merkez Kampüs",
        building: "Mühendislik Fakültesi",
        room: "Amfi 1",
      },
      status: "upcoming",
      statusLabel: "Yaklaşan",
      cancelled: false,
    },
    {
      id: 2,
      title: "Yapay Zeka & LLM Hackathonu",
      capacity: 100,
      registeredCount: 35, // 65 BOŞ KONTENJAN
      active: true,
      organizer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      community: "Yapay Zeka ve Veri Kulübü",
      category: "Yapay Zeka",
      date: "2026-11-15",
      startTime: "10:00",
      endTime: "18:00",
      startAt: "2026-11-15T10:00:00+03:00",
      endAt: "2026-11-15T18:00:00+03:00",
      registrationDeadline: "2026-11-15T09:00:00+03:00",
      location: {
        campus: "Kuzey Kampüs",
        building: "Teknokent",
        room: "Kuluçka Merkezi",
      },
      status: "upcoming",
      statusLabel: "Yaklaşan",
      cancelled: false,
    },
    {
      id: 3,
      title: "Girişimcilik ve Finans Semineri",
      capacity: 30,
      registeredCount: 28, // 2 BOŞ KONTENJAN (Son Kontenjanlar)
      active: true,
      organizer: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      community: "Girişimcilik Kulübü",
      category: "Kariyer",
      date: "2026-11-25",
      startTime: "15:00",
      endTime: "17:00",
      startAt: "2026-11-25T15:00:00+03:00",
      endAt: "2026-11-25T17:00:00+03:00",
      registrationDeadline: "2026-11-25T14:00:00+03:00",
      location: {
        campus: "Merkez Kampüs",
        building: "İktisadi İdari Bilimler",
        room: "Konferans Salonu",
      },
      status: "upcoming",
      statusLabel: "Yaklaşan",
      cancelled: false,
    },
    {
      id: 4,
      title: "Tarihi Kampüs Buluşması (Geçmiş)",
      capacity: 40,
      registeredCount: 30,
      active: false,
      organizer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      community: "Sosyal Etkinlik Kulübü",
      category: "Sosyal",
      date: "2026-10-10",
      startTime: "13:00",
      endTime: "15:00",
      startAt: "2026-10-10T13:00:00+03:00",
      endAt: "2026-10-10T15:00:00+03:00",
      registrationDeadline: "2026-10-10T12:00:00+03:00",
      location: {
        campus: "Güney Kampüs",
        building: "Kültür Merkezi",
        room: "Salon A",
      },
      status: "completed",
      statusLabel: "Tamamlandı",
      cancelled: false,
    },
    {
      id: 5,
      title: "İptal Edilen Mobil Uygulama Atölyesi",
      capacity: 25,
      registeredCount: 5,
      active: false,
      organizer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      community: "Yazılım Geliştirme Topluluğu",
      category: "Yazılım",
      date: "2026-11-22",
      startTime: "11:00",
      endTime: "13:00",
      startAt: "2026-11-22T11:00:00+03:00",
      endAt: "2026-11-22T13:00:00+03:00",
      registrationDeadline: "2026-11-22T10:00:00+03:00",
      location: {
        campus: "Merkez Kampüs",
        building: "Mühendislik Fakültesi",
        room: "Lab 3",
      },
      status: "cancelled",
      statusLabel: "İptal Edildi",
      cancelled: true,
      cancelReason: "Hava muhalefeti sebebiyle ertelendi.",
    },
  ];

  describe("1. Arama ve Filtreleme Motoru", function () {
    it("Türkçe karakter duyarlı başlık araması yapabilmeli", function () {
      const results = filterAndSortEvents(mockEvents, {
        searchQuery: "akıllı sözleşme",
      });
      expect(results).to.have.lengthOf(1);
      expect(results[0].id).to.equal(1);
      expect(results[0].title).to.include("Akıllı Sözleşme");
    });

    it("Büyük/küçük harf ve İ/i dönüşümlerinde doğru eşleşmeli", function () {
      const resultsUpper = filterAndSortEvents(mockEvents, {
        searchQuery: "GİRİŞİMCİLİK",
      });
      expect(resultsUpper).to.have.lengthOf(1);
      expect(resultsUpper[0].id).to.equal(3);

      const resultsLower = filterAndSortEvents(mockEvents, {
        searchQuery: "girişimcilik",
      });
      expect(resultsLower).to.have.lengthOf(1);
      expect(resultsLower[0].id).to.equal(3);
    });

    it("Düzenleyen topluluk ismine göre arama yapabilmeli", function () {
      const results = filterAndSortEvents(mockEvents, {
        searchQuery: "Veri Kulübü",
      });
      expect(results).to.have.lengthOf(1);
      expect(results[0].community).to.equal("Yapay Zeka ve Veri Kulübü");
    });

    it("Kategori filtresi doğru çalışmalı", function () {
      const results = filterAndSortEvents(mockEvents, {
        category: "Blockchain",
      });
      expect(results).to.have.lengthOf(1);
      expect(results[0].category).to.equal("Blockchain");
    });

    it("Kontenjan durumu filtresi: AVAILABLE yalnızca yeri olan ve aktif etkinlikleri getirmeli", function () {
      const results = filterAndSortEvents(mockEvents, {
        availability: "AVAILABLE",
      });
      const ids = results.map((e) => e.id);
      // id 1 dolu (50/50), id 4 completed, id 5 cancelled
      // Geriye id 2 (35/100) ve id 3 (28/30) kalmalı
      expect(ids).to.include.members([2, 3]);
      expect(ids).to.not.include(1);
      expect(ids).to.not.include(4);
      expect(ids).to.not.include(5);
    });

    it("Kontenjan durumu filtresi: FULL yalnızca dolan etkinlikleri getirmeli", function () {
      const results = filterAndSortEvents(mockEvents, {
        availability: "FULL",
      });
      expect(results).to.have.lengthOf(1);
      expect(results[0].id).to.equal(1);
      expect(results[0].registeredCount).to.equal(results[0].capacity);
    });

    it("Tarih aralığı (dateFrom & dateTo) filtresi doğru çalışmalı", function () {
      // 2026-11-14 ile 2026-11-21 arasındaki etkinlikler: id 1 (2026-11-20), id 2 (2026-11-15)
      const results = filterAndSortEvents(mockEvents, {
        dateFrom: "2026-11-14",
        dateTo: "2026-11-21",
      });
      const ids = results.map((e) => e.id);
      expect(ids).to.include.members([1, 2]);
      expect(ids).to.not.include(3); // 2026-11-25
      expect(ids).to.not.include(4); // 2026-10-10
    });

    it("Durum filtresi: UPCOMING, PAST, CANCELLED seçenekleri doğru ayrıştırmalı", function () {
      const upcoming = filterAndSortEvents(mockEvents, { timeFilter: "UPCOMING" });
      const past = filterAndSortEvents(mockEvents, { timeFilter: "PAST" });
      const cancelled = filterAndSortEvents(mockEvents, { timeFilter: "CANCELLED" });

      expect(upcoming.every((e) => e.status === "upcoming" || e.status === "ongoing")).to.be.true;
      expect(past.every((e) => e.status === "completed")).to.be.true;
      expect(cancelled.every((e) => e.status === "cancelled")).to.be.true;
    });
  });

  describe("2. Sıralama (Sort) Algoritması", function () {
    it("DATE_ASC (En yakın tarih önce) sıralaması doğru çalışmalı", function () {
      const sorted = filterAndSortEvents(mockEvents, { sortBy: "DATE_ASC" });
      for (let i = 0; i < sorted.length - 1; i++) {
        const t1 = Date.parse(sorted[i].startAt);
        const t2 = Date.parse(sorted[i + 1].startAt);
        expect(t1).to.be.at.most(t2);
      }
    });

    it("DATE_DESC (En uzak tarih önce) sıralaması doğru çalışmalı", function () {
      const sorted = filterAndSortEvents(mockEvents, { sortBy: "DATE_DESC" });
      for (let i = 0; i < sorted.length - 1; i++) {
        const t1 = Date.parse(sorted[i].startAt);
        const t2 = Date.parse(sorted[i + 1].startAt);
        expect(t1).to.be.at.least(t2);
      }
    });

    it("REMAINING_DESC (En çok boş kontenjan önce) sıralaması doğru çalışmalı", function () {
      const sorted = filterAndSortEvents(mockEvents, { sortBy: "REMAINING_DESC" });
      const first = sorted[0];
      // id 2: 100 - 35 = 65 boş yer (en yüksek)
      expect(first.id).to.equal(2);
      expect(first.capacity - first.registeredCount).to.equal(65);
    });

    it("FILL_DESC (Doluluk oranı yüksek önce) sıralaması doğru çalışmalı", function () {
      const sorted = filterAndSortEvents(mockEvents, { sortBy: "FILL_DESC" });
      const first = sorted[0];
      // id 1: 50/50 = %100 doluluk
      expect(first.id).to.equal(1);
      expect(first.registeredCount / first.capacity).to.equal(1);
    });

    it("CAPACITY_DESC (En büyük kapasite önce) sıralaması doğru çalışmalı", function () {
      const sorted = filterAndSortEvents(mockEvents, { sortBy: "CAPACITY_DESC" });
      expect(sorted[0].capacity).to.equal(100); // id 2
      expect(sorted[1].capacity).to.equal(50);  // id 1
    });
  });

  describe("3. Sunucu Tarafı Query Doğrulama ve Sınırlandırma (eventsQuerySchema)", function () {
    it("Geçerli arama ve filtre parametrelerini varsayılanlarla doğrulamalı", function () {
      const parsed = eventsQuerySchema.parse({
        search: "solidity",
        availability: "AVAILABLE",
        sortBy: "UPCOMING_ASC",
      });

      expect(parsed.search).to.equal("solidity");
      expect(parsed.availability).to.equal("AVAILABLE");
      expect(parsed.sortBy).to.equal("UPCOMING_ASC");
      expect(parsed.page).to.equal(1);
      expect(parsed.limit).to.equal(20);
      expect(parsed.status).to.equal("ALL");
      expect(parsed.category).to.equal("ALL");
    });

    it("Sayfalama sınırını (limit) 100 ile sınırlamalı", function () {
      expect(() => {
        eventsQuerySchema.parse({ limit: 500 });
      }).to.throw();
    });

    it("Geçersiz availability veya sortBy değerini reddetmeli", function () {
      expect(() => {
        eventsQuerySchema.parse({ availability: "HACK_ATTEMPT" });
      }).to.throw();

      expect(() => {
        eventsQuerySchema.parse({ sortBy: "INJECTION_ATTEMPT" });
      }).to.throw();
    });

    it("Maksimum arama metni uzunluğunu (200 karakter) aşan istekleri reddetmeli", function () {
      const longStr = "a".repeat(250);
      expect(() => {
        eventsQuerySchema.parse({ search: longStr });
      }).to.throw();
    });
  });

  describe("4. Planlama Araçları: iCalendar (.ics) Üretimi ve Gizlilik Denetimi", function () {
    const testEvent = {
      id: 42,
      title: "Monad & EVM Geliştirici Zirvesi, Amfi Konferansı; Özel!",
      description: "Blokzincir üzerinde akıllı sözleşme güvenliği, denetim ve ölçeklenebilirlik.\nYeni sürüm notları.",
      community: "Blockchain Kulübü",
      category: "Blockchain",
      startAt: "2026-11-20T14:00:00+03:00",
      endAt: "2026-11-20T17:00:00+03:00",
      location: {
        campus: "Merkez Kampüs",
        building: "Mühendislik Fakültesi",
        room: "B-204",
      },
      cancelled: false,
      organizer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    };

    it("RFC 5545 standartlarına uygun VCALENDAR ve VEVENT blokları üretmeli", function () {
      const ics = generateEventIcs(testEvent, { origin: "https://campuspass.edu" });

      expect(ics).to.include("BEGIN:VCALENDAR\r\n");
      expect(ics).to.include("VERSION:2.0\r\n");
      expect(ics).to.include("PRODID:-//CampusPass//Event Discovery Calendar//TR\r\n");
      expect(ics).to.include("BEGIN:VEVENT\r\n");
      expect(ics).to.include("UID:campuspass-event-42@campuspass.edu\r\n");
      expect(ics).to.include("END:VEVENT\r\n");
      expect(ics).to.include("END:VCALENDAR\r\n");
    });

    it("Türkiye saatini (Europe/Istanbul) UTC'ye doğru çevirmeli", function () {
      // 2026-11-20T14:00:00+03:00 -> UTC'de 11:00:00Z olmalı
      const startUtc = formatIcsDateTimeUtc("2026-11-20T14:00:00+03:00");
      expect(startUtc).to.equal("20261120T110000Z");

      // 2026-11-20T17:00:00+03:00 -> UTC'de 14:00:00Z olmalı
      const endUtc = formatIcsDateTimeUtc("2026-11-20T17:00:00+03:00");
      expect(endUtc).to.equal("20261120T140000Z");
    });

    it("RFC 5545 metin kaçış kurallarını (virgül, noktalı virgül, satır sonu) doğru uygulamalı", function () {
      const rawText = "Merhaba, Dünya; Yeni\nSatır\\TersBölü";
      const escaped = escapeIcsText(rawText);
      expect(escaped).to.equal("Merhaba\\, Dünya\\; Yeni\\nSatır\\\\TersBölü");
    });

    it("Güvenlik & Gizlilik Sınırı: .ics çıktısında ASLA hassas cüzdan veya öğrenci verisi yer almamalı", function () {
      const eventWithPrivateFields = {
        ...testEvent,
        studentWallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        studentName: "Gizli Katılımcı",
        qrSignature: "0x123456789abcdef",
        sessionToken: "secret_cookie_token_abc",
      };

      const ics = generateEventIcs(eventWithPrivateFields);

      // Cüzdan adresleri ve gizli veriler takvim dosyasında bulunmamalı
      expect(ics).to.not.include("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
      expect(ics).to.not.include("Gizli Katılımcı");
      expect(ics).to.not.include("0x123456789abcdef");
      expect(ics).to.not.include("secret_cookie_token_abc");
    });

    it("İptal edilen etkinliklerde STATUS:CANCELLED olarak işaretlemeli", function () {
      const cancelledEvent = {
        ...testEvent,
        cancelled: true,
        status: "cancelled",
      };
      const ics = generateEventIcs(cancelledEvent);
      expect(ics).to.include("STATUS:CANCELLED\r\n");
    });
  });

  describe("5. Kontenjan ve Canlı Durum Netliği", function () {
    it("mergeOnChainEventWithMetadata remainingCapacity, isFull ve fillPercent alanlarını hesaplamalı", function () {
      const onChain = {
        id: 10,
        title: "Test Atölyesi",
        capacity: 100,
        registeredCount: 80,
        active: true,
        organizer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      };

      const merged = mergeOnChainEventWithMetadata(onChain);
      expect(merged.remainingCapacity).to.equal(20);
      expect(merged.isFull).to.be.false;
      expect(merged.fillPercent).to.equal(80);
    });

    it("Kapasite dolduğunda isFull true ve remainingCapacity 0 olmalı", function () {
      const onChain = {
        id: 11,
        title: "Dolu Atölye",
        capacity: 50,
        registeredCount: 50,
        active: true,
        organizer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      };

      const merged = mergeOnChainEventWithMetadata(onChain);
      expect(merged.remainingCapacity).to.equal(0);
      expect(merged.isFull).to.be.true;
      expect(merged.fillPercent).to.equal(100);
    });
  });
});
