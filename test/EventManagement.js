import { expect } from "chai";
import { network } from "hardhat";
import {
  MAX_POSTER_SIZE_BYTES,
  buildEventCompositeKey,
  buildMetadataAuthMessage,
  clearMetadataStoreForTesting,
  filterAndSortEvents,
  mergeOnChainEventWithMetadata,
  saveInitialEventMetadata,
  updateEventMetadataAuthorized,
  validateEventMetadataInput,
  validatePosterFile,
} from "../src/utils/eventMetadata.js";
import {
  buildCanonicalQrMessage,
  clearUsedNonces,
  generateSecureNonce,
  verifySignedQrTicket,
} from "../src/utils/qrVerification.js";

const { ethers, networkHelpers } = await network.create();

describe("Faz 7 — Gelişmiş Etkinlik Yönetimi ve Metadata Testleri", function () {
  const sampleValidInput = {
    title: "Monad Blokzincir ve Web3 Zirvesi",
    capacity: 100,
    description: "Monad mimarisi, paralel EVM ve akıllı sözleşme güvenliği üzerine uygulamalı zirve.",
    community: "Blockchain & Web3 Topluluğu",
    category: "Blockchain",
    date: "2026-11-20",
    startTime: "13:00",
    endTime: "17:00",
    registrationDeadline: "2026-11-20T12:00",
    location: {
      campus: "Merkez Kampüs",
      building: "Mühendislik Binası",
      room: "Amfi 1",
    },
    posterUrl: "https://example.com/posters/monad-summit.png",
  };

  async function deployFixture() {
    clearMetadataStoreForTesting();
    clearUsedNonces();

    const [organizer, student, attacker] = await ethers.getSigners();
    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    await campusPass
      .connect(organizer)
      .createEvent(sampleValidInput.title, sampleValidInput.capacity);

    return {
      campusPass,
      contractAddress,
      organizer,
      student,
      attacker,
      chainId: 10143,
    };
  }

  it("1. geçerli etkinlik metadata kaydını (chainId, contractAddress, eventId) üçlüsüyle oluşturmalı", async function () {
    const { contractAddress, organizer, chainId } =
      await networkHelpers.loadFixture(deployFixture);

    const saved = saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: sampleValidInput,
    });

    const expectedKey = buildEventCompositeKey(chainId, contractAddress, 1);
    expect(saved.compositeKey).to.equal(expectedKey);
    expect(saved.community).to.equal("Blockchain & Web3 Topluluğu");
    expect(saved.category).to.equal("Blockchain");
    expect(saved.startAt).to.equal("2026-11-20T13:00:00+03:00");
    expect(saved.endAt).to.equal("2026-11-20T17:00:00+03:00");
    expect(saved.registrationDeadline).to.equal("2026-11-20T12:00:00+03:00");
    expect(saved.location.campus).to.equal("Merkez Kampüs");
  });

  it("2. eksik, hatalı, XSS içeren form verilerini ve 500 KB üstü/geçersiz afişleri reddetmeli", async function () {
    // Boş açıklama
    expect(() =>
      validateEventMetadataInput({ ...sampleValidInput, description: "   " })
    ).to.throw("Etkinlik açıklaması alanı boş bırakılamaz");

    // Sıfır veya negatif kapasite
    expect(() =>
      validateEventMetadataInput({ ...sampleValidInput, capacity: 0 })
    ).to.throw("Etkinlik kapasitesi sıfırdan büyük bir tam sayı olmalıdır");

    // Geçersiz kategori
    expect(() =>
      validateEventMetadataInput({ ...sampleValidInput, category: "Bilinmeyen" })
    ).to.throw("Geçersiz etkinlik kategorisi");

    // XSS script enjeksiyonu
    expect(() =>
      validateEventMetadataInput({
        ...sampleValidInput,
        description: "Merhaba <script>alert(1)</script>",
      })
    ).to.throw("güvenlik açısından izin verilmeyen ifadeler");

    // Zararlı javascript: URL ve SVG data URL
    expect(() =>
      validateEventMetadataInput({
        ...sampleValidInput,
        posterUrl: "javascript:alert(1)",
      })
    ).to.throw("yalnızca güvenli https://");

    expect(() =>
      validateEventMetadataInput({
        ...sampleValidInput,
        posterUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      })
    ).to.throw("SVG kabul edilmez");

    // Afiş dosya boyutu ve MIME türü sınırı
    expect(() =>
      validatePosterFile({ type: "image/svg+xml", size: 1024 })
    ).to.throw("Desteklenmeyen dosya türü");

    expect(() =>
      validatePosterFile({
        type: "image/png",
        size: MAX_POSTER_SIZE_BYTES + 100,
      })
    ).to.throw("en fazla 500 KB olabilir");
  });

  it("3. geçersiz tarih ve saat aralıklarını (bitiş <= başlangıç) reddetmeli", async function () {
    expect(() =>
      validateEventMetadataInput({
        ...sampleValidInput,
        startTime: "16:00",
        endTime: "14:00",
      })
    ).to.throw("Etkinlik bitiş saati, başlangıç saatinden sonra olmalıdır");

    expect(() =>
      validateEventMetadataInput({
        ...sampleValidInput,
        startTime: "15:00",
        endTime: "15:00",
      })
    ).to.throw("Etkinlik bitiş saati, başlangıç saatinden sonra olmalıdır");
  });

  it("4. kayıt son tarihi kontrolünü uygulamalı ve süresi geçen etkinlikte kaydı kapatmalı", async function () {
    const { contractAddress, organizer, chainId } =
      await networkHelpers.loadFixture(deployFixture);

    // Kayıt son tarihi etkinlik başlangıcından sonra olamaz
    expect(() =>
      validateEventMetadataInput({
        ...sampleValidInput,
        date: "2026-11-20",
        startTime: "13:00",
        endTime: "17:00",
        registrationDeadline: "2026-11-20T14:00",
      })
    ).to.throw("Kayıt son tarihi, etkinliğin başlangıç tarih ve saatinden sonra olamaz");

    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: sampleValidInput,
    });

    const baseOnChain = {
      id: 1,
      organizer: organizer.address,
      title: sampleValidInput.title,
      capacity: 100,
      registeredCount: 10,
      active: true,
    };

    // Son kayıt tarihinden önce (11:00) kayıt açık olmalı
    const beforeDeadlineMs = Date.parse("2026-11-20T11:00:00+03:00");
    const mergedBefore = mergeOnChainEventWithMetadata(baseOnChain, {
      chainId,
      contractAddress,
      nowMs: beforeDeadlineMs,
    });
    expect(mergedBefore.canRegisterByTime).to.equal(true);
    expect(mergedBefore.deadlinePassed).to.equal(false);

    // Son kayıt tarihinden sonra (12:30) kayıt kapalı olmalı
    const afterDeadlineMs = Date.parse("2026-11-20T12:30:00+03:00");
    const mergedAfter = mergeOnChainEventWithMetadata(baseOnChain, {
      chainId,
      contractAddress,
      nowMs: afterDeadlineMs,
    });
    expect(mergedAfter.canRegisterByTime).to.equal(false);
    expect(mergedAfter.deadlinePassed).to.equal(true);
  });

  it("5. etkinlik arama, kategori/topluluk/durum filtreleme ve sıralamayı doğru çalıştırmalı", async function () {
    const sampleEvents = [
      {
        id: 1,
        title: "Solidity Akıllı Sözleşme Eğitimi",
        description: "Hardhat 3 ile geliştirme",
        community: "Blockchain Kulübü",
        category: "Blockchain",
        status: "upcoming",
        startAt: "2026-12-01T14:00:00+03:00",
        capacity: 50,
        registeredCount: 40, // %80
        location: { campus: "Kuzey Kampüs", building: "B1", room: "101" },
      },
      {
        id: 2,
        title: "Derin Öğrenme ve LLM Atölyesi",
        description: "Transformer mimarileri",
        community: "Yapay Zekâ Topluluğu",
        category: "Yapay Zekâ",
        status: "completed",
        startAt: "2026-09-10T10:00:00+03:00",
        capacity: 100,
        registeredCount: 50, // %50
        location: { campus: "Güney Kampüs", building: "B2", room: "202" },
      },
      {
        id: 3,
        title: "Kariyer Günleri: Yazılım Mülakatları",
        description: "Algoritma ve sistem tasarımı",
        community: "Kariyer Kulübü",
        category: "Kariyer",
        status: "upcoming",
        startAt: "2026-11-05T13:00:00+03:00",
        capacity: 100,
        registeredCount: 95, // %95
        location: { campus: "Merkez Kampüs", building: "Kongre Merkezi", room: "Salon A" },
      },
    ];

    // Arama testi
    const bySearch = filterAndSortEvents(sampleEvents, { searchQuery: "Derin Öğrenme" });
    expect(bySearch).to.have.lengthOf(1);
    expect(bySearch[0].id).to.equal(2);

    // Kategori filtresi
    const byCategory = filterAndSortEvents(sampleEvents, { category: "Kariyer" });
    expect(byCategory).to.have.lengthOf(1);
    expect(byCategory[0].id).to.equal(3);

    // Topluluk filtresi
    const byCommunity = filterAndSortEvents(sampleEvents, { community: "Blockchain Kulübü" });
    expect(byCommunity).to.have.lengthOf(1);
    expect(byCommunity[0].id).to.equal(1);

    // Yaklaşan ve geçmiş ayrımı
    const upcomingOnly = filterAndSortEvents(sampleEvents, { timeFilter: "UPCOMING" });
    expect(upcomingOnly.map((e) => e.id)).to.deep.equal([3, 1]);

    const pastOnly = filterAndSortEvents(sampleEvents, { timeFilter: "PAST" });
    expect(pastOnly.map((e) => e.id)).to.deep.equal([2]);

    // Tarihe göre sıralama (yakından uzağa)
    const byDateAsc = filterAndSortEvents(upcomingOnly, { sortBy: "DATE_ASC" });
    expect(byDateAsc.map((e) => e.id)).to.deep.equal([3, 1]);

    // Doluluk oranına göre sıralama
    const byFillDesc = filterAndSortEvents(sampleEvents, { sortBy: "FILL_DESC" });
    expect(byFillDesc.map((e) => e.id)).to.deep.equal([3, 1, 2]);
  });

  it("6. organizatör dışındaki kullanıcıların metadata değiştirmesini engellemeli", async function () {
    const { contractAddress, organizer, attacker, chainId } =
      await networkHelpers.loadFixture(deployFixture);

    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: sampleValidInput,
    });

    const timestamp = 1761250500;
    const spoofedMsg = buildMetadataAuthMessage({
      action: "UPDATE_METADATA",
      chainId,
      contractAddress,
      eventId: 1,
      organizer: organizer.address,
      timestamp,
    });
    const attackerSignature = await attacker.signMessage(spoofedMsg);

    // 1. Farklı callerAddress ile deneme reddedilmeli
    expect(() =>
      updateEventMetadataAuthorized({
        chainId,
        contractAddress,
        eventId: 1,
        onChainOrganizer: organizer.address,
        callerAddress: attacker.address,
        signature: attackerSignature,
        signedTimestamp: timestamp,
        metadataInput: { ...sampleValidInput, community: "Ele Geçirildi" },
      })
    ).to.throw("Yetkisiz erişim");

    // 2. callerAddress olarak organizatör yazılıp saldırganın imzası gönderildiğinde kriptografik doğrulama reddetmeli
    expect(() =>
      updateEventMetadataAuthorized({
        chainId,
        contractAddress,
        eventId: 1,
        onChainOrganizer: organizer.address,
        callerAddress: organizer.address,
        signature: attackerSignature,
        signedTimestamp: timestamp,
        metadataInput: { ...sampleValidInput, community: "Ele Geçirildi" },
      })
    ).to.throw("Kriptografik imza doğrulaması başarısız");
  });

  it("7. organizatör imzalı etkinlik iptalinin arayüz durumuna doğru yansımasını sağlamalı", async function () {
    const { contractAddress, organizer, chainId } =
      await networkHelpers.loadFixture(deployFixture);

    const timestamp = 1761250800;
    const cancelMsg = buildMetadataAuthMessage({
      action: "CANCEL_EVENT",
      chainId,
      contractAddress,
      eventId: 1,
      organizer: organizer.address,
      timestamp,
    });
    const organizerSignature = await organizer.signMessage(cancelMsg);

    updateEventMetadataAuthorized({
      chainId,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      signature: organizerSignature,
      signedTimestamp: timestamp,
      action: "CANCEL_EVENT",
      metadataInput: {
        ...sampleValidInput,
        cancelled: true,
        cancelReason: "Hava muhalefeti nedeniyle ertelendi.",
      },
    });

    const merged = mergeOnChainEventWithMetadata(
      {
        id: 1,
        organizer: organizer.address,
        title: sampleValidInput.title,
        capacity: 100,
        registeredCount: 5,
        active: true,
      },
      {
        chainId,
        contractAddress,
        nowMs: Date.parse("2026-11-18T10:00:00+03:00"),
      }
    );

    expect(merged.cancelled).to.equal(true);
    expect(merged.status).to.equal("cancelled");
    expect(merged.statusLabel).to.equal("İptal Edilen");
    expect(merged.canRegisterByTime).to.equal(false);
    expect(merged.cancelReason).to.equal("Hava muhalefeti nedeniyle ertelendi.");
  });

  it("8. blokzincir etkinlikleriyle metadata senkronizasyonunu (metadata eksik olsa bile) tutarlı yapmalı", async function () {
    const { campusPass, contractAddress, organizer, chainId } =
      await networkHelpers.loadFixture(deployFixture);

    // Etkinlik 2 zincirde oluşturuluyor ancak zincir dışı metadata kaydedilmiyor
    await campusPass.connect(organizer).createEvent("Zincir Üstü Ham Etkinlik", 30);
    const ev2 = await campusPass.events(2);

    const mergedWithoutMeta = mergeOnChainEventWithMetadata(
      {
        id: Number(ev2.id),
        organizer: ev2.organizer,
        title: ev2.title,
        capacity: Number(ev2.capacity),
        registeredCount: Number(ev2.registeredCount),
        active: Boolean(ev2.active),
      },
      { chainId, contractAddress }
    );

    expect(mergedWithoutMeta.id).to.equal(2);
    expect(mergedWithoutMeta.title).to.equal("Zincir Üstü Ham Etkinlik");
    expect(mergedWithoutMeta.hasCustomMetadata).to.equal(false);
    expect(mergedWithoutMeta.community).to.be.a("string");
    expect(mergedWithoutMeta.location.campus).to.be.a("string");
  });

  it("9. genişletilmiş etkinlik modeliyle mevcut imzalı QR doğrulama akışının bozulmadan çalıştığını doğrulamalı", async function () {
    const { campusPass, contractAddress, organizer, student, chainId } =
      await networkHelpers.loadFixture(deployFixture);

    saveInitialEventMetadata({
      chainId,
      contractAddress,
      eventId: 1,
      onChainOrganizer: organizer.address,
      callerAddress: organizer.address,
      metadataInput: sampleValidInput,
    });

    await campusPass.connect(student).registerForEvent(1);

    const nonce = generateSecureNonce();
    const payload = {
      version: "CP1",
      chainId,
      contractAddress,
      eventId: 1,
      participant: student.address,
      nonce,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    };
    const msg = buildCanonicalQrMessage(payload);
    const sig = await student.signMessage(msg);
    const rawQrString = JSON.stringify({
      v: payload.version,
      c: payload.chainId,
      a: payload.contractAddress,
      e: payload.eventId,
      p: payload.participant,
      n: payload.nonce,
      iat: payload.issuedAt,
      exp: payload.expiresAt,
      sig,
    });

    const verification = await verifySignedQrTicket({
      rawQrString,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: chainId,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250060,
    });

    expect(verification.valid).to.equal(true);
    await campusPass.connect(organizer).markAttendance(1, student.address);
    expect(await campusPass.attended(1, student.address)).to.equal(true);
  });
});
