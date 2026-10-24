import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { createEventIndexer } from "../server/src/indexer/eventIndexer.js";
import {
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  buildSiweMessage,
} from "../server/src/services/authService.js";
import {
  createTransactionalPrismaStore,
  getPrismaClient,
} from "../server/src/services/prismaClient.js";
import { loadAndValidateEnv } from "../server/src/utils/env.js";
import { maskSensitiveValue } from "../server/src/utils/logger.js";
import { validatePrismaSchemaFile } from "../server/src/utils/prismaSchemaValidator.js";
import {
  clearMetadataStoreForTesting,
  findUnmigratedLocalMetadata,
  hydrateMetadataStoreFromServerMap,
  saveInitialEventMetadata,
} from "../src/utils/eventMetadata.js";
import {
  QR_TTL_SECONDS,
  QR_VERSION,
  buildCanonicalQrMessage,
  clearUsedNonces,
  generateSecureNonce,
  verifySignedQrTicket,
} from "../src/utils/qrVerification.js";
import { fetchStudentProfileData } from "../src/utils/studentProfile.js";

const { ethers } = await network.create();

describe("Faz 9 — Backend API, SIWE Kimlik Doğrulama, Prisma Veri Bütünlüğü ve Event Indexer Testleri", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  const VALID_METADATA_PAYLOAD = {
    description:
      "Monad Testnet üzerinde yüksek performanslı EVM mimarisi, paralel yürütme ve akıllı sözleşme güvenliği eğitimi.",
    community: "Monad Geliştirici Topluluğu",
    category: "Blockchain",
    date: "2026-12-10",
    startTime: "14:00",
    endTime: "17:30",
    registrationDeadline: "2026-12-10T12:00",
    location: {
      campus: "Merkez Kampüs",
      building: "Mühendislik Fakültesi",
      room: "Amfi B-101",
    },
    posterUrl: "https://example.com/posters/monad-bootcamp.png",
  };

  async function deployBackendFixture() {
    clearMetadataStoreForTesting();
    const [organizer, studentA, studentB, attacker, otherOrganizer] =
      await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Etkinlik #1 (organizer) ve Etkinlik #2 (otherOrganizer) oluştur
    await campusPass
      .connect(organizer)
      .createEvent("Monad Parallel EVM Bootcamp", 50);
    await campusPass
      .connect(otherOrganizer)
      .createEvent("Siber Güvenlik Zirvesi", 30);

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

    const { app, services } = buildCampusPassApp({
      prisma,
      contract: campusPass,
      indexer,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      siweDomain: TEST_DOMAIN,
      siweUri: TEST_URI,
      rateLimitMax: 200,
      authRateLimitMax: 50,
    });

    return {
      app,
      prisma,
      indexer,
      services,
      campusPass,
      contractAddress,
      organizer,
      studentA,
      studentB,
      attacker,
      otherOrganizer,
    };
  }

  /**
   * SIWE (EIP-4361) akışıyla tam giriş yapar ve { cookieHeader, csrfToken } döner.
   */
  async function loginWithSiwe(app, signer) {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${signer.address}`,
    });
    expect(nonceRes.status).to.equal(200);
    const { nonce, domain, uri, chainId, issuedAt, expiresAt } =
      nonceRes.body.data;

    const siweMessage = buildSiweMessage({
      domain,
      address: signer.address,
      uri,
      chainId,
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
    const setCookieArr = verifyRes.cookies || [];
    const sessionCookie = setCookieArr.find((c) =>
      c.startsWith(`${SESSION_COOKIE_NAME}=`)
    );
    expect(sessionCookie).to.be.a("string");

    const cookiePair = sessionCookie.split(";")[0];
    return {
      cookieHeader: cookiePair,
      csrfToken: verifyRes.body.data.csrfToken,
      rawCookieString: sessionCookie,
      nonce,
      siweMessage,
      signature,
    };
  }

  it("1. Health endpoint'i servis, veritabanı, blokzincir ve Prisma şema durumunu doğru döndürmeli", async function () {
    const schemaCheck = validatePrismaSchemaFile();
    expect(schemaCheck.valid).to.equal(true);
    expect(schemaCheck.models).to.include.members([
      "EventMetadata",
      "IndexedRegistration",
      "IndexedAttendance",
      "IndexerCheckpoint",
    ]);

    const { app, contractAddress } = await deployBackendFixture();
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.data.status).to.equal("healthy");
    expect(res.body.data.database.status).to.equal("ok");
    expect(res.body.data.blockchain.chainId).to.equal(TEST_CHAIN_ID);
    expect(res.body.data.blockchain.contractAddress).to.equal(contractAddress);
  });

  it("2. Organizatör SIWE oturumuyla geçerli etkinlik metadata kaydı oluşturabilmeli ve veritabanı bütünlüğünü korumalı", async function () {
    const { app, prisma, organizer, contractAddress } =
      await deployBackendFixture();
    const auth = await loginWithSiwe(app, organizer);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: VALID_METADATA_PAYLOAD,
    });

    expect(createRes.status).to.equal(201);
    expect(createRes.body.success).to.equal(true);
    expect(createRes.body.data.eventId).to.equal(1);
    expect(createRes.body.data.community).to.equal(
      "Monad Geliştirici Topluluğu"
    );
    expect(createRes.body.data.organizerAddress).to.equal(organizer.address);

    // Doğrudan veritabanı tablosunda adreslerin normalize (küçük harf) olarak saklandığını doğrula
    const dbRow = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId: TEST_CHAIN_ID,
          contractAddress: contractAddress.toLowerCase(),
          eventId: 1,
        },
      },
    });
    expect(dbRow).to.not.equal(null);
    expect(dbRow.contractAddress).to.equal(contractAddress.toLowerCase());
    expect(dbRow.organizerAddress).to.equal(organizer.address.toLowerCase());
    expect(dbRow.campus).to.equal("Merkez Kampüs");
  });

  it("3. Organizatör mevcut etkinlik metadata kaydını PATCH ile güncelleyebilmeli", async function () {
    const { app, organizer } = await deployBackendFixture();
    const auth = await loginWithSiwe(app, organizer);

    await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: VALID_METADATA_PAYLOAD,
    });

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: {
        ...VALID_METADATA_PAYLOAD,
        community: "Güncellenmiş Web3 Kulübü",
        category: "Yazılım",
        location: {
          campus: "Teknokent Kampüsü",
          building: "Ar-Ge Binası",
          room: "Konferans 3",
        },
      },
    });

    expect(patchRes.status).to.equal(200);
    expect(patchRes.body.data.community).to.equal("Güncellenmiş Web3 Kulübü");
    expect(patchRes.body.data.category).to.equal("Yazılım");
    expect(patchRes.body.data.location.campus).to.equal("Teknokent Kampüsü");

    const getMetaRes = await app.inject({
      method: "GET",
      url: "/api/events/1/metadata",
    });
    expect(getMetaRes.status).to.equal(200);
    expect(getMetaRes.body.data.community).to.equal("Güncellenmiş Web3 Kulübü");
  });

  it("4. Yetkisiz kullanıcıların veya başka etkinlik organizatörünün metadata değiştirmesini canlı blokzincir kontrolüyle reddetmeli", async function () {
    const { app, organizer, attacker, otherOrganizer } =
      await deployBackendFixture();

    // 4a. Oturum açmamış istek -> 401
    const unauthRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      body: VALID_METADATA_PAYLOAD,
    });
    expect(unauthRes.status).to.equal(401);

    // 4b. Saldırgan kendi cüzdanıyla SIWE girişi yapıp gövdede sahte organizerAddress gönderse bile -> 403
    const attackerAuth = await loginWithSiwe(app, attacker);
    const spoofRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: attackerAuth.cookieHeader,
        [CSRF_HEADER_NAME]: attackerAuth.csrfToken,
      },
      body: {
        ...VALID_METADATA_PAYLOAD,
        organizerAddress: organizer.address, // İstemci sahte organizatör adresi gönderiyor
      },
    });
    expect(spoofRes.status).to.equal(403);
    expect(spoofRes.body.error.code).to.equal("FORBIDDEN");

    // 4c. Etkinlik #2'nin organizatörü Etkinlik #1'i değiştirmeye çalışırsa -> 403
    const otherOrgAuth = await loginWithSiwe(app, otherOrganizer);
    const crossEventRes = await app.inject({
      method: "PATCH",
      url: "/api/events/1/metadata",
      headers: {
        cookie: otherOrgAuth.cookieHeader,
        [CSRF_HEADER_NAME]: otherOrgAuth.csrfToken,
      },
      body: VALID_METADATA_PAYLOAD,
    });
    expect(crossEventRes.status).to.equal(403);
  });

  it("5. SIWE (EIP-4361) imza doğrulamasını, domain/chainId kontrolünü ve sahte imzaların reddini doğru uygulamalı", async function () {
    const { app, organizer, attacker } = await deployBackendFixture();

    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${organizer.address}`,
    });
    const { nonce, issuedAt, expiresAt } = nonceRes.body.data;

    // 5a. Mesajda organizer adresi yazarken attacker imzalarsa -> 401
    const msgForOrganizer = buildSiweMessage({
      domain: TEST_DOMAIN,
      address: organizer.address,
      uri: TEST_URI,
      chainId: TEST_CHAIN_ID,
      nonce,
      issuedAt,
      expirationTime: expiresAt,
    });
    const wrongSig = await attacker.signMessage(msgForOrganizer);

    const wrongSigRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: { message: msgForOrganizer, signature: wrongSig },
    });
    expect(wrongSigRes.status).to.equal(401);
    expect(wrongSigRes.body.error.code).to.equal("SIGNATURE_ADDRESS_MISMATCH");

    // 5b. Yanlış domain ile imzalanmış SIWE mesajı -> 401
    const wrongDomainMsg = buildSiweMessage({
      domain: "phishing-site.com",
      address: organizer.address,
      uri: TEST_URI,
      chainId: TEST_CHAIN_ID,
      nonce,
      issuedAt,
      expirationTime: expiresAt,
    });
    const wrongDomainSig = await organizer.signMessage(wrongDomainMsg);

    const wrongDomainRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: { message: wrongDomainMsg, signature: wrongDomainSig },
    });
    expect(wrongDomainRes.status).to.equal(401);
    expect(wrongDomainRes.body.error.code).to.equal("SIWE_DOMAIN_MISMATCH");

    // 5c. Doğru imzayla başarılı giriş
    const validSig = await organizer.signMessage(msgForOrganizer);
    const okRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: { message: msgForOrganizer, signature: validSig },
    });
    expect(okRes.status).to.equal(200);
    expect(okRes.body.data.authenticated).to.equal(true);
    expect(okRes.body.data.walletAddress).to.equal(organizer.address);
  });

  it("6. Nonce replay koruması: Aynı SIWE nonce ve imzayla ikinci kez giriş yapılmasını atomik olarak engellemeli", async function () {
    const { app, organizer } = await deployBackendFixture();

    // İlk giriş başarılı
    const auth = await loginWithSiwe(app, organizer);

    // Aynı mesaj ve imzayla ikinci kez /api/auth/verify çağrıldığında reddedilmeli
    const replayRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: {
        message: auth.siweMessage,
        signature: auth.signature,
      },
    });

    expect(replayRes.status).to.equal(401);
    expect(replayRes.body.error.code).to.equal("NONCE_REPLAY_DETECTED");
  });

  it("7. Geçersiz API girdilerini, XSS payloadlarını, bozuk EIP-55 checksum adreslerini ve aşırı büyük istekleri reddetmeli", async function () {
    const { app, organizer } = await deployBackendFixture();
    const auth = await loginWithSiwe(app, organizer);

    // 7a. XSS script içeren açıklama -> 400
    const xssRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: {
        ...VALID_METADATA_PAYLOAD,
        description: "<script>alert('xss')</script>",
      },
    });
    expect(xssRes.status).to.equal(400);

    // 7b. Bitiş saati başlangıç saatinden önce olan tarih -> 400
    const badTimeRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: {
        ...VALID_METADATA_PAYLOAD,
        startTime: "18:00",
        endTime: "15:00",
      },
    });
    expect(badTimeRes.status).to.equal(400);

    // 7c. Bozuk EIP-55 checksum içeren cüzdan adresiyle öğrenci sorgusu -> 400
    const validChecksum = organizer.address;
    const brokenChecksumAddress =
      "0x" +
      validChecksum
        .slice(2)
        .replace(/[a-fA-F]/, (ch) =>
          ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()
        );

    const badAddrRes = await app.inject({
      method: "GET",
      url: `/api/students/${brokenChecksumAddress}/events`,
    });
    expect(badAddrRes.status).to.equal(400);

    // 7d. Maksimum gövde boyutunu (900 KB) aşan istek -> 413 Payload Too Large
    const hugeString = "A".repeat(950 * 1024);
    const tooLargeRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: JSON.stringify({ description: hugeString }),
    });
    expect(tooLargeRes.status).to.equal(413);
    expect(tooLargeRes.body.error.code).to.equal("PAYLOAD_TOO_LARGE");
  });

  it("8. Blockchain Event Indexer aynı blokları tekrar taradığında duplicate (mükerrer) kayıt oluşturmamalı", async function () {
    const { prisma, indexer, campusPass, organizer, studentA } =
      await deployBackendFixture();

    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(organizer).markAttendance(1, studentA.address);

    // 1. Senkronizasyon
    await indexer.syncOnce();
    const regCountFirst = await prisma.indexedRegistration.count();
    const attCountFirst = await prisma.indexedAttendance.count();
    expect(regCountFirst).to.equal(1);
    expect(attCountFirst).to.equal(1);

    // Aynı blok aralığını zorla tekrar işle (idempotency ve duplicate log koruması)
    const checkpoint = await indexer.getCheckpoint();
    await indexer.processBlockBatch(0, checkpoint.lastProcessedBlock, false);

    const regCountSecond = await prisma.indexedRegistration.count();
    const attCountSecond = await prisma.indexedAttendance.count();
    expect(regCountSecond).to.equal(1);
    expect(attCountSecond).to.equal(1);
    expect(indexer.getMetrics().duplicatesSkipped).to.be.greaterThan(0);
  });

  it("9. Indexer checkpoint devamlılığı: Yeniden başlatıldığında kaldığı bloktan devam etmeli ve yeni olayları indekslemeli", async function () {
    const {
      prisma,
      indexer,
      campusPass,
      contractAddress,
      organizer,
      studentA,
      studentB,
    } = await deployBackendFixture();

    await campusPass.connect(studentA).registerForEvent(1);
    const firstSync = await indexer.syncOnce();
    const firstCheckpoint = await indexer.getCheckpoint();
    expect(firstCheckpoint).to.not.equal(null);
    expect(firstCheckpoint.lastProcessedBlock).to.equal(
      firstSync.lastProcessedBlock
    );

    // Uygulama yeniden başlatılmış gibi yeni bir indexer örneği oluştur
    await campusPass.connect(studentB).registerForEvent(1);
    await campusPass.connect(organizer).markAttendance(1, studentA.address);

    const restartedIndexer = createEventIndexer({
      prisma,
      contract: campusPass,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      startBlock: 0,
      batchSize: 50,
      confirmations: 0,
      reorgLookbackBlocks: 0,
    });

    const secondSync = await restartedIndexer.syncOnce();
    expect(secondSync.fromBlock).to.equal(
      firstCheckpoint.lastProcessedBlock + 1
    );
    expect(secondSync.lastProcessedBlock).to.be.greaterThan(
      firstCheckpoint.lastProcessedBlock
    );

    const totalRegs = await prisma.indexedRegistration.count();
    const totalAtts = await prisma.indexedAttendance.count();
    expect(totalRegs).to.equal(2);
    expect(totalAtts).to.equal(1);
  });

  it("10. Farklı öğrenci cüzdanlarının kayıt ve katılım geçmişlerini birbirinden tam izole etmeli", async function () {
    const { app, indexer, campusPass, organizer, studentA, studentB } =
      await deployBackendFixture();

    // StudentA -> Etkinlik 1 (Kayıt + Katılım), StudentB -> Etkinlik 2 (Sadece Kayıt)
    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(organizer).markAttendance(1, studentA.address);
    await campusPass.connect(studentB).registerForEvent(2);

    await indexer.syncOnce();

    const resA = await app.inject({
      method: "GET",
      url: `/api/students/${studentA.address}/events`,
    });
    const attA = await app.inject({
      method: "GET",
      url: `/api/students/${studentA.address}/attendance`,
    });

    expect(resA.status).to.equal(200);
    expect(resA.body.data.registeredEvents).to.have.lengthOf(1);
    expect(resA.body.data.registeredEvents[0].id).to.equal(1);
    expect(attA.body.data.attendedEvents).to.have.lengthOf(1);
    expect(attA.body.data.timeline[0].attendanceTxHash).to.match(
      /^0x[0-9a-f]{64}$/
    );

    const resB = await app.inject({
      method: "GET",
      url: `/api/students/${studentB.address}/events`,
    });
    const attB = await app.inject({
      method: "GET",
      url: `/api/students/${studentB.address}/attendance`,
    });

    expect(resB.status).to.equal(200);
    expect(resB.body.data.registeredEvents).to.have.lengthOf(1);
    expect(resB.body.data.registeredEvents[0].id).to.equal(2);
    expect(attB.body.data.attendedEvents).to.have.lengthOf(0);
  });

  it("11. Etkinlik iptal (/cancel) ve yeniden aktifleştirme (/reactivate) yetkilendirmesini doğru uygulamalı", async function () {
    const { app, organizer, attacker } = await deployBackendFixture();
    const orgAuth = await loginWithSiwe(app, organizer);
    const attackerAuth = await loginWithSiwe(app, attacker);

    // Saldırgan iptal edemez -> 403
    const forbiddenCancel = await app.inject({
      method: "POST",
      url: "/api/events/1/cancel",
      headers: {
        cookie: attackerAuth.cookieHeader,
        [CSRF_HEADER_NAME]: attackerAuth.csrfToken,
      },
      body: { cancelReason: "Yetkisiz iptal denemesi" },
    });
    expect(forbiddenCancel.status).to.equal(403);

    // Gerçek organizatör etkinliği iptal eder -> 200
    const cancelRes = await app.inject({
      method: "POST",
      url: "/api/events/1/cancel",
      headers: {
        cookie: orgAuth.cookieHeader,
        [CSRF_HEADER_NAME]: orgAuth.csrfToken,
      },
      body: { cancelReason: "Konuşmacı uçuş iptali nedeniyle ertelendi." },
    });
    expect(cancelRes.status).to.equal(200);
    expect(cancelRes.body.data.cancelled).to.equal(true);
    expect(cancelRes.body.data.cancelReason).to.include("uçuş iptali");

    const eventDetailCancelled = await app.inject({
      method: "GET",
      url: "/api/events/1",
    });
    expect(eventDetailCancelled.body.data.status).to.equal("cancelled");
    expect(eventDetailCancelled.body.data.canRegisterByTime).to.equal(false);

    // Gerçek organizatör etkinliği yeniden aktifleştirir -> 200
    const reactivateRes = await app.inject({
      method: "POST",
      url: "/api/events/1/reactivate",
      headers: {
        cookie: orgAuth.cookieHeader,
        [CSRF_HEADER_NAME]: orgAuth.csrfToken,
      },
    });
    expect(reactivateRes.status).to.equal(200);
    expect(reactivateRes.body.data.cancelled).to.equal(false);

    const eventDetailActive = await app.inject({
      method: "GET",
      url: "/api/events/1",
    });
    expect(eventDetailActive.body.data.status).to.equal("upcoming");
  });

  it("12. API ve blokzincir metadata eşleştirmesini, filtreleme/sayfalamayı ve localStorage migration akışını doğru çalıştırmalı", async function () {
    const { app, organizer, contractAddress } = await deployBackendFixture();
    const auth = await loginWithSiwe(app, organizer);

    // Önce yerel depoda (localStorage) eski bir metadata kaydı oluştur
    saveInitialEventMetadata({
      chainId: TEST_CHAIN_ID,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: VALID_METADATA_PAYLOAD,
    });

    // Sunucuda henüz kayıt yokken unmigrated olarak tespit edilmeli
    const unmigratedBefore = findUnmigratedLocalMetadata(organizer.address, {});
    expect(unmigratedBefore).to.have.lengthOf(1);
    expect(unmigratedBefore[0].eventId).to.equal(1);

    // Yerel kaydı sunucuya migrate et
    const migrateRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: unmigratedBefore[0],
    });
    expect(migrateRes.status).to.equal(201);

    // /api/events üzerinden sayfalama ve kategori/arama filtresiyle sorgula
    const listRes = await app.inject({
      method: "GET",
      url: "/api/events?page=1&limit=10&category=Blockchain&search=Bootcamp",
    });
    expect(listRes.status).to.equal(200);
    expect(listRes.body.data).to.have.lengthOf(1);
    expect(listRes.body.data[0].id).to.equal(1);
    expect(listRes.body.data[0].hasCustomMetadata).to.equal(true);
    expect(listRes.body.pagination.total).to.equal(1);

    // Başka bir cihazda yerel önbelleği temizleyip sunucu haritasıyla hydrate ettiğimizde aynı metadata görünmeli
    clearMetadataStoreForTesting();
    hydrateMetadataStoreFromServerMap(listRes.body.metadataMap);
    const unmigratedAfter = findUnmigratedLocalMetadata(
      organizer.address,
      listRes.body.metadataMap
    );
    expect(unmigratedAfter).to.have.lengthOf(0);
  });

  it("13. RPC hata yönetimi ve rate-limit durumunda kontrollü yeniden deneme (exponential backoff) yapmalı", async function () {
    const { prisma, campusPass, contractAddress } =
      await deployBackendFixture();

    // İlk 2 çağrıda 429 Rate Limit hatası fırlatıp 3. çağrıda gerçek blok numarasını dönen provider
    let attempts = 0;
    const flakyProvider = {
      async getBlockNumber() {
        attempts += 1;
        if (attempts <= 2) {
          throw new Error("429 Too Many Requests: RPC rate limit exceeded");
        }
        return 5;
      },
    };

    const retryIndexer = createEventIndexer({
      prisma,
      contract: campusPass,
      provider: flakyProvider,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      maxRetries: 4,
      retryBaseDelayMs: 5,
    });

    // contract.runner.provider yerine flakyProvider kullanılması için executeWithRetry davranışını doğrula
    const brokenContract = {
      events: async () => {
        throw new Error("RPC connection timeout");
      },
      nextEventId: async () => {
        throw new Error("RPC connection timeout");
      },
    };

    const { app: brokenRpcApp } = buildCampusPassApp({
      prisma,
      contract: brokenContract,
      chainId: TEST_CHAIN_ID,
      contractAddress,
    });

    const rpcErrRes = await brokenRpcApp.inject({
      method: "GET",
      url: "/api/events",
    });
    expect(rpcErrRes.status).to.equal(502);
    expect(rpcErrRes.body.error.code).to.equal("RPC_ERROR");

    // Rate-limit retry testi: getLogs sırasında ilk 2 batch denemesinde (2 x 3 paralel filtre = 6 çağrı) 429 hatası alıp 3. denemede başarılı olan sözleşme
    let queryAttempts = 0;
    const rateLimitedContract = {
      filters: campusPass.filters,
      runner: { provider: { getBlockNumber: async () => 2 } },
      async queryFilter(filter, fromBlock, toBlock) {
        queryAttempts += 1;
        if (queryAttempts <= 6) {
          throw new Error("429 Rate Limit Exceeded");
        }
        return campusPass.queryFilter(filter, fromBlock, toBlock);
      },
    };

    const resilientIndexer = createEventIndexer({
      prisma,
      contract: rateLimitedContract,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      confirmations: 0,
      maxRetries: 4,
      retryBaseDelayMs: 5,
    });

    const syncRes = await resilientIndexer.syncOnce();
    expect(syncRes.synced).to.equal(true);
    expect(resilientIndexer.getMetrics().retriesCount).to.equal(2);
    expect(retryIndexer).to.be.an("object");
  });

  it("14. Veritabanı transaction rollback: Çok adımlı yazma işleminde hata oluştuğunda kısmi yazmaları tamamen geri almalı", async function () {
    const { prisma, contractAddress, studentA } = await deployBackendFixture();

    const beforeRegCount = await prisma.indexedRegistration.count();
    const beforeCheckpoint = await prisma.indexerCheckpoint.findUnique({
      where: {
        chainId_contractAddress: {
          chainId: TEST_CHAIN_ID,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
    });
    expect(beforeRegCount).to.equal(0);
    expect(beforeCheckpoint).to.equal(null);

    // Transaction içinde önce geçerli bir kayıt ve checkpoint ekleyip ardından kasıtlı hata fırlat
    let failedAsExpected = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.indexedRegistration.create({
          data: {
            chainId: TEST_CHAIN_ID,
            contractAddress: contractAddress.toLowerCase(),
            eventId: 1,
            participantAddress: studentA.address.toLowerCase(),
            transactionHash: "0x" + "11".repeat(32),
            blockNumber: 10,
            logIndex: 0,
          },
        });

        await tx.indexerCheckpoint.create({
          data: {
            chainId: TEST_CHAIN_ID,
            contractAddress: contractAddress.toLowerCase(),
            lastProcessedBlock: 10,
          },
        });

        // Aynı unique anahtarla ikinci kez kayıt ekleyerek P2002 hatası tetikle
        await tx.indexedRegistration.create({
          data: {
            chainId: TEST_CHAIN_ID,
            contractAddress: contractAddress.toLowerCase(),
            eventId: 1,
            participantAddress: studentA.address.toLowerCase(),
            transactionHash: "0x" + "11".repeat(32),
            blockNumber: 10,
            logIndex: 0,
          },
        });
      });
    } catch (err) {
      failedAsExpected = true;
      expect(err.code).to.equal("P2002");
    }

    expect(failedAsExpected).to.equal(true);

    // Rollback doğrulaması: Ne indexedRegistration ne de indexerCheckpoint tablosunda kayıt kalmamalı!
    const afterRegCount = await prisma.indexedRegistration.count();
    const afterCheckpoint = await prisma.indexerCheckpoint.findUnique({
      where: {
        chainId_contractAddress: {
          chainId: TEST_CHAIN_ID,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
    });
    expect(afterRegCount).to.equal(0);
    expect(afterCheckpoint).to.equal(null);
  });

  it("15. CORS allowlist, CSRF token doğrulaması, HttpOnly çerez ayarları, oturum sonlandırma ve log maskelemesini doğru uygulamalı", async function () {
    const { app, organizer } = await deployBackendFixture();
    const auth = await loginWithSiwe(app, organizer);

    // 15a. HttpOnly ve SameSite=Lax bayrakları çerezde bulunmalı
    expect(auth.rawCookieString).to.include("HttpOnly");
    expect(auth.rawCookieString).to.include("SameSite=Lax");

    // 15b. İzin verilmeyen bir Origin'den gelen CORS isteği reddedilmeli -> 403
    const badCorsRes = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: {
        origin: "https://evil-attacker.example.com",
      },
    });
    expect(badCorsRes.status).to.equal(403);
    expect(badCorsRes.body.error.code).to.equal("CORS_ORIGIN_FORBIDDEN");

    // 15c. İzin verilen Origin için CORS başlıkları dönmeli
    const goodCorsRes = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "http://localhost:5173",
      },
    });
    expect(goodCorsRes.status).to.equal(200);
    expect(goodCorsRes.headers["access-control-allow-origin"]).to.equal(
      "http://localhost:5173"
    );

    // 15d. Geçerli oturum çerezi varken X-CSRF-Token başlığı eksik veya yanlışsa POST isteği reddedilmeli -> 403
    const missingCsrfRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
      },
      body: VALID_METADATA_PAYLOAD,
    });
    expect(missingCsrfRes.status).to.equal(403);
    expect(missingCsrfRes.body.error.code).to.equal("CSRF_TOKEN_INVALID");

    // 15e. Logout sonrasında aynı oturum çerezi geçersiz olmalı -> 401
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: auth.cookieHeader,
      },
    });
    expect(logoutRes.status).to.equal(200);

    const afterLogoutRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: VALID_METADATA_PAYLOAD,
    });
    expect(afterLogoutRes.status).to.equal(401);

    // 15f. Hassas veri maskeleme kontrolü (DATABASE_URL parolası ve özel anahtar maskelenmeli)
    const masked = maskSensitiveValue({
      databaseUrl: "postgresql://postgres:SuperSecretPass123@localhost:5432/campuspass",
      sessionSecret: "my-super-secret-session-key-123456",
      note: "Private key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    });
    expect(masked.databaseUrl).to.not.include("SuperSecretPass123");
    expect(masked.sessionSecret).to.include("REDACTED");
    expect(masked.note).to.not.include(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
  });

  it("16. Üretim ortamı (production) güvenlik sınırı: Sahte/in-memory veritabanı fallback'ini ve varsayılan oturum sırrını reddetmeli", async function () {
    // 16a. Production ortamında memory:// DATABASE_URL reddedilmeli
    expect(() =>
      loadAndValidateEnv({
        NODE_ENV: "production",
        DATABASE_URL: "memory://test",
        SESSION_SECRET: "a-very-strong-production-session-secret-key-2026",
      })
    ).to.throw(/Üretim \(production\) ortamında gerçek bir PostgreSQL DATABASE_URL zorunludur/);

    // 16b. Production ortamında varsayılan veya kısa SESSION_SECRET reddedilmeli
    expect(() =>
      loadAndValidateEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.example.com:5432/campuspass",
      })
    ).to.throw(/Üretim \(production\) ortamında en az 32 karakterlik benzersiz bir SESSION_SECRET zorunludur/);

    // 16c. getPrismaClient production modunda forceMemory seçeneğini reddetmeli
    let forceMemErr = null;
    try {
      await getPrismaClient({
        forceMemory: true,
        envOverride: { NODE_ENV: "production" },
      });
    } catch (err) {
      forceMemErr = err;
    }
    expect(forceMemErr).to.not.equal(null);
    expect(forceMemErr.code).to.equal("PRODUCTION_MEMORY_STORE_FORBIDDEN");

    // 16d. getPrismaClient production modunda PostgreSQL erişilemez olduğunda sessizce in-memory store'a düşmemeli
    let strictPgErr = null;
    try {
      await getPrismaClient({
        resetShared: true,
        envOverride: {
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:59999/campuspass",
        },
      });
    } catch (err) {
      strictPgErr = err;
    }
    expect(strictPgErr).to.not.equal(null);
    expect(strictPgErr.code).to.equal("P1001");
  });

  it("17. Veritabanı kapalıyken (offline) API anlamlı 503 DATABASE_UNAVAILABLE hatası vermeli ve /api/health degraded dönmeli", async function () {
    const { app, prisma } = await deployBackendFixture();

    // Veritabanı bağlantısını kapalı duruma getir
    prisma.$setSimulatedOffline(true);

    // 17a. GET /api/health -> 503 Service Unavailable & status: "degraded"
    const healthRes = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(healthRes.status).to.equal(503);
    expect(healthRes.body.success).to.equal(false);
    expect(healthRes.body.error.code).to.equal("DATABASE_UNAVAILABLE");
    expect(healthRes.body.data.status).to.equal("degraded");
    expect(healthRes.body.data.database.status).to.equal("error");

    // 17b. GET /api/events -> 503 DATABASE_UNAVAILABLE
    const eventsRes = await app.inject({
      method: "GET",
      url: "/api/events",
    });
    expect(eventsRes.status).to.equal(503);
    expect(eventsRes.body.success).to.equal(false);
    expect(eventsRes.body.error.code).to.equal("DATABASE_UNAVAILABLE");

    // 17c. GET /api/auth/nonce -> 503 DATABASE_UNAVAILABLE
    const nonceRes = await app.inject({
      method: "GET",
      url: "/api/auth/nonce",
    });
    expect(nonceRes.status).to.equal(503);
    expect(nonceRes.body.error.code).to.equal("DATABASE_UNAVAILABLE");

    // Veritabanı tekrar çevrimiçi olduğunda normal çalışmaya dönmeli
    prisma.$setSimulatedOffline(false);
    const recoveredRes = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(recoveredRes.status).to.equal(200);
    expect(recoveredRes.body.data.status).to.equal("healthy");
  });

  it("18. SIWE URI doğrulaması (SIWE_URI_MISMATCH) ve eşzamanlı paralel nonce replay koruması çalışmalı", async function () {
    const { app, organizer } = await deployBackendFixture();

    // 18a. Yanlış/oltalama URI ile imzalanmış SIWE mesajı reddedilmeli -> 401 SIWE_URI_MISMATCH
    const nonceRes1 = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${organizer.address}`,
    });
    const nonceData1 = nonceRes1.body.data;

    const phishingUriMessage = buildSiweMessage({
      domain: TEST_DOMAIN,
      address: organizer.address,
      uri: "https://phishing-site.example.com/login",
      chainId: TEST_CHAIN_ID,
      nonce: nonceData1.nonce,
      issuedAt: nonceData1.issuedAt,
      expirationTime: nonceData1.expiresAt,
    });
    const phishingSig = await organizer.signMessage(phishingUriMessage);

    const uriMismatchRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: { message: phishingUriMessage, signature: phishingSig },
    });
    expect(uriMismatchRes.status).to.equal(401);
    expect(uriMismatchRes.body.error.code).to.equal("SIWE_URI_MISMATCH");

    // 18b. Aynı anda (Promise.all) gönderilen iki özdeş SIWE doğrulama isteğinden yalnızca biri başarılı olmalı
    const nonceRes2 = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${organizer.address}`,
    });
    const nonceData2 = nonceRes2.body.data;

    const validMessage = buildSiweMessage({
      domain: TEST_DOMAIN,
      address: organizer.address,
      uri: TEST_URI,
      chainId: TEST_CHAIN_ID,
      nonce: nonceData2.nonce,
      issuedAt: nonceData2.issuedAt,
      expirationTime: nonceData2.expiresAt,
    });
    const validSig = await organizer.signMessage(validMessage);

    const [parallelResA, parallelResB] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/auth/verify",
        body: { message: validMessage, signature: validSig },
      }),
      app.inject({
        method: "POST",
        url: "/api/auth/verify",
        body: { message: validMessage, signature: validSig },
      }),
    ]);

    const statuses = [parallelResA.status, parallelResB.status].sort();
    expect(statuses).to.deep.equal([200, 401]);
  });

  it("19. Blockchain reorganization (reorg) durumunda geçersizleşen blok kayıtlarını temizleyip kanonik kayıtlarla değiştirmeli", async function () {
    const { prisma, campusPass, contractAddress, studentA, studentB } =
      await deployBackendFixture();

    const orphanTxHash = "0x" + "aa".repeat(32);
    const canonicalTxHash = "0x" + "bb".repeat(32);

    // İlk taramada blok 5'te studentA için (sonradan reorg olacak) bir kayıt döndüren simüle sözleşme
    let reorgOccurred = false;
    const regTopic = campusPass.interface.getEvent("UserRegistered").topicHash;

    const makeEncodedRegLog = (studentAddr, txHash, blockNum) => ({
      args: { eventId: 1n, participant: studentAddr },
      transactionHash: txHash,
      blockNumber: blockNum,
      index: 0,
    });

    const reorgContract = {
      filters: {
        EventCreated: () => ({ fragment: { name: "EventCreated" } }),
        UserRegistered: () => ({ fragment: { name: "UserRegistered" } }),
        AttendanceMarked: () => ({ fragment: { name: "AttendanceMarked" } }),
      },
      runner: {
        provider: {
          getBlockNumber: async () => 5,
        },
      },
      async queryFilter(filter) {
        if (filter.fragment.name !== "UserRegistered") return [];
        if (!reorgOccurred) {
          return [makeEncodedRegLog(studentA.address, orphanTxHash, 5)];
        }
        return [makeEncodedRegLog(studentB.address, canonicalTxHash, 5)];
      },
    };
    expect(regTopic).to.be.a("string");

    const indexer = createEventIndexer({
      prisma,
      contract: reorgContract,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      startBlock: 1,
      confirmations: 0,
      reorgLookbackBlocks: 3,
    });

    // 1. Tur: Reorg öncesi tarama -> studentA (orphanTxHash) kaydedilir
    await indexer.syncOnce();
    const regsBeforeReorg = await prisma.indexedRegistration.findMany();
    expect(regsBeforeReorg).to.have.lengthOf(1);
    expect(regsBeforeReorg[0].participantAddress).to.equal(
      studentA.address.toLowerCase()
    );

    // 2. Tur: Blok 5'te reorg gerçekleşir -> orphanTxHash silinmeli, canonicalTxHash (studentB) eklenmeli
    reorgOccurred = true;
    await indexer.syncOnce();

    const regsAfterReorg = await prisma.indexedRegistration.findMany();
    expect(regsAfterReorg).to.have.lengthOf(1);
    expect(regsAfterReorg[0].participantAddress).to.equal(
      studentB.address.toLowerCase()
    );
    expect(regsAfterReorg[0].transactionHash).to.equal(canonicalTxHash);
    expect(indexer.getMetrics().reorgRemovedCount).to.equal(1);
  });

  it("20. Uçtan uca Backend + Frontend veri akışı: Cüzdan değişiminde öğrenci profili izolasyonu ve QR katılım doğrulamasının birlikte çalışması", async function () {
    clearUsedNonces();
    const {
      app,
      indexer,
      campusPass,
      contractAddress,
      organizer,
      studentA,
      studentB,
    } = await deployBackendFixture();

    // 1. Organizatör SIWE ile giriş yapıp Etkinlik #1 metadata'sını kaydeder
    const auth = await loginWithSiwe(app, organizer);
    const metaRes = await app.inject({
      method: "POST",
      url: "/api/events/1/metadata",
      headers: {
        cookie: auth.cookieHeader,
        [CSRF_HEADER_NAME]: auth.csrfToken,
      },
      body: VALID_METADATA_PAYLOAD,
    });
    expect(metaRes.status).to.equal(201);

    // 2. Farklı bir oturum/tarayıcı çerezsiz olarak GET /api/events ile aynı metadata'yı görür
    const publicEventsRes = await app.inject({
      method: "GET",
      url: "/api/events",
    });
    expect(publicEventsRes.status).to.equal(200);
    const ev1 = publicEventsRes.body.data.find((e) => e.id === 1);
    expect(ev1.community).to.equal("Monad Geliştirici Topluluğu");
    hydrateMetadataStoreFromServerMap(publicEventsRes.body.metadataMap);

    // 3. studentA Etkinlik #1'e kaydolur ve imzalı QR üretir; organizatör QR'ı doğrular ve markAttendance çağırır
    await campusPass.connect(studentA).registerForEvent(1);

    const nowSec = Math.floor(Date.now() / 1000);
    const nonce = generateSecureNonce();
    const ticketBase = {
      version: QR_VERSION,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      eventId: 1,
      participant: studentA.address,
      nonce,
      issuedAt: nowSec,
      expiresAt: nowSec + QR_TTL_SECONDS,
    };
    const canonicalMsg = buildCanonicalQrMessage(ticketBase);
    const qrSignature = await studentA.signMessage(canonicalMsg);
    const qrJson = JSON.stringify({ ...ticketBase, signature: qrSignature });

    const qrVerification = await verifySignedQrTicket({
      rawQrString: qrJson,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: TEST_CHAIN_ID,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: nowSec,
    });
    expect(qrVerification.valid).to.equal(true);

    await campusPass
      .connect(organizer)
      .markAttendance(1, qrVerification.ticket.participant);

    // 4. Indexer zincir olaylarını PostgreSQL'e senkronize eder
    await indexer.syncOnce();

    // 5. Öğrenci profili cüzdan değişimi kontrolü: studentA için 1 kayıt + 1 katılım, studentB için 0 kayıt
    const profileA = await fetchStudentProfileData({
      contract: campusPass,
      walletAddress: studentA.address,
      chainId: TEST_CHAIN_ID,
      contractAddress,
    });
    expect(profileA.stats.totalRegistered).to.equal(1);
    expect(profileA.stats.verifiedAttended).to.equal(1);

    const profileB = await fetchStudentProfileData({
      contract: campusPass,
      walletAddress: studentB.address,
      chainId: TEST_CHAIN_ID,
      contractAddress,
    });
    expect(profileB.stats.totalRegistered).to.equal(0);
    expect(profileB.stats.verifiedAttended).to.equal(0);
  });
});
