import { expect } from "chai";
import { network } from "hardhat";
import React from "react";
globalThis.React = React;
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { buildCampusPassApp } from "../server/src/app.js";
import { createEventIndexer } from "../server/src/indexer/eventIndexer.js";
import { buildSiweMessage } from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";

import CommunityManagePage from "../src/pages/CommunityManagePage.jsx";
import OrganizerEventAnalyticsPage from "../src/pages/OrganizerEventAnalyticsPage.jsx";
import CommunityProfilePage from "../src/pages/CommunityProfilePage.jsx";
import { AppProvider } from "../src/context/AppContext.jsx";

const { ethers } = await network.create();
const el = React.createElement;

describe("Faz 19 — Community & Organizer Operations Test Paketi", function () {
  this.timeout(15000);

  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployPhase19Fixture() {
    const [
      ownerSigner,
      adminSigner,
      memberSigner,
      applicantSigner,
      strangerSigner,
    ] = await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // 1 Etkinlik oluştur
    await campusPass.connect(ownerSigner).createEvent("Topluluk Zirvesi 2026", 100);

    // Öğrenci kayıt
    await campusPass.connect(memberSigner).registerForEvent(1);

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
      ownerSigner,
      adminSigner,
      memberSigner,
      applicantSigner,
      strangerSigner,
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
      statement: "CampusPass topluluk islemleri icin cuzdaninizi dogrulayin.",
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
  // BÖLÜM 1: TOPLULUK OPERASYON MERKEZİ (COMMUNITY OPERATIONS HUB)
  // =========================================================================
  describe("A. Community Operations Hub & Activity", function () {
    it("A.1 Oturum açmamış kullanıcı topluluk aktivite akışına erişemez (401)", async function () {
      const { app } = await deployPhase19Fixture();
      const res = await app.inject({
        method: "GET",
        url: "/api/communities/test-community/activity",
      });
      expect(res.status).to.equal(401);
    });

    it("A.2 Yetkisiz kullanıcı (üye olmayan veya sıradan üye) aktivite akışına erişemez (403)", async function () {
      const { app, ownerSigner, strangerSigner } = await deployPhase19Fixture();
      const ownerSession = await loginWithSiwe(app, ownerSigner);

      // Topluluk kur
      const createRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
        body: {
          name: "Operasyon Test Topluluğu",
          shortDescription: "Aktivite testi",
        },
      });
      expect(createRes.status).to.equal(201);
      const slug = createRes.body.data.slug;

      // Yabancı oturum açsın
      const strangerSession = await loginWithSiwe(app, strangerSigner);
      const activityRes = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/activity`,
        headers: {
          cookie: strangerSession.cookieHeader,
          "x-csrf-token": strangerSession.csrfToken,
        },
      });
      expect(activityRes.status).to.equal(403);
    });

    it("A.3 OWNER ve ADMIN kullanıcılar gerçek operasyonel aktivite kayıtlarını görebilir (200)", async function () {
      const { app, ownerSigner, applicantSigner } = await deployPhase19Fixture();
      const ownerSession = await loginWithSiwe(app, ownerSigner);

      // Topluluk kur
      const createRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
        body: {
          name: "Blokzincir Kulübü Hub",
          shortDescription: "Merkez testi",
        },
      });
      const slug = createRes.body.data.slug;

      // Başvuru yap
      const applicantSession = await loginWithSiwe(app, applicantSigner);
      await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/join`,
        headers: {
          cookie: applicantSession.cookieHeader,
          "x-csrf-token": applicantSession.csrfToken,
        },
      });

      // Başvuranı listele ve ID al
      const appsListRes = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/applications`,
        headers: {
          cookie: ownerSession.cookieHeader,
        },
      });
      expect(appsListRes.status).to.equal(200);
      const appMemberId = appsListRes.body.data.items[0].id;

      // Başvuruyu onayla
      const approveRes = await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/applications/${appMemberId}/approve`,
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
      });
      expect(approveRes.status).to.equal(200);

      // Duyuru oluştur
      await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/announcements`,
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
        body: {
          title: "İlk Tanışma Toplantısı",
          content: "Tüm üyelerimizi bekliyoruz.",
        },
      });

      // Aktivite akışını sorgula
      const actRes = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/activity`,
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
      });
      expect(actRes.status).to.equal(200);
      expect(actRes.body.success).to.equal(true);
      expect(actRes.body.data.items).to.be.an("array");
      expect(actRes.body.data.items.length).to.be.greaterThan(0);

      // Duyuru veya üyelik onay aktivitesi mevcut olmalı
      const types = actRes.body.data.items.map((i) => i.type);
      expect(types).to.include.members(["MEMBERSHIP_APPROVED", "ANNOUNCEMENT_PUBLISHED"]);
    });

    it("A.4 Manageable topluluklar özeti ve operasyon metrikleri doğru hesaplanmalı", async function () {
      const { app, ownerSigner } = await deployPhase19Fixture();
      const ownerSession = await loginWithSiwe(app, ownerSigner);

      const res = await app.inject({
        method: "GET",
        url: "/api/communities/manageable",
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
      });

      expect(res.status).to.equal(200);
      expect(res.body.data.summary).to.be.an("object");
      expect(res.body.data.summary).to.have.property("totalManagedCommunities");
      expect(res.body.data.summary).to.have.property("totalActiveMembers");
      expect(res.body.data.summary).to.have.property("totalPendingApplications");
    });
  });

  // =========================================================================
  // BÖLÜM 2: ÜYELİK VE DENETİM (OPERATIONAL AUDIT) İZİ
  // =========================================================================
  describe("B. Operational Audit Visibility & Membership Polish", function () {
    it("B.1 Başvuru onaylandığında ve reddedildiğinde reviewedByWallet ve reviewedAt kaydedilmeli", async function () {
      const { app, ownerSigner, applicantSigner, memberSigner } = await deployPhase19Fixture();
      const ownerSession = await loginWithSiwe(app, ownerSigner);

      // Topluluk kur
      const createRes = await app.inject({
        method: "POST",
        url: "/api/communities",
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
        body: {
          name: "Denetim Test Topluluğu",
          shortDescription: "Audit testi",
        },
      });
      const slug = createRes.body.data.slug;

      // Başvuran 1
      const app1Session = await loginWithSiwe(app, applicantSigner);
      await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/join`,
        headers: {
          cookie: app1Session.cookieHeader,
          "x-csrf-token": app1Session.csrfToken,
        },
      });

      const list1Res = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/applications`,
        headers: { cookie: ownerSession.cookieHeader },
      });
      const app1MemberId = list1Res.body.data.items[0].id;

      // Onayla
      const approveRes = await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/applications/${app1MemberId}/approve`,
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
      });
      expect(approveRes.status).to.equal(200);
      expect(approveRes.body.data.reviewedByWallet.toLowerCase()).to.equal(ownerSigner.address.toLowerCase());
      expect(approveRes.body.data.reviewedAt).to.not.be.null;

      // Başvuran 2
      const app2Session = await loginWithSiwe(app, memberSigner);
      await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/join`,
        headers: {
          cookie: app2Session.cookieHeader,
          "x-csrf-token": app2Session.csrfToken,
        },
      });

      const list2Res = await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/applications`,
        headers: { cookie: ownerSession.cookieHeader },
      });
      const app2MemberId = list2Res.body.data.items.find((m) => m.walletAddress.toLowerCase() === memberSigner.address.toLowerCase()).id;

      // Reddet
      const rejectRes = await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/applications/${app2MemberId}/reject`,
        headers: {
          cookie: ownerSession.cookieHeader,
          "x-csrf-token": ownerSession.csrfToken,
        },
      });
      expect(rejectRes.status).to.equal(200);
      expect(rejectRes.body.data.reviewedByWallet.toLowerCase()).to.equal(ownerSigner.address.toLowerCase());
      expect(rejectRes.body.data.reviewedAt).to.not.be.null;

      // Reddedilen üyenin yeniden başvurabilmesi ve denetim alanlarının sıfırlanması
      const reapplyRes = await app.inject({
        method: "POST",
        url: `/api/communities/${slug}/join`,
        headers: {
          cookie: app2Session.cookieHeader,
          "x-csrf-token": app2Session.csrfToken,
        },
      });
      expect(reapplyRes.status).to.be.oneOf([200, 201]);
      expect(reapplyRes.body.data.membership.status).to.equal("PENDING");
      expect(reapplyRes.body.data.membership.reviewedByWallet).to.be.null;
    });

    it("B.2 Yoklama doğrulandığında verifiedByWallet doğru kaydedilmeli", async function () {
      const { services, prisma, ownerSigner, memberSigner } = await deployPhase19Fixture();

      // QR / katılımcı doğrulama (txHash ile indeks kaydı oluşturulur)
      const dummyTxHash = "0x" + "aa".repeat(32);
      const result = await services.eventService.verifyQrAndAttendance(
        1,
        ownerSigner.address,
        { participantAddress: memberSigner.address, txHash: dummyTxHash }
      );

      expect(result.verified).to.equal(true);

      const attRecord = await prisma.indexedAttendance.findFirst({
        where: { eventId: 1, participantAddress: memberSigner.address.toLowerCase() },
      });
      expect(attRecord).to.not.be.null;
      expect(attRecord.verifiedByWallet).to.equal(ownerSigner.address.toLowerCase());
    });
  });

  // =========================================================================
  // BÖLÜM 3: ORGANİZATÖR ETKİNLİK OPERASYONLARI & KATILIMCI FİLTRELERİ
  // =========================================================================
  describe("C. Organizer Event Operations & Participant Filters", function () {
    it("C.1 Katılımcı listesi NO_SHOW ve MISSING_PROFILE_NAME filtrelerini desteklemeli", async function () {
      const { services, ownerSigner, memberSigner } = await deployPhase19Fixture();

      // Yoklama verifier ile kaydedilsin
      const dummyTxHash = "0x" + "bb".repeat(32);
      await services.eventService.verifyQrAndAttendance(
        1,
        ownerSigner.address,
        { participantAddress: memberSigner.address, txHash: dummyTxHash }
      );

      // Tüm katılımcılar
      const allRes = await services.organizerAnalyticsService.getEventParticipants(1, ownerSigner.address, {
        filter: "ALL",
        page: 1,
        pageSize: 10,
      });
      expect(allRes.items).to.be.an("array");
      expect(allRes.totals).to.be.an("object");
      expect(allRes.totals).to.have.property("remainingCapacity");
      expect(allRes.totals).to.have.property("noShowCount");
      expect(allRes.totals).to.have.property("missingProfileNameCount");

      // Yoklaması doğrulanmış katılımcının verifiedByWallet alanı mevcut olmalı
      const attended = allRes.items.find((p) => p.walletAddress.toLowerCase() === memberSigner.address.toLowerCase());
      expect(attended).to.not.be.undefined;
      expect(attended.isAttended).to.equal(true);
      expect(attended.verifiedByWallet.toLowerCase()).to.equal(ownerSigner.address.toLowerCase());
    });

    it("C.2 CSV Dışa Aktarımında denetim sütunları ve 'kayıt yok' varsayılanı bulunmalı", async function () {
      const { services, ownerSigner } = await deployPhase19Fixture();

      const csvResult = await services.organizerAnalyticsService.exportEventCsv(1, ownerSigner.address);
      const csvContent = csvResult?.csvContent || (typeof csvResult === "string" ? csvResult : "");
      expect(csvContent).to.be.a("string");
      expect(csvContent).to.include("Yoklama Dogrulayan Cuzdan");
      expect(csvContent).to.include("Sertifika Veren Cuzdan");
      expect(csvContent).to.include("Sertifika Verilme Tarihi");
    });
  });

  // =========================================================================
  // BÖLÜM 4: FRONTEND BİLEŞEN RENDER VE ERİŞİLEBİLİRLİK KONTROLLERİ
  // =========================================================================
  describe("D. Frontend Component Render Tests", function () {
    it("D.1 CommunityManagePage Hub sekmesini ve operasyon merkezi kartlarını render edebilmeli", function () {
      const sampleCommunity = {
        id: "comm-1",
        slug: "blockchain-kulubu",
        name: "Blockchain Kulübü",
        activeMemberCount: 15,
        pendingApplicationCount: 3,
        eventCount: 4,
        currentUserMembership: { role: "OWNER", status: "ACTIVE" },
      };

      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/communities/blockchain-kulubu/manage"] },
          el(
            AppProvider,
            {
              initialAccount: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              initialSessionState: {
                loading: false,
                authenticated: true,
                walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                csrfToken: "mock-csrf",
              },
            },
            el(CommunityManagePage, {
              account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              initialCommunity: sampleCommunity,
            })
          )
        )
      );

      expect(html).to.include("Operasyon Merkezi");
      expect(html).to.include("AKTİF ÜYE");
      expect(html).to.include("BEKLEYEN BAŞVURU");
      expect(html).to.include("Başvuruları İncele");
      expect(html).to.include("Son Operasyonel Hareketler");
    });

    it("D.2 OrganizerEventAnalyticsPage no-show ve profil adı eksik filtrelerini render edebilmeli", function () {
      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/organizer/events/1/analytics"] },
          el(
            AppProvider,
            {
              initialAccount: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              initialSessionState: {
                loading: false,
                authenticated: true,
                walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
                csrfToken: "mock-csrf",
              },
            },
            el(OrganizerEventAnalyticsPage, {
              account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
              eventId: "1",
              initialEventData: {
                id: 1,
                title: "Web3 Zirvesi",
                capacity: 50,
                registeredCount: 30,
                verifiedAttendanceCount: 20,
                certificateCount: 15,
                remainingCapacity: 20,
                noShowCount: 10,
                missingProfileNameCount: 2,
              },
            })
          )
        )
      );

      expect(html).to.include("Katılmadı / No-show");
      expect(html).to.include("Profil Adı Eksik");
      expect(html).to.include("Kalan Kontenjan");
    });

    it("D.3 CommunityProfilePage reddedilen başvuru durumunu ve Yeniden Başvur butonunu göstermeli", function () {
      const mockCommunity = {
        id: "comm-2",
        slug: "ai-club",
        name: "Yapay Zeka Topluluğu",
        memberCount: 20,
        currentUserMembership: {
          role: "MEMBER",
          status: "REJECTED",
          reviewedAt: "2026-11-05T12:00:00Z",
        },
      };

      const html = renderToString(
        el(
          MemoryRouter,
          { initialEntries: ["/communities/ai-club"] },
          el(
            AppProvider,
            {
              initialAccount: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
              initialSessionState: {
                loading: false,
                authenticated: true,
                walletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
                csrfToken: "mock-csrf",
              },
            },
            el(CommunityProfilePage, {
              account: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
              initialCommunity: mockCommunity,
            })
          )
        )
      );

      expect(html).to.include("Başvurunuz Reddedildi");
      expect(html).to.include("Yeniden Başvur");
    });
  });
});
