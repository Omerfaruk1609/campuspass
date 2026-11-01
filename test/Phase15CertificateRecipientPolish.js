import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { createEventIndexer } from "../server/src/indexer/eventIndexer.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";
import {
  buildCertificateSvgMarkup,
  generateCertificatePdfDocument,
} from "../src/utils/certificatePdf.js";

const { ethers } = await network.create();

describe("Faz 15 Final Polish — Sertifika Alıcı Kimliği & Doğrulanmış Profil Tam Adı Snapshot Testleri", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployPolishFixture() {
    const [organizer, studentA, studentB, outsider] = await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Etkinlik #1 oluştur
    await campusPass
      .connect(organizer)
      .createEvent("Monad Testnet Web3 Geliştirici Zirvesi 2026", 50);

    // studentA kaydolur ve katılımı organizatör tarafından doğrulanır
    await campusPass.connect(studentA).registerForEvent(1);
    const markTxA = await campusPass
      .connect(organizer)
      .markAttendance(1, studentA.address);
    await markTxA.wait();

    // studentB kaydolur ve katılımı organizatör tarafından doğrulanır
    await campusPass.connect(studentB).registerForEvent(1);
    const markTxB = await campusPass
      .connect(organizer)
      .markAttendance(1, studentB.address);
    await markTxB.wait();

    const prisma = createTransactionalPrismaStore();
    const indexer = createEventIndexer({
      prisma,
      contract: campusPass,
      chainId: TEST_CHAIN_ID,
      contractAddress,
      startBlock: 0,
      batchSize: 50,
      confirmations: 0,
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
      prisma,
      campusPass,
      contractAddress,
      organizer,
      studentA,
      studentB,
      outsider,
    };
  }

  async function loginWithSiwe(app, signer) {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?walletAddress=${signer.address}`,
    });
    expect(nonceRes.status).to.equal(200);
    const { nonce, issuedAt, expiresAt } = nonceRes.body.data;

    const message = [
      `${TEST_DOMAIN} wants you to sign in with your Ethereum account:`,
      signer.address,
      "",
      "CampusPass test authentication.",
      "",
      `URI: ${TEST_URI}`,
      "Version: 1",
      `Chain ID: ${TEST_CHAIN_ID}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expiresAt}`,
    ].join("\n");

    const signature = await signer.signMessage(message);

    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      body: { message, signature },
    });
    expect(verifyRes.status).to.equal(200);

    const setCookie = verifyRes.cookies?.[0] || "";
    const cookieHeader = setCookie.split(";")[0];
    const csrfToken = verifyRes.body.data.csrfToken;

    return { cookieHeader, csrfToken };
  }

  it("1. Sertifika üretiminde katılımcının sunucu tarafındaki doğrulanmış profil tam adı (StudentProfile.displayName) anlık mühürlenir (snapshot)", async function () {
    const { app, prisma, studentA } = await deployPolishFixture();

    // 1. studentA için sunucu tarafında profil oluştur
    await prisma.studentProfile.create({
      data: {
        walletAddress: studentA.address.toLowerCase(),
        displayName: "Zeynep Kaya",
        university: "Monad Teknik Üniversitesi",
        department: "Bilgisayar Mühendisliği",
      },
    });

    const sessionA = await loginWithSiwe(app, studentA);

    // 2. Sertifika üret
    const issueRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionA.cookieHeader,
        "x-csrf-token": sessionA.csrfToken,
      },
      body: { eventId: 1 },
    });

    expect(issueRes.status).to.equal(201);
    expect(issueRes.body.data.recipientName).to.equal("Zeynep Kaya");
    expect(issueRes.body.data.displayName).to.equal("Zeynep Kaya");

    // Veritabanındaki AttendanceCertificate tablosunu doğrudan doğrula
    const certRow = await prisma.attendanceCertificate.findUnique({
      where: { certificateId: issueRes.body.data.certificateId },
    });
    expect(certRow.displayName).to.equal("Zeynep Kaya");
  });

  it("2. İstek gövdesinde (request body) gönderilen sahte isim ASLA kabul edilmez; yalnızca sunucunun güvendiği profil adı kullanılır", async function () {
    const { app, prisma, studentA } = await deployPolishFixture();

    await prisma.studentProfile.create({
      data: {
        walletAddress: studentA.address.toLowerCase(),
        displayName: "Mehmet Demir",
      },
    });

    const sessionA = await loginWithSiwe(app, studentA);

    // Saldırgan veya istemci request body içinde farklı/sahte bir isim gönderir
    const issueRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionA.cookieHeader,
        "x-csrf-token": sessionA.csrfToken,
      },
      body: {
        eventId: 1,
        displayName: "Prof. Dr. Sahte Rektör İsim",
      },
    });

    expect(issueRes.status).to.equal(201);
    // Request body'deki isim tamamen göz ardı edilmeli; profil tablosundaki isim mühürlenmeli
    expect(issueRes.body.data.recipientName).to.equal("Mehmet Demir");
    expect(issueRes.body.data.displayName).to.equal("Mehmet Demir");
    expect(issueRes.body.data.recipientName).to.not.include("Sahte");
  });

  it("3. Sertifika üretildikten sonra öğrencinin profilini değiştirmesi, önceden verilmiş sertifikadaki mühürlü ismi ASLA değiştirmez (Snapshot Immutability)", async function () {
    const { app, prisma, studentA } = await deployPolishFixture();

    await prisma.studentProfile.create({
      data: {
        walletAddress: studentA.address.toLowerCase(),
        displayName: "İlk Verilen İsim",
      },
    });

    const sessionA = await loginWithSiwe(app, studentA);

    // 1. İlk isimle sertifika üret
    const firstRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionA.cookieHeader,
        "x-csrf-token": sessionA.csrfToken,
      },
      body: { eventId: 1 },
    });
    expect(firstRes.status).to.equal(201);
    const certId = firstRes.body.data.certificateId;
    expect(firstRes.body.data.recipientName).to.equal("İlk Verilen İsim");

    // 2. Öğrenci daha sonra profil ayarlarından adını günceller
    await prisma.studentProfile.update({
      where: { walletAddress: studentA.address.toLowerCase() },
      data: { displayName: "Sonradan Değiştirilen Yeni İsim" },
    });

    // 3. Sertifikayı tekrar sorgula (GET /api/certificates/:id ve idempotent POST /api/certificates/issue)
    const idempotentRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionA.cookieHeader,
        "x-csrf-token": sessionA.csrfToken,
      },
      body: { eventId: 1 },
    });
    expect(idempotentRes.status).to.equal(200);
    expect(idempotentRes.body.idempotent).to.equal(true);
    expect(idempotentRes.body.data.certificateId).to.equal(certId);
    // Önceki sertifikadaki isim snapshot olarak kalmalı, profil güncellemesinden etkilenmemeli
    expect(idempotentRes.body.data.recipientName).to.equal("İlk Verilen İsim");

    const getRes = await app.inject({
      method: "GET",
      url: `/api/certificates/${certId}`,
    });
    expect(getRes.status).to.equal(200);
    expect(getRes.body.data.recipientName).to.equal("İlk Verilen İsim");
  });

  it("4. Profil tam adı bulunmadığında sahte isim uydurulmaz; onaylı ürün kuralları (deliberate fallback) gereği null saklanır ve cüzdan bağı korunur", async function () {
    const { app, prisma, studentB } = await deployPolishFixture();

    // studentB için profil tablosunda kayıt yok veya displayName boş
    const sessionB = await loginWithSiwe(app, studentB);

    const issueRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionB.cookieHeader,
        "x-csrf-token": sessionB.csrfToken,
      },
      body: { eventId: 1 },
    });

    expect(issueRes.status).to.equal(201);
    // Sahte isim üretilmez (do not fabricate one)
    expect(issueRes.body.data.recipientName).to.equal(null);
    expect(issueRes.body.data.displayName).to.equal(null);
    // Cüzdan adresi birincil doğrulama bağı olarak korunur
    expect(issueRes.body.data.participantAddress.toLowerCase()).to.equal(
      studentB.address.toLowerCase()
    );
  });

  it("5. requireProfileName aktif olduğunda ve profil tam adı tanımlı olmadığında sertifika üretimi 400 PROFILE_NAME_REQUIRED ile bloklanır", async function () {
    const { app, studentB } = await deployPolishFixture();

    const sessionB = await loginWithSiwe(app, studentB);

    const blockedRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionB.cookieHeader,
        "x-csrf-token": sessionB.csrfToken,
      },
      body: {
        eventId: 1,
        requireProfileName: true,
      },
    });

    expect(blockedRes.status).to.equal(400);
    expect(blockedRes.body.error.code).to.equal("PROFILE_NAME_REQUIRED");
    expect(blockedRes.body.error.message).to.include("Hesap Ayarları");
  });

  it("6. Organizatör katılan öğrenci adına sertifika ürettiğinde de öğrencinin kendi doğrulanmış profil ismi mühürlenir", async function () {
    const { app, prisma, organizer, studentA } = await deployPolishFixture();

    await prisma.studentProfile.create({
      data: {
        walletAddress: studentA.address.toLowerCase(),
        displayName: "Burak Özdemir",
      },
    });

    const orgSession = await loginWithSiwe(app, organizer);

    // Organizatör studentA için sertifika üretir
    const orgIssueRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: orgSession.cookieHeader,
        "x-csrf-token": orgSession.csrfToken,
      },
      body: {
        eventId: 1,
        walletAddress: studentA.address,
        displayName: "Organizatörün Yazdığı Alakasız İsim",
      },
    });

    expect(orgIssueRes.status).to.equal(201);
    // Organizatörün gönderdiği isim değil, öğrencinin profili kullanılır
    expect(orgIssueRes.body.data.recipientName).to.equal("Burak Özdemir");
    expect(orgIssueRes.body.data.participantAddress.toLowerCase()).to.equal(
      studentA.address.toLowerCase()
    );
  });

  it("7. SVG ve PDF belgeleri birincil alıcı olarak doğrulanmış profil tam adını büyük puntoyla, cüzdan adresini ikincil bağlayıcı olarak sunar", async function () {
    const { app, prisma, studentA } = await deployPolishFixture();

    await prisma.studentProfile.create({
      data: {
        walletAddress: studentA.address.toLowerCase(),
        displayName: "Selin Çelik Yılmaz",
      },
    });

    const sessionA = await loginWithSiwe(app, studentA);
    const issueRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionA.cookieHeader,
        "x-csrf-token": sessionA.csrfToken,
      },
      body: { eventId: 1 },
    });

    const cert = issueRes.body.data;

    // 1. SVG Çıktısını test et
    const svg = buildCertificateSvgMarkup(cert);
    expect(svg).to.include("SERTİFİKA SAHİBİ / DOĞRULANMIŞ KATILIMCI");
    expect(svg).to.include("Selin Çelik Yılmaz");
    expect(svg).to.include("Doğrulanmış Cüzdan Kimliği:");
    expect(svg).to.include(cert.participantAddress);

    // 2. PDF Çıktısını test et
    const doc = generateCertificatePdfDocument(cert);
    expect(doc.pdfString).to.include("SERTIFIKA SAHIBI / DOGRULANMIS KATILIMCI:");
    expect(doc.pdfString).to.include("Selin Celik Yilmaz");
    expect(doc.pdfString).to.include("Dogrulanmis Cuzdan Kimligi:");
    expect(doc.pdfString).to.include(cert.participantAddress);
  });

  it("8. Herkese açık 4 katmanlı sertifika doğrulama (GET /api/certificates/verify/:id) ve kriptografik mühür doğrulaması kusursuz çalışır", async function () {
    const { app, prisma, studentA } = await deployPolishFixture();

    await prisma.studentProfile.create({
      data: {
        walletAddress: studentA.address.toLowerCase(),
        displayName: "Kerem Aksoy",
      },
    });

    const sessionA = await loginWithSiwe(app, studentA);
    const issueRes = await app.inject({
      method: "POST",
      url: "/api/certificates/issue",
      headers: {
        cookie: sessionA.cookieHeader,
        "x-csrf-token": sessionA.csrfToken,
      },
      body: { eventId: 1 },
    });
    const certId = issueRes.body.data.certificateId;

    // Tamamen anonim ziyaretçi doğrulama sorgusu
    const verifyRes = await app.inject({
      method: "GET",
      url: `/api/certificates/verify/${certId}`,
    });

    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.body.data.verified).to.equal(true);
    expect(verifyRes.body.data.verificationStatus).to.equal("VERIFIED");
    expect(verifyRes.body.data.certificate.recipientName).to.equal("Kerem Aksoy");
    expect(verifyRes.body.data.certificate.participantAddress.toLowerCase()).to.equal(
      studentA.address.toLowerCase()
    );
    expect(verifyRes.body.data.verificationSources.cryptographicIntegrity.passed).to.equal(true);
    expect(verifyRes.body.data.verificationSources.liveBlockchainContract.passed).to.equal(true);
  });
});
