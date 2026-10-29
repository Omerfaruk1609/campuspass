import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { buildSiweMessage } from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";
import { NOTIFICATION_TYPES } from "../src/utils/notifications.js";

const { ethers } = await network.create();

describe("Faz 15 — Bildirim Merkezi, Topluluk İletişimi ve Gerçek Zamanlı Güncellemeler Test Paketi", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployPhase15Fixture() {
    const [founderSigner, studentSigner, memberSigner, visitorSigner] =
      await ethers.getSigners();

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
      memberSigner,
      visitorSigner,
      contractAddress,
      campusPass,
    };
  }

  async function loginWithSiwe(
    app,
    signer,
    { domain = TEST_DOMAIN, uri = TEST_URI } = {}
  ) {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${signer.address}`,
    });
    expect(nonceRes.status).to.equal(200);
    const { nonce, issuedAt, expiresAt } = nonceRes.body.data;

    const siweMessage = buildSiweMessage({
      domain,
      address: signer.address,
      statement: "CampusPass Faz 15 bildirim testi icin cuzdaninizi dogrulayin.",
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
  // 1. SIWE OTURUM GÜVENLİĞİ VE CSRF DOĞRULAMASI
  // =========================================================================
  describe("1. SIWE Oturum Güvenliği ve CSRF Doğrulaması", function () {
    it("1.1 Oturumu olmayan istek bildirimleri okuyamaz (401 SESSION_REQUIRED)", async function () {
      const { app } = await deployPhase15Fixture();

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
      });

      expect(res.status).to.equal(401);
      expect(res.body.success).to.be.false;
      expect(res.body.error?.code).to.equal("SESSION_REQUIRED");
    });

    it("1.2 Oturumu olmayan istek okunmamış bildirim sayısını alamaz (401 SESSION_REQUIRED)", async function () {
      const { app } = await deployPhase15Fixture();

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
      });

      expect(res.status).to.equal(401);
      expect(res.body.error?.code).to.equal("SESSION_REQUIRED");
    });

    it("1.3 Durum değiştiren işlemlerde CSRF token eksikse istek reddedilmeli (403 CSRF_TOKEN_INVALID)", async function () {
      const { app, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/read-all",
        headers: {
          cookie: auth.cookieHeader,
          // X-CSRF-Token eksik
        },
      });

      expect(res.status).to.equal(403);
      expect(res.body.error?.code).to.equal("CSRF_TOKEN_INVALID");
    });

    it("1.4 Doğrulanmış SIWE oturumu ve CSRF ile bildirim listesi ve okunmamış sayısı alınabilir", async function () {
      const { app, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: {
          cookie: auth.cookieHeader,
        },
      });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data).to.be.an("array");
      expect(res.body.pagination).to.have.property("unreadCount", 0);
    });
  });

  // =========================================================================
  // 2. BİLDİRİM CRUD VE OKUNDU İŞARETLEME
  // =========================================================================
  describe("2. Bildirim CRUD ve Okundu İşaretleme", function () {
    it("2.1 Tekil bildirim okundu olarak işaretlenebilir ve readAt güncellenir", async function () {
      const { app, services, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const created = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title: "Test Bildirimi",
        message: "Bildirim içeriği",
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/notifications/${created.id}/read`,
        headers: {
          cookie: auth.cookieHeader,
          "x-csrf-token": auth.csrfToken,
        },
      });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data.read).to.be.true;
      expect(res.body.data.readAt).to.not.be.null;

      const unreadRes = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: auth.cookieHeader },
      });
      expect(unreadRes.body.data.unreadCount).to.equal(0);
    });

    it("2.2 Tüm bildirimler tek istekte okundu olarak işaretlenebilir (read-all)", async function () {
      const { app, services, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const n1 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.EVENT_UPDATED,
        title: "Bildirim 1",
        message: "İçerik 1",
      });
      const n2 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.EVENT_UPDATED,
        title: "Bildirim 2",
        message: "İçerik 2",
      });

      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/read-all",
        headers: {
          cookie: auth.cookieHeader,
          "x-csrf-token": auth.csrfToken,
        },
      });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data.updatedCount).to.equal(2);
    });

    it("2.3 Kullanıcı tekil bildirimi silebilir", async function () {
      const { app, services, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const notif = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.COMMUNITY_ANNOUNCEMENT,
        title: "Silinecek Bildirim",
        message: "Silinmeli",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/notifications/${notif.id}`,
        headers: {
          cookie: auth.cookieHeader,
          "x-csrf-token": auth.csrfToken,
        },
      });

      expect(res.status).to.equal(200);

      const listRes = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: auth.cookieHeader },
      });
      expect(listRes.body.data.some((n) => n.id === notif.id)).to.be.false;
    });

    it("2.4 Kullanıcı başka bir kullanıcının bildirimini okundu yapamaz veya silemez (Kullanıcı İzolasyonu)", async function () {
      const { app, services, studentSigner, visitorSigner } =
        await deployPhase15Fixture();
      const studentAuth = await loginWithSiwe(app, studentSigner);
      const visitorAuth = await loginWithSiwe(app, visitorSigner);

      const studentNotif = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title: "Gizli Bildirim",
        message: "Öğrenciye özel",
      });

      // Ziyaretçi öğrencinin bildirimini silmeye çalışır
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/notifications/${studentNotif.id}`,
        headers: {
          cookie: visitorAuth.cookieHeader,
          "x-csrf-token": visitorAuth.csrfToken,
        },
      });
      expect(deleteRes.status).to.equal(404);

      // Öğrencinin bildirimi hala var olmalı
      const studentList = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: studentAuth.cookieHeader },
      });
      expect(studentList.body.data.some((n) => n.id === studentNotif.id)).to.be.true;
    });
  });

  // =========================================================================
  // 3. BİLDİRİM TERCİHLERİ VE TESLİMAT FİLTRELEME
  // =========================================================================
  describe("3. Bildirim Tercihleri ve Teslimat Filtreleme", function () {
    it("3.1 İlk sorguda varsayılan tercihler dönmeli (tümü aktif)", async function () {
      const { app, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/preferences",
        headers: { cookie: auth.cookieHeader },
      });

      expect(res.status).to.equal(200);
      expect(res.body.data).to.include({
        eventUpdates: true,
        community: true,
        announcements: true,
        certificates: true,
      });
    });

    it("3.2 Bildirim tercihleri PATCH ile güncellenebilmeli", async function () {
      const { app, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "PATCH",
        url: "/api/notifications/preferences",
        headers: {
          cookie: auth.cookieHeader,
          "x-csrf-token": auth.csrfToken,
        },
        body: {
          announcements: false,
          eventUpdates: true,
        },
      });

      expect(res.status).to.equal(200);
      expect(res.body.data.announcements).to.be.false;
      expect(res.body.data.eventUpdates).to.be.true;
    });

    it("3.3 Devre dışı bırakılan kategoriye ait bildirimler kullanıcıya teslim edilmemeli", async function () {
      const { app, services, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      // announcements tercihini kapat
      await app.inject({
        method: "PATCH",
        url: "/api/notifications/preferences",
        headers: {
          cookie: auth.cookieHeader,
          "x-csrf-token": auth.csrfToken,
        },
        body: { announcements: false },
      });

      // Duyuru kategorisinde bildirim oluşturmayı dene
      const delivered = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.COMMUNITY_ANNOUNCEMENT,
        title: "Kaçırılacak Duyuru",
        message: "Bu teslim edilmemelidir",
      });

      expect(delivered).to.be.null;

      // Okunmamış sayısı 0 kalmalıdır
      const countRes = await app.inject({
        method: "GET",
        url: "/api/notifications/unread-count",
        headers: { cookie: auth.cookieHeader },
      });
      expect(countRes.body.data.unreadCount).to.equal(0);
    });
  });

  // =========================================================================
  // 4. DEDUPKEY İDEMPOTENCY VE OPEN REDIRECT KORUMASI
  // =========================================================================
  describe("4. DedupKey İdempotency ve Open Redirect Koruması", function () {
    it("4.1 Aynı dedupKey ile mükerrer bildirim oluşturulduğunda sessizce var olan döner", async function () {
      const { services, studentSigner } = await deployPhase15Fixture();

      const notif1 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.EVENT_REGISTRATION_CONFIRMED,
        title: "Kayıt Onayı",
        message: "Kaydınız onaylandı",
        dedupKey: "event-reg-10143-1-testuser",
      });

      const notif2 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.EVENT_REGISTRATION_CONFIRMED,
        title: "Kayıt Onayı (Tekrar)",
        message: "Kaydınız onaylandı",
        dedupKey: "event-reg-10143-1-testuser",
      });

      expect(notif1.id).to.equal(notif2.id);
    });

    it("4.2 Harici veya geçersiz destinationUrl linkleri güvenli şekilde filtrelenmeli (Open Redirect Önlemi)", async function () {
      const { services, studentSigner } = await deployPhase15Fixture();

      // Harici HTTP adresi reddedilmeli
      const notif1 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title: "Güvenlik Testi 1",
        message: "Zararlı link testi",
        destinationUrl: "https://malicious-site.com/steal-creds",
      });
      expect(notif1.destinationUrl).to.be.null;

      // Protocol-relative (//) adresi reddedilmeli
      const notif2 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title: "Güvenlik Testi 2",
        message: "Protocol relative testi",
        destinationUrl: "//evil.com",
      });
      expect(notif2.destinationUrl).to.be.null;

      // Geçerli dahili rota korunmalı
      const notif3 = await services.notificationService.createNotification({
        recipientWallet: studentSigner.address,
        type: NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
        title: "Güvenlik Testi 3",
        message: "Dahili link testi",
        destinationUrl: "/events/42",
      });
      expect(notif3.destinationUrl).to.equal("/events/42");
    });
  });

  // =========================================================================
  // 5. TOPLULUK DUYURULARI VE YETKİLENDİRME
  // =========================================================================
  describe("5. Topluluk Duyuruları ve Yetkilendirme (RBAC)", function () {
    it("5.1 Topluluk üyesi olmayan veya normal MEMBER rolündeki kullanıcı duyuru yayınlayamaz (403 FORBIDDEN)", async function () {
      const { app, services, founderSigner, memberSigner } =
        await deployPhase15Fixture();
      const founderAuth = await loginWithSiwe(app, founderSigner);
      const memberAuth = await loginWithSiwe(app, memberSigner);

      // Founder topluluk oluşturur
      const comm = await services.communityService.createCommunity({
        walletAddress: founderSigner.address,
        data: { name: "Web3 Kulübü" },
      });

      // Member duyuru yayınlamaya çalışır
      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${comm.slug}/announcements`,
        headers: {
          cookie: memberAuth.cookieHeader,
          "x-csrf-token": memberAuth.csrfToken,
        },
        body: {
          title: "Yetkisiz Duyuru",
          content: "Bu duyuru yayınlanmamalıdır.",
        },
      });

      expect(res.status).to.equal(403);
    });

    it("5.2 OWNER topluluk duyurusu yayınlayabilir ve tüm aktif üyelere bildirim iletilir", async function () {
      const { app, services, founderSigner, studentSigner } =
        await deployPhase15Fixture();
      const founderAuth = await loginWithSiwe(app, founderSigner);
      const studentAuth = await loginWithSiwe(app, studentSigner);

      // Topluluk oluştur
      const comm = await services.communityService.createCommunity({
        walletAddress: founderSigner.address,
        data: { name: "Yazılım Kulübü" },
      });

      // Öğrenci katılır ve onaylanır
      const joinRes = await services.communityService.joinCommunity(
        comm.slug,
        studentSigner.address
      );
      await services.communityService.approveApplication(
        comm.slug,
        joinRes.membership.id,
        founderSigner.address
      );

      // Founder duyuru yayınlar
      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${comm.slug}/announcements`,
        headers: {
          cookie: founderAuth.cookieHeader,
          "x-csrf-token": founderAuth.csrfToken,
        },
        body: {
          title: "Yeni Hackathon Başlıyor!",
          content: "Detaylar için web sitemize göz atın.",
        },
      });

      expect(res.status).to.equal(201);
      expect(res.body.data.recipientCount).to.be.at.least(2); // founder + student

      // Öğrencinin bildirimlerinde duyuru görünmeli
      const notifRes = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: studentAuth.cookieHeader },
      });

      const announcementNotif = notifRes.body.data.find(
        (n) => n.type === NOTIFICATION_TYPES.COMMUNITY_ANNOUNCEMENT
      );
      expect(announcementNotif).to.exist;
      expect(announcementNotif.title).to.include("Yeni Hackathon Başlıyor!");
    });
  });

  // =========================================================================
  // 6. ETKİNLİK DUYURULARI VE ORGANİZATÖR YETKİSİ
  // =========================================================================
  describe("6. Etkinlik Duyuruları ve Organizatör Yetkisi", function () {
    it("6.1 Canlı blokzincir organizatörü olmayan cüzdan etkinlik duyurusu yayınlayamaz", async function () {
      const { app, campusPass, founderSigner, visitorSigner } =
        await deployPhase15Fixture();
      const visitorAuth = await loginWithSiwe(app, visitorSigner);

      // Founder blokzincirde etkinlik oluşturur
      const tx = await campusPass
        .connect(founderSigner)
        .createEvent("Blockchain Günü", 100);
      await tx.wait();

      // Ziyaretçi duyuru atmaya çalışır
      const res = await app.inject({
        method: "POST",
        url: "/api/events/1/announcements",
        headers: {
          cookie: visitorAuth.cookieHeader,
          "x-csrf-token": visitorAuth.csrfToken,
        },
        body: {
          title: "Yetkisiz Etkinlik Duyurusu",
          content: "İçerik",
        },
      });

      expect(res.status).to.equal(403);
    });

    it("6.2 Organizatör etkinlik duyurusu yayınlayabilir ve kayıtlı katılımcılara bildirim gider", async function () {
      const { app, prisma, campusPass, founderSigner, studentSigner, contractAddress } =
        await deployPhase15Fixture();
      const founderAuth = await loginWithSiwe(app, founderSigner);
      const studentAuth = await loginWithSiwe(app, studentSigner);

      // Founder blokzincirde etkinlik oluşturur
      const tx = await campusPass
        .connect(founderSigner)
        .createEvent("Monad Workshop", 50);
      await tx.wait();

      // Öğrenciyi kayıtlı olarak simüle et
      await prisma.indexedRegistration.create({
        data: {
          chainId: TEST_CHAIN_ID,
          contractAddress: contractAddress.toLowerCase(),
          eventId: 1,
          participantAddress: studentSigner.address.toLowerCase(),
          transactionHash: "0x" + "a".repeat(64),
          blockNumber: 100,
          logIndex: 0,
        },
      });

      // Founder duyuru yayınlar
      const res = await app.inject({
        method: "POST",
        url: "/api/events/1/announcements",
        headers: {
          cookie: founderAuth.cookieHeader,
          "x-csrf-token": founderAuth.csrfToken,
        },
        body: {
          title: "Derslik Değişikliği",
          content: "Workshop Konferans Salonu B'ye alınmıştır.",
        },
      });

      expect(res.status).to.equal(201);
      expect(res.body.data.recipientCount).to.equal(1);

      // Öğrencinin bildirimlerinde etkinlik duyurusu görünmeli
      const notifRes = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: studentAuth.cookieHeader },
      });

      const eventNotif = notifRes.body.data.find(
        (n) => n.type === NOTIFICATION_TYPES.EVENT_ANNOUNCEMENT
      );
      expect(eventNotif).to.exist;
      expect(eventNotif.title).to.include("Derslik Değişikliği");
      expect(eventNotif.destinationUrl).to.equal("/events/1");
    });
  });

  // =========================================================================
  // 7. OTOMATİK ETKİNLİK VE TOPLULUK TETİKLEYİCİLERİ
  // =========================================================================
  describe("7. Otomatik Etkinlik ve Topluluk Bildirim Tetikleyicileri", function () {
    it("7.1 Etkinlik iptal edildiğinde kayıtlı öğrencilere otomatik EVENT_CANCELLED bildirimi gider", async function () {
      const { app, prisma, campusPass, founderSigner, studentSigner, contractAddress } =
        await deployPhase15Fixture();
      const founderAuth = await loginWithSiwe(app, founderSigner);
      const studentAuth = await loginWithSiwe(app, studentSigner);

      const tx = await campusPass
        .connect(founderSigner)
        .createEvent("Zirve 2026", 100);
      await tx.wait();

      await prisma.indexedRegistration.create({
        data: {
          chainId: TEST_CHAIN_ID,
          contractAddress: contractAddress.toLowerCase(),
          eventId: 1,
          participantAddress: studentSigner.address.toLowerCase(),
          transactionHash: "0x" + "b".repeat(64),
          blockNumber: 101,
          logIndex: 0,
        },
      });

      // Etkinliği iptal et
      const cancelRes = await app.inject({
        method: "POST",
        url: "/api/events/1/cancel",
        headers: {
          cookie: founderAuth.cookieHeader,
          "x-csrf-token": founderAuth.csrfToken,
        },
        body: { cancelReason: "Hava muhalefeti" },
      });
      expect(cancelRes.status).to.equal(200);

      // Öğrenciye bildirim gitmiş olmalı
      const notifs = await app.inject({
        method: "GET",
        url: "/api/notifications",
        headers: { cookie: studentAuth.cookieHeader },
      });

      const cancelNotif = notifs.body.data.find(
        (n) => n.type === NOTIFICATION_TYPES.EVENT_CANCELLED
      );
      expect(cancelNotif).to.exist;
      expect(cancelNotif.message).to.include("Hava muhalefeti");
    });

    it("7.2 Topluluk başvuru onayı ve reddi başvuru sahibine anında bildirim üretir", async function () {
      const { services, founderSigner, studentSigner, memberSigner } =
        await deployPhase15Fixture();

      const comm = await services.communityService.createCommunity({
        walletAddress: founderSigner.address,
        data: { name: "Robotik Topluluğu" },
      });

      // 1. Öğrenci başvurur -> Onaylanır
      const join1 = await services.communityService.joinCommunity(
        comm.slug,
        studentSigner.address
      );
      await services.communityService.approveApplication(
        comm.slug,
        join1.membership.id,
        founderSigner.address
      );

      const studentNotifs = await services.notificationService.getNotificationsForUser(
        studentSigner.address
      );
      expect(
        studentNotifs.items.some(
          (n) => n.type === NOTIFICATION_TYPES.COMMUNITY_MEMBERSHIP_APPROVED
        )
      ).to.be.true;

      // 2. Member başvurur -> Reddedilir
      const join2 = await services.communityService.joinCommunity(
        comm.slug,
        memberSigner.address
      );
      await services.communityService.rejectApplication(
        comm.slug,
        join2.membership.id,
        founderSigner.address
      );

      const memberNotifs = await services.notificationService.getNotificationsForUser(
        memberSigner.address
      );
      expect(
        memberNotifs.items.some(
          (n) => n.type === NOTIFICATION_TYPES.COMMUNITY_MEMBERSHIP_REJECTED
        )
      ).to.be.true;
    });

    it("7.3 Topluluk rol değişikliği ilgili üyeye anında bildirim üretir", async function () {
      const { services, founderSigner, studentSigner } =
        await deployPhase15Fixture();

      const comm = await services.communityService.createCommunity({
        walletAddress: founderSigner.address,
        data: { name: "AI Topluluğu" },
      });

      const join = await services.communityService.joinCommunity(
        comm.slug,
        studentSigner.address
      );
      await services.communityService.approveApplication(
        comm.slug,
        join.membership.id,
        founderSigner.address
      );

      // Rolü ADMIN yap
      await services.communityService.updateMemberRole(
        comm.slug,
        join.membership.id,
        "ADMIN",
        founderSigner.address
      );

      const notifs = await services.notificationService.getNotificationsForUser(
        studentSigner.address
      );
      const roleNotif = notifs.items.find(
        (n) => n.type === NOTIFICATION_TYPES.COMMUNITY_ROLE_CHANGED
      );
      expect(roleNotif).to.exist;
      expect(roleNotif.message).to.include("ADMIN");
    });
  });

  // =========================================================================
  // 8. SERVER-SENT EVENTS (SSE) GERÇEK ZAMANLI AKIŞ
  // =========================================================================
  describe("8. Server-Sent Events (SSE) Gerçek Zamanlı Akış", function () {
    it("8.1 Oturumu olmayan istemci SSE akışına bağlanamaz (401 SESSION_REQUIRED)", async function () {
      const { app } = await deployPhase15Fixture();

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/stream",
      });

      expect(res.status).to.equal(401);
    });

    it("8.2 Doğrulanmış SIWE oturumu ile SSE akışı başlatılabilir ve connected olayı alınır", async function () {
      const { app, studentSigner } = await deployPhase15Fixture();
      const auth = await loginWithSiwe(app, studentSigner);

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/stream",
        headers: {
          cookie: auth.cookieHeader,
          accept: "text/event-stream",
        },
      });

      expect(res.status).to.equal(200);
      expect(res.headers["content-type"]).to.include("text/event-stream");
      expect(res.rawPayload.toString("utf8")).to.include("event: connected");
    });
  });
});
