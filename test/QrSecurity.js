import { expect } from "chai";
import { network } from "hardhat";
import {
  QR_TTL_SECONDS,
  QR_VERSION,
  buildCanonicalQrMessage,
  clearUsedNonces,
  generateSecureNonce,
  isNonceUsed,
  markNonceUsed,
  parseQrString,
  verifySignedQrTicket,
} from "../src/utils/qrVerification.js";
import { generateQrMatrix } from "../src/utils/qrMatrix.js";

const { ethers, networkHelpers } = await network.create();

describe("QR Güvenlik ve Uçtan Uca Doğrulama Testleri", function () {
  async function deployFixture() {
    clearUsedNonces();
    const [organizer, student, attacker, otherOrganizer] = await ethers.getSigners();
    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();
    const contractAddress = await campusPass.getAddress();

    // Etkinlik 1 ve Etkinlik 2 oluştur
    await campusPass.connect(organizer).createEvent("Monad Güvenlik Atölyesi", 10);
    await campusPass.connect(otherOrganizer).createEvent("Diğer Etkinlik", 10);

    // Öğrenciyi Etkinlik 1'e kaydet
    await campusPass.connect(student).registerForEvent(1);

    return {
      campusPass,
      contractAddress,
      organizer,
      student,
      attacker,
      otherOrganizer,
    };
  }

  async function buildSignedQrString({
    signer,
    version = QR_VERSION,
    chainId = 10143,
    contractAddress,
    eventId = 1,
    participant,
    nonce = generateSecureNonce(),
    issuedAt = 1761250000,
    expiresAt = 1761250000 + QR_TTL_SECONDS,
  }) {
    const payload = {
      version,
      chainId,
      contractAddress,
      eventId,
      participant: participant || signer.address,
      nonce,
      issuedAt,
      expiresAt,
    };
    const msg = buildCanonicalQrMessage(payload);
    const sig = await signer.signMessage(msg);
    return {
      payload,
      sig,
      rawQrString: JSON.stringify({
        v: payload.version,
        c: payload.chainId,
        a: payload.contractAddress,
        e: payload.eventId,
        p: payload.participant,
        n: payload.nonce,
        iat: payload.issuedAt,
        exp: payload.expiresAt,
        sig,
      }),
    };
  }

  it("1. geçerli imzalı QR kodunu 5 aşamalı kontrolden geçirmeli", async function () {
    const { campusPass, contractAddress, organizer, student } =
      await networkHelpers.loadFixture(deployFixture);

    const now = 1761250050;
    const { rawQrString } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    const result = await verifySignedQrTicket({
      rawQrString,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: now,
    });

    expect(result.valid).to.equal(true);
    expect(result.checks).to.have.lengthOf(5);
    expect(result.checks.every((c) => c.passed)).to.equal(true);
  });

  it("2. tek kullanımlık nonce ve blokzincir durumu ile aynı QR kodun tekrar kullanımını (farklı cihaz dahil) engellemeli", async function () {
    const { campusPass, contractAddress, organizer, student } =
      await networkHelpers.loadFixture(deployFixture);

    const now = 1761250050;
    const { rawQrString, payload } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    // İlk kullanımda nonce işaretlenir
    expect(isNonceUsed(payload.nonce)).to.equal(false);
    markNonceUsed(payload.nonce, "0xtxhash");
    expect(isNonceUsed(payload.nonce)).to.equal(true);

    // Aynı cihazda tekrar okutulduğunda nonce kontrolü reddetmeli
    const sameDeviceRetry = await verifySignedQrTicket({
      rawQrString,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: now,
    });
    expect(sameDeviceRetry.valid).to.equal(false);
    expect(sameDeviceRetry.checks.find((c) => c.id === "freshness").passed).to.equal(false);

    // Farklı cihaz/tarayıcı simülasyonu (yerel nonce hafızası temizlense bile blokzincir 'attended' reddetmeli)
    clearUsedNonces();
    await campusPass.connect(organizer).markAttendance(1, student.address);

    const otherDeviceRetry = await verifySignedQrTicket({
      rawQrString,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: now,
    });
    expect(otherDeviceRetry.valid).to.equal(false);
    expect(otherDeviceRetry.checks.find((c) => c.id === "onchain_status").passed).to.equal(false);
  });

  it("3. süresi dolmuş (expired) veya TTL penceresi (>180 sn) manipüle edilmiş QR kodları reddetmeli", async function () {
    const { campusPass, contractAddress, organizer, student } =
      await networkHelpers.loadFixture(deployFixture);

    const { rawQrString: validTtlQr } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    // Süre dolduktan 1 saniye sonra (1761250181) reddedilmeli
    const expiredResult = await verifySignedQrTicket({
      rawQrString: validTtlQr,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250181,
    });
    expect(expiredResult.valid).to.equal(false);
    expect(expiredResult.checks.find((c) => c.id === "freshness").passed).to.equal(false);

    // Öğrenci kendi özel anahtarıyla 1 saatlik (3600 sn) QR imzalarsa TTL penceresi kontrolü reddetmeli
    const { rawQrString: longLivedQr } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761253600,
    });

    const longLivedResult = await verifySignedQrTicket({
      rawQrString: longLivedQr,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250010,
    });
    expect(longLivedResult.valid).to.equal(false);
    expect(longLivedResult.checks.find((c) => c.id === "freshness").passed).to.equal(false);
  });

  it("4. imzalanmış QR verisi üzerinde değişiklik yapıldığında veya başka cüzdanla imzalandığında reddetmeli", async function () {
    const { campusPass, contractAddress, organizer, student, attacker } =
      await networkHelpers.loadFixture(deployFixture);

    const { rawQrString } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    // QR içindeki expiresAt değerini imzadan sonra 10 saniye uzatma girişimi
    const parsed = JSON.parse(rawQrString);
    parsed.exp += 10;
    const tamperedQrString = JSON.stringify(parsed);

    const tamperedResult = await verifySignedQrTicket({
      rawQrString: tamperedQrString,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250050,
    });
    expect(tamperedResult.valid).to.equal(false);
    expect(tamperedResult.checks.find((c) => c.id === "signature").passed).to.equal(false);

    // Saldırganın öğrencinin adresini yazıp kendi cüzdanıyla imzaladığı QR kod
    const { rawQrString: spoofedQr } = await buildSignedQrString({
      signer: attacker,
      participant: student.address,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    const spoofedResult = await verifySignedQrTicket({
      rawQrString: spoofedQr,
      expectedEventId: 1,
      connectedAccount: organizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250050,
    });
    expect(spoofedResult.valid).to.equal(false);
    expect(spoofedResult.checks.find((c) => c.id === "signature").passed).to.equal(false);
  });

  it("5. farklı etkinlik, farklı ağ (chainId) veya farklı sözleşme arasında QR tekrar kullanımını engellemeli", async function () {
    const { campusPass, contractAddress, student, otherOrganizer } =
      await networkHelpers.loadFixture(deployFixture);

    // Etkinlik 1 için imzalanmış QR kodu Etkinlik 2'de kullanma girişimi
    const { rawQrString: event1Qr } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    const crossEventResult = await verifySignedQrTicket({
      rawQrString: event1Qr,
      expectedEventId: 2,
      connectedAccount: otherOrganizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250050,
    });
    expect(crossEventResult.valid).to.equal(false);
    expect(crossEventResult.checks[0].id).to.equal("context");
    expect(crossEventResult.checks[0].passed).to.equal(false);

    // Farklı Chain ID (ör. Ethereum Mainnet = 1) için imzalanmış QR kod
    const { rawQrString: wrongChainQr } = await buildSignedQrString({
      signer: student,
      chainId: 1,
      contractAddress,
      eventId: 1,
      issuedAt: 1761250000,
      expiresAt: 1761250180,
    });

    const wrongChainResult = await verifySignedQrTicket({
      rawQrString: wrongChainQr,
      expectedEventId: 1,
      connectedAccount: otherOrganizer.address,
      expectedChainId: 10143,
      expectedContractAddress: contractAddress,
      contractInstance: campusPass,
      nowSecondsOverride: 1761250050,
    });
    expect(wrongChainResult.valid).to.equal(false);
    expect(wrongChainResult.checks[0].passed).to.equal(false);
  });

  it("6. bozuk, eksik, null veya geçersiz formatlı QR içeriklerini güvenli şekilde reddetmeli", async function () {
    const invalidInputs = [
      "",
      "   ",
      "not-a-json",
      "null",
      "12345",
      "[]",
      "{}",
      JSON.stringify({ v: "CP1", c: 10143 }),
      JSON.stringify({
        v: "CP1",
        c: 10143,
        a: "0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da",
        e: 1,
        p: "gecersiz-adres",
        n: "0x1234",
        iat: 100,
        exp: 200,
        sig: "0x1234",
      }),
      JSON.stringify({
        v: "CP1",
        c: 10143,
        a: "0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da",
        e: 1,
        p: "0x70761Cd6ff53fa54408f1497f0E5FF9E56794dC5",
        n: "toString", // Prototype pollution / kısa nonce denemesi
        iat: 100,
        exp: 200,
        sig: "0x" + "a".repeat(130),
      }),
    ];

    for (const badInput of invalidInputs) {
      expect(() => parseQrString(badInput)).to.throw();
    }

    expect(isNonceUsed("toString")).to.equal(false);
    expect(isNonceUsed("__proto__")).to.equal(false);
  });

  it("7. ISO/IEC 18004 QR matrisini Alignment Pattern ve Timing Pattern çakışması olmadan doğru üretmeli", async function () {
    const { contractAddress, student } = await networkHelpers.loadFixture(deployFixture);
    const { rawQrString } = await buildSignedQrString({
      signer: student,
      contractAddress,
      eventId: 1,
    });

    const matrix = generateQrMatrix(rawQrString);
    // ~323 byte veri -> Version 12 -> boyut = 12 * 4 + 17 = 65x65
    expect(matrix.length).to.equal(65);
    expect(matrix[0].length).to.equal(65);

    // Version 12'de (6, 32) ve (32, 6) konumlarında Alignment Pattern merkezleri (1) ve çevresi (0) doğru yerleştirilmiş olmalı
    expect(matrix[6][32]).to.equal(1);
    expect(matrix[5][32]).to.equal(0);
    expect(matrix[7][32]).to.equal(0);
    expect(matrix[4][32]).to.equal(1);
    expect(matrix[8][32]).to.equal(1);

    expect(matrix[32][6]).to.equal(1);
    expect(matrix[32][5]).to.equal(0);
    expect(matrix[32][7]).to.equal(0);

    // Boş metin hatası
    expect(() => generateQrMatrix("")).to.throw();
  });
});
