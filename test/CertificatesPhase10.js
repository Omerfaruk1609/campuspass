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
  CERTIFICATE_VERSION,
  VERIFICATION_RESULT_LABELS,
  VERIFICATION_RESULT_STATUS,
  computeCertificateIntegrity,
  verifyCertificateIntegritySeal,
} from "../server/src/services/certificateService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";
import {
  A4_LANDSCAPE_HEIGHT_PT,
  A4_LANDSCAPE_WIDTH_PT,
  buildCertificateSvgMarkup,
  generateCertificatePdfDocument,
  wrapCertificateTitleLines,
} from "../src/utils/certificatePdf.js";

const { ethers } = await network.create();

describe("Faz 10 — Blockchain Doğrulamalı Dijital Katılım Sertifikaları Test Paketi", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployCertificateFixture() {
    const [organizer, studentAttended, studentRegisteredOnly, otherStudent, attacker] =
      await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Etkinlik #1 oluştur
    await campusPass
      .connect(organizer)
      .createEvent("Monad İleri Seviye Blokzincir ve Kriptografi Semineri", 50);

    // studentAttended: hem kayıt olur hem de organizatör tarafından katılımı (AttendanceMarked) doğrulanır
    await campusPass.connect(studentAttended).registerForEvent(1);
    const markTx = await campusPass
      .connect(organizer)
      .markAttendance(1, studentAttended.address);
    const markReceipt = await markTx.wait();

    // studentRegisteredOnly: yalnızca kayıt olur (UserRegistered), etkinliğe katılmaz
    await campusPass.connect(studentRegisteredOnly).registerForEvent(1);

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

    // Blokzincir olaylarını PostgreSQL veri katmanına indeksle
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
      rateLimitMax: 250,
      authRateLimitMax: 60,
      certificateWriteRateLimitMax: 60,
      certificateVerifyRateLimitMax: 120,
    });

    return {
      app,
      prisma,
      indexer,
      services,
      campusPass,
      contractAddress,
      organizer,
      studentAttended,
      studentRegisteredOnly,
      otherStudent,
      attacker,
      markReceipt,
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
      statement:
        "CampusPass ogrenci sertifika islemleri icin cuzdaninizi dogrulayin.",
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

  it("1. Gerçek katılımcı (AttendanceMarked doğrulanmış öğrenci) sertifika oluşturabilir (201 Created)", async function () {
    const { app, studentAttended, organizer, contractAddress, markReceipt } =
      await deployCertificateFixture();

    const session = await loginWithSiwe(app, studentAttended);

    const res = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: {
        eventId: 1,
        walletAddress: studentAttended.address,
        displayName: "Ömer Faruk",
      },
    });

    expect(res.status).to.equal(201);
    expect(res.body.success).to.equal(true);
    expect(res.body.created).to.equal(true);
    expect(res.body.idempotent).to.equal(false);

    const cert = res.body.data;
    expect(cert.certificateId).to.match(/^CP-CERT-[0-9A-F]{32}$/);
    expect(cert.version).to.equal(CERTIFICATE_VERSION);
    expect(cert.status).to.equal("ACTIVE");
    expect(cert.chainId).to.equal(TEST_CHAIN_ID);
    expect(cert.contractAddress).to.equal(contractAddress);
    expect(cert.eventId).to.equal(1);
    expect(cert.organizerAddress).to.equal(organizer.address);
    expect(cert.participantAddress).to.equal(studentAttended.address);
    expect(cert.attendanceTxHash.toLowerCase()).to.equal(
      markReceipt.hash.toLowerCase()
    );
    expect(cert.displayName).to.equal("Ömer Faruk");
    expect(cert.verificationPath).to.equal(`/verify/${cert.certificateId}`);
  });

  it("2. Yalnızca kayıtlı olan ama katılmayan öğrenci (UserRegistered var, AttendanceMarked yok) sertifika oluşturamaz", async function () {
    const { app, studentRegisteredOnly, otherStudent } =
      await deployCertificateFixture();

    // Durum A: Kayıtlı ama katılmamış öğrenci
    const regOnlySession = await loginWithSiwe(app, studentRegisteredOnly);
    const resRegOnly = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: regOnlySession.cookieHeader,
        [CSRF_HEADER_NAME]: regOnlySession.csrfToken,
      },
      body: {
        eventId: 1,
        walletAddress: studentRegisteredOnly.address,
      },
    });

    expect(resRegOnly.status).to.equal(403);
    expect(resRegOnly.body.error.code).to.equal(
      "ATTENDANCE_NOT_VERIFIED_ONCHAIN"
    );

    // Durum B: Hiç kayıt olmamış öğrenci
    const notRegSession = await loginWithSiwe(app, otherStudent);
    const resNotReg = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: notRegSession.cookieHeader,
        [CSRF_HEADER_NAME]: notRegSession.csrfToken,
      },
      body: {
        eventId: 1,
        walletAddress: otherStudent.address,
      },
    });

    expect(resNotReg.status).to.equal(403);
    expect(resNotReg.body.error.code).to.equal("NOT_REGISTERED_FOR_EVENT");
  });

  it("3. Başka bir cüzdan adına sertifika oluşturulamaz (SIWE oturum cüzdanı != talep edilen cüzdan)", async function () {
    const { app, studentAttended, attacker } = await deployCertificateFixture();

    // Saldırgan kendi cüzdanıyla SIWE oturumu açıp katılımcının cüzdanı adına sertifika talep eder
    const attackerSession = await loginWithSiwe(app, attacker);
    const res = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: attackerSession.cookieHeader,
        [CSRF_HEADER_NAME]: attackerSession.csrfToken,
      },
      body: {
        eventId: 1,
        walletAddress: studentAttended.address,
      },
    });

    expect(res.status).to.equal(403);
    expect(res.body.error.code).to.equal("CERTIFICATE_WALLET_MISMATCH");

    // SIWE oturumu olmadan yapılan istek de 401 ile reddedilir
    const unauthRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      body: { eventId: 1, walletAddress: studentAttended.address },
    });
    expect(unauthRes.status).to.equal(401);
  });

  it("4. Aynı katılım için ikinci sertifika talebi idempotent çalışır (200 OK ve aynı certificateId döner)", async function () {
    const { app, prisma, studentAttended } = await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const firstRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: { eventId: 1, walletAddress: studentAttended.address },
    });
    expect(firstRes.status).to.equal(201);
    expect(firstRes.body.created).to.equal(true);

    const secondRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: { eventId: 1, walletAddress: studentAttended.address },
    });
    expect(secondRes.status).to.equal(200);
    expect(secondRes.body.created).to.equal(false);
    expect(secondRes.body.idempotent).to.equal(true);
    expect(secondRes.body.data.certificateId).to.equal(
      firstRes.body.data.certificateId
    );
    expect(secondRes.body.data.certificateHash).to.equal(
      firstRes.body.data.certificateHash
    );

    const totalCount = await prisma.attendanceCertificate.count();
    expect(totalCount).to.equal(1);
  });

  it("5. Eşzamanlı (concurrent Promise.all) sertifika talepleri duplicate kayıt üretmez", async function () {
    const { app, prisma, studentAttended } = await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const requests = Array.from({ length: 6 }, () =>
      app.inject({
        method: "POST",
        url: "/api/certificates",
        headers: {
          cookie: session.cookieHeader,
          [CSRF_HEADER_NAME]: session.csrfToken,
        },
        body: { eventId: 1, walletAddress: studentAttended.address },
      })
    );

    const responses = await Promise.all(requests);
    for (const r of responses) {
      expect([200, 201]).to.include(r.status);
      expect(r.body.success).to.equal(true);
    }

    const uniqueCertIds = new Set(
      responses.map((r) => r.body.data.certificateId)
    );
    expect(uniqueCertIds.size).to.equal(1);

    const dbCount = await prisma.attendanceCertificate.count();
    expect(dbCount).to.equal(1);
  });

  it("6. Sertifika doğrulama endpoint'i (GET /api/certificates/:certificateId/verify) geçerli sertifikayı 4 katmanda doğrular", async function () {
    const { app, studentAttended } = await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: { eventId: 1 },
    });
    const certId = createRes.body.data.certificateId;

    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}/verify`,
    });

    expect(verifyRes.status).to.equal(200);
    const v = verifyRes.body.data;
    expect(v.verified).to.equal(true);
    expect(v.verificationStatus).to.equal(VERIFICATION_RESULT_STATUS.VERIFIED);
    expect(v.verificationLabel).to.equal(
      VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.VERIFIED]
    );
    expect(v.verificationSources.databaseRecord.passed).to.equal(true);
    expect(v.verificationSources.cryptographicIntegrity.passed).to.equal(true);
    expect(v.verificationSources.indexedAttendanceLog.passed).to.equal(true);
    expect(v.verificationSources.liveBlockchainContract.passed).to.equal(true);
  });

  it("7. Uydurma veya bulunmayan certificateId 'Bulunamadı' (NOT_FOUND) döner; bozuk format 400 ile reddedilir", async function () {
    const { app } = await deployCertificateFixture();

    const fakeCertId = "CP-CERT-DEADBEEF000011112222333344445555";
    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${fakeCertId}/verify`,
    });

    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.body.data.verified).to.equal(false);
    expect(verifyRes.body.data.verificationStatus).to.equal(
      VERIFICATION_RESULT_STATUS.NOT_FOUND
    );
    expect(verifyRes.body.data.verificationLabel).to.equal("Bulunamadı");
    expect(verifyRes.body.data.certificate).to.equal(null);

    // Bozuk format (SQLi / XSS / kısa kod) 400 Bad Request döner
    const malformedRes = await app.inject({
      method: "GET",
      url: "/api/certificates/CP-CERT-INVALID-SHORT/verify",
    });
    expect(malformedRes.status).to.equal(400);
  });

  it("8. Sertifika verisi veritabanında değiştirildiğinde kriptografik bütünlük kontrolü (CP-CERT-V1) başarısız olur", async function () {
    const { app, prisma, studentAttended, attacker } =
      await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: { eventId: 1 },
    });
    const certId = createRes.body.data.certificateId;

    // Veritabanındaki sertifika kaydında katılımcı adresini veya başlığı doğrudan manipüle et
    const dbRow = await prisma.attendanceCertificate.findUnique({
      where: { certificateId: certId },
    });
    await prisma.attendanceCertificate.update({
      where: { id: dbRow.id },
      data: {
        participantAddress: attacker.address.toLowerCase(),
      },
    });

    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}/verify`,
    });

    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.body.data.verified).to.equal(false);
    expect(verifyRes.body.data.verificationStatus).to.equal(
      VERIFICATION_RESULT_STATUS.INVALID
    );
    expect(verifyRes.body.data.verificationLabel).to.equal("Geçersiz");
    expect(verifyRes.body.data.reasonCode).to.equal(
      "CERTIFICATE_INTEGRITY_TAMPERED"
    );
    expect(
      verifyRes.body.data.verificationSources.cryptographicIntegrity.passed
    ).to.equal(false);
  });

  it("9. RPC kesintisinde doğrulama sonucu sertifikayı 'Geçersiz' olarak işaretlemez; 'Doğrulama şu anda yapılamıyor' (UNVERIFIABLE_NOW) döner", async function () {
    const { app, prisma, studentAttended, contractAddress } =
      await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: { eventId: 1 },
    });
    const certId = createRes.body.data.certificateId;

    // RPC kesintisini simüle eden bozuk sözleşme nesnesiyle ikinci bir uygulama örneği oluştur
    const brokenContract = {
      events: async () => {
        throw new Error("Monad Testnet RPC timeout (503 Service Unavailable)");
      },
      registered: async () => {
        throw new Error("Monad Testnet RPC timeout (503 Service Unavailable)");
      },
      attended: async () => {
        throw new Error("Monad Testnet RPC timeout (503 Service Unavailable)");
      },
    };

    const { app: appWithBrokenRpc } = buildCampusPassApp({
      prisma,
      contract: brokenContract,
      chainId: TEST_CHAIN_ID,
      contractAddress,
    });

    const verifyRes = await appWithBrokenRpc.inject({
      method: "GET",
      url: `/api/certificates/${certId}/verify`,
    });

    expect(verifyRes.status).to.equal(200);
    const v = verifyRes.body.data;
    expect(v.verified).to.equal(false);
    expect(v.verificationStatus).to.equal(
      VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW
    );
    expect(v.verificationLabel).to.equal("Doğrulama şu anda yapılamıyor");
    expect(v.reasonCode).to.equal("RPC_UNAVAILABLE");
    // Veritabanı, kriptografik mühür ve indekslenmiş log katmanları başarılıdır; yalnızca canlı RPC ulaşılamaz durumdadır
    expect(v.verificationSources.databaseRecord.passed).to.equal(true);
    expect(v.verificationSources.cryptographicIntegrity.passed).to.equal(true);
    expect(v.verificationSources.indexedAttendanceLog.passed).to.equal(true);
    expect(v.verificationSources.liveBlockchainContract.passed).to.equal(false);
  });

  it("10. Indexer geride kaldığında yanlış pozitif sertifika üretimi ve doğrulaması engellenir", async function () {
    const {
      app,
      prisma,
      campusPass,
      organizer,
      otherStudent,
      studentAttended,
      contractAddress,
    } = await deployCertificateFixture();

    // otherStudent etkinliğe katılır ancak indexer.syncOnce() henüz çalıştırılmaz!
    await campusPass.connect(otherStudent).registerForEvent(1);
    await campusPass.connect(organizer).markAttendance(1, otherStudent.address);

    const otherSession = await loginWithSiwe(app, otherStudent);
    const prematureRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: otherSession.cookieHeader,
        [CSRF_HEADER_NAME]: otherSession.csrfToken,
      },
      body: { eventId: 1 },
    });

    expect(prematureRes.status).to.equal(409);
    expect(prematureRes.body.error.code).to.equal("INDEXER_ATTENDANCE_PENDING");

    // Mevcut bir sertifika için IndexerCheckpoint geriye düşerse doğrulama UNVERIFIABLE_NOW döner
    const attSession = await loginWithSiwe(app, studentAttended);
    const issuedRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: attSession.cookieHeader,
        [CSRF_HEADER_NAME]: attSession.csrfToken,
      },
      body: { eventId: 1 },
    });
    const certId = issuedRes.body.data.certificateId;

    await prisma.indexerCheckpoint.update({
      where: {
        chainId_contractAddress: {
          chainId: TEST_CHAIN_ID,
          contractAddress: contractAddress.toLowerCase(),
        },
      },
      data: { lastProcessedBlock: 0 },
    });

    const verifyLagRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}/verify`,
    });
    expect(verifyLagRes.status).to.equal(200);
    expect(verifyLagRes.body.data.verificationStatus).to.equal(
      VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW
    );
    expect(verifyLagRes.body.data.reasonCode).to.equal(
      "INDEXER_LAGGING_OR_UNCONFIRMED"
    );
  });

  it("11. Zincir yeniden düzenlemesi (reorg) sonrası geçersizleşen katılım logu için sertifika INVALID olarak işaretlenir", async function () {
    const {
      app,
      prisma,
      campusPass,
      studentAttended,
      contractAddress,
      markReceipt,
    } = await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    // Önce geçerli sertifikayı oluştur
    const createRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: { eventId: 1 },
    });
    const certId = createRes.body.data.certificateId;
    const targetBlock = Number(markReceipt.blockNumber);

    // Reorg penceresindeki blok üzerinde zincirde karşılığı kalmamış (orphaned) bir AttendanceMarked logu ve sertifikası simüle et
    const orphanStudent = "0x9999999999999999999999999999999999999999";
    const orphanTxHash =
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    await prisma.indexedAttendance.create({
      data: {
        chainId: TEST_CHAIN_ID,
        contractAddress: contractAddress.toLowerCase(),
        eventId: 1,
        participantAddress: orphanStudent,
        transactionHash: orphanTxHash,
        blockNumber: targetBlock,
        logIndex: 99,
      },
    });

    const orphanIssuedAt = new Date();
    const orphanCertId = "CP-CERT-99999999999999999999999999999999";
    const orphanBase = {
      version: CERTIFICATE_VERSION,
      certificateId: orphanCertId,
      chainId: TEST_CHAIN_ID,
      contractAddress: contractAddress.toLowerCase(),
      eventId: 1,
      eventTitle: "Monad İleri Seviye Blokzincir ve Kriptografi Semineri",
      organizerAddress: createRes.body.data.organizerAddress.toLowerCase(),
      participantAddress: orphanStudent,
      attendanceTxHash: orphanTxHash,
      attendanceBlockNumber: targetBlock,
      attendanceLogIndex: 99,
      issuedAt: orphanIssuedAt,
    };
    const orphanIntegrity = computeCertificateIntegrity(orphanBase);

    await prisma.attendanceCertificate.create({
      data: {
        ...orphanBase,
        status: "ACTIVE",
        certificateHash: orphanIntegrity.certificateHash,
        integritySignature: orphanIntegrity.integritySignature,
      },
    });

    // Indexer reorg penceresini yeniden taradığında (syncOnce) zincirde karşılığı olmayan orphan log silinir
    // ve ilişkili sertifika atomik olarak INVALIDATED_BY_REORG durumuna çekilir
    const localIndexer = createEventIndexer({
      prisma,
      contract: campusPass,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      startBlock: 0,
      batchSize: 50,
      confirmations: 0,
      reorgLookbackBlocks: 10,
    });
    await localIndexer.syncOnce();

    const verifyOrphanRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${orphanCertId}/verify`,
    });
    expect(verifyOrphanRes.status).to.equal(200);
    expect(verifyOrphanRes.body.data.verified).to.equal(false);
    expect(verifyOrphanRes.body.data.verificationStatus).to.equal(
      VERIFICATION_RESULT_STATUS.INVALID
    );
    expect(verifyOrphanRes.body.data.reasonCode).to.equal(
      "ATTENDANCE_INVALIDATED_BY_REORG"
    );

    // Gerçek katılımcının sertifikası ise reorg taramasından etkilenmez ve VERIFIED kalır
    const verifyValidRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}/verify`,
    });
    expect(verifyValidRes.body.data.verified).to.equal(true);
    expect(verifyValidRes.body.data.verificationStatus).to.equal(
      VERIFICATION_RESULT_STATUS.VERIFIED
    );
  });

  it("12. Cüzdan değiştiğinde sertifika listesi doğru cüzdana göre izole edilir ve displayName XSS içeremez", async function () {
    const { app, studentAttended, studentRegisteredOnly } =
      await deployCertificateFixture();

    const sessionA = await loginWithSiwe(app, studentAttended);

    // XSS içeren displayName reddedilmeli
    const xssRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: sessionA.cookieHeader,
        [CSRF_HEADER_NAME]: sessionA.csrfToken,
      },
      body: {
        eventId: 1,
        displayName: "<script>alert('xss')</script>",
      },
    });
    expect(xssRes.status).to.equal(400);

    // Temiz gösterim adıyla oluştur
    await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: sessionA.cookieHeader,
        [CSRF_HEADER_NAME]: sessionA.csrfToken,
      },
      body: {
        eventId: 1,
        displayName: "Ömer Faruk",
      },
    });

    // studentAttended için /api/certificates/me -> 1 sertifika
    const listARes = await app.inject({
      method: "GET",
      url: "/api/certificates/me",
      headers: { cookie: sessionA.cookieHeader },
    });
    expect(listARes.status).to.equal(200);
    expect(listARes.body.data).to.have.lengthOf(1);
    expect(listARes.body.data[0].participantAddress).to.equal(
      studentAttended.address
    );

    // Cüzdan studentRegisteredOnly olarak değiştiğinde /api/certificates/me -> 0 sertifika
    const sessionB = await loginWithSiwe(app, studentRegisteredOnly);
    const listBRes = await app.inject({
      method: "GET",
      url: "/api/certificates/me",
      headers: { cookie: sessionB.cookieHeader },
    });
    expect(listBRes.status).to.equal(200);
    expect(listBRes.body.data).to.have.lengthOf(0);
  });

  it("13. Herkese açık doğrulama ve detay endpoint'leri cüzdan bağlantısı gerektirmez ve kişisel displayName verisini sızdırmaz", async function () {
    const { app, studentAttended } = await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: {
        eventId: 1,
        displayName: "Gizli Öğrenci Gösterim Adı",
      },
    });
    const certId = createRes.body.data.certificateId;

    // Cookie veya CSRF olmadan (tamamen anonim ziyaretçi) detay ve doğrulama sorguları
    const publicDetailRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}`,
    });
    expect(publicDetailRes.status).to.equal(200);
    expect(publicDetailRes.body.data.certificateId).to.equal(certId);
    expect(publicDetailRes.body.data.displayName).to.equal(undefined);

    const publicVerifyRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}/verify`,
    });
    expect(publicVerifyRes.status).to.equal(200);
    expect(publicVerifyRes.body.data.verified).to.equal(true);
    expect(publicVerifyRes.body.data.certificate.displayName).to.equal(
      undefined
    );
  });

  it("14. Yatay A4 PDF ve SVG sertifika üreticisi QR kod, Türkçe karakter desteği ve tüm zorunlu blokzincir alanlarıyla geçerli çıktı üretir", async function () {
    const { app, studentAttended } = await deployCertificateFixture();
    const session = await loginWithSiwe(app, studentAttended);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/certificates",
      headers: {
        cookie: session.cookieHeader,
        [CSRF_HEADER_NAME]: session.csrfToken,
      },
      body: {
        eventId: 1,
        displayName: "Çağrı Şahin Yılmaz",
      },
    });
    const cert = createRes.body.data;

    const doc = generateCertificatePdfDocument(cert, {
      baseOrigin: "https://campuspass.example.edu",
    });

    expect(doc.verificationUrl).to.equal(
      `https://campuspass.example.edu/verify/${cert.certificateId}`
    );
    expect(doc.fileName).to.equal(
      `CampusPass-Sertifika-${cert.certificateId}.pdf`
    );

    // PDF-1.4 ve Yatay A4 MediaBox kontrolü
    expect(doc.pdfString.startsWith("%PDF-1.4")).to.equal(true);
    expect(doc.pdfString).to.include(
      `/MediaBox [0 0 ${A4_LANDSCAPE_WIDTH_PT} ${A4_LANDSCAPE_HEIGHT_PT}]`
    );
    expect(doc.pdfString).to.include(cert.certificateId);
    expect(doc.pdfString).to.include(cert.participantAddress);
    expect(doc.pdfString).to.include(cert.organizerAddress);
    expect(doc.pdfString).to.include(cert.attendanceTxHash);
    expect(doc.pdfBytes.byteLength).to.be.greaterThan(1500);

    // QR matrisi ve SVG içerik kontrolü
    expect(doc.qrMatrix.length).to.be.greaterThanOrEqual(21);
    const svg = buildCertificateSvgMarkup(cert, {
      baseOrigin: "https://campuspass.example.edu",
    });
    expect(svg).to.include('viewBox="0 0 1123 794"');
    expect(svg).to.include("DİJİTAL KATILIM SERTİFİKASI");
    expect(svg).to.include(cert.certificateId);
    expect(svg).to.include("Çağrı Şahin Yılmaz");
    expect(svg).to.include("resmî bir üniversite diploması veya akademik yeterlilik belgesi değildir");

    // Uzun başlık sarma (overflow koruması) kontrolü
    const wrapped = wrapCertificateTitleLines(
      "Uluslararası Blokzincir, Sıfır Bilgi Kanıtları ve Dağıtık Sistemler Mühendisliği Kongresi 2026",
      44,
      2
    );
    expect(wrapped).to.have.lengthOf(2);
    expect(wrapped[0].length).to.be.at.most(44);

    // Doğrudan bütünlük mührü fonksiyon kontrolü
    const sealCheck = verifyCertificateIntegritySeal({
      ...cert,
      integritySignature: computeCertificateIntegrity(cert).integritySignature,
    });
    expect(sealCheck.valid).to.equal(true);
    expect(SESSION_COOKIE_NAME).to.be.a("string");
  });
});
