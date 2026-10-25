import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { buildSiweMessage } from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";

const { ethers } = await network.create();

describe("Faz 14 — Performans, Öğrenci Profili, Hesap Ayarları ve Güvenlik Test Paketi", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployPhase14Fixture() {
    const [founderSigner, studentSigner, visitorSigner] = await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    const prisma = createTransactionalPrismaStore();

    const { app, services } = buildCampusPassApp({
      prisma,
      contract: campusPass,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      allowedOrigins: ["http://localhost:5173"],
      siweDomain: TEST_DOMAIN,
      siweUri: TEST_URI,
    });

    return {
      app,
      prisma,
      services,
      founderSigner,
      studentSigner,
      visitorSigner,
      contractAddress,
    };
  }

  async function loginWithSiwe(app, signer, { domain = TEST_DOMAIN, uri = TEST_URI } = {}) {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${signer.address}`,
    });
    expect(nonceRes.status).to.equal(200);
    const { nonce, issuedAt, expiresAt } = nonceRes.body.data;

    const siweMessage = buildSiweMessage({
      domain,
      address: signer.address,
      statement: "CampusPass Faz 14 ogrenci profili testi icin cuzdaninizi dogrulayin.",
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
  // 1. ÖĞRENCİ PROFİLİ GÜVENLİK VE SIWE OTURUM YETKİLENDİRMESİ
  // =========================================================================
  describe("1. Öğrenci Profili Güncelleme ve SIWE / CSRF Güvenlik Doğrulaması", function () {
    it("1.1 Oturumu olmayan istek öğrenci profilini güncelleyemez (401 Unauthorized)", async function () {
      const { app } = await deployPhase14Fixture();

      const res = await app.inject({
        method: "PATCH",
        url: "/api/students/profile",
        body: {
          displayName: "Yetkisiz Deneme",
          bio: "Oturumsuz profil düzenlenemez.",
        },
      });

      expect(res.status).to.equal(401);
      expect(res.body.success).to.be.false;
      expect(res.body.error.code).to.equal("SESSION_REQUIRED");
    });

    it("1.2 Geçerli SIWE oturumu olup CSRF token'ı eksik/geçersiz olan istek reddedilmeli (403 Forbidden)", async function () {
      const { app, studentSigner } = await deployPhase14Fixture();
      const session = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/students/profile",
        headers: {
          cookie: session.cookieHeader,
          // x-csrf-token bilerek gönderilmedi
        },
        body: {
          displayName: "Ahmet Öğrenci",
          department: "Bilgisayar Mühendisliği",
        },
      });

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.error.code).to.equal("CSRF_TOKEN_INVALID");
    });

    it("1.3 Doğrulanmış SIWE oturumu ve CSRF ile öğrenci profili başarıyla oluşturulmalı/güncellenmeli (200 OK)", async function () {
      const { app, studentSigner } = await deployPhase14Fixture();
      const session = await loginWithSiwe(app, studentSigner);

      const updateRes = await app.inject({
        method: "PATCH",
        url: "/api/students/profile",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: {
          displayName: "Zeynep Kaya",
          university: "Monad Üniversitesi",
          department: "Yazılım Mühendisliği",
          bio: "Web3 ve Akıllı Sözleşme Geliştiricisi",
          avatarUrl: "https://example.com/avatar.png",
          isPublic: true,
        },
      });

      expect(updateRes.status).to.equal(200);
      expect(updateRes.body.success).to.be.true;
      expect(updateRes.body.data.displayName).to.equal("Zeynep Kaya");
      expect(updateRes.body.data.department).to.equal("Yazılım Mühendisliği");
      expect(updateRes.body.data.bio).to.equal("Web3 ve Akıllı Sözleşme Geliştiricisi");
      expect(updateRes.body.data.isPublic).to.be.true;
      expect(updateRes.body.data.walletAddress).to.equal(studentSigner.address);
    });
  });

  // =========================================================================
  // 2. PROFİL SORGULAMA, GİZLİLİK VE SAHİPLİK KONTROLÜ
  // =========================================================================
  describe("2. Profil Okuma, Gizlilik Ayarları (isPublic) ve Sahiplik Ayrımı", function () {
    it("2.1 Henüz profil oluşturmamış cüzdan için varsayılan boş profil nesnesi dönmeli", async function () {
      const { app, visitorSigner } = await deployPhase14Fixture();

      const res = await app.inject({
        method: "GET",
        url: `/api/students/${visitorSigner.address}/profile`,
      });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data.displayName).to.be.null;
      expect(res.body.data.university).to.equal("Monad Üniversitesi");
      expect(res.body.data.exists).to.be.false;
      expect(res.body.data.isPublic).to.be.true;
    });

    it("2.2 Profil gizli (isPublic: false) yapıldığında üçüncü taraf ziyaretçiler kişisel verileri görememeli", async function () {
      const { app, studentSigner, visitorSigner } = await deployPhase14Fixture();
      const session = await loginWithSiwe(app, studentSigner);

      // Gizli profil oluştur
      await app.inject({
        method: "PATCH",
        url: "/api/students/profile",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: {
          displayName: "Gizli Öğrenci",
          bio: "Bu biyografi gizli kalmalıdır.",
          department: "Siber Güvenlik",
          isPublic: false,
        },
      });

      // 3. Taraf ziyaretçi (oturumsuz veya farklı cüzdan) sorguluyor
      const publicRes = await app.inject({
        method: "GET",
        url: `/api/students/${studentSigner.address}/profile`,
      });

      expect(publicRes.status).to.equal(200);
      expect(publicRes.body.data.isPublic).to.be.false;
      expect(publicRes.body.data.isPrivate).to.be.true;
      expect(publicRes.body.data.displayName).to.be.null;
      expect(publicRes.body.data.bio).to.be.null;
      expect(publicRes.body.data.department).to.be.null;

      // Ziyaretçi oturumuyla sorgulandığında da sızmamalı
      const visitorSession = await loginWithSiwe(app, visitorSigner);
      const visitorQueryRes = await app.inject({
        method: "GET",
        url: `/api/students/${studentSigner.address}/profile`,
        headers: {
          cookie: visitorSession.cookieHeader,
        },
      });

      expect(visitorQueryRes.body.data.isPrivate).to.be.true;
      expect(visitorQueryRes.body.data.displayName).to.be.null;

      // Ancak profil sahibi kendi oturumuyla sorguladığında verilerini eksiksiz görmeli
      const ownerQueryRes = await app.inject({
        method: "GET",
        url: `/api/students/${studentSigner.address}/profile`,
        headers: {
          cookie: session.cookieHeader,
        },
      });

      expect(ownerQueryRes.status).to.equal(200);
      expect(ownerQueryRes.body.data.isOwner).to.be.true;
      expect(ownerQueryRes.body.data.displayName).to.equal("Gizli Öğrenci");
      expect(ownerQueryRes.body.data.bio).to.equal("Bu biyografi gizli kalmalıdır.");
      expect(ownerQueryRes.body.data.department).to.equal("Siber Güvenlik");
    });
  });

  // =========================================================================
  // 3. GİRDİ DOĞRULAMA VE SINIRLAR (INPUT VALIDATION)
  // =========================================================================
  describe("3. Profil Girdi Doğrulama ve Karakter Sınırları", function () {
    it("3.1 60 karakterden uzun displayName reddedilmeli (400 Bad Request)", async function () {
      const { app, studentSigner } = await deployPhase14Fixture();
      const session = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/students/profile",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: {
          displayName: "A".repeat(61),
        },
      });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
    });

    it("3.2 300 karakterden uzun bio reddedilmeli (400 Bad Request)", async function () {
      const { app, studentSigner } = await deployPhase14Fixture();
      const session = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/students/profile",
        headers: {
          cookie: session.cookieHeader,
          "x-csrf-token": session.csrfToken,
        },
        body: {
          bio: "B".repeat(301),
        },
      });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
    });

    it("3.3 Bozuk veya geçersiz cüzdan adresi ile profil sorgulandığında 400 verilmeli", async function () {
      const { app } = await deployPhase14Fixture();

      const res = await app.inject({
        method: "GET",
        url: "/api/students/0xInvalidWalletAddressFormat/profile",
      });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
    });
  });
});
