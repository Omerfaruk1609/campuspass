import { expect } from "chai";
import { network } from "hardhat";
import { buildCampusPassApp } from "../server/src/app.js";
import { createEventIndexer } from "../server/src/indexer/eventIndexer.js";
import {
  buildSiweMessage,
} from "../server/src/services/authService.js";
import { createTransactionalPrismaStore } from "../server/src/services/prismaClient.js";
import {
  buildCsvRow,
  sanitizeCsvCell,
} from "../server/src/services/organizerAnalyticsService.js";

const { ethers } = await network.create();

describe("Faz 11 — Organizatör Yönetim Paneli, Etkinlik Analitiği ve Topluluk Performansı Test Paketi", function () {
  const TEST_CHAIN_ID = 10143;
  const TEST_DOMAIN = "localhost:5173";
  const TEST_URI = "http://localhost:5173";

  async function deployOrganizerAnalyticsFixture() {
    const [
      organizerA,
      organizerB,
      student1,
      student2,
      student3,
      attacker,
    ] = await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Organizatör A: Etkinlik #1 (Kapasite 50)
    await campusPass
      .connect(organizerA)
      .createEvent("Monad Topluluk Hackathonu #1", 50);

    // Organizatör A: Etkinlik #2 (Kapasite 20)
    await campusPass
      .connect(organizerA)
      .createEvent("Monad Akıllı Sözleşme Atölyesi", 20);

    // Organizatör B: Etkinlik #3 (Kapasite 100)
    await campusPass
      .connect(organizerB)
      .createEvent("Organizatör B Özel Semineri", 100);

    // Etkinlik #1 Katılımları:
    // student1: kayıt + katılım (attended)
    await campusPass.connect(student1).registerForEvent(1);
    await campusPass.connect(organizerA).markAttendance(1, student1.address);

    // student2: kayıt + katılım (attended)
    await campusPass.connect(student2).registerForEvent(1);
    await campusPass.connect(organizerA).markAttendance(1, student2.address);

    // student3: yalnızca kayıt (registered only)
    await campusPass.connect(student3).registerForEvent(1);

    // Etkinlik #2 Katılımları:
    // student1: aynı zamanda Etkinlik #2'ye de katıldı (unique student testi için)
    await campusPass.connect(student1).registerForEvent(2);
    await campusPass.connect(organizerA).markAttendance(2, student1.address);

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

    // İndeksle
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
      indexer,
      campusPass,
      contractAddress,
      organizerA,
      organizerB,
      student1,
      student2,
      student3,
      attacker,
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
      statement: "CampusPass organizator paneli islemleri icin cuzdaninizi dogrulayin.",
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

  it("1. Sıfır etkinlikli organizatör: KPI değerleri sıfıra bölme hatası olmadan 0 dönmeli", async function () {
    const { app, attacker } = await deployOrganizerAnalyticsFixture();

    const session = await loginWithSiwe(app, attacker);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: session.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.data.kpis.totalEvents).to.equal(0);
    expect(res.body.data.kpis.totalCapacity).to.equal(0);
    expect(res.body.data.kpis.totalRegistrations).to.equal(0);
    expect(res.body.data.kpis.totalVerifiedAttendances).to.equal(0);
    expect(res.body.data.kpis.overallAttendanceRate).to.equal(0);
    expect(res.body.data.kpis.uniqueAttendedStudents).to.equal(0);
    expect(res.body.data.events).to.be.an("array");
    expect(res.body.data.events.length).to.equal(0);
  });

  it("2. Sıfır kayıtlı etkinlik: Doluluk ve katılım oranları %0 olarak hesaplanmalı", async function () {
    const { app, organizerB } = await deployOrganizerAnalyticsFixture();

    const session = await loginWithSiwe(app, organizerB);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/3/analytics",
      headers: {
        cookie: session.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    const metrics = res.body.data.metrics;
    expect(metrics.capacity).to.equal(100);
    expect(metrics.registeredCount).to.equal(0);
    expect(metrics.verifiedAttendanceCount).to.equal(0);
    expect(metrics.occupancyRate).to.equal(0);
    expect(metrics.attendanceRate).to.equal(0);
    expect(metrics.dropOffRate).to.equal(0);
  });

  it("3. Kayıtlı fakat katılımı olmayan etkinlik: Katılım oranı %0, vazgeçme oranı %100 hesaplanmalı", async function () {
    const { app, indexer, campusPass, organizerA, student3 } =
      await deployOrganizerAnalyticsFixture();

    // Organizatör A yeni bir etkinlik açar (Etkinlik #4)
    await campusPass.connect(organizerA).createEvent("Sadece Kayıtlı Etkinlik", 30);
    await campusPass.connect(student3).registerForEvent(4);
    await indexer.syncOnce();

    const session = await loginWithSiwe(app, organizerA);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/4/analytics",
      headers: {
        cookie: session.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    const metrics = res.body.data.metrics;
    expect(metrics.registeredCount).to.equal(1);
    expect(metrics.verifiedAttendanceCount).to.equal(0);
    expect(metrics.attendanceRate).to.equal(0);
    expect(metrics.dropOffRate).to.equal(100);
  });

  it("4. Kayıt ve katılım sayıları eşit etkinlik: Katılım oranı tam %100 dönmeli", async function () {
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();

    const session = await loginWithSiwe(app, organizerA);

    // Etkinlik #2: 1 kayıt var, 1'i de katıldı (student1)
    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/2/analytics",
      headers: {
        cookie: session.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    const metrics = res.body.data.metrics;
    expect(metrics.registeredCount).to.equal(1);
    expect(metrics.verifiedAttendanceCount).to.equal(1);
    expect(metrics.attendanceRate).to.equal(100);
    expect(metrics.dropOffRate).to.equal(0);
  });

  it("5. Kısmi katılım hesabı: 3 kayıt, 2 katılım olan etkinlikte oranlar doğru hesaplanmalı", async function () {
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();

    const session = await loginWithSiwe(app, organizerA);

    // Etkinlik #1: Kapasite 50, 3 kayıt (student1, student2, student3), 2 katılım (student1, student2)
    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/analytics",
      headers: {
        cookie: session.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    const metrics = res.body.data.metrics;
    expect(metrics.capacity).to.equal(50);
    expect(metrics.registeredCount).to.equal(3);
    expect(metrics.verifiedAttendanceCount).to.equal(2);
    // Doluluk: 3 / 50 = %6
    expect(metrics.occupancyRate).to.equal(6);
    // Katılım: 2 / 3 = %67
    expect(metrics.attendanceRate).to.equal(67);
    // Vazgeçme: (3 - 2) / 3 = %33
    expect(metrics.dropOffRate).to.equal(33);
  });

  it("6. Çoklu etkinliklerde benzersiz tekil öğrenci (unique students) sayısı doğru hesaplanmalı", async function () {
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();

    const session = await loginWithSiwe(app, organizerA);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: session.cookieHeader,
      },
    });

    if (!res.body || !res.body.data) {
      console.log("DEBUG TEST 1 RES:", res.status, JSON.stringify(res.body));
    }

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    const kpis = res.body.data.kpis;
    // Etkinlik 1: student1, student2, student3 (3 kişi)
    // Etkinlik 2: student1 (zaten Etkinlik 1'de vardı)
    // Toplam tekil kayıtlı öğrenci = 3
    expect(kpis.uniqueRegisteredStudents).to.equal(3);
    // Katılanlar: Etkinlik 1'de student1 ve student2, Etkinlik 2'de student1
    // Toplam tekil katılan öğrenci = 2 (student1 ve student2)
    expect(kpis.uniqueAttendedStudents).to.equal(2);
    // Toplam katılım işlemi = 3 (Etkinlik 1: 2 + Etkinlik 2: 1)
    expect(kpis.totalVerifiedAttendances).to.equal(3);
  });

  it("7. Çoklu organizatör izolasyonu: Organizatör A ve Organizatör B panoları tam yalıtımlı olmalı", async function () {
    const { app, organizerA, organizerB } = await deployOrganizerAnalyticsFixture();

    const sessionA = await loginWithSiwe(app, organizerA);
    const sessionB = await loginWithSiwe(app, organizerB);

    const resA = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    const resB = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: sessionB.cookieHeader,
      },
    });

    // Organizatör A 2 etkinliğe sahip
    expect(resA.body.data.kpis.totalEvents).to.equal(2);
    const eventIdsA = resA.body.data.events.map((e) => e.id);
    expect(eventIdsA).to.include(1);
    expect(eventIdsA).to.include(2);
    expect(eventIdsA).to.not.include(3);

    // Organizatör B 1 etkinliğe sahip
    expect(resB.body.data.kpis.totalEvents).to.equal(1);
    const eventIdsB = resB.body.data.events.map((e) => e.id);
    expect(eventIdsB).to.include(3);
    expect(eventIdsB).to.not.include(1);
    expect(eventIdsB).to.not.include(2);
  });

  it("8. Sertifika durum sayımları: Aktif ve iptal edilen sertifikalar doğru ayrıştırılmalı", async function () {
    const { app, prisma, organizerA, student1, contractAddress } =
      await deployOrganizerAnalyticsFixture();

    // student1 için Etkinlik #1'e aktif bir sertifika verisi ekle
    await prisma.attendanceCertificate.create({
      data: {
        certificateId: "CP-CERT-10143-0001-0001",
        version: "CP-CERT-V1",
        status: "ACTIVE",
        chainId: TEST_CHAIN_ID,
        contractAddress,
        eventId: 1,
        eventTitle: "Monad Topluluk Hackathonu #1",
        organizerAddress: organizerA.address,
        participantAddress: student1.address,
        attendanceTxHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        attendanceBlockNumber: 10,
        attendanceLogIndex: 0,
        certificateHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        integritySignature: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });

    const sessionA = await loginWithSiwe(app, organizerA);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.data.kpis.totalCertificates).to.equal(1);
    expect(res.body.data.kpis.activeCertificates).to.equal(1);
  });

  it("9. Indexer checkpoint gecikme (lag) hesabı ve isSynced durumu doğrulanmalı", async function () {
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();

    const sessionA = await loginWithSiwe(app, organizerA);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    const indexerStatus = res.body.data.indexerStatus;
    expect(indexerStatus).to.be.an("object");
    expect(indexerStatus).to.have.property("checkpointBlock");
    expect(indexerStatus).to.have.property("headBlock");
    expect(indexerStatus).to.have.property("lagBlocks");
    expect(indexerStatus).to.have.property("isSynced");
    expect(indexerStatus.lagBlocks).to.be.at.least(0);
  });

  it("10. Katılımcı yönetimi tablosunda arama (search) ve durum filtreleme (status) doğru çalışmalı", async function () {
    const { app, organizerA, student1, student3 } =
      await deployOrganizerAnalyticsFixture();

    const sessionA = await loginWithSiwe(app, organizerA);

    // 10.A — ATTENDED filtresi: Yalnızca katılan 2 öğrenci dönmeli
    const attendedRes = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/participants?status=ATTENDED",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(attendedRes.status).to.equal(200);
    expect(attendedRes.body.success).to.equal(true);
    expect(attendedRes.body.data.participants).to.have.lengthOf(2);
    for (const p of attendedRes.body.data.participants) {
      expect(p.isAttended).to.equal(true);
    }

    // 10.B — REGISTERED_ONLY filtresi: Yalnızca student3 dönmeli
    const regOnlyRes = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/participants?status=REGISTERED_ONLY",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(regOnlyRes.status).to.equal(200);
    expect(regOnlyRes.body.data.participants).to.have.lengthOf(1);
    expect(regOnlyRes.body.data.participants[0].walletAddress.toLowerCase()).to.equal(
      student3.address.toLowerCase()
    );
    expect(regOnlyRes.body.data.participants[0].isAttended).to.equal(false);

    // 10.C — Arama filtresi: student1 cüzdan adresiyle arama
    const searchRes = await app.inject({
      method: "GET",
      url: `/api/organizer/events/1/participants?search=${student1.address}`,
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(searchRes.status).to.equal(200);
    expect(searchRes.body.data.participants).to.have.lengthOf(1);
    expect(searchRes.body.data.participants[0].walletAddress.toLowerCase()).to.equal(
      student1.address.toLowerCase()
    );
  });

  it("11. Katılımcı tablosunda sayfalama (pagination) sınırları ve meta bilgileri doğru dönmeli", async function () {
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();

    const sessionA = await loginWithSiwe(app, organizerA);

    // limit=1 ile sayfa 1
    const page1Res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/participants?page=1&limit=1",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(page1Res.status).to.equal(200);
    expect(page1Res.body.data.pagination.page).to.equal(1);
    expect(page1Res.body.data.pagination.limit).to.equal(1);
    expect(page1Res.body.data.pagination.totalCount).to.equal(3);
    expect(page1Res.body.data.pagination.totalPages).to.equal(3);
    expect(page1Res.body.data.pagination.hasMore).to.equal(true);
    expect(page1Res.body.data.participants).to.have.lengthOf(1);

    // limit=1 ile sayfa 3 (son sayfa)
    const page3Res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/participants?page=3&limit=1",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(page3Res.status).to.equal(200);
    expect(page3Res.body.data.pagination.page).to.equal(3);
    expect(page3Res.body.data.pagination.hasMore).to.equal(false);
  });

  it("12. CSV dışa aktarımı ve Formula Injection (Spreadsheet injection) koruması", async function () {
    // 12.A: sanitizeCsvCell doğrudan birim testi
    expect(sanitizeCsvCell("=SUM(A1:A10)")).to.equal("'=SUM(A1:A10)");
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).to.equal("'+cmd|' /C calc'!A0");
    expect(sanitizeCsvCell("-1+1")).to.equal("'-1+1");
    expect(sanitizeCsvCell("@SUM")).to.equal("'@SUM");
    expect(sanitizeCsvCell("Normal Metin")).to.equal("Normal Metin");
    expect(sanitizeCsvCell('Metin "İçinde" Tırnak')).to.equal('Metin "İçinde" Tırnak');
    expect(buildCsvRow(['Metin "İçinde" Tırnak'])).to.equal('"Metin ""İçinde"" Tırnak"');

    // buildCsvRow testi
    const row = buildCsvRow(["1", "=MALICIOUS", "Normal"]);
    expect(row).to.equal('"1","\'=MALICIOUS","Normal"');

    // 12.B: Endpoint üzerinden CSV indirme testi
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();
    const sessionA = await loginWithSiwe(app, organizerA);

    const csvRes = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/export?type=participants",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(csvRes.status).to.equal(200);
    expect(csvRes.headers["content-type"]).to.include("text/csv");
    expect(csvRes.headers["content-disposition"]).to.include("attachment");
    // UTF-8 BOM ve başlık satırı
    expect(csvRes.body).to.include("Katilimci Cuzdan Adresi");
    expect(csvRes.body).to.include("Kayit Durumu");
  });

  it("13. Yetkilendirme koruması: SIWE oturumu olmadan çağrılan analitik endpoint'leri 401 dönmeli", async function () {
    const { app } = await deployOrganizerAnalyticsFixture();

    const res1 = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
    });

    expect(res1.status).to.equal(401);
    expect(res1.body.success).to.equal(false);
    expect(res1.body.error.code).to.equal("SESSION_REQUIRED");

    const res2 = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/analytics",
    });

    expect(res2.status).to.equal(401);
    expect(res2.body.success).to.equal(false);
    expect(res2.body.error.code).to.equal("SESSION_REQUIRED");
  });

  it("14. Yetkilendirme koruması: Başka organizatörün etkinlik analitiğine erişim 403 Forbidden ile engellenmeli", async function () {
    const { app, organizerB } = await deployOrganizerAnalyticsFixture();

    // Organizatör B oturum açar
    const sessionB = await loginWithSiwe(app, organizerB);

    // Organizatör B, Organizatör A'ya ait Etkinlik #1 analitiğine erişmeye çalışır
    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/analytics",
      headers: {
        cookie: sessionB.cookieHeader,
      },
    });

    expect(res.status).to.equal(403);
    expect(res.body.success).to.equal(false);
    expect(res.body.error.code).to.equal("FORBIDDEN");

    // Katılımcı listesine erişim de 403 ile engellenmeli
    const resParts = await app.inject({
      method: "GET",
      url: "/api/organizer/events/1/participants",
      headers: {
        cookie: sessionB.cookieHeader,
      },
    });

    expect(resParts.status).to.equal(403);
    expect(resParts.body.success).to.equal(false);
    expect(resParts.body.error.code).to.equal("FORBIDDEN");
  });

  it("15. Zaman serisi analitik endpoint'i (/timeseries) karşılaştırmalı seri verisi üretmeli", async function () {
    const { app, organizerA } = await deployOrganizerAnalyticsFixture();

    const sessionA = await loginWithSiwe(app, organizerA);

    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/timeseries",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.data.eventsSeries).to.be.an("array").with.lengthOf(2);
    const ev1 = res.body.data.eventsSeries.find((e) => e.id === 1);
    expect(Boolean(ev1)).to.equal(true);
    expect(ev1.registeredCount).to.equal(3);
    expect(ev1.verifiedAttendanceCount).to.equal(2);
  });

  it("16. Uçtan uca analitik akışı: Yeni etkinlik oluşturulup katılım işaretlendiğinde panoya anında yansımalı", async function () {
    const { app, campusPass, indexer, organizerA, student3 } =
      await deployOrganizerAnalyticsFixture();

    const sessionA = await loginWithSiwe(app, organizerA);

    // Organizatör A yeni bir etkinlik oluşturur (Etkinlik #4)
    await campusPass
      .connect(organizerA)
      .createEvent("Faz 11 Canlı Doğrulama Hackathonu", 40);

    // student3 kaydolur ve katılımı onaylanır
    await campusPass.connect(student3).registerForEvent(4);
    await campusPass.connect(organizerA).markAttendance(4, student3.address);

    // Indexer olayları yakalar
    await indexer.syncOnce();

    // Panoda Etkinlik #4'ün anında belirdiğini doğrula
    const res = await app.inject({
      method: "GET",
      url: "/api/organizer/dashboard",
      headers: {
        cookie: sessionA.cookieHeader,
      },
    });

    expect(res.status).to.equal(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.data.kpis.totalEvents).to.equal(3);
    const ev4 = res.body.data.events.find((e) => e.id === 4);
    expect(Boolean(ev4)).to.equal(true);
    expect(ev4.title).to.equal("Faz 11 Canlı Doğrulama Hackathonu");
    expect(ev4.registeredCount).to.equal(1);
    expect(ev4.verifiedAttendanceCount).to.equal(1);
    expect(ev4.attendanceRate).to.equal(100);
  });
});
