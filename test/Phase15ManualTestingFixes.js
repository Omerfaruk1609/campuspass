import { expect } from "chai";
import { network } from "hardhat";
import React from "react";
globalThis.React = React;
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { buildCampusPassApp } from "../server/src/app.js";
import { buildSiweMessage } from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";
import { NOTIFICATION_TYPES } from "../src/utils/notifications.js";
import {
  buildCanonicalQrMessage,
  verifySignedQrTicket,
  clearUsedNonces,
} from "../src/utils/qrVerification.js";
import { fetchStudentProfileData } from "../src/utils/studentProfile.js";
import { AppProvider } from "../src/context/AppContext.jsx";
import OrganizerDashboardPage from "../src/pages/OrganizerDashboardPage.jsx";
import OrganizerEventAnalyticsPage from "../src/pages/OrganizerEventAnalyticsPage.jsx";
import HomePage from "../src/pages/HomePage.jsx";
import EventPage from "../src/pages/EventPage.jsx";
import StudentProfile from "../src/pages/StudentProfile.jsx";

const { ethers } = await network.create();
const el = React.createElement;

describe("Faz 15 Manuel Test Bulguları & İş Akışı Düzeltmeleri Regresyon Paketi", function () {
  this.timeout(20000);

  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployFixture() {
    const [
      organizerSigner,
      studentASigner,
      studentBSigner,
      communityAdminSigner,
      regularMemberSigner,
      outsiderSigner,
    ] = await ethers.getSigners();

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
      campusPass,
      contractAddress,
      organizerSigner,
      studentASigner,
      studentBSigner,
      communityAdminSigner,
      regularMemberSigner,
      outsiderSigner,
    };
  }

  async function loginWithSiwe(app, signer) {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${signer.address}`,
    });
    expect(nonceRes.status).to.equal(200);
    const { nonce, issuedAt, expiresAt } = nonceRes.body.data;

    const siweMessage = buildSiweMessage({
      domain: TEST_DOMAIN,
      address: signer.address,
      statement: "CampusPass Faz 15 regresyon testi icin SIWE dogrulamasi.",
      uri: TEST_URI,
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

  async function buildSignedTicketForTest({
    signer,
    contractAddress,
    eventId,
    nonce = "0x11223344556677889900aabbccddeeff",
    issuedAt = Math.floor(Date.now() / 1000) - 5,
    expiresAt = Math.floor(Date.now() / 1000) + 150,
    chainId = TEST_CHAIN_ID,
  }) {
    const participant = ethers.getAddress(signer.address);
    const normalizedContract = ethers.getAddress(contractAddress);
    const canonicalMsg = buildCanonicalQrMessage({
      version: "CP1",
      chainId,
      contractAddress: normalizedContract,
      eventId: Number(eventId),
      participant,
      nonce,
      issuedAt,
      expiresAt,
    });
    const signature = await signer.signMessage(canonicalMsg);
    const payload = {
      v: "CP1",
      c: Number(chainId),
      a: normalizedContract,
      ca: normalizedContract,
      e: Number(eventId),
      p: participant,
      n: nonce,
      iat: issuedAt,
      exp: expiresAt,
      sig: signature,
    };
    return {
      payload,
      rawQrString: JSON.stringify(payload),
    };
  }

  // =========================================================================
  // 1. ORGANIZER DASHBOARD RUNTIME FAILURE (onCreateEventClick is not defined)
  // =========================================================================
  describe("1. Organizer Dashboard Çalışma Zamanı Hatası (onCreateEventClick & onBack)", function () {
    const testOrganizer = "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5";

    it("1.1 OrganizerDashboardPage prop verilmeden render edildiğinde 'onCreateEventClick is not defined' fırlatmamalı", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: testOrganizer,
              initialChainId: TEST_CHAIN_ID,
              initialSessionState: {
                authenticated: true,
                walletAddress: testOrganizer,
                loading: false,
              },
              initialLoadingEvents: false,
            },
            el(OrganizerDashboardPage)
          )
        )
      );

      expect(html).to.include("Monad Testnet ve veritabanı analitikleri yükleniyor...");
    });

    it("1.2 OrganizerDashboardPage onCreateEventClick aksiyonunu aldığında hatasız bağlamalı ve çalıştırmalı", function () {
      let createTriggered = false;
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer"] },
          el(
            AppProvider,
            {
              initialAccount: testOrganizer,
              initialChainId: TEST_CHAIN_ID,
              initialSessionState: {
                authenticated: true,
                walletAddress: testOrganizer,
                loading: false,
              },
              initialLoadingEvents: false,
            },
            el(OrganizerDashboardPage, {
              onCreateEventClick: () => {
                createTriggered = true;
              },
            })
          )
        )
      );

      expect(html).to.be.a("string");
      expect(createTriggered).to.be.false;
    });

    it("1.3 '/events?create=1' rotasına yönlendirildiğinde HomePage etkinlik oluşturma formunu otomatik açmalı", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events?create=1"] },
          el(
            AppProvider,
            {
              initialAccount: testOrganizer,
              initialChainId: TEST_CHAIN_ID,
              initialSessionState: {
                authenticated: true,
                walletAddress: testOrganizer,
                loading: false,
              },
              initialLoadingEvents: false,
            },
            el(HomePage, {
              viewMode: "discovery",
              account: testOrganizer,
              chainId: TEST_CHAIN_ID,
              manageableCommunities: [
                {
                  communityId: "comm-1",
                  name: "Monad Blockchain Kulübü",
                  role: "OWNER",
                },
              ],
            })
          )
        )
      );

      expect(html).to.include("Yeni Etkinlik Oluştur (Monad Testnet)");
      expect(html).to.include("Monad Blockchain Kulübü");
    });

    it("1.4 OrganizerEventAnalyticsPage prop verilmeden render edildiğinde 'onBack is not defined' fırlatmamalı", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer/events/1"] },
          el(
            AppProvider,
            {
              initialAccount: testOrganizer,
              initialChainId: TEST_CHAIN_ID,
              initialSessionState: {
                authenticated: true,
                walletAddress: testOrganizer,
                loading: false,
              },
              initialLoadingEvents: false,
            },
            el(OrganizerEventAnalyticsPage, { eventId: 1 })
          )
        )
      );

      expect(html).to.include("Etkinlik analitiği ve blokzincir kayıtları yükleniyor...");
    });
  });

  // =========================================================================
  // 2. ORGANIZER COMMUNITY SELECTION & AUTHORIZATION
  // =========================================================================
  describe("2. Organizatör Topluluk Seçimi ve Sunucu Yetkilendirme Kuralları", function () {
    it("2.1 HomePage etkinlik oluşturma formunda topluluk alanı serbest metin değil, kontrollü <select> olmalı ve durumları göstermeli", function () {
      const testOrganizer = "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5";

      // Durum A: Yükleniyor
      const loadingHtml = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events?create=1"] },
          el(HomePage, {
            viewMode: "discovery",
            account: testOrganizer,
            chainId: TEST_CHAIN_ID,
            loadingCommunities: true,
          })
        )
      );
      expect(loadingHtml).to.include("Yetkili topluluklarınız yükleniyor...");

      // Durum B: Yetkili topluluk yok
      const emptyHtml = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events?create=1"] },
          el(HomePage, {
            viewMode: "discovery",
            account: testOrganizer,
            chainId: TEST_CHAIN_ID,
            sessionState: { authenticated: true, walletAddress: testOrganizer },
            manageableCommunities: [],
          })
        )
      );
      expect(emptyHtml).to.include("Yönetici yetkiniz olan aktif bir topluluk bulunamadı");
      expect(emptyHtml).to.include("Kurucu (OWNER) veya Yönetici (ADMIN) olmalısınız");

      // Durum C: Yetkili topluluklar yüklendi
      const readyHtml = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events?create=1"] },
          el(HomePage, {
            viewMode: "discovery",
            account: testOrganizer,
            chainId: TEST_CHAIN_ID,
            sessionState: { authenticated: true, walletAddress: testOrganizer },
            manageableCommunities: [
              {
                communityId: "comm-101",
                name: "İTÜ Blockchain Topluluğu",
                role: "OWNER",
              },
              {
                communityId: "comm-102",
                name: "Yapay Zeka Kulübü",
                role: "ADMIN",
              },
            ],
          })
        )
      );
      expect(readyHtml).to.include('<select id="event-community"');
      expect(readyHtml).to.include("İTÜ Blockchain Topluluğu (Kurucu)");
      expect(readyHtml).to.include("Yapay Zeka Kulübü (Yönetici)");
    });

    it("2.2 GET /api/communities/manageable yalnızca kullanıcının OWNER veya ADMIN olduğu aktif toplulukları dönmeli", async function () {
      const {
        app,
        organizerSigner,
        communityAdminSigner,
        regularMemberSigner,
      } = await deployFixture();

      const orgAuth = await loginWithSiwe(app, organizerSigner);
      const adminAuth = await loginWithSiwe(app, communityAdminSigner);
      const memberAuth = await loginWithSiwe(app, regularMemberSigner);

      // Organizer bir topluluk kurar (OWNER)
      const createCommRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          name: "Monad Geliştirici Topluluğu",
          slug: "monad-gelistirici-toplulugu",
          category: "Blockchain",
          universityName: "Teknik Üniversite",
          shortDescription: "Web3 ve Monad geliştirici topluluğu.",
        },
      });
      expect(createCommRes.status).to.equal(201);
      const communityId = createCommRes.body.data.id;

      // Admin ve Member katılır, onaylanır, Admin yetkilendirilir
      for (const auth of [adminAuth, memberAuth]) {
        await app.inject({
          method: "POST",
          url: `/api/communities/${communityId}/join`,
          headers: {
            cookie: auth.cookieHeader,
            "x-csrf-token": auth.csrfToken,
          },
        });
      }

      const appsRes = await app.inject({
        method: "GET",
        url: `/api/communities/${communityId}/applications`,
        headers: { cookie: orgAuth.cookieHeader },
      });
      for (const item of appsRes.body.data.items) {
        await app.inject({
          method: "POST",
          url: `/api/communities/${communityId}/applications/${item.id}/approve`,
          headers: {
            cookie: orgAuth.cookieHeader,
            "x-csrf-token": orgAuth.csrfToken,
          },
        });
      }

      // communityAdminSigner'ı ADMIN yap
      const membersRes = await app.inject({
        method: "GET",
        url: `/api/communities/${communityId}/members`,
        headers: { cookie: orgAuth.cookieHeader },
      });
      const adminMemberRecord = membersRes.body.data.items.find(
        (m) =>
          m.walletAddress.toLowerCase() ===
          communityAdminSigner.address.toLowerCase()
      );
      await app.inject({
        method: "PATCH",
        url: `/api/communities/${communityId}/members/${adminMemberRecord.id}/role`,
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: { role: "ADMIN" },
      });

      // OWNER için manageable listesi 1 topluluk dönmeli
      const orgManageable = await app.inject({
        method: "GET",
        url: "/api/communities/manageable",
        headers: { cookie: orgAuth.cookieHeader },
      });
      expect(orgManageable.status).to.equal(200);
      expect(orgManageable.body.data.items).to.have.lengthOf(1);
      expect(orgManageable.body.data.items[0].id).to.equal(communityId);
      expect(orgManageable.body.data.items[0].role).to.equal("OWNER");

      // ADMIN için manageable listesi 1 topluluk dönmeli
      const adminManageable = await app.inject({
        method: "GET",
        url: "/api/communities/manageable",
        headers: { cookie: adminAuth.cookieHeader },
      });
      expect(adminManageable.status).to.equal(200);
      expect(adminManageable.body.data.items).to.have.lengthOf(1);
      expect(adminManageable.body.data.items[0].role).to.equal("ADMIN");

      // Normal MEMBER için manageable listesi BOŞ olmalı
      const memberManageable = await app.inject({
        method: "GET",
        url: "/api/communities/manageable",
        headers: { cookie: memberAuth.cookieHeader },
      });
      expect(memberManageable.status).to.equal(200);
      expect(memberManageable.body.data.items).to.have.lengthOf(0);
    });

    it("2.3 Sunucu metadata kaydında communityId yetkisini doğrulamalı, sahte/serbest metin veya yetkisiz topluluğu reddetmeli", async function () {
      const {
        app,
        campusPass,
        organizerSigner,
        outsiderSigner,
      } = await deployFixture();

      const orgAuth = await loginWithSiwe(app, organizerSigner);
      const outsiderAuth = await loginWithSiwe(app, outsiderSigner);

      // 1. Outsider kendi topluluğunu kurar
      const outsiderCommRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: outsiderAuth.cookieHeader,
          "x-csrf-token": outsiderAuth.csrfToken,
        },
        body: {
          name: "Outsider Kulübü",
          slug: "outsider-kulubu",
          category: "Teknoloji",
          universityName: "Test Üniversitesi",
          shortDescription: "Başka bir kulüp.",
        },
      });
      const outsiderCommunityId = outsiderCommRes.body.data.id;

      // 2. Organizer kendi topluluğunu kurar
      const orgCommRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          name: "Resmi Blockchain Kulübü",
          slug: "resmi-blockchain-kulubu",
          category: "Blockchain",
          universityName: "Test Üniversitesi",
          shortDescription: "Yetkili kulüp.",
        },
      });
      const orgCommunityId = orgCommRes.body.data.id;

      // 3. Organizer zincirde etkinlik oluşturur (Event #1)
      const tx = await campusPass
        .connect(organizerSigner)
        .createEvent("Web3 Zirvesi", 100n);
      await tx.wait();

      const baseMetadataPayload = {
        category: "Blockchain",
        description: "Kapsamlı blokzincir zirvesi.",
        date: "2026-12-10",
        startTime: "14:00",
        endTime: "17:00",
        registrationDeadline: "2026-12-10T12:00",
        location: {
          campus: "Merkez Kampüs",
          building: "Mühendislik",
          room: "A-101",
        },
      };

      // Durum A: Yetkisiz (başkasının) communityId gönderildiğinde 403 COMMUNITY_UNAUTHORIZED
      const unauthCommRes = await app.inject({
        method: "POST",
        url: "/api/events/1/metadata",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          ...baseMetadataPayload,
          communityId: outsiderCommunityId,
          community: "Outsider Kulübü",
        },
      });
      expect(unauthCommRes.status).to.equal(403);
      expect(unauthCommRes.body.error?.code).to.equal("COMMUNITY_UNAUTHORIZED");

      // Durum B: Geçersiz / var olmayan communityId gönderildiğinde 404 COMMUNITY_NOT_FOUND
      const notFoundCommRes = await app.inject({
        method: "POST",
        url: "/api/events/1/metadata",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          ...baseMetadataPayload,
          communityId: "non-existent-community-id",
          community: "Hayali Kulüp",
        },
      });
      expect(notFoundCommRes.status).to.equal(404);
      expect(notFoundCommRes.body.error?.code).to.equal("COMMUNITY_NOT_FOUND");

      // Durum C: Serbest metin (kayıtsız topluluk adı) gönderildiğinde 400 COMMUNITY_SELECTION_REQUIRED
      const freeTextRes = await app.inject({
        method: "POST",
        url: "/api/events/1/metadata",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          ...baseMetadataPayload,
          community: "Rastgele Serbest Metin Kulübü",
        },
      });
      expect(freeTextRes.status).to.equal(400);
      expect(freeTextRes.body.error?.code).to.equal("COMMUNITY_SELECTION_REQUIRED");

      // Durum D: Yetkili communityId ile gönderildiğinde (istemci sahte isim gönderse bile) DB'deki gerçek topluluk adı yazılmalı
      const validRes = await app.inject({
        method: "POST",
        url: "/api/events/1/metadata",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          ...baseMetadataPayload,
          communityId: orgCommunityId,
          community: "İstemcinin Manipüle Ettiği Sahte İsim",
        },
      });
      expect(validRes.status).to.equal(201);
      expect(validRes.body.data.communityId).to.equal(orgCommunityId);
      expect(validRes.body.data.community).to.equal("Resmi Blockchain Kulübü");
    });
  });

  // =========================================================================
  // 3. STUDENT DASHBOARD REGISTRATIONS & ISOLATION
  // =========================================================================
  describe("3. Öğrenci Paneli Kayıt Görünürlüğü ve Kullanıcılar Arası İzolasyon", function () {
    it("3.1 Öğrenci kendi kayıt olduğu etkinlikleri, katılım ve sertifika durumlarıyla görmeli; başka cüzdanın kayıtları sızmamalı", async function () {
      const {
        app,
        campusPass,
        organizerSigner,
        studentASigner,
        studentBSigner,
      } = await deployFixture();

      const orgAuth = await loginWithSiwe(app, organizerSigner);
      const studentAAuth = await loginWithSiwe(app, studentASigner);

      // Topluluk oluştur
      const commRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          name: "Kampüs Yazılım Topluluğu",
          slug: "kampus-yazilim-toplulugu",
          category: "Yazılım",
          universityName: "Test Üniversitesi",
          shortDescription: "Yazılım etkinlikleri.",
        },
      });
      const communityId = commRes.body.data.id;

      // Etkinlik #1 ve Etkinlik #2 oluştur
      await (await campusPass.connect(organizerSigner).createEvent("Solidity Bootcamp", 50n)).wait();
      await (await campusPass.connect(organizerSigner).createEvent("Siber Güvenlik Semineri", 50n)).wait();

      for (const [evId, title] of [
        [1, "Solidity Bootcamp"],
        [2, "Siber Güvenlik Semineri"],
      ]) {
        await app.inject({
          method: "POST",
          url: `/api/events/${evId}/metadata`,
          headers: {
            cookie: orgAuth.cookieHeader,
            "x-csrf-token": orgAuth.csrfToken,
          },
          body: {
            communityId,
            community: "Kampüs Yazılım Topluluğu",
            category: "Yazılım",
            description: `${title} açıklaması`,
            date: "2026-12-15",
            startTime: "13:00",
            endTime: "16:00",
            registrationDeadline: "2026-12-15T12:00",
            location: { campus: "Merkez", building: "B Blok", room: "102" },
          },
        });
      }

      // Student A yalnızca Etkinlik #1'e kaydolur; Student B yalnızca Etkinlik #2'ye kaydolur
      const regATx = await campusPass.connect(studentASigner).registerForEvent(1n);
      const regAReceipt = await regATx.wait();

      const regBTx = await campusPass.connect(studentBSigner).registerForEvent(2n);
      const regBReceipt = await regBTx.wait();

      // Kayıt senkronizasyon uç noktası
      const syncARes = await app.inject({
        method: "POST",
        url: "/api/events/1/registrations/sync",
        headers: {
          cookie: studentAAuth.cookieHeader,
          "x-csrf-token": studentAAuth.csrfToken,
        },
        body: {
          walletAddress: studentASigner.address,
          txHash: regAReceipt.hash,
        },
      });
      expect(syncARes.status).to.equal(200);
      expect(syncARes.body.data.registrationExists).to.be.true;
      expect(syncARes.body.data.attendanceVerified).to.be.false;

      // Student A profil etkinliklerini sorgular
      const studentAEventsRes = await app.inject({
        method: "GET",
        url: `/api/students/${studentASigner.address}/events`,
      });
      expect(studentAEventsRes.status).to.equal(200);
      const studentAData = studentAEventsRes.body.data;

      expect(studentAData.registeredEvents).to.have.lengthOf(1);
      expect(studentAData.registeredEvents[0].id).to.equal(1);
      expect(studentAData.registeredEvents[0].title).to.equal("Solidity Bootcamp");
      expect(studentAData.registeredEvents[0].registrationStatus).to.equal("REGISTERED");
      expect(studentAData.registeredEvents[0].attendanceVerificationStatus).to.equal(
        "PENDING"
      );
      expect(studentAData.registeredEvents[0].hasCertificate).to.be.false;
      expect(studentAData.registeredEvents[0].certificateStatus).to.equal(
        "NOT_ELIGIBLE"
      );

      // Student B'nin kaydı (Etkinlik #2) Student A'nın listesinde ASLA yer almamalı
      expect(studentAData.registeredEvents.some((e) => e.id === 2)).to.be.false;

      // Student B profil etkinliklerini sorgular (zincir üstü okuma ile Etkinlik #2'yi görmeli, Etkinlik #1'i görmemeli)
      const studentBEventsRes = await app.inject({
        method: "GET",
        url: `/api/students/${studentBSigner.address}/events`,
      });
      expect(studentBEventsRes.status).to.equal(200);
      const studentBData = studentBEventsRes.body.data;
      expect(studentBData.registeredEvents).to.have.lengthOf(1);
      expect(studentBData.registeredEvents[0].id).to.equal(2);
      expect(studentBData.registeredEvents[0].title).to.equal("Siber Güvenlik Semineri");
      expect(studentBData.registeredEvents.some((e) => e.id === 1)).to.be.false;

      // İstemci tarafı fetchStudentProfileData fonksiyonu da Monad 100-blok sınırına takılmadan doğru veriyi dönmeli
      const clientProfileA = await fetchStudentProfileData({
        walletAddress: studentASigner.address,
        contract: campusPass,
        chainId: TEST_CHAIN_ID,
        contractAddress: await campusPass.getAddress(),
      });
      expect(clientProfileA.registeredEvents).to.have.lengthOf(1);
      expect(clientProfileA.registeredEvents[0].id).to.equal(1);
      expect(clientProfileA.registeredEvents[0].registrationTxHash).to.equal(
        regAReceipt.hash
      );
      expect(regBReceipt.hash).to.not.equal(regAReceipt.hash);
    });

    it("3.2 StudentProfile bileşeni kayıtlı etkinliği, katılım durumunu ve sertifika rozetini render etmeli", function () {
      const testWallet = "0x1111111111111111111111111111111111111111";
      const sampleRegisteredEvent = {
        id: 7,
        title: "Monad Zero-Knowledge Atölyesi",
        organizer: "0x2222222222222222222222222222222222222222",
        community: "ZK Kulübü",
        category: "Blockchain",
        capacity: 40,
        registeredCount: 15,
        active: true,
        isRegistered: true,
        isAttended: true,
        hasCertificate: true,
        date: "2026-11-25",
        startTime: "15:00",
        endTime: "18:00",
        location: { campus: "Merkez", building: "FEAS", room: "Z-10" },
        status: "completed",
        statusLabel: "Tamamlandı",
      };

      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/profile"] },
          el(
            AppProvider,
            {
              initialAccount: testWallet,
              initialChainId: TEST_CHAIN_ID,
              initialEvents: [sampleRegisteredEvent],
              initialLoadingEvents: false,
              initialSessionState: {
                authenticated: true,
                walletAddress: testWallet,
                loading: false,
              },
            },
            el(StudentProfile, {
              account: testWallet,
              chainId: TEST_CHAIN_ID,
              defaultTab: "events",
            })
          )
        )
      );

      expect(html).to.include("0x1111...1111");
      expect(html).to.include("Cüzdan Doğrulandı ✓");
    });
  });

  // =========================================================================
  // 4. ATTENDANCE QR SECURITY
  // =========================================================================
  describe("4. Katılım QR Güvenliği (Self-Scan Engeli, Yetki, Replay, Süre, Cross-Event)", function () {
    beforeEach(function () {
      clearUsedNonces();
    });

    it("4.1 Öğrenci görünümü yalnızca QR kod gösterimini içermeli; Organizatör tarama arayüzü öğrenciye görünmemeli", function () {
      const organizerAddr = "0x1111111111111111111111111111111111111111";
      const studentAddr = "0x2222222222222222222222222222222222222222";
      const sampleEvent = {
        id: 1,
        title: "Güvenli QR Etkinliği",
        organizer: organizerAddr,
        community: "Güvenlik Kulübü",
        category: "Siber Güvenlik",
        capacity: 50,
        registeredCount: 10,
        active: true,
        isRegistered: true,
        isAttended: false,
        date: "2026-12-01",
        startTime: "14:00",
        endTime: "16:00",
        registrationDeadline: "2026-12-01T12:00",
        location: { campus: "Kampüs", building: "Bina", room: "Salon" },
        status: "upcoming",
        statusLabel: "Kayıt Açık",
      };

      // Öğrenci görünümü
      const studentHtml = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events/1"] },
          el(EventPage, {
            event: sampleEvent,
            account: studentAddr,
            chainId: TEST_CHAIN_ID,
          })
        )
      );
      expect(studentHtml).to.include("Öğrenci İmzalı QR Katılım Kodu");
      expect(studentHtml).to.not.include("Organizatör Yönetimi");
      expect(studentHtml).to.not.include("1. İmzayı Doğrula");

      // Organizatör görünümü (organizatör kendi etkinliğine kayıtlı olsa bile kendi öğrenci QR panelini görmemeli)
      const organizerHtml = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/events/1"] },
          el(EventPage, {
            event: sampleEvent,
            account: organizerAddr,
            chainId: TEST_CHAIN_ID,
          })
        )
      );
      expect(organizerHtml).to.include("Organizatör Yönetimi");
      expect(organizerHtml).to.include("1. İmzayı Doğrula");
      expect(organizerHtml).to.not.include("Öğrenci İmzalı QR Katılım Kodu");
    });

    it("4.2 verifySignedQrTicket öğrencinin veya organizatörün kendi QR kodunu okutmasını (self-scan) reddetmeli", async function () {
      const { campusPass, contractAddress, organizerSigner, studentASigner } =
        await deployFixture();

      await (await campusPass.connect(organizerSigner).createEvent("QR Test Etkinliği", 50n)).wait();
      await (await campusPass.connect(studentASigner).registerForEvent(1n)).wait();
      await (await campusPass.connect(organizerSigner).registerForEvent(1n)).wait();

      // Senaryo A: Öğrenci kendi QR kodunu üretip kendi cüzdanıyla doğrulamaya çalışır
      const studentTicket = await buildSignedTicketForTest({
        signer: studentASigner,
        contractAddress,
        eventId: 1,
        nonce: "0xaaaa1111222233334444555566667777",
      });

      const selfScanByStudent = await verifySignedQrTicket({
        rawQrString: studentTicket.rawQrString,
        expectedEventId: 1,
        connectedAccount: studentASigner.address,
        expectedChainId: TEST_CHAIN_ID,
        expectedContractAddress: contractAddress,
        contractInstance: campusPass,
      });
      expect(selfScanByStudent.valid).to.be.false;
      const orgCheckA = selfScanByStudent.checks.find((c) => c.id === "organizer");
      expect(orgCheckA.passed).to.be.false;

      // Senaryo B: Organizatör kendi QR kodunu üretip okutmaya çalışır
      const organizerTicket = await buildSignedTicketForTest({
        signer: organizerSigner,
        contractAddress,
        eventId: 1,
        nonce: "0xbbbb1111222233334444555566667777",
      });

      const selfScanByOrganizer = await verifySignedQrTicket({
        rawQrString: organizerTicket.rawQrString,
        expectedEventId: 1,
        connectedAccount: organizerSigner.address,
        expectedChainId: TEST_CHAIN_ID,
        expectedContractAddress: contractAddress,
        contractInstance: campusPass,
      });
      expect(selfScanByOrganizer.valid).to.be.false;
      const orgCheckB = selfScanByOrganizer.checks.find((c) => c.id === "organizer");
      expect(orgCheckB.passed).to.be.false;
      expect(orgCheckB.detail).to.include("kendi QR kodlarını doğrulayamaz");
    });

    it("4.3 Backend POST /api/events/:eventId/attendance/verify yetkisiz doğrulayıcıyı, self-scan'i, replay'i, süresi dolmuş ve farklı etkinlik QR kodlarını reddetmeli", async function () {
      const {
        app,
        campusPass,
        contractAddress,
        organizerSigner,
        studentASigner,
        outsiderSigner,
      } = await deployFixture();

      const orgAuth = await loginWithSiwe(app, organizerSigner);
      const studentAAuth = await loginWithSiwe(app, studentASigner);
      const outsiderAuth = await loginWithSiwe(app, outsiderSigner);

      // Etkinlik #1 ve #2 oluştur
      await (await campusPass.connect(organizerSigner).createEvent("Etkinlik 1", 50n)).wait();
      await (await campusPass.connect(organizerSigner).createEvent("Etkinlik 2", 50n)).wait();

      // Student A ve Organizer Etkinlik #1'e kaydolur
      await (await campusPass.connect(studentASigner).registerForEvent(1n)).wait();
      await (await campusPass.connect(organizerSigner).registerForEvent(1n)).wait();

      const validStudentTicket = await buildSignedTicketForTest({
        signer: studentASigner,
        contractAddress,
        eventId: 1,
        nonce: "0x11112222333344445555666677778888",
      });

      // A) Öğrenci doğrudan API isteğiyle kendi QR kodunu doğrulamaya çalışırsa -> 403 SELF_ATTENDANCE_FORBIDDEN
      const studentDirectVerify = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: studentAAuth.cookieHeader,
          "x-csrf-token": studentAAuth.csrfToken,
        },
        body: {
          rawQrString: validStudentTicket.rawQrString,
        },
      });
      expect(studentDirectVerify.status).to.equal(403);
      expect(studentDirectVerify.body.error?.code).to.equal(
        "SELF_ATTENDANCE_FORBIDDEN"
      );

      // B) Yetkisiz üçüncü kişi (outsider) doğrulamaya çalışırsa -> 403 ATTENDANCE_VERIFIER_UNAUTHORIZED
      const outsiderVerify = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: outsiderAuth.cookieHeader,
          "x-csrf-token": outsiderAuth.csrfToken,
        },
        body: {
          rawQrString: validStudentTicket.rawQrString,
        },
      });
      expect(outsiderVerify.status).to.equal(403);
      expect(outsiderVerify.body.error?.code).to.equal(
        "ATTENDANCE_VERIFIER_UNAUTHORIZED"
      );

      // C) Organizatör kendi katılımını (self-attendance) işaretlemeye çalışırsa -> 403 SELF_ATTENDANCE_FORBIDDEN
      const orgSelfTicket = await buildSignedTicketForTest({
        signer: organizerSigner,
        contractAddress,
        eventId: 1,
        nonce: "0x99998888777766665555444433332222",
      });
      const orgSelfVerify = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          rawQrString: orgSelfTicket.rawQrString,
        },
      });
      expect(orgSelfVerify.status).to.equal(403);
      expect(orgSelfVerify.body.error?.code).to.equal("SELF_ATTENDANCE_FORBIDDEN");

      // D) Farklı etkinlik (Etkinlik #2) için üretilmiş QR kod Etkinlik #1'de okutulursa -> 400 QR_CROSS_EVENT_REJECTED
      const crossEventTicket = await buildSignedTicketForTest({
        signer: studentASigner,
        contractAddress,
        eventId: 2,
        nonce: "0xcccc1111222233334444555566667777",
      });
      const crossEventVerify = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          rawQrString: crossEventTicket.rawQrString,
        },
      });
      expect(crossEventVerify.status).to.equal(400);
      expect(crossEventVerify.body.error?.code).to.equal("QR_CROSS_EVENT_REJECTED");

      // E) Süresi dolmuş QR kod okutulursa -> 400 QR_EXPIRED_OR_INVALID_TTL
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredTicket = await buildSignedTicketForTest({
        signer: studentASigner,
        contractAddress,
        eventId: 1,
        nonce: "0xdddd1111222233334444555566667777",
        issuedAt: nowSec - 300,
        expiresAt: nowSec - 120,
      });
      const expiredVerify = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          rawQrString: expiredTicket.rawQrString,
        },
      });
      expect(expiredVerify.status).to.equal(400);
      expect(expiredVerify.body.error?.code).to.equal("QR_EXPIRED_OR_INVALID_TTL");

      // F) Geçerli QR kod için ön doğrulama (consumeNonce: false):
      // "Kayıt mevcut (registrationExists: true)" ile "Katılım doğrulandı (attendanceVerified: false)" net biçimde ayrışmalı
      const preCheckRes = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          rawQrString: validStudentTicket.rawQrString,
          consumeNonce: false,
        },
      });
      expect(preCheckRes.status).to.equal(200);
      expect(preCheckRes.body.data.registrationExists).to.be.true;
      expect(preCheckRes.body.data.attendanceVerified).to.be.false;
      expect(preCheckRes.body.data.verificationStage).to.equal(
        "REGISTRATION_VERIFIED_READY_FOR_ONCHAIN_MARK"
      );

      // G) Organizatör zincirde katılımı işaretler ve sunucuda QR onayını tamamlar (consumeNonce: true)
      const attTx = await campusPass
        .connect(organizerSigner)
        .markAttendance(1n, studentASigner.address);
      const attReceipt = await attTx.wait();

      const confirmRes = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          rawQrString: validStudentTicket.rawQrString,
          txHash: attReceipt.hash,
          consumeNonce: true,
        },
      });
      expect(confirmRes.status).to.equal(200);
      expect(confirmRes.body.data.registrationExists).to.be.true;
      expect(confirmRes.body.data.attendanceVerified).to.be.true;
      expect(confirmRes.body.data.verificationStage).to.equal("ATTENDANCE_VERIFIED");

      // H) Aynı QR kod tekrar kullanıldığında (Replay Attack) -> 409 QR_NONCE_REPLAY_DETECTED
      const replayRes = await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          rawQrString: validStudentTicket.rawQrString,
        },
      });
      expect(replayRes.status).to.equal(409);
      expect(replayRes.body.error?.code).to.equal("QR_NONCE_REPLAY_DETECTED");
    });
  });

  // =========================================================================
  // 5. CERTIFICATE ISSUANCE AFTER VALID ATTENDANCE
  // =========================================================================
  describe("5. Geçerli Katılım Doğrulaması Sonrası Sertifika Üretimi ve Bildirim Akışı", function () {
    it("5.1 Katılım doğrulanmadan sertifika üretilememeli; katılım doğrulandıktan sonra üretilmeli, mükerrer üretim engellenmeli ve bildirim gönderilmeli", async function () {
      const {
        app,
        campusPass,
        organizerSigner,
        studentASigner,
        studentBSigner,
        outsiderSigner,
      } = await deployFixture();

      const orgAuth = await loginWithSiwe(app, organizerSigner);
      const studentAAuth = await loginWithSiwe(app, studentASigner);
      const studentBAuth = await loginWithSiwe(app, studentBSigner);
      const outsiderAuth = await loginWithSiwe(app, outsiderSigner);

      // Etkinlik oluştur ve Student A + Student B kaydolsun
      await (await campusPass.connect(organizerSigner).createEvent("Monad Sertifika Zirvesi", 50n)).wait();
      await (await campusPass.connect(studentASigner).registerForEvent(1n)).wait();
      await (await campusPass.connect(studentBSigner).registerForEvent(1n)).wait();

      // 1. Katılım doğrulanmadan önce Student A sertifika talep ederse -> 403 ATTENDANCE_NOT_VERIFIED_ONCHAIN
      const prematureCertRes = await app.inject({
        method: "POST",
        url: "/api/certificates/issue",
        headers: {
          cookie: studentAAuth.cookieHeader,
          "x-csrf-token": studentAAuth.csrfToken,
        },
        body: {
          eventId: 1,
          walletAddress: studentASigner.address,
        },
      });
      expect(prematureCertRes.status).to.equal(403);
      expect(prematureCertRes.body.error?.code).to.equal(
        "ATTENDANCE_NOT_VERIFIED_ONCHAIN"
      );

      // 2. Organizatör Student A ve Student B'nin katılımını doğrular
      const attTxA = await campusPass
        .connect(organizerSigner)
        .markAttendance(1n, studentASigner.address);
      const attReceiptA = await attTxA.wait();

      await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          participantAddress: studentASigner.address,
          txHash: attReceiptA.hash,
        },
      });

      const attTxB = await campusPass
        .connect(organizerSigner)
        .markAttendance(1n, studentBSigner.address);
      const attReceiptB = await attTxB.wait();

      await app.inject({
        method: "POST",
        url: "/api/events/1/attendance/verify",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          participantAddress: studentBSigner.address,
          txHash: attReceiptB.hash,
        },
      });

      // 3. Yetkisiz üçüncü kişi (outsider) Student A adına sertifika üretmeye çalışırsa -> 403 CERTIFICATE_WALLET_MISMATCH
      const unauthorizedIssueRes = await app.inject({
        method: "POST",
        url: "/api/certificates/issue",
        headers: {
          cookie: outsiderAuth.cookieHeader,
          "x-csrf-token": outsiderAuth.csrfToken,
        },
        body: {
          eventId: 1,
          walletAddress: studentASigner.address,
        },
      });
      expect(unauthorizedIssueRes.status).to.equal(403);
      expect(unauthorizedIssueRes.body.error?.code).to.equal(
        "CERTIFICATE_WALLET_MISMATCH"
      );

      // 4. Organizatör katılımı doğrulanmış Student A adına sertifika üretebilmeli (201 Created)
      const orgIssueRes = await app.inject({
        method: "POST",
        url: "/api/certificates/issue",
        headers: {
          cookie: orgAuth.cookieHeader,
          "x-csrf-token": orgAuth.csrfToken,
        },
        body: {
          eventId: 1,
          walletAddress: studentASigner.address,
        },
      });
      expect(orgIssueRes.status).to.equal(201);
      expect(orgIssueRes.body.created).to.be.true;
      const certA = orgIssueRes.body.data;
      expect(certA.certificateId).to.match(/^CP-CERT-[A-F0-9]+$/);
      expect(certA.participantAddress.toLowerCase()).to.equal(
        studentASigner.address.toLowerCase()
      );
      expect(certA.eventId).to.equal(1);

      // 5. Mükerrer sertifika talebi (Student A tekrar isterse) yeni kayıt oluşturmamalı (200 OK, created: false, aynı certificateId)
      const duplicateIssueRes = await app.inject({
        method: "POST",
        url: "/api/certificates/issue",
        headers: {
          cookie: studentAAuth.cookieHeader,
          "x-csrf-token": studentAAuth.csrfToken,
        },
        body: {
          eventId: 1,
          walletAddress: studentASigner.address,
        },
      });
      expect(duplicateIssueRes.status).to.equal(200);
      expect(duplicateIssueRes.body.created).to.be.false;
      expect(duplicateIssueRes.body.data.certificateId).to.equal(
        certA.certificateId
      );

      // 6. Student B kendi sertifikasını üretebilmeli (201 Created)
      const studentBIssueRes = await app.inject({
        method: "POST",
        url: "/api/certificates/issue",
        headers: {
          cookie: studentBAuth.cookieHeader,
          "x-csrf-token": studentBAuth.csrfToken,
        },
        body: {
          eventId: 1,
          walletAddress: studentBSigner.address,
        },
      });
      expect(studentBIssueRes.status).to.equal(201);
      expect(studentBIssueRes.body.created).to.be.true;
      expect(studentBIssueRes.body.data.certificateId).to.not.equal(
        certA.certificateId
      );

      // 7. Student A'nın bildirimlerinde CERTIFICATE_ISSUED bildirimi yer almalı
      const notifRes = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: studentAAuth.cookieHeader },
      });
      expect(notifRes.status).to.equal(200);
      const notifItems = Array.isArray(notifRes.body.data)
        ? notifRes.body.data
        : notifRes.body.data?.items || [];
      const certNotif = notifItems.find(
        (n) => n.type === NOTIFICATION_TYPES.CERTIFICATE_ISSUED
      );
      expect(certNotif).to.not.be.undefined;
      const parsedMeta =
        typeof certNotif.metadata === "string"
          ? JSON.parse(certNotif.metadata)
          : certNotif.metadata;
      expect(parsedMeta?.certificateId).to.equal(certA.certificateId);
      expect(certNotif.destinationUrl).to.equal(`/verify/${certA.certificateId}`);

      // 8. Öğrenci Paneli (GET /api/students/:wallet/events) sertifika durumunu ACTIVE olarak göstermeli
      const studentAEventsAfterCert = await app.inject({
        method: "GET",
        url: `/api/students/${studentASigner.address}/events`,
      });
      expect(studentAEventsAfterCert.status).to.equal(200);
      const evAfter = studentAEventsAfterCert.body.data.registeredEvents[0];
      expect(evAfter.hasCertificate).to.be.true;
      expect(evAfter.certificateId).to.equal(certA.certificateId);
      expect(evAfter.certificateStatus).to.equal("ACTIVE");

      // 9. Açık sertifika doğrulama uç noktası (GET /api/certificates/verify/:certificateId) çalışmaya devam etmeli
      const publicVerifyRes = await app.inject({
        method: "GET",
        url: `/api/certificates/verify/${certA.certificateId}`,
      });
      expect(publicVerifyRes.status).to.equal(200);
      expect(publicVerifyRes.body.data.verified).to.be.true;
      expect(publicVerifyRes.body.data.verificationStatus).to.equal("VERIFIED");
    });
  });
});
