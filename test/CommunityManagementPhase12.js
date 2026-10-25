import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { createEventIndexer } from "../server/src/indexer/eventIndexer.js";
import { buildSiweMessage } from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";

const { ethers } = await network.create();

describe("Faz 12 — Üniversite Topluluk Yönetim Sistemi, Rol Tabanlı Yetkilendirme ve Üyelik Test Paketi", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployCommunityFixture() {
    const [
      founderSigner,
      adminCandidateSigner,
      memberSigner1,
      memberSigner2,
      strangerSigner,
      otherOrganizerSigner,
    ] = await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Kurucu tarafından 1 etkinlik oluşturalım
    await campusPass
      .connect(founderSigner)
      .createEvent("Blokzincir ve Web3 Zirvesi", 50);

    // Başka bir organizatör tarafından 1 etkinlik oluşturalım (yetkisiz bağlantı testi için)
    await campusPass
      .connect(otherOrganizerSigner)
      .createEvent("Yabancı Organizatör Etkinliği", 30);

    // Öğrenci katılımı
    await campusPass.connect(memberSigner1).registerForEvent(1);
    await campusPass.connect(founderSigner).markAttendance(1, memberSigner1.address);

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
      adminCandidateSigner,
      memberSigner1,
      memberSigner2,
      strangerSigner,
      otherOrganizerSigner,
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
  // BÖLÜM 1: TOPLULUK OLUŞTURMA VE VALIDASYON
  // =========================================================================
  it("1. Oturum açmamış kullanıcı topluluk oluşturamaz (401 Unauthorized)", async function () {
    const { app } = await deployCommunityFixture();

    const res = await app.inject({
      method: "POST",
      url: "/api/communities",
      body: {
        name: "Yetkisiz Topluluk",
      },
    });

    expect(res.status).to.equal(401);
    expect(res.body.success).to.equal(false);
  });

  it("2. Geçersiz girdi ile topluluk oluşturma reddedilmeli (400 Bad Request)", async function () {
    const { app, founderSigner } = await deployCommunityFixture();
    const session = await loginWithSiwe(app, founderSigner);

    // Kısa isim (en az 2 karakter olmalı)
    const resShortName = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session.cookieHeader,
        "x-csrf-token": session.csrfToken,
      },
      body: { name: "A" },
    });
    expect(resShortName.status).to.equal(400);

    // Geçersiz email
    const resBadEmail = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session.cookieHeader,
        "x-csrf-token": session.csrfToken,
      },
      body: {
        name: "Geçerli Topluluk İsmi",
        contactEmail: "not-an-email",
      },
    });
    expect(resBadEmail.status).to.equal(400);

    // Geçersiz web sitesi URL
    const resBadUrl = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session.cookieHeader,
        "x-csrf-token": session.csrfToken,
      },
      body: {
        name: "Geçerli Topluluk İsmi",
        websiteUrl: "ftp://bad-scheme.com",
      },
    });
    expect(resBadUrl.status).to.equal(400);
  });

  it("3. Başarılı topluluk oluşturma: Kurucu otomatik OWNER olmalı ve slug atanmalı", async function () {
    const { app, founderSigner } = await deployCommunityFixture();
    const session = await loginWithSiwe(app, founderSigner);

    const res = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session.cookieHeader,
        "x-csrf-token": session.csrfToken,
      },
      body: {
        name: "Monad Blockchain Kulübü",
        shortDescription: "Monad ekosistemi öğrenci topluluğu",
        universityName: "Monad Üniversitesi",
        category: "Teknoloji",
        contactEmail: "blockchain@monad.edu.tr",
        websiteUrl: "https://blockchain.monad.edu.tr",
      },
    });

    expect(res.status).to.equal(201);
    expect(res.body.success).to.equal(true);
    expect(res.body.data.slug).to.equal("monad-blockchain-kulubu");
    expect(res.body.data.name).to.equal("Monad Blockchain Kulübü");
    expect(res.body.data.myRole).to.equal("OWNER");
    expect(res.body.data.stats.memberCount).to.equal(1);
  });

  it("4. Aynı isimle ikinci topluluk oluşturulduğunda benzersiz slug türetilmeli (-2)", async function () {
    const { app, founderSigner, adminCandidateSigner } = await deployCommunityFixture();
    const session1 = await loginWithSiwe(app, founderSigner);
    const session2 = await loginWithSiwe(app, adminCandidateSigner);

    // İlk topluluk
    const res1 = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session1.cookieHeader,
        "x-csrf-token": session1.csrfToken,
      },
      body: { name: "Yapay Zeka Topluluğu" },
    });
    expect(res1.body.data.slug).to.equal("yapay-zeka-toplulugu");

    // İkinci topluluk (aynı isim)
    const res2 = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session2.cookieHeader,
        "x-csrf-token": session2.csrfToken,
      },
      body: { name: "Yapay Zeka Topluluğu" },
    });
    expect(res2.body.data.slug).to.equal("yapay-zeka-toplulugu-2");
  });

  // =========================================================================
  // BÖLÜM 2: TOPLULUKLARI KEŞFETME VE DETAY GÖRÜNTÜLEME
  // =========================================================================
  it("5. GET /api/communities ve GET /api/communities/:slug başarıyla veri dönmeli", async function () {
    const { app, founderSigner } = await deployCommunityFixture();
    const session = await loginWithSiwe(app, founderSigner);

    await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: session.cookieHeader,
        "x-csrf-token": session.csrfToken,
      },
      body: { name: "Robotik Kulübü", category: "Mühendislik" },
    });

    // Keşfet listesi (public)
    const listRes = await app.inject({
      method: "GET",
      url: "/api/communities?category=Mühendislik",
    });
    expect(listRes.status).to.equal(200);
    expect(listRes.body.data.items).to.be.an("array");
    expect(listRes.body.data.items.length).to.be.at.least(1);
    expect(listRes.body.data.items[0].slug).to.equal("robotik-kulubu");

    // Tekil profil (public)
    const profileRes = await app.inject({
      method: "GET",
      url: "/api/communities/robotik-kulubu",
    });
    expect(profileRes.status).to.equal(200);
    expect(profileRes.body.data.name).to.equal("Robotik Kulübü");
    expect(profileRes.body.data.stats).to.have.property("memberCount");
    expect(profileRes.body.data.stats).to.have.property("eventCount");
  });

  // =========================================================================
  // BÖLÜM 3: ÜYELİK YAŞAM DÖNGÜSÜ (BAŞVURU, ONAY, RET, AYRILMA)
  // =========================================================================
  it("6. Üyelik Yaşam Döngüsü: Katılım başvurusu (PENDING), onay (ACTIVE) ve üyenin ayrılması", async function () {
    const { app, founderSigner, memberSigner1 } = await deployCommunityFixture();
    const founderSession = await loginWithSiwe(app, founderSigner);
    const memberSession = await loginWithSiwe(app, memberSigner1);

    // Topluluk oluştur
    const commRes = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { name: "Yazılım Geliştiricileri Topluluğu" },
    });
    const slug = commRes.body.data.slug;

    // 1. Öğrenci katılım başvurusu yapar
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/join`,
      headers: {
        cookie: memberSession.cookieHeader,
        "x-csrf-token": memberSession.csrfToken,
      },
    });
    expect(joinRes.status).to.be.oneOf([200, 201]);
    expect(joinRes.body.data.status).to.equal("PENDING");
    const memberId = joinRes.body.data.id;

    // Tekrar katılım başvurusunda bulunursa 409 Conflict dönmeli
    const duplicateJoinRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/join`,
      headers: {
        cookie: memberSession.cookieHeader,
        "x-csrf-token": memberSession.csrfToken,
      },
    });
    expect(duplicateJoinRes.status).to.equal(409);

    // 2. Kurucu başvuruları listeler
    const appsRes = await app.inject({
      method: "GET",
      url: `/api/communities/${slug}/applications`,
      headers: {
        cookie: founderSession.cookieHeader,
      },
    });
    expect(appsRes.status).to.equal(200);
    expect(appsRes.body.data.items.length).to.equal(1);
    expect(appsRes.body.data.items[0].id).to.equal(memberId);

    // 3. Kurucu başvuruyu onaylar
    const approveRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/applications/${memberId}/approve`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
    });
    expect(approveRes.status).to.equal(200);
    expect(approveRes.body.data.status).to.equal("ACTIVE");

    // 4. Öğrencinin /api/communities/me listesinde topluluk görünmeli
    const myCommunitiesRes = await app.inject({
      method: "GET",
      url: "/api/communities/me",
      headers: {
        cookie: memberSession.cookieHeader,
      },
    });
    expect(myCommunitiesRes.status).to.equal(200);
    expect(myCommunitiesRes.body.data.joined.length).to.equal(1);
    expect(myCommunitiesRes.body.data.joined[0].community.slug).to.equal(slug);

    // 5. Öğrenci topluluktan ayrılır
    const leaveRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/leave`,
      headers: {
        cookie: memberSession.cookieHeader,
        "x-csrf-token": memberSession.csrfToken,
      },
    });
    expect(leaveRes.status).to.equal(200);
    expect(leaveRes.body.success).to.equal(true);

    // Ayrıldıktan sonra aktif üye listesinde olmamalı
    const membersRes = await app.inject({
      method: "GET",
      url: `/api/communities/${slug}/members`,
      headers: {
        cookie: founderSession.cookieHeader,
      },
    });
    const foundMember = membersRes.body.data.items.find(
      (m) => m.walletAddress.toLowerCase() === memberSigner1.address.toLowerCase()
    );
    expect(foundMember).to.equal(undefined);
  });

  it("7. Başvuru reddetme: Durum REJECTED olmalı", async function () {
    const { app, founderSigner, memberSigner2 } = await deployCommunityFixture();
    const founderSession = await loginWithSiwe(app, founderSigner);
    const memberSession = await loginWithSiwe(app, memberSigner2);

    const commRes = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { name: "Oyun Tasarımı Kulübü" },
    });
    const slug = commRes.body.data.slug;

    // Başvuru
    const joinRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/join`,
      headers: {
        cookie: memberSession.cookieHeader,
        "x-csrf-token": memberSession.csrfToken,
      },
    });
    const memberId = joinRes.body.data.id;

    // Reddet
    const rejectRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/applications/${memberId}/reject`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
    });
    expect(rejectRes.status).to.equal(200);
    expect(rejectRes.body.data.status).to.equal("REJECTED");
  });

  // =========================================================================
  // BÖLÜM 4: ROL TABANLI YETKİLENDİRME (RBAC) VE GÜVENLİK
  // =========================================================================
  it("8. Tek Kurucu Koruması: Topluluğun tek OWNER'ı topluluğu sahipsiz bırakıp ayrılamaz (400)", async function () {
    const { app, founderSigner } = await deployCommunityFixture();
    const founderSession = await loginWithSiwe(app, founderSigner);

    const commRes = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { name: "Siber Güvenlik Kulübü" },
    });
    const slug = commRes.body.data.slug;

    // Kurucu ayrılmaya çalışır
    const leaveRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/leave`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
    });

    expect(leaveRes.status).to.equal(400);
    expect(JSON.stringify(leaveRes.body)).to.include("tek kurucusu");
  });

  it("9. Rol Yönetimi ve Hiyerarşi: OWNER üyeyi ADMIN yapabilir; ADMIN başka bir ADMIN'i veya OWNER'ı silemez", async function () {
    const { app, founderSigner, adminCandidateSigner, memberSigner1 } =
      await deployCommunityFixture();
    const founderSession = await loginWithSiwe(app, founderSigner);
    const adminSession = await loginWithSiwe(app, adminCandidateSigner);
    const memberSession = await loginWithSiwe(app, memberSigner1);

    // Topluluk oluştur
    const commRes = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { name: "Yapay Zeka ve Veri Kulübü" },
    });
    const slug = commRes.body.data.slug;

    // adminCandidate başvurur ve onaylanır
    const joinAdmin = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/join`,
      headers: {
        cookie: adminSession.cookieHeader,
        "x-csrf-token": adminSession.csrfToken,
      },
    });
    const adminMemberId = joinAdmin.body.data.id;

    await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/applications/${adminMemberId}/approve`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
    });

    // memberSigner1 başvurur ve onaylanır
    const joinMem1 = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/join`,
      headers: {
        cookie: memberSession.cookieHeader,
        "x-csrf-token": memberSession.csrfToken,
      },
    });
    const normalMemberId = joinMem1.body.data.id;

    await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/applications/${normalMemberId}/approve`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
    });

    // 1. OWNER, adminCandidate'i ADMIN yapar
    const promoteRes = await app.inject({
      method: "PATCH",
      url: `/api/communities/${slug}/members/${adminMemberId}/role`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { role: "ADMIN" },
    });
    expect(promoteRes.status).to.equal(200);
    expect(promoteRes.body.data.role).to.equal("ADMIN");

    // 2. ADMIN, normal MEMBER'ı silebilir
    const adminRemovesMemberRes = await app.inject({
      method: "DELETE",
      url: `/api/communities/${slug}/members/${normalMemberId}`,
      headers: {
        cookie: adminSession.cookieHeader,
        "x-csrf-token": adminSession.csrfToken,
      },
    });
    expect(adminRemovesMemberRes.status).to.equal(200);

    // 3. ADMIN, OWNER'ı silmeye çalışırsa 403 Forbidden almalı
    const founderMember = (
      await app.inject({
        method: "GET",
        url: `/api/communities/${slug}/members`,
        headers: { cookie: adminSession.cookieHeader },
      })
    ).body.data.items.find((m) => m.role === "OWNER");

    const adminRemovesOwnerRes = await app.inject({
      method: "DELETE",
      url: `/api/communities/${slug}/members/${founderMember.id}`,
      headers: {
        cookie: adminSession.cookieHeader,
        "x-csrf-token": adminSession.csrfToken,
      },
    });
    expect(adminRemovesOwnerRes.status).to.equal(403);
    expect(JSON.stringify(adminRemovesOwnerRes.body)).to.include("sahibini");

    // 4. Normal MEMBER rol değiştiremez (403)
    const unauthorizedRoleChange = await app.inject({
      method: "PATCH",
      url: `/api/communities/${slug}/members/${adminMemberId}/role`,
      headers: {
        cookie: memberSession.cookieHeader,
        "x-csrf-token": memberSession.csrfToken,
      },
      body: { role: "OWNER" },
    });
    expect(unauthorizedRoleChange.status).to.equal(403);
  });

  // =========================================================================
  // BÖLÜM 5: TOPLULUK - ETKİNLİK İLİŞKİLENDİRMESİ (ANTI-HIJACKING)
  // =========================================================================
  it("10. Organizatör kendi etkinliğini topluluğa bağlayabilir; başkasının etkinliğini bağlayamaz", async function () {
    const {
      app,
      founderSigner,
      otherOrganizerSigner,
      contractAddress,
    } = await deployCommunityFixture();
    const founderSession = await loginWithSiwe(app, founderSigner);
    const otherSession = await loginWithSiwe(app, otherOrganizerSigner);

    // Kurucu topluluk oluşturur
    const commRes = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { name: "Web3 Etkinlik Kulübü" },
    });
    const slug = commRes.body.data.slug;

    // Etkinlik #1 founder'a ait (metadata oluşturulmuş olmalı)
    await app.inject({
      method: "POST",
      url: "/api/events/metadata",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: {
        eventId: 1,
        chainId: TEST_CHAIN_ID,
        contractAddress,
        title: "Blokzincir ve Web3 Zirvesi",
        description: "Test açıklaması",
        community: "Web3 Kulübü",
        category: "Teknoloji",
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 90000000).toISOString(),
      },
    });

    // Etkinlik #2 otherOrganizer'a ait
    await app.inject({
      method: "POST",
      url: "/api/events/metadata",
      headers: {
        cookie: otherSession.cookieHeader,
        "x-csrf-token": otherSession.csrfToken,
      },
      body: {
        eventId: 2,
        chainId: TEST_CHAIN_ID,
        contractAddress,
        title: "Yabancı Organizatör Etkinliği",
        description: "Başka organizatör açıklaması",
        community: "Farklı Kulüp",
        category: "Genel",
        startAt: new Date(Date.now() + 86400000).toISOString(),
        endAt: new Date(Date.now() + 90000000).toISOString(),
      },
    });

    // 1. Kurucu kendi etkinliğini (#1) başarıyla bağlar
    const linkRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/events/link`,
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
    expect(linkRes.body.success).to.equal(true);

    // 2. Kurucu, başkasına ait Etkinlik #2'yi bağlamaya çalışırsa 403 Forbidden almalı (Anti-Hijacking)
    const hijackRes = await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/events/link`,
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: {
        eventId: 2,
        chainId: TEST_CHAIN_ID,
        contractAddress,
      },
    });
    expect(hijackRes.status).to.equal(403);
    expect(JSON.stringify(hijackRes.body)).to.include("kendi oluşturduğunuz");

    // 3. Topluluk etkinliklerini listele
    const commEventsRes = await app.inject({
      method: "GET",
      url: `/api/communities/${slug}/events`,
    });
    expect(commEventsRes.status).to.equal(200);
    expect(commEventsRes.body.data.items.length).to.equal(1);
    expect(Number(commEventsRes.body.data.items[0].eventId)).to.equal(1);

    // 4. Bağlantıyı kaldırma (unlink)
    const unlinkRes = await app.inject({
      method: "DELETE",
      url: `/api/communities/${slug}/events/unlink`,
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
    expect(unlinkRes.status).to.equal(200);
    expect(unlinkRes.body.success).to.equal(true);
  });

  // =========================================================================
  // BÖLÜM 6: TOPLULUK ANALİTİĞİ VE İSTATİSTİKLER
  // =========================================================================
  it("11. Topluluk Analitiği: Etkinlikler, kayıtlar, katılımlar ve oran doğru hesaplanmalı", async function () {
    const { app, founderSigner, contractAddress } = await deployCommunityFixture();
    const founderSession = await loginWithSiwe(app, founderSigner);

    // Topluluk oluştur
    const commRes = await app.inject({
      method: "POST",
      url: "/api/communities",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: { name: "Analitik Test Kulübü" },
    });
    const slug = commRes.body.data.slug;

    // Etkinlik #1 metadata oluştur ve bağla
    await app.inject({
      method: "POST",
      url: "/api/events/metadata",
      headers: {
        cookie: founderSession.cookieHeader,
        "x-csrf-token": founderSession.csrfToken,
      },
      body: {
        eventId: 1,
        chainId: TEST_CHAIN_ID,
        contractAddress,
        title: "Analitik Etkinliği",
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    await app.inject({
      method: "POST",
      url: `/api/communities/${slug}/events/link`,
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

    // Analitik verisi çek (OWNER yetkisi gerekir)
    const analyticsRes = await app.inject({
      method: "GET",
      url: `/api/communities/${slug}/analytics`,
      headers: {
        cookie: founderSession.cookieHeader,
      },
    });

    expect(analyticsRes.status).to.equal(200);
    const data = analyticsRes.body.data;
    expect(data.summary.totalEvents).to.equal(1);
    expect(data.summary.totalRegistrations).to.equal(1);
    expect(data.summary.totalAttended).to.equal(1);
    expect(data.summary.averageAttendanceRate).to.equal(100);
    expect(data.eventItems).to.be.an("array");
    expect(data.eventItems.length).to.equal(1);
    expect(data.events.totalEvents).to.equal(1);
  });
});
