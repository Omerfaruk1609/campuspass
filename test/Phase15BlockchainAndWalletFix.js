import { expect } from "chai";
import React from "react";
globalThis.React = React;
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  parseBlockchainError,
  callWithRetry,
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
} from "../src/data/events.js";
import {
  AUTH_STORAGE_EVENT_KEY,
  broadcastAuthEvent,
  clearActiveAuthState,
  getActiveAuthState,
  connectNotificationStream,
} from "../src/utils/apiClient.js";
import { AppProvider, useAppContext } from "../src/context/AppContext.jsx";
import RootLayout from "../src/layouts/RootLayout.jsx";
import Navbar from "../src/components/Navbar.jsx";
import StudentProfile from "../src/pages/StudentProfile.jsx";
import OrganizerDashboardPage from "../src/pages/OrganizerDashboardPage.jsx";
import OrganizerEventAnalyticsPage from "../src/pages/OrganizerEventAnalyticsPage.jsx";
import CommunityDiscoveryPage from "../src/pages/CommunityDiscoveryPage.jsx";
import CommunityProfilePage from "../src/pages/CommunityProfilePage.jsx";
import EventPage from "../src/pages/EventPage.jsx";
import ProtectedRoute from "../src/components/guards/ProtectedRoute.jsx";
import OrganizerGuard from "../src/components/guards/OrganizerGuard.jsx";

const el = React.createElement;

describe("Faz 15 — Blokzincir Olay Okuma ve Cüzdan/SIWE Yaşam Döngüsü Regresyon Test Paketi", function () {
  this.timeout(10000);

  describe("1. Blokzincir ve RPC Hata Yönetimi (Part A Regresyonları)", function () {
    it("1.1 'missing revert data' veya boş call exception durumunda açıklayıcı hata mesajı dönmeli", function () {
      const err = new Error("missing revert data");
      err.code = "CALL_EXCEPTION";
      err.shortMessage = "missing revert data";
      err.data = "0x";

      const parsed = parseBlockchainError(err);
      expect(parsed).to.include("Akıllı sözleşmeye ulaşılamadı veya belirtilen adreste sözleşme kodu bulunamadı");
      expect(parsed).to.include("Monad Testnet (10143)");
    });

    it("1.2 'could not decode result data' (BAD_DATA) durumunda anlamlı Türkçe hata mesajı vermeli", function () {
      const err = new Error("could not decode result data");
      err.code = "BAD_DATA";
      err.value = "0x";

      const parsed = parseBlockchainError(err);
      expect(parsed).to.include("Akıllı sözleşmeye ulaşılamadı veya belirtilen adreste sözleşme kodu bulunamadı");
    });

    it("1.3 RPC bağlantı kopması (ENOTFOUND, ECONNREFUSED, failed to detect network) durumunu ayırt edebilmeli", function () {
      const err1 = new Error("getaddrinfo ENOTFOUND testnet-rpc.monad.xyz");
      expect(parseBlockchainError(err1)).to.include("Monad Testnet RPC sunucusuna bağlanılamadı");

      const err2 = new Error("JsonRpcProvider failed to detect network and cannot start up");
      expect(parseBlockchainError(err2)).to.include("Monad Testnet RPC sunucusuna bağlanılamadı");
    });

    it("1.4 Yanlış ağ (Chain ID uyumsuzluğu) hatasını ayırt edebilmeli", function () {
      const err = new Error("Yanlış ağdasınız (Chain ID: 1). Lütfen Monad Testnet (10143) ağına geçin.");
      expect(parseBlockchainError(err)).to.include("Yanlış ağdasınız");
      expect(parseBlockchainError(err)).to.include("10143");
    });

    it("1.5 Monad RPC 100 blok aralığı sınırını (-32614 limited to a 100 range) veya rate limit hatasını tanımlayabilmeli", function () {
      const err = new Error("eth_getLogs is limited to a 100 range");
      expect(parseBlockchainError(err)).to.include("istek veya blok aralığı sınırı aşıldı");
    });

    it("1.6 Monad RPC rate limit (-32011 'requests limited to 15/sec') CALL_EXCEPTION ile sarmalandığında doğru Türkçe rate limit hatası dönmeli", function () {
      const err = new Error("missing revert data (action=\"call\", data=null, reason=null)");
      err.code = "CALL_EXCEPTION";
      err.shortMessage = "missing revert data";
      err.info = {
        error: {
          code: -32011,
          message: "requests limited to 15/sec",
        },
      };

      const parsed = parseBlockchainError(err);
      expect(parsed).to.include("istek veya blok aralığı sınırı aşıldı (en fazla 15 istek/sn)");
      // Yanıltıcı "sözleşme kodu bulunamadı" hatası OLMAMALI
      expect(parsed).to.not.include("sözleşme kodu bulunamadı");
    });

    it("1.7 callWithRetry geçici -32011 rate limit hatası alındığında üstel geri çekilmeyle tekrar denemeli ve başarılı olmalı", async function () {
      let attempts = 0;
      const result = await callWithRetry(
        async () => {
          attempts += 1;
          if (attempts < 3) {
            const err = new Error("requests limited to 15/sec");
            err.info = { error: { code: -32011, message: "requests limited to 15/sec" } };
            throw err;
          }
          return "success_val";
        },
        3,
        20
      );

      expect(attempts).to.equal(3);
      expect(result).to.equal("success_val");
    });

    it("1.8 SIWE oturum gerekliliği (SESSION_REQUIRED) hatasını ayırt edebilmeli", function () {
      const err = new Error("SESSION_REQUIRED: SIWE oturumu gereklidir");
      expect(parseBlockchainError(err)).to.include("SIWE oturumunuz bulunmuyor veya süresi dolmuş");
    });

    it("1.9 Varsayılan sözleşme adresi ve Monad Chain ID doğru yapılandırılmış olmalı", function () {
      expect(CONTRACT_ADDRESS).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(MONAD_CHAIN_ID).to.equal(10143);
      expect(MONAD_RPC_URL).to.include("monad");
    });
  });

  describe("2. Cüzdan Yaşam Döngüsü ve SIWE Oturum İzolasyonu (Part B Regresyonları)", function () {
    beforeEach(function () {
      clearActiveAuthState();
    });

    it("2.1 Cüzdan değiştiğinde veya bağlantı kesildiğinde auth durumu sıfırlanmalı", function () {
      clearActiveAuthState();
      const state = getActiveAuthState();
      expect(state.authenticated).to.be.false;
      expect(state.walletAddress).to.be.null;
      expect(state.csrfToken).to.be.null;
    });

    it("2.2 Sekmeler arası 'LOGOUT' olayı yayınlandığında aktif oturum silinmeli", function () {
      broadcastAuthEvent("LOGOUT");
      const state = getActiveAuthState();
      expect(state.authenticated).to.be.false;
    });

    it("2.3 Sekmeler arası 'LOGIN' olayı doğru cüzdan adresiyle yayınlanabilmeli", function () {
      const testWallet = "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5";
      broadcastAuthEvent("LOGIN", { walletAddress: testWallet });
      // Event key'in localStorage'a veya depoya yazıldığını kontrol et
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_EVENT_KEY) || "{}");
        expect(stored.type).to.equal("LOGIN");
        expect(stored.walletAddress).to.equal(testWallet);
      }
    });

    it("2.4 connectNotificationStream istemci tarafında disconnect ile sonlandırılabilir olmalı", function () {
      let closed = false;
      const MockEventSource = class {
        constructor() {
          this.readyState = 1;
        }
        addEventListener() {}
        close() {
          closed = true;
          this.readyState = 2;
        }
      };

      const disconnect = connectNotificationStream({
        EventSourceClass: MockEventSource,
      });

      expect(typeof disconnect).to.equal("function");
      disconnect();
      expect(closed).to.be.true;
    });

    it("2.5 AppProvider içinde handleSiweLogin fonksiyonu sağlanmalı ve Navbar'a aktarılmalı", function () {
      let contextCaptured = null;
      function TestConsumer() {
        contextCaptured = useAppContext();
        return el("div", null, "Consumer Ready");
      }

      renderToString(
        el(
          MemoryRouter,
          null,
          el(AppProvider, null, el(TestConsumer))
        )
      );

      expect(contextCaptured).to.not.be.null;
      expect(typeof contextCaptured.handleSiweLogin).to.equal("function");
      expect(typeof contextCaptured.handleConnectWallet).to.equal("function");
      expect(typeof contextCaptured.handleDisconnectWallet).to.equal("function");
    });

    it("2.6 Navbar bileşeni onSiweLogin prop'unu desteklemeli", function () {
      let loginCalled = false;
      const html = renderToString(
        el(
          MemoryRouter,
          null,
          el(Navbar, {
            account: "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5",
            chainId: 10143,
            sessionState: { authenticated: false },
            onSiweLogin: () => {
              loginCalled = true;
            },
          })
        )
      );

      expect(html).to.include("0x7076...4dC5");
      expect(html).to.include("Monad Testnet");
      expect(loginCalled).to.be.false;
    });

    it("2.7 RootLayout hem Navbar hem de alt rotaları hatasız render edebilmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          null,
          el(AppProvider, null, el(RootLayout))
        )
      );

      expect(html).to.include("Campus");
      expect(html).to.include("Pass");
    });
  });

  describe("3. Rotalar Arası Cüzdan ve Oturum Durumu Tutarlılığı (Sayfa Durum Regresyonları)", function () {
    const testWallet = "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5";
    const testSampleEvent = {
      id: 1,
      title: "Monad Blokzincir Hackathonu",
      community: "Monad TR",
      category: "Blockchain",
      capacity: 100,
      registeredCount: 42,
      organizer: "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5",
      isRegistered: true,
      isAttended: false,
      date: "2026-11-20",
      startTime: "10:00",
      endTime: "18:00",
      registrationDeadline: "2026-11-19T23:59",
      location: { campus: "Merkez", building: "Mühendislik", room: "A-101" },
      status: "upcoming",
      statusLabel: "Kayıtlar Açık",
      deadlinePassed: false,
      canRegisterByTime: true,
    };

    it("3.1 StudentProfile prop almadan AppProvider context'indeki cüzdanı tüketmeli ve bağlı görünüm render etmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/profile"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialSessionState: { authenticated: true, walletAddress: testWallet, loading: false },
              initialLoadingEvents: false,
            },
            el(ProtectedRoute, null, el(StudentProfile, { defaultTab: "events" }))
          )
        )
      );

      // Cüzdan bağlı değil ekranı OLMAMALI
      expect(html).to.not.include("Profili Görmek İçin Cüzdan Bağla");
      expect(html).to.not.include("Kayıtlı Etkinliklerinizi ve Sertifikalarınızı Görüntüleyin");
      // Cüzdan bağlı olduğu için bağlı cüzdan kimliği ve rozetleri görünmeli
      expect(html).to.include("0x7076...4dC5");
      expect(html).to.include("Cüzdan Doğrulandı ✓");
    });

    it("3.2 OrganizerDashboardPage prop almadan context'teki hesabı tüketmeli ve 'Organizatör Cüzdanını Bağla' yerine dashboard render etmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialSessionState: { authenticated: true, walletAddress: testWallet, loading: false },
              initialLoadingEvents: false,
            },
            el(OrganizerGuard, null, el(OrganizerDashboardPage))
          )
        )
      );

      // Cüzdan bağlı değil promptu OLMAMALI
      expect(html).to.not.include("Organizatör Cüzdanını Bağla");
      expect(html).to.include("Monad Testnet ve veritabanı analitikleri yükleniyor...");
    });

    it("3.3 OrganizerEventAnalyticsPage prop almadan context'teki hesabı tüketmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer/events/1"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialSessionState: { authenticated: true, walletAddress: testWallet, loading: false },
              initialEvents: [testSampleEvent],
              initialLoadingEvents: false,
            },
            el(
              OrganizerGuard,
              { requireEventOrganizer: true },
              el(OrganizerEventAnalyticsPage, { eventId: 1 })
            )
          )
        )
      );

      // Cüzdan bağlantısı gerekli ekranı OLMAMALI
      expect(html).to.not.include("Cüzdan Bağlantısı Gerekli");
      expect(html).to.include("Etkinlik analitiği ve blokzincir kayıtları yükleniyor...");
    });

    it("3.4 EventPage prop almadan context'teki cüzdanı tüketmeli ve bağlı cüzdan ile durumunu göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events/1"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialSessionState: { authenticated: true, walletAddress: testWallet, loading: false },
              initialEvents: [testSampleEvent],
              initialLoadingEvents: false,
            },
            el(EventPage, { event: testSampleEvent })
          )
        )
      );

      expect(html).to.include("0x7076...4dC5");
      expect(html).to.include("Organizatörsünüz");
      expect(html).to.include("Monad Blokzincir Hackathonu");
    });

    it("3.5 CommunityDiscoveryPage ve CommunityProfilePage cüzdan bağlı durumunu context'ten tanımalı", function () {
      const htmlDisc = renderToString(
        el(
          MemoryRouter,
          null,
          el(
            AppProvider,
            { initialAccount: testWallet, initialSessionState: { loading: false } },
            el(CommunityDiscoveryPage)
          )
        )
      );
      expect(htmlDisc).to.include("Toplulukları Keşfet");
      expect(htmlDisc).to.include("Topluluk Kur");

      const htmlProf = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/communities/monad-tr"] },
          el(
            AppProvider,
            { initialAccount: testWallet, initialSessionState: { loading: false } },
            el(CommunityProfilePage, { slug: "monad-tr" })
          )
        )
      );
      // Cüzdan bağlı olduğu için "Topluluğa Katılmak İçin Cüzdan Bağla" butonunu göstermemeli
      expect(htmlProf).to.not.include("Topluluğa Katılmak İçin Cüzdan Bağla");
    });

    it("3.6 Bileşenler doğrudan prop verildiğinde geriye dönük uyumlu çalışmalı", function () {
      const explicitWallet = "0x1111111111111111111111111111111111111111";
      const html = renderToString(
        el(
          MemoryRouter,
          null,
          el(StudentProfile, {
            account: explicitWallet,
            chainId: 10143,
            defaultTab: "certs",
          })
        )
      );

      expect(html).to.include("0x1111...1111");
      expect(html).to.include("Sertifikalarım");
    });

    it("3.7 OrganizerGuard: Oturum yüklenirken (session restoration pending) yükleniyor durumu göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialSessionState: { authenticated: false, walletAddress: null, loading: true },
            },
            el(OrganizerGuard, null, el("div", null, "Organizatör İçeriği"))
          )
        )
      );

      expect(html).to.include("Organizatör oturumu kontrol ediliyor...");
      expect(html).to.not.include("Organizatör İçeriği");
    });

    it("3.8 OrganizerGuard: Cüzdan bağlı değilken 'Organizatör Cüzdan Bağlantısı Gerekli' göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: null,
              initialSessionState: { authenticated: false, walletAddress: null, loading: false },
            },
            el(OrganizerGuard, null, el("div", null, "Organizatör İçeriği"))
          )
        )
      );

      expect(html).to.include("Organizatör Cüzdan Bağlantısı Gerekli");
      expect(html).to.include("Organizatör Cüzdanını Bağla");
      expect(html).to.not.include("Organizatör İçeriği");
    });

    it("3.9 OrganizerGuard: Yanlış ağdayken (wrong network) ağ geçiş uyarısı göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialChainId: 1, // Mainnet instead of 10143
              initialSessionState: { authenticated: true, walletAddress: testWallet, loading: false },
            },
            el(OrganizerGuard, null, el("div", null, "Organizatör İçeriği"))
          )
        )
      );

      expect(html).to.include("Yanlış Ağdasınız");
      expect(html).to.include("Monad Testnet");
      expect(html).to.not.include("Organizatör İçeriği");
    });

    it("3.10 OrganizerGuard: Cüzdan bağlı ancak SIWE yapılmamışsa 'SIWE ile Giriş Yapın' göstermeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialChainId: 10143,
              initialSessionState: { authenticated: false, walletAddress: null, loading: false },
            },
            el(OrganizerGuard, null, el("div", null, "Organizatör İçeriği"))
          )
        )
      );

      expect(html).to.include("SIWE ile Giriş Yapın");
      expect(html).to.include("Güvenli Oturum Gerekli");
      expect(html).to.not.include("Organizatör İçeriği");
    });

    it("3.11 OrganizerGuard: Başka bir kullanıcının etkinliğine girildiğinde 403 Forbidden göstermeli", function () {
      const otherUserWallet = "0x9999999999999999999999999999999999999999";
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer/events/1"] },
          el(
            AppProvider,
            {
              initialAccount: otherUserWallet,
              initialChainId: 10143,
              initialSessionState: { authenticated: true, walletAddress: otherUserWallet, loading: false },
              initialEvents: [testSampleEvent],
              initialLoadingEvents: false,
            },
            el(
              OrganizerGuard,
              { requireEventOrganizer: true, eventId: 1 },
              el("div", null, "Gizli Analitik")
            )
          )
        )
      );

      expect(html).to.include("Yetkisiz Erişim (403 Forbidden)");
      expect(html).to.not.include("Gizli Analitik");
    });
  });
});
