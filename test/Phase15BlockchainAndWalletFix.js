import { expect } from "chai";
import React from "react";
globalThis.React = React;
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  parseBlockchainError,
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

    it("1.6 SIWE oturum gerekliliği (SESSION_REQUIRED) hatasını ayırt edebilmeli", function () {
      const err = new Error("SESSION_REQUIRED: SIWE oturumu gereklidir");
      expect(parseBlockchainError(err)).to.include("SIWE oturumunuz bulunmuyor veya süresi dolmuş");
    });

    it("1.7 Varsayılan sözleşme adresi ve Monad Chain ID doğru yapılandırılmış olmalı", function () {
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
});
