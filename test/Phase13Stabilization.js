import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { createEventIndexer } from "../server/src/indexer/eventIndexer.js";
import { buildSiweMessage } from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";
import {
  AUTH_STORAGE_EVENT_KEY,
  broadcastAuthEvent,
  clearActiveAuthState,
  ensureSiweSession,
  getActiveAuthState,
} from "../src/utils/apiClient.js";

const { ethers } = await network.create();

describe("Faz 13 — Teknik Borç, Güvenlik ve Entegrasyon Stabilizasyonu Test Paketi", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployStabilizationFixture() {
    const [founderSigner, memberSigner, otherAdminSigner] = await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Kurucu tarafından 1 etkinlik oluştur
    await campusPass
      .connect(founderSigner)
      .createEvent("Faz 13 Blokzincir Güvenlik Zirvesi", 100);

    const prisma = createTransactionalPrismaStore();
    const indexer = createEventIndexer({
      prisma,
      contract: campusPass,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      startBlock: 0,
      batchSize: 50,
      confirmations: 0,
      reorgLookbackBlocks: 2,
      retryBaseDelayMs: 10,
    });

    await indexer.syncOnce();

    const { app, services } = buildCampusPassApp({
      prisma,
      contract: campusPass,
      indexer,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      allowedOrigins: ["http://localhost:5173"],
      siweDomain: TEST_DOMAIN,
      siweUri: TEST_URI,
    });

    return {
      app,
      services,
      prisma,
      campusPass,
      contractAddress,
      founderSigner,
      memberSigner,
      otherAdminSigner,
    };
  }

  async function loginWithSiwe(app, signer) {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${signer.address}`,
    });
    expect(nonceRes.status).to.equal(200);
    const { nonce, domain, uri, issuedAt, expiresAt } = nonceRes.body.data;

    const siweMessage = buildSiweMessage({
      domain,
      address: signer.address,
      statement: "CampusPass Faz 13 stabilizasyon testi icin cuzdaninizi dogrulayin.",
      uri,
      version: "1",
      chainId: TEST_CHAIN_ID,
      nonce,
      issuedAt,
      expirationTime: expiresAt,
    });

    const signature = await signer.signMessage(siweMessage);
    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: { message: siweMessage, signature },
    });
    expect(verifyRes.status).to.equal(200);

    const setCookieHeader = verifyRes.cookies?.[0] || "";
    const cookiePair = setCookieHeader.split(";")[0];
    return {
      cookieHeader: cookiePair,
      csrfToken: verifyRes.body.data.csrfToken,
      walletAddress: verifyRes.body.data.walletAddress,
    };
  }

  // =========================================================================
  // 1. SEC-01: TOPLULUK PROFİLİ VE İSTEĞE BAĞLI OTURUM DOĞRULAMA (OPTIONAL AUTH)
  // =========================================================================
  describe("1. [SEC-01] Topluluk Profilinde Rol Tespiti ve İsteğe Bağlı Oturum (Optional Auth)", function () {
    it("1.1 Oturumu olan topluluk kurucusu /:slug profili çağırdığında rolü 'OWNER' olarak tespit edilmeli", async function () {
      const { app, founderSigner } = await deployStabilizationFixture();
      const session = await loginWithSiwe(app, founderSigner);

      // Topluluk oluştur
      const createRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: {
          name: "Monad Güvenlik Kulübü",
          category: "Blockchain & Web3",
          shortDescription: "Güvenlik araştırmaları",
        },
      });
      expect(createRes.status).to.equal(201);
      const slug = createRes.body.data.slug;

      // GET /api/communities/:slug çağrısını session çerezi ile yap
      const profileRes = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}`,
        headers: {
          cookie: session.cookieHeader,
        },
      });

      expect(profileRes.status).to.equal(200);
      expect(profileRes.body.success).to.equal(true);
      expect(profileRes.body.data.myRole).to.equal("OWNER");
      expect(profileRes.body.data.currentUserMembership).to.not.equal(null);
      expect(profileRes.body.data.currentUserMembership.role).to.equal("OWNER");
    });

    it("1.2 Oturumu olmayan anonim kullanıcı profili çağırdığında 'NON-MEMBER' dönmeli ve istek başarılı tamamlanmalı", async function () {
      const { app, founderSigner } = await deployStabilizationFixture();
      const session = await loginWithSiwe(app, founderSigner);

      const createRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: {
          name: "Yazılım ve Algoritma Kulübü",
        },
      });
      const slug = createRes.body.data.slug;

      // Anonim istek (çerezsiz)
      const anonRes = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}`,
      });

      expect(anonRes.status).to.equal(200);
      expect(anonRes.body.data.myRole).to.equal("NON-MEMBER");
      expect(anonRes.body.data.currentUserMembership).to.equal(null);
    });
  });

  // =========================================================================
  // 2. INT-01: ÇAPRAZ TOPLULUK ETKİNLİK UNLINK KORUMASI
  // =========================================================================
  describe("2. [INT-01] Çoklu Kiracılık (Tenant) Güvenliği: Çapraz Topluluk Etkinlik Unlink Koruması", function () {
    it("2.1 Başka bir topluluğa bağlı etkinliği unlink etmeye çalışan yetkiliye 400 Bad Request verilmeli", async function () {
      const { app, founderSigner, otherAdminSigner, contractAddress } =
        await deployStabilizationFixture();

      // Kurucu oturumu -> Topluluk 1 oluştur ve Etkinlik #1'i bağla
      const founderSession = await loginWithSiwe(app, founderSigner);
      const comm1Res = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: founderSession.cookieHeader,
          "x-csrf-token": founderSession.csrfToken,
        },
        body: { name: "Topluluk Bir" },
      });
      const slug1 = comm1Res.body.data.slug;

      // Etkinlik 1'i Topluluk 1'e bağla
      const linkRes = await app.inject({
        method: "POST",
        url: `/api/communities/${slug1}/events/link`,
        headers: {
          cookie: founderSession.cookieHeader,
          "x-csrf-token": founderSession.csrfToken,
        },
        body: {
          eventId: 1,
          chainId: TEST_CHAIN_ID,
          contractAddress,
        },
      });
      expect(linkRes.status).to.equal(200);

      // İkinci kullanıcı -> Topluluk 2 oluştur
      const otherSession = await loginWithSiwe(app, otherAdminSigner);
      const comm2Res = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: otherSession.cookieHeader,
          "x-csrf-token": otherSession.csrfToken,
        },
        body: { name: "Topluluk Iki" },
      });
      const slug2 = comm2Res.body.data.slug;

      // Saldırı: Topluluk 2 yöneticisi, Topluluk 1'e ait olan Etkinlik #1'in bağlantısını koparmaya çalışır
      const maliciousUnlinkRes = await app.inject({
        method: "DELETE",
        url: `/api/communities/${slug2}/events/unlink`,
        headers: {
          cookie: otherSession.cookieHeader,
          "x-csrf-token": otherSession.csrfToken,
        },
        body: {
          eventId: 1,
          chainId: TEST_CHAIN_ID,
          contractAddress,
        },
      });

      expect(maliciousUnlinkRes.status).to.equal(400);
      expect(JSON.stringify(maliciousUnlinkRes.body)).to.include("EVENT_COMMUNITY_MISMATCH");

      // Etkinlik 1'in hala Topluluk 1'e bağlı olduğu doğrulanmalı
      const comm1Events = await app.inject({
        method: "GET",
        url: `/api/communities/${slug1}/events`,
      });
      expect(comm1Events.body.data.items.length).to.equal(1);
      expect(Number(comm1Events.body.data.items[0].eventId)).to.equal(1);
    });

    it("2.2 Kendi topluluğuna bağlı etkinliği unlink eden yetkili başarılı olmalı (200 OK)", async function () {
      const { app, founderSigner, contractAddress } = await deployStabilizationFixture();
      const session = await loginWithSiwe(app, founderSigner);

      const commRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: { name: "Girişimcilik ve İnovasyon Topluluğu" },
      });
      const slug = commRes.body.data.slug;

      // Link
      await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/events/link`,
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: { eventId: 1, chainId: TEST_CHAIN_ID, contractAddress },
      });

      // Valid Unlink
      const unlinkRes = await app.inject({
        method: "DELETE",
        url: `/api/communities/${slug}/events/unlink`,
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: { eventId: 1, chainId: TEST_CHAIN_ID, contractAddress },
      });

      expect(unlinkRes.status).to.equal(200);
      expect(unlinkRes.body.success).to.equal(true);

      // Artık toplulukta etkinlik olmamalı
      const emptyCommEvents = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/events`,
      });
      expect(emptyCommEvents.body.data.items.length).to.equal(0);
    });
  });

  // =========================================================================
  // 3. SEC-02 & UX-01: SIWE OTURUM YÖNETİMİ, LOGOUT VE SEKME EŞİTLEME
  // =========================================================================
  describe("3. [SEC-02 & UX-01] SIWE Oturum Güvencesi, Logout ve Sekmeler Arası Eşitleme", function () {
    it("3.1 Server-side logout oturumu veritabanında geçersiz kılmalı ve /auth/session 'authenticated: false' dönmeli", async function () {
      const { app, founderSigner } = await deployStabilizationFixture();
      const session = await loginWithSiwe(app, founderSigner);

      // Oturum aktif
      const beforeLogout = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { cookie: session.cookieHeader },
      });
      expect(beforeLogout.body.data.authenticated).to.equal(true);

      // Logout çağrısı
      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie: session.cookieHeader },
      });
      expect(logoutRes.status).to.equal(200);
      expect(logoutRes.body.data.authenticated).to.equal(false);

      // Logout sonrası aynı çerezle tekrar oturum sorulduğunda false dönmeli
      const afterLogout = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { cookie: session.cookieHeader },
      });
      expect(afterLogout.body.data.authenticated).to.equal(false);
    });

    it("3.2 ensureSiweSession hem string adres hem de obje parametresi ile çağrılabilmeli", async function () {
      const dummyWallet = "0x1234567890123456789012345678901234567890";
      clearActiveAuthState();

      // String parametresiyle cüzdan adresi eksik olmadığında doğrulama aşamasına ilerlemeli
      try {
        await ensureSiweSession(dummyWallet);
      } catch (err) {
        // Mock ortamda window.ethereum olmadığı için anlamlı imza hatası vermeli
        expect(err.message).to.include("cüzdan imzası gereklidir");
      }

      // Obje parametresiyle
      try {
        await ensureSiweSession({ walletAddress: dummyWallet });
      } catch (err) {
        expect(err.message).to.include("cüzdan imzası gereklidir");
      }
    });

    it("3.3 broadcastAuthEvent sekmeler arası oturum kapatma olayını doğru anahtar ile tetiklemeli", function () {
      expect(AUTH_STORAGE_EVENT_KEY).to.equal("campuspass_auth_event");
      let storedKey = null;
      let storedValue = null;

      globalThis.window = {
        localStorage: {
          setItem: (k, v) => {
            storedKey = k;
            storedValue = v;
          },
        },
      };

      broadcastAuthEvent("LOGOUT");
      expect(storedKey).to.equal("campuspass_auth_event");
      expect(storedValue).to.include('"type":"LOGOUT"');

      // Temizlik
      delete globalThis.window;
    });
  });
});
