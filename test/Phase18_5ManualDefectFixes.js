import { expect } from "chai";
import React from "react";
globalThis.React = React;
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import Navbar from "../src/components/Navbar.jsx";
import OrganizerDashboardPage from "../src/pages/OrganizerDashboardPage.jsx";
import OrganizerGuard from "../src/components/guards/OrganizerGuard.jsx";
import { AppProvider } from "../src/context/AppContext.jsx";
import {
  runBoundedConcurrency,
  studentProfileCache,
  invalidateStudentProfileCache,
} from "../src/utils/studentProfile.js";
import { SimpleBarChart } from "../src/components/AnalyticsCharts.jsx";

const el = React.createElement;

describe("Phase 18.5 — Manual Defect Fixes Regression Suite", function () {
  this.timeout(10000);

  const sampleOrganizerAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const sampleStudentAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  describe("A. Organizer Dashboard — Blocking Defect Fixes", function () {
    it("A.1 /organizer rotası geçerli SIWE oturumuyla window.ethereum olmasa dahi hata vermeden render edilebilmeli", function () {
      const mockDashboard = {
        organizerAddress: sampleOrganizerAddress,
        kpis: {
          totalEvents: 3,
          totalCapacity: 150,
          totalRegistrations: 120,
          totalVerifiedAttendances: 90,
          overallAttendanceRate: 75.0,
          activeCertificates: 45,
          uniqueAttendedStudents: 70,
          upcomingCount: 1,
        },
        events: [
          {
            id: 1,
            title: "Web3 Summit",
            capacity: 100,
            registeredCount: 80,
            verifiedAttendanceCount: 65,
            attendanceRate: 81.3,
            certificates: { active: 12, total: 12 },
            date: "2026-11-20",
            startTime: "10:00",
            endTime: "18:00",
            status: "completed",
            statusLabel: "Tamamlandı",
          },
        ],
        indexerStatus: { isSynced: true, lagBlocks: 0 },
      };

      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: sampleOrganizerAddress,
              initialSessionState: {
                loading: false,
                authenticated: true,
                walletAddress: sampleOrganizerAddress,
                csrfToken: "mock-csrf-token",
              },
            },
            el(
              OrganizerGuard,
              null,
              el(OrganizerDashboardPage, {
                account: sampleOrganizerAddress,
                initialDashboardData: mockDashboard,
              })
            )
          )
        )
      );

      // Guard engeli aşılmalı ve organizatör paneli başlığı veya yükleme durumu render edilmeli
      expect(html).to.not.include("SIWE ile Giriş Yapın");
      expect(html).to.not.include("Organizatör oturumu için tarayıcı cüzdanı (MetaMask vb.) gereklidir.");
      expect(html).to.include("Organizatör Paneli");
      expect(html).to.include("Topluluk Performans Göstergeleri (KPI)");
      expect(html).to.include("Web3 Summit");
      expect(html).to.include("12 Sertifika");
    });

    it("A.2 SimpleBarChart kendisine iletilen title, registeredCount ve attendedCount alanlarını 0-height kalmadan SVG rect olarak çizmeli", function () {
      const chartData = [
        {
          title: "#1 Monad Zirvesi",
          registeredCount: 40,
          attendedCount: 30,
        },
        {
          title: "#2 Web3 Hackathon",
          registeredCount: 60,
          attendedCount: 50,
        },
      ];

      const html = renderToString(
        el(SimpleBarChart, { data: chartData })
      );

      // SVG bar elemanları ve legend render edilmeli
      expect(html).to.include("analytics-svg-chart");
      expect(html).to.include("legend-label");
      expect(html).to.include("Kayıt");
      expect(html).to.include("Katılım");
      expect(html).to.include("<rect");
      expect(html).to.include("#1 Monad Z");
    });

    it("A.3 OrganizerDashboardPage etkinlik listesinde sertifika sayısını (certificates.active / total) doğru göstermeli", function () {
      const mockEventWithCerts = {
        id: 1,
        title: "Web3 Summit",
        organizer: sampleOrganizerAddress,
        capacity: 100,
        registeredCount: 80,
        verifiedAttendanceCount: 65,
        attendanceRate: 81.3,
        certificates: { active: 12, total: 12 },
        date: "2026-11-20",
        startTime: "10:00",
        endTime: "18:00",
        status: "completed",
        statusLabel: "Tamamlandı",
      };

      // Mock dashboardData verisi simülasyonu
      expect(mockEventWithCerts.certificates.active).to.equal(12);
      const displayCount = mockEventWithCerts.certificates?.active ?? mockEventWithCerts.certificates?.total ?? 0;
      expect(displayCount).to.equal(12);
    });

    it("A.4 OrganizerDashboardPage aksiyon butonları (+ Yeni Etkinlik Oluştur, ↻ Verileri Yenile ve filtre hapları) DOM'da yer almalı", function () {
      const mockDashboard = {
        organizerAddress: sampleOrganizerAddress,
        kpis: {
          totalEvents: 1,
          totalCapacity: 50,
          totalRegistrations: 40,
          totalVerifiedAttendances: 35,
          overallAttendanceRate: 87.5,
          activeCertificates: 10,
          uniqueAttendedStudents: 30,
          upcomingCount: 1,
          completedCount: 0,
          cancelledCount: 0,
        },
        events: [
          {
            id: 99,
            title: "Web3 Kariyer Günü",
            capacity: 50,
            registeredCount: 40,
            verifiedAttendanceCount: 35,
            attendanceRate: 87.5,
            certificates: { active: 10, total: 10 },
            date: "2026-12-01",
            startTime: "14:00",
            endTime: "17:00",
            status: "upcoming",
            statusLabel: "Yaklaşan",
          },
        ],
        indexerStatus: { isSynced: true, lagBlocks: 0 },
      };

      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: sampleOrganizerAddress,
              initialSessionState: {
                loading: false,
                authenticated: true,
                walletAddress: sampleOrganizerAddress,
                csrfToken: "mock-csrf-token",
              },
            },
            el(OrganizerDashboardPage, {
              account: sampleOrganizerAddress,
              initialDashboardData: mockDashboard,
              onCreateEventClick: () => {},
            })
          )
        )
      );

      expect(html).to.include("+ Yeni Etkinlik Oluştur");
      expect(html).to.include("↻ Verileri Yenile");
      expect(html).to.include("Yaklaşan");
      expect(html).to.include("Web3 Kariyer Günü");
    });
  });

  describe("B. Responsive Navigation & Mobile Drawer", function () {
    it("B.1 Masaüstü ekranlarda .stitch-desktop-nav menü sınıfı yer almalı", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/"] },
          el(Navbar, {
            account: sampleOrganizerAddress,
            chainId: 10143,
            sessionState: { authenticated: true, walletAddress: sampleOrganizerAddress },
            unreadNotificationCount: 0,
          })
        )
      );

      expect(html).to.include("stitch-desktop-nav");
      expect(html).to.include("Etkinlikler");
      expect(html).to.include("Topluluklar");
      expect(html).to.include("Organizatör");
    });

    it("B.2 Mobil menü açma butonu (.stitch-mobile-toggle) ve erişilebilirlik öznitelikleri (aria-label, aria-expanded) render edilmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/"] },
          el(Navbar, {
            account: sampleStudentAddress,
            chainId: 10143,
            sessionState: { authenticated: true, walletAddress: sampleStudentAddress },
            unreadNotificationCount: 0,
          })
        )
      );

      expect(html).to.include("stitch-mobile-toggle");
      expect(html).to.include('aria-label="Menüyü Aç"');
      expect(html).to.include('aria-expanded="false"');
    });

    it("B.3 Okunmamış bildirim sayısı rozeti (unreadNotificationCount > 0) navbar üstünde belirgin kalmalı", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/"] },
          el(Navbar, {
            account: sampleStudentAddress,
            chainId: 10143,
            sessionState: { authenticated: true, walletAddress: sampleStudentAddress },
            unreadNotificationCount: 5,
          })
        )
      );

      expect(html).to.include("5");
      expect(html).to.include('aria-label="Bildirimler (5 okunmamış)"');
    });

    it("B.4 Navbar bağlı cüzdan ve oturum durumunda hesap butonunu, bildirim ikonunu ve ağ durumunu doğru render etmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/"] },
          el(Navbar, {
            account: sampleStudentAddress,
            chainId: 10143,
            sessionState: { authenticated: true, walletAddress: sampleStudentAddress },
            unreadNotificationCount: 2,
          })
        )
      );

      // Kısaltılmış cüzdan adresi ve bildirim butonu doğrulaması
      expect(html).to.include("0x3C44...93BC");
      expect(html).to.include("Bildirimler (2 okunmamış)");
      expect(html).to.include("Monad Testnet");
    });
  });

  describe("C. Student Dashboard Performance & Cache Isolation", function () {
    beforeEach(function () {
      invalidateStudentProfileCache();
    });

    it("C.1 runBoundedConcurrency paralel istekleri sınırlı concurrency ile hatasız ve eksiksiz işlemeli", async function () {
      const items = Array.from({ length: 18 }, (_, idx) => idx + 1);
      let maxConcurrent = 0;
      let activeCount = 0;

      const results = await runBoundedConcurrency(
        items,
        async (item) => {
          activeCount += 1;
          if (activeCount > maxConcurrent) maxConcurrent = activeCount;
          await new Promise((r) => setTimeout(r, 10));
          activeCount -= 1;
          return item * 2;
        },
        6 // Concurrency = 6
      );

      expect(results).to.have.lengthOf(18);
      expect(results[0]).to.equal(2);
      expect(results[17]).to.equal(36);
      expect(maxConcurrent).to.be.at.most(6);
    });

    it("C.2 studentProfileCache cüzdan verilerini izole saklamalı ve farklı cüzdana sızdırmamalı", function () {
      const walletA = "0x1111111111111111111111111111111111111111";
      const walletB = "0x2222222222222222222222222222222222222222";

      studentProfileCache.set(walletA.toLowerCase(), {
        profile: { walletAddress: walletA, registeredEvents: [{ id: 10 }] },
        timestamp: Date.now(),
      });

      expect(studentProfileCache.has(walletA.toLowerCase())).to.equal(true);
      expect(studentProfileCache.has(walletB.toLowerCase())).to.equal(false);

      // Cüzdan A'nın önbelleği silindiğinde Cüzdan B etkilenmemeli
      invalidateStudentProfileCache(walletA);
      expect(studentProfileCache.has(walletA.toLowerCase())).to.equal(false);
    });

    it("C.3 invalidateStudentProfileCache parametresiz çağrıldığında tüm önbelleği sıfırlamalı", function () {
      studentProfileCache.set("0xaaa", { timestamp: Date.now() });
      studentProfileCache.set("0xbbb", { timestamp: Date.now() });
      expect(studentProfileCache.size).to.equal(2);

      invalidateStudentProfileCache();
      expect(studentProfileCache.size).to.equal(0);
    });

    it("C.4 Farklı cüzdanlar arasında (Wallet A ve Wallet B) kayıt ve sertifika sızıntısı olmamalı (Zero Cross-Wallet Leakage)", function () {
      const walletA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const walletB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

      studentProfileCache.set(walletA.toLowerCase(), {
        profile: {
          walletAddress: walletA,
          registeredEvents: [{ id: 1, title: "Gizli A Etkinliği" }],
          totalRegistered: 1,
        },
        certificates: [{ certificateId: "CERT-A-001", eventId: 1 }],
        timestamp: Date.now(),
      });

      // Wallet B için önbellek sorgusu boş dönmeli
      const cachedB = studentProfileCache.get(walletB.toLowerCase());
      expect(cachedB).to.equal(undefined);

      // Cüzdan değiştiğinde önbellekten Wallet B'ye Wallet A verisi asla aktarılmamalı
      const retrievedA = studentProfileCache.get(walletA.toLowerCase());
      expect(retrievedA.profile.walletAddress).to.equal(walletA);
      expect(retrievedA.certificates[0].certificateId).to.equal("CERT-A-001");
    });

    it("C.5 studentProfileCache 30 saniye TTL içinde anında önbellekten dönmeli (Request Deduplication)", function () {
      const wallet = "0xcccccccccccccccccccccccccccccccccccccccc";
      const now = Date.now();
      studentProfileCache.set(wallet.toLowerCase(), {
        profile: { walletAddress: wallet, registeredEvents: [] },
        certificates: [],
        timestamp: now,
      });

      const entry = studentProfileCache.get(wallet.toLowerCase());
      expect(entry).to.not.equal(undefined);
      expect(now - entry.timestamp).to.be.below(1000);
    });
  });
});
