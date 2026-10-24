import { expect } from "chai";
import { network } from "hardhat";
import {
  ATTENDANCE_STATE,
  ATTENDANCE_STATE_LABELS,
  buildStudentTimeline,
  calculateStudentStats,
  classifyStudentAttendanceState,
  fetchStudentProfileData,
} from "../src/utils/studentProfile.js";
import {
  clearMetadataStoreForTesting,
  saveInitialEventMetadata,
} from "../src/utils/eventMetadata.js";

const { ethers, networkHelpers } = await network.create();

describe("Faz 8 — Öğrenci Profili ve Katılım Geçmişi Testleri", function () {
  async function deployProfileFixture() {
    clearMetadataStoreForTesting();
    const [organizer, studentA, studentB] = await ethers.getSigners();
    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();
    const chainId = 10143;

    // 4 farklı etkinlik oluştur
    await campusPass.connect(organizer).createEvent("Web3 Başlangıç Semineri", 50);
    await campusPass.connect(organizer).createEvent("Solidity Güvenlik Atölyesi", 30);
    await campusPass.connect(organizer).createEvent("Yapay Zekâ ve Veri Bilimi", 40);
    await campusPass.connect(organizer).createEvent("İptal Edilen Kampüs Buluşması", 25);

    // Etkinlik 1: Geçmiş (Tamamlanan) etkinlik
    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: {
        description: "Temel blokzincir kavramları.",
        community: "Blockchain Kulübü",
        category: "Blockchain",
        date: "2026-09-10",
        startTime: "10:00",
        endTime: "12:00",
        registrationDeadline: "2026-09-10T09:00",
        location: { campus: "Merkez Kampüs", building: "Müh. A", room: "101" },
        posterUrl: "",
      },
    });

    // Etkinlik 2: Geçmiş (Tamamlanan) etkinlik
    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 2,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: {
        description: "Akıllı sözleşme denetimi.",
        community: "Siber Güvenlik Topluluğu",
        category: "Siber Güvenlik",
        date: "2026-10-05",
        startTime: "14:00",
        endTime: "17:00",
        registrationDeadline: "2026-10-05T12:00",
        location: { campus: "Merkez Kampüs", building: "Müh. B", room: "202" },
        posterUrl: "",
      },
    });

    // Etkinlik 3: Yaklaşan etkinlik
    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 3,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: {
        description: "Veri analitiği ve modeller.",
        community: "Yapay Zekâ Kulübü",
        category: "Yapay Zekâ",
        date: "2026-12-15",
        startTime: "13:00",
        endTime: "16:00",
        registrationDeadline: "2026-12-15T11:00",
        location: { campus: "Kuzey Kampüs", building: "Bilişim", room: "Amfi 3" },
        posterUrl: "",
      },
    });

    // Etkinlik 4: İptal edilmiş etkinlik
    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 4,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: {
        description: "Açık hava etkinliği.",
        community: "Sosyal Etkinlik Kulübü",
        category: "Sosyal",
        date: "2026-11-25",
        startTime: "15:00",
        endTime: "18:00",
        registrationDeadline: "2026-11-25T12:00",
        location: { campus: "Güney Kampüs", building: "Bahçe", room: "Açık Alan" },
        posterUrl: "",
        cancelled: true,
        cancelReason: "Hava koşulları",
      },
    });

    const referenceNowMs = Date.parse("2026-10-24T12:00:00+03:00");

    return {
      campusPass,
      contractAddress,
      chainId,
      organizer,
      studentA,
      studentB,
      referenceNowMs,
    };
  }

  it("1. bağlı cüzdanın kayıtlı etkinliklerini doğru listelemeli", async function () {
    const { campusPass, contractAddress, chainId, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(studentA).registerForEvent(3);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    expect(profile.walletAddress).to.equal(studentA.address);
    expect(profile.registeredEvents.map((e) => e.id)).to.deep.equal([3, 1]);
    expect(profile.upcomingEvents.map((e) => e.id)).to.deep.equal([3]);
    expect(profile.pastEvents.map((e) => e.id)).to.deep.equal([1]);
  });

  it("2. başka cüzdanın kayıtlarını bağlı öğrenci profilinde göstermemeli", async function () {
    const { campusPass, contractAddress, chainId, studentA, studentB, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(studentB).registerForEvent(2);
    await campusPass.connect(studentB).registerForEvent(3);

    const profileA = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    expect(profileA.registeredEvents).to.have.lengthOf(1);
    expect(profileA.registeredEvents[0].id).to.equal(1);
  });

  it("3. doğrulanmış katılımları (attended) doğru hesaplamalı ve listelemeli", async function () {
    const { campusPass, contractAddress, chainId, organizer, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(studentA).registerForEvent(2);
    await campusPass.connect(organizer).markAttendance(1, studentA.address);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    expect(profile.attendedEvents).to.have.lengthOf(1);
    expect(profile.attendedEvents[0].id).to.equal(1);
    expect(profile.stats.totalRegistered).to.equal(2);
    expect(profile.stats.verifiedAttended).to.equal(1);
    expect(profile.stats.attendanceRate).to.equal(50);
  });

  it("4. kayıtlı ancak katılmamış öğrenciyi doğru sınıflandırmalı ve katılmış gibi göstermemeli", async function () {
    const { campusPass, contractAddress, chainId, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    // Etkinlik 1 (tamamlanmış) ve Etkinlik 3 (yaklaşan) için kayıt ol, ancak katılım işaretleme
    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(studentA).registerForEvent(3);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    const ev1 = profile.registeredEvents.find((e) => e.id === 1);
    const ev3 = profile.registeredEvents.find((e) => e.id === 3);

    expect(ev1.isAttended).to.equal(false);
    expect(ev1.attendanceState.code).to.equal(ATTENDANCE_STATE.COMPLETED_NOT_ATTENDED);
    expect(ev1.attendanceState.label).to.equal(
      ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.COMPLETED_NOT_ATTENDED]
    );

    expect(ev3.isAttended).to.equal(false);
    expect(ev3.attendanceState.code).to.equal(ATTENDANCE_STATE.REGISTERED_PENDING);
    expect(ev3.attendanceState.label).to.equal(
      ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.REGISTERED_PENDING]
    );

    expect(profile.attendedEvents).to.have.lengthOf(0);
    expect(profile.stats.verifiedAttended).to.equal(0);
    expect(profile.stats.attendanceRate).to.equal(0);
  });

  it("5. sıfır etkinlik durumunda sıfıra bölme hatası olmadan istatistikleri 0 olarak hesaplamalı", async function () {
    const { campusPass, contractAddress, chainId, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    expect(profile.stats.totalRegistered).to.equal(0);
    expect(profile.stats.verifiedAttended).to.equal(0);
    expect(profile.stats.upcomingCount).to.equal(0);
    expect(profile.stats.completedCount).to.equal(0);
    expect(profile.stats.attendanceRate).to.equal(0);
    expect(Number.isNaN(profile.stats.attendanceRate)).to.equal(false);
    expect(calculateStudentStats([]).attendanceRate).to.equal(0);
  });

  it("6. cüzdan değişiminde profil verilerini yeni cüzdana göre yenilemeli ve eski veriyi sızdırmamalı", async function () {
    const { campusPass, contractAddress, chainId, organizer, studentA, studentB, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(organizer).markAttendance(1, studentA.address);

    // Önce studentA yüklenir
    const profileA = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });
    expect(profileA.stats.totalRegistered).to.equal(1);
    expect(profileA.stats.verifiedAttended).to.equal(1);

    // Ardından hiç kaydı olmayan studentB'ye geçilir
    const profileB = await fetchStudentProfileData({
      walletAddress: studentB.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });
    expect(profileB.walletAddress).to.equal(studentB.address);
    expect(profileB.registeredEvents).to.have.lengthOf(0);
    expect(profileB.stats.totalRegistered).to.equal(0);
    expect(profileB.stats.verifiedAttended).to.equal(0);
  });

  it("7. metadata eksikliğinde yalnızca zincir üstü bilgilerle güvenli görüntüleme sağlamalı", async function () {
    const { campusPass, contractAddress, chainId, organizer, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    // Etkinlik 5 zincirde oluşturulur ancak metadata kaydedilmez
    await campusPass.connect(organizer).createEvent("Metadata Olmayan Etkinlik", 15);
    await campusPass.connect(studentA).registerForEvent(5);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    expect(profile.registeredEvents).to.have.lengthOf(1);
    expect(profile.registeredEvents[0].id).to.equal(5);
    expect(profile.registeredEvents[0].title).to.equal("Metadata Olmayan Etkinlik");
    expect(profile.registeredEvents[0].hasCustomMetadata).to.equal(false);
    expect(profile.registeredEvents[0].community).to.be.a("string");
  });

  it("8. katılım zaman çizelgesini kronolojik sıralamalı ve sahte Explorer bağlantısı üretmemeli", async function () {
    const { campusPass, contractAddress, chainId, organizer, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    await campusPass.connect(studentA).registerForEvent(1); // 2026-09-10
    await campusPass.connect(studentA).registerForEvent(2); // 2026-10-05
    await campusPass.connect(studentA).registerForEvent(3); // 2026-12-15
    await campusPass.connect(organizer).markAttendance(1, studentA.address);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    // Varsayılan DESC (en yeni tarih üstte: 3 -> 2 -> 1)
    expect(profile.timeline.map((t) => t.eventId)).to.deep.equal([3, 2, 1]);
    // Gerçek işlem loglarından txHash okunduğu için geçerli Explorer linki bulunmalı
    expect(profile.timeline[2].explorerTxUrl).to.include("https://testnet.monadexplorer.com/tx/0x");

    // İşlem hash'i bilinmeyen bir kayıt için sahte bağlantı üretilmemeli (null olmalı)
    const manualTimeline = buildStudentTimeline([
      {
        id: 99,
        title: "Hash Bilinmeyen Etkinlik",
        community: "Test Kulübü",
        startAt: "2026-11-01T10:00:00+03:00",
        isRegistered: true,
        isAttended: false,
        status: "upcoming",
        registrationTxHash: null,
        attendanceTxHash: null,
      },
    ]);
    expect(manualTimeline[0].explorerTxUrl).to.equal(null);
  });

  it("9. iptal edilmiş etkinliklerin istatistiklere doğru yansımasını ve oranı bozmamasını sağlamalı", async function () {
    const { campusPass, contractAddress, chainId, organizer, studentA, referenceNowMs } =
      await networkHelpers.loadFixture(deployProfileFixture);

    // Öğrenci Etkinlik 1 (katıldı) ve Etkinlik 4 (iptal edildi) için kayıtlı
    await campusPass.connect(studentA).registerForEvent(1);
    await campusPass.connect(studentA).registerForEvent(4);
    await campusPass.connect(organizer).markAttendance(1, studentA.address);

    const profile = await fetchStudentProfileData({
      walletAddress: studentA.address,
      contract: campusPass,
      chainId,
      contractAddress,
      nowMs: referenceNowMs,
    });

    expect(profile.stats.totalRegistered).to.equal(2);
    expect(profile.stats.cancelledCount).to.equal(1);
    expect(profile.stats.verifiedAttended).to.equal(1);
    // İptal edilen etkinlik paydadan çıkarıldığı için 1/1 = %100 olmalı (yanıltıcı şekilde %50'ye düşmemeli)
    expect(profile.stats.eligibleForRate).to.equal(1);
    expect(profile.stats.attendanceRate).to.equal(100);

    const cancelledEv = profile.registeredEvents.find((e) => e.id === 4);
    expect(classifyStudentAttendanceState(cancelledEv).code).to.equal(
      ATTENDANCE_STATE.CANCELLED_EVENT
    );
  });

  it("10. RPC hata durumunda anlamlı hata fırlatmalı ve boş cüzdanda veri döndürmemeli", async function () {
    const { studentA } = await networkHelpers.loadFixture(deployProfileFixture);

    // Cüzdan bağlı değilken boş profil dönmeli
    const disconnectedProfile = await fetchStudentProfileData({
      walletAddress: null,
      contract: null,
    });
    expect(disconnectedProfile.walletAddress).to.equal(null);
    expect(disconnectedProfile.registeredEvents).to.have.lengthOf(0);

    // Bozuk RPC / sözleşme hatasında hata fırlatmalı
    const brokenContract = {
      nextEventId: async () => {
        throw new Error("RPC connection timeout");
      },
    };

    let caughtError = null;
    try {
      await fetchStudentProfileData({
        walletAddress: studentA.address,
        contract: brokenContract,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).to.not.equal(null);
    expect(caughtError.message).to.include("RPC connection timeout");
  });
});
