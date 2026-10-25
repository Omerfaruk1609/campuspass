import net from "node:net";
import { env } from "../src/utils/env.js";

/**
 * Gerçek PostgreSQL Entegrasyon Test Koşucusu (Mock/Bellek İçi Testlerden Ayrı)
 * - Yalnızca gerçek bir PostgreSQL sunucusuna (TEST_DATABASE_URL veya DATABASE_URL)
 *   TCP bağlantısı kurulabildiğinde ve @prisma/client hazır olduğunda testleri çalıştırır.
 * - Mevcut veritabanını asla silmez veya sıfırlamaz; izole test chainId (999999) kullanır.
 * - Bağlantı yoksa sahte başarı üretmez; durumu açıkça [ATLANDI] olarak raporlar.
 */
function checkPostgresPortReachable(databaseUrl, timeoutMs = 2000) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(databaseUrl);
      const host = parsed.hostname || "localhost";
      const port = Number(parsed.port) || 5432;

      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ reachable: false, host, port, reason: "TIMEOUT" });
      }, timeoutMs);

      socket.on("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ reachable: true, host, port, reason: null });
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({
          reachable: false,
          host,
          port,
          reason: err.code || err.message,
        });
      });
    } catch (err) {
      resolve({
        reachable: false,
        host: "unknown",
        port: 5432,
        reason: err.message,
      });
    }
  });
}

async function runPostgresIntegrationSuite() {
  console.log("=== CampusPass Gerçek PostgreSQL Entegrasyon Test Kontrolü ===");
  const targetDbUrl = process.env.TEST_DATABASE_URL || env.DATABASE_URL;
  const probe = await checkPostgresPortReachable(targetDbUrl);

  if (!probe.reachable) {
    console.log(
      `[BİLGİ / ATLANDI] Gerçek PostgreSQL sunucusuna (${probe.host}:${probe.port}) şu anda ulaşılamıyor (Sebep: ${probe.reason}).`
    );
    console.log(
      "Not: Yönerge gereği gerçek ortamda çalıştırılamayan PostgreSQL testleri çalışmış gibi raporlanmamıştır."
    );
    console.log(
      "Kurulum ve Çalıştırma Adımları:\n" +
        "  1. Docker Desktop veya yerel PostgreSQL 15+ servisini başlatın.\n" +
        "  2. 'cd server && npm install' ile @prisma/client ve prisma CLI paketlerini kurun.\n" +
        "  3. 'npm run db:generate && npm run db:migrate' ile migration'ları uygulayın.\n" +
        "  4. 'npm run test:postgres' komutunu yeniden çalıştırın."
    );
    process.exit(0);
  }

  let PrismaClient;
  try {
    const mod = await import("@prisma/client");
    PrismaClient = mod.PrismaClient;
  } catch (err) {
    console.log(
      `[BİLGİ / ATLANDI] PostgreSQL portu açık ancak @prisma/client henüz üretilmemiş (${err.message}).`
    );
    process.exit(0);
  }

  const TEST_CHAIN_ID = 999999;
  const TEST_CONTRACT = "0x0000000000000000000000000000000000999999";
  const TEST_EVENT_ID = 888888;
  const TEST_ORGANIZER = "0x70761cd6ff53fa54408f1497f0e5ff9e56794dc5";
  const TEST_STUDENT = "0x1111111111111111111111111111111111111111";

  const prisma = new PrismaClient({
    datasources: { db: { url: targetDbUrl } },
  });

  try {
    await prisma.$connect();

    // 1. Bağlantı kontrolü
    const rows = await prisma.$queryRaw`SELECT 1 AS connected`;
    console.log("1. [BAŞARILI] Gerçek PostgreSQL bağlantısı doğrulandı:", rows);

    // Olası önceki yarım kalmış izole test kayıtlarını temizle (gerçek Monad 10143 verilerine dokunmaz)
    await prisma.attendanceCertificate.deleteMany({
      where: { chainId: TEST_CHAIN_ID, contractAddress: TEST_CONTRACT },
    });
    await prisma.indexedAttendance.deleteMany({
      where: { chainId: TEST_CHAIN_ID, contractAddress: TEST_CONTRACT },
    });
    await prisma.indexedRegistration.deleteMany({
      where: { chainId: TEST_CHAIN_ID, contractAddress: TEST_CONTRACT },
    });
    await prisma.eventMetadata.deleteMany({
      where: { chainId: TEST_CHAIN_ID, contractAddress: TEST_CONTRACT },
    });

    // 2. CRUD Testi (Create, Read, Update)
    const createdMeta = await prisma.eventMetadata.create({
      data: {
        chainId: TEST_CHAIN_ID,
        contractAddress: TEST_CONTRACT,
        eventId: TEST_EVENT_ID,
        organizerAddress: TEST_ORGANIZER,
        title: "PostgreSQL Entegrasyon Test Etkinliği",
        capacity: 50,
        description: "Gerçek PostgreSQL CRUD doğrulama kaydı.",
        community: "Test Topluluğu",
        category: "Yazılım",
        startAt: new Date("2026-12-01T14:00:00+03:00"),
        endAt: new Date("2026-12-01T17:00:00+03:00"),
        registrationDeadline: new Date("2026-12-01T13:30:00+03:00"),
        campus: "Merkez Kampüs",
        building: "B Blok",
        room: "Salon 101",
      },
    });

    const updatedMeta = await prisma.eventMetadata.update({
      where: { id: createdMeta.id },
      data: { room: "Salon 202" },
    });
    if (updatedMeta.room !== "Salon 202") {
      throw new Error("PostgreSQL update doğrulaması başarısız.");
    }
    console.log("2. [BAŞARILI] Gerçek PostgreSQL CRUD işlemleri doğrulandı.");

    // 3. Unique Constraint (P2002) Testi
    let uniqueErrorCaught = false;
    try {
      await prisma.eventMetadata.create({
        data: {
          chainId: TEST_CHAIN_ID,
          contractAddress: TEST_CONTRACT,
          eventId: TEST_EVENT_ID,
          organizerAddress: TEST_ORGANIZER,
          description: "Duplicate denemesi",
          community: "Test Topluluğu",
          category: "Yazılım",
          startAt: new Date("2026-12-01T14:00:00+03:00"),
          endAt: new Date("2026-12-01T17:00:00+03:00"),
          registrationDeadline: new Date("2026-12-01T13:30:00+03:00"),
          campus: "Merkez Kampüs",
          building: "B Blok",
          room: "Salon 101",
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        uniqueErrorCaught = true;
      } else {
        throw err;
      }
    }
    if (!uniqueErrorCaught) {
      throw new Error("Unique constraint (P2002) ihlali yakalanmadı!");
    }
    console.log("3. [BAŞARILI] Unique constraint (P2002) davranışı doğrulandı.");

    // 4. Transaction Rollback Testi
    try {
      await prisma.$transaction(async (tx) => {
        await tx.indexedRegistration.create({
          data: {
            chainId: TEST_CHAIN_ID,
            contractAddress: TEST_CONTRACT,
            eventId: TEST_EVENT_ID,
            participantAddress: TEST_STUDENT,
            transactionHash:
              "0x1111111111111111111111111111111111111111111111111111111111111111",
            blockNumber: 100,
            logIndex: 0,
          },
        });
        throw new Error("ROLLBACK_SIMULATION");
      });
    } catch (err) {
      if (err.message !== "ROLLBACK_SIMULATION") throw err;
    }

    const regCountAfterRollback = await prisma.indexedRegistration.count({
      where: { chainId: TEST_CHAIN_ID, contractAddress: TEST_CONTRACT },
    });
    if (regCountAfterRollback !== 0) {
      throw new Error("Transaction rollback sonrası kayıt silinmedi!");
    }
    console.log("4. [BAŞARILI] Atomik $transaction rollback davranışı doğrulandı.");

    // 5. Faz 10 — AttendanceCertificate CRUD ve Unique Constraint (P2002) Testi
    const createdCert = await prisma.attendanceCertificate.create({
      data: {
        certificateId: "CP-CERT-ABCD1234ABCD1234ABCD1234ABCD1234",
        version: "CP-CERT-V1",
        status: "ACTIVE",
        chainId: TEST_CHAIN_ID,
        contractAddress: TEST_CONTRACT,
        eventId: TEST_EVENT_ID,
        eventTitle: "PostgreSQL Entegrasyon Test Etkinliği",
        organizerAddress: TEST_ORGANIZER,
        participantAddress: TEST_STUDENT,
        displayName: "Gerçek PostgreSQL Test Öğrencisi",
        attendanceTxHash:
          "0x2222222222222222222222222222222222222222222222222222222222222222",
        attendanceBlockNumber: 120,
        attendanceLogIndex: 0,
        certificateHash:
          "0x3333333333333333333333333333333333333333333333333333333333333333",
        integritySignature:
          "0x4444444444444444444444444444444444444444444444444444444444444444",
      },
    });

    let certUniqueErrorCaught = false;
    try {
      await prisma.attendanceCertificate.create({
        data: {
          certificateId: "CP-CERT-99991234ABCD1234ABCD1234ABCD1234",
          version: "CP-CERT-V1",
          status: "ACTIVE",
          chainId: TEST_CHAIN_ID,
          contractAddress: TEST_CONTRACT,
          eventId: TEST_EVENT_ID,
          eventTitle: "Duplicate Sertifika Denemesi",
          organizerAddress: TEST_ORGANIZER,
          participantAddress: TEST_STUDENT,
          attendanceTxHash:
            "0x5555555555555555555555555555555555555555555555555555555555555555",
          attendanceBlockNumber: 121,
          attendanceLogIndex: 1,
          certificateHash:
            "0x6666666666666666666666666666666666666666666666666666666666666666",
          integritySignature:
            "0x7777777777777777777777777777777777777777777777777777777777777777",
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        certUniqueErrorCaught = true;
      } else {
        throw err;
      }
    }
    if (!certUniqueErrorCaught) {
      throw new Error(
        "AttendanceCertificate cert_event_participant_unique (P2002) ihlali yakalanmadı!"
      );
    }
    console.log(
      "5. [BAŞARILI] Faz 10 AttendanceCertificate CRUD ve Unique Constraint (P2002) doğrulandı."
    );

    // 6. Faz 12 — Community ve CommunityMember CRUD, Unique Constraint (P2002) Testi
    const TEST_COMM_SLUG = "test-postgres-toplulugu-phase12";
    // Olası eski test kalıntısını temizle
    await prisma.communityMember.deleteMany({
      where: { community: { slug: TEST_COMM_SLUG } },
    });
    await prisma.community.deleteMany({
      where: { slug: TEST_COMM_SLUG },
    });

    const createdComm = await prisma.community.create({
      data: {
        name: "Test PostgreSQL Topluluğu Faz 12",
        slug: TEST_COMM_SLUG,
        leadOrganizerAddress: TEST_ORGANIZER,
        description: "PostgreSQL entegrasyon testi için topluluk kaydı",
        shortDescription: "PostgreSQL test",
        universityName: "Monad Üniversitesi",
        category: "Yazılım",
        createdByWallet: TEST_ORGANIZER,
        status: "ACTIVE",
        members: {
          create: {
            walletAddress: TEST_ORGANIZER,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
      include: { members: true },
    });

    if (!createdComm.id || createdComm.members.length !== 1 || createdComm.members[0].role !== "OWNER") {
      throw new Error("Community + CommunityMember oluşturma doğrulaması başarısız.");
    }

    // İkinci üye ekle (MEMBER, PENDING)
    const pendingMember = await prisma.communityMember.create({
      data: {
        communityId: createdComm.id,
        walletAddress: TEST_STUDENT,
        role: "MEMBER",
        status: "PENDING",
      },
    });

    // Durum güncelleme: PENDING -> ACTIVE
    const activatedMember = await prisma.communityMember.update({
      where: { id: pendingMember.id },
      data: { status: "ACTIVE" },
    });
    if (activatedMember.status !== "ACTIVE") {
      throw new Error("CommunityMember status update doğrulaması başarısız.");
    }

    // Unique Constraint: Aynı cüzdan aynı topluluğa tekrar eklenemez (community_member_unique)
    let memberUniqueCaught = false;
    try {
      await prisma.communityMember.create({
        data: {
          communityId: createdComm.id,
          walletAddress: TEST_STUDENT,
          role: "MEMBER",
          status: "PENDING",
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        memberUniqueCaught = true;
      } else {
        throw err;
      }
    }
    if (!memberUniqueCaught) {
      throw new Error("CommunityMember community_member_unique (P2002) ihlali yakalanmadı!");
    }

    // Rol güncelleme: MEMBER -> ADMIN
    const promotedMember = await prisma.communityMember.update({
      where: { id: pendingMember.id },
      data: { role: "ADMIN" },
    });
    if (promotedMember.role !== "ADMIN") {
      throw new Error("CommunityMember role update doğrulaması başarısız.");
    }
    console.log(
      "6. [BAŞARILI] Faz 12 Community & CommunityMember CRUD, P2002 Unique Constraint ve Rol/Durum döngüsü doğrulandı."
    );

    // 7. Faz 14 — StudentProfile CRUD, P2002 Unique Constraint ve Güncelleme Testi
    const TEST_STUDENT_PROFILE_WALLET = "0x1414141414141414141414141414141414141414";
    await prisma.studentProfile.deleteMany({ where: { walletAddress: TEST_STUDENT_PROFILE_WALLET } });

    const createdStudentProfile = await prisma.studentProfile.create({
      data: {
        walletAddress: TEST_STUDENT_PROFILE_WALLET,
        displayName: "Faz 14 Test Öğrencisi",
        university: "Monad Üniversitesi",
        department: "Bilgisayar Mühendisliği",
        bio: "Gerçek PostgreSQL Faz 14 entegrasyon testi biyografisi.",
        avatarUrl: "https://example.com/avatar14.png",
        isPublic: true,
      },
    });

    if (!createdStudentProfile.id || createdStudentProfile.displayName !== "Faz 14 Test Öğrencisi") {
      throw new Error("StudentProfile create doğrulaması başarısız.");
    }

    let profileUniqueCaught = false;
    try {
      await prisma.studentProfile.create({
        data: {
          walletAddress: TEST_STUDENT_PROFILE_WALLET,
          displayName: "Mükerrer Deneme",
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        profileUniqueCaught = true;
      } else {
        throw err;
      }
    }
    if (!profileUniqueCaught) {
      throw new Error("StudentProfile walletAddress unique constraint (P2002) ihlali yakalanmadı!");
    }

    const updatedProfile = await prisma.studentProfile.update({
      where: { walletAddress: TEST_STUDENT_PROFILE_WALLET },
      data: {
        bio: "Güncellenmiş test biyografisi.",
        isPublic: false,
      },
    });

    if (updatedProfile.isPublic !== false || updatedProfile.bio !== "Güncellenmiş test biyografisi.") {
      throw new Error("StudentProfile update doğrulaması başarısız.");
    }
    console.log(
      "7. [BAŞARILI] Faz 14 StudentProfile CRUD, P2002 Unique Constraint ve Gizlilik (isPublic) güncellemeleri doğrulandı."
    );

    // İzole test kayıtlarını temizle
    await prisma.studentProfile.deleteMany({ where: { walletAddress: TEST_STUDENT_PROFILE_WALLET } });
    await prisma.attendanceCertificate.delete({ where: { id: createdCert.id } });
    await prisma.eventMetadata.delete({ where: { id: createdMeta.id } });
    await prisma.communityMember.deleteMany({ where: { communityId: createdComm.id } });
    await prisma.community.delete({ where: { id: createdComm.id } });
    console.log("=== Tüm Gerçek PostgreSQL Entegrasyon Testleri Başarıyla Tamamlandı ===");
  } finally {
    await prisma.$disconnect();
  }
}

runPostgresIntegrationSuite().catch((err) => {
  console.error("[HATA] PostgreSQL entegrasyon testi başarısız:", err.message);
  process.exit(1);
});
