import crypto from "node:crypto";
import { ethers } from "ethers";
import { MONAD_EXPLORER_URL } from "../../../src/data/events.js";
import { env } from "../utils/env.js";
import { ApiError } from "../utils/errors.js";
import {
  CERTIFICATE_ID_REGEX,
  validateAndNormalizeAddress,
} from "../utils/validation.js";

export const CERTIFICATE_VERSION = "CP-CERT-V1";

export const CERTIFICATE_STATUS = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  INVALIDATED_BY_REORG: "INVALIDATED_BY_REORG",
};

export const VERIFICATION_RESULT_STATUS = {
  VERIFIED: "VERIFIED",
  NOT_FOUND: "NOT_FOUND",
  INVALID: "INVALID",
  UNVERIFIABLE_NOW: "UNVERIFIABLE_NOW",
};

export const VERIFICATION_RESULT_LABELS = {
  [VERIFICATION_RESULT_STATUS.VERIFIED]: "Doğrulandı",
  [VERIFICATION_RESULT_STATUS.NOT_FOUND]: "Bulunamadı",
  [VERIFICATION_RESULT_STATUS.INVALID]: "Geçersiz",
  [VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW]: "Doğrulama şu anda yapılamıyor",
};

/**
 * 128-bit kriptografik entropiye sahip, tahmin edilemez benzersiz sertifika kimliği üretir.
 * Örnek: CP-CERT-8F4A2C91E0B37D65123498ABCDEF0123
 */
export function generateSecureCertificateId() {
  return `CP-CERT-${crypto.randomBytes(16).toString("hex").toUpperCase()}`;
}

/**
 * Sürümlü (CP-CERT-V1) deterministik kanonik sertifika veri metnini oluşturur.
 * Sertifika üzerindeki temel alanlardan herhangi biri değiştirildiğinde hash ve HMAC değişir.
 */
export function buildCanonicalCertificatePayload({
  version = CERTIFICATE_VERSION,
  certificateId,
  chainId,
  contractAddress,
  eventId,
  eventTitle,
  organizerAddress,
  participantAddress,
  attendanceTxHash,
  attendanceBlockNumber,
  attendanceLogIndex,
  issuedAt,
}) {
  const isoIssuedAt =
    issuedAt instanceof Date ? issuedAt.toISOString() : new Date(issuedAt).toISOString();

  return [
    "CampusPass Attendance Certificate Integrity Record",
    `Version: ${String(version).trim()}`,
    `CertificateId: ${String(certificateId).trim().toUpperCase()}`,
    `ChainId: ${Number(chainId)}`,
    `ContractAddress: ${String(contractAddress).trim().toLowerCase()}`,
    `EventId: ${Number(eventId)}`,
    `EventTitle: ${String(eventTitle).trim()}`,
    `OrganizerAddress: ${String(organizerAddress).trim().toLowerCase()}`,
    `ParticipantAddress: ${String(participantAddress).trim().toLowerCase()}`,
    `AttendanceTxHash: ${String(attendanceTxHash).trim().toLowerCase()}`,
    `AttendanceBlockNumber: ${Number(attendanceBlockNumber)}`,
    `AttendanceLogIndex: ${Number(attendanceLogIndex)}`,
    `IssuedAt: ${isoIssuedAt}`,
  ].join("\n");
}

/**
 * Kanonik veri üzerinden SHA-256 özeti (certificateHash) ve sunucu HMAC-SHA256
 * bütünlük mührünü (integritySignature) hesaplar.
 */
export function computeCertificateIntegrity(record, signingSecret = env.SESSION_SECRET) {
  const canonicalPayload = buildCanonicalCertificatePayload(record);
  const certificateHash =
    "0x" + crypto.createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
  const integritySignature =
    "0x" +
    crypto
      .createHmac("sha256", String(signingSecret))
      .update(canonicalPayload, "utf8")
      .digest("hex");

  return {
    canonicalPayload,
    certificateHash,
    integritySignature,
  };
}

function safeEqualHexStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a.toLowerCase(), "utf8");
  const bufB = Buffer.from(b.toLowerCase(), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Veritabanındaki sertifika kaydının kanonik bütünlüğünü (hash ve HMAC mührü) doğrular.
 */
export function verifyCertificateIntegritySeal(record, signingSecret = env.SESSION_SECRET) {
  if (!record || typeof record !== "object") {
    return { valid: false, reason: "Sertifika kaydı eksik." };
  }
  if (record.version !== CERTIFICATE_VERSION) {
    return {
      valid: false,
      reason: `Desteklenmeyen sertifika doğrulama sürümü: ${record.version}`,
    };
  }
  try {
    const expected = computeCertificateIntegrity(record, signingSecret);
    const hashMatches = safeEqualHexStrings(
      record.certificateHash,
      expected.certificateHash
    );
    const sigMatches = safeEqualHexStrings(
      record.integritySignature,
      expected.integritySignature
    );

    if (!hashMatches || !sigMatches) {
      return {
        valid: false,
        reason:
          "Sertifika bütünlük kontrolü başarısız! Sertifika verileri oluşturulma sonrasında değiştirilmiş (manipüle edilmiş).",
      };
    }
    return { valid: true, reason: "Kriptografik bütünlük mührü (CP-CERT-V1) doğrulandı." };
  } catch (err) {
    return {
      valid: false,
      reason: `Bütünlük hesaplama hatası: ${err.message}`,
    };
  }
}

export function createCertificateService({
  prisma,
  blockchainService,
  signingSecret = env.SESSION_SECRET,
  confirmations = 0,
}) {
  const {
    chainId,
    contractAddress,
    contractAddressNormalized,
  } = blockchainService;

  // Aynı anda gelen mükerrer sertifika taleplerinde yarış koşullarını (race condition) önleyen kilit tablosu
  const inFlightIssuanceMap = new Map();

  function formatCertificateDto(
    row,
    metadataRow = null,
    { includePrivateDisplayName = false } = {}
  ) {
    const checksumContract = ethers.getAddress(row.contractAddress);
    const checksumOrganizer = ethers.getAddress(row.organizerAddress);
    const checksumParticipant = ethers.getAddress(row.participantAddress);
    const issuedIso =
      row.issuedAt instanceof Date
        ? row.issuedAt.toISOString()
        : new Date(row.issuedAt).toISOString();

    const dto = {
      certificateId: row.certificateId,
      version: row.version,
      status: row.status,
      chainId: Number(row.chainId),
      contractAddress: checksumContract,
      eventId: Number(row.eventId),
      eventTitle: row.eventTitle,
      community: metadataRow?.community || "Kampüs Topluluğu",
      category: metadataRow?.category || "Genel",
      eventStartAt: metadataRow?.startAt
        ? new Date(metadataRow.startAt).toISOString()
        : null,
      organizerAddress: checksumOrganizer,
      participantAddress: checksumParticipant,
      attendanceTxHash: row.attendanceTxHash,
      attendanceBlockNumber: Number(row.attendanceBlockNumber),
      attendanceLogIndex: Number(row.attendanceLogIndex),
      certificateHash: row.certificateHash,
      issuedAt: issuedIso,
      verificationPath: `/verify/${row.certificateId}`,
      explorerTxUrl: `${MONAD_EXPLORER_URL}/tx/${row.attendanceTxHash}`,
      explorerContractUrl: `${MONAD_EXPLORER_URL}/address/${checksumContract}`,
      disclaimer:
        "Bu belge resmî bir üniversite diploması veya akademik yeterlilik belgesi değildir; yalnızca belirtilen cüzdan adresinin Monad Testnet üzerindeki CampusPass akıllı sözleşmesinde doğrulanmış etkinlik katılımını (AttendanceMarked) temsil eder.",
    };

    if (includePrivateDisplayName) {
      dto.displayName = row.displayName || null;
      dto.displayNameDisclaimer = row.displayName
        ? "Bu gösterim adı cüzdan sahibi tarafından beyan edilmiştir; bağımsız kimlik doğrulaması niteliği taşımaz."
        : null;
    }

    return dto;
  }

  /**
   * Doğrulanmış blokzincir katılımına (AttendanceMarked) dayalı sertifika oluşturur.
   * Mükerrer ve eşzamanlı taleplerde idempotent çalışır.
   */
  async function issueCertificate({
    sessionWalletAddress,
    eventId,
    requestedWalletAddress = null,
    displayName = "",
  }) {
    if (!sessionWalletAddress) {
      throw ApiError.unauthorized(
        "Sertifika oluşturmak için SIWE ile cüzdan oturumu açmalısınız.",
        "SIWE_SESSION_REQUIRED"
      );
    }

    const {
      checksumAddress: checksumParticipant,
      normalizedAddress: normalizedParticipant,
    } = validateAndNormalizeAddress(sessionWalletAddress, "Oturum cüzdan adresi");

    // Koşul 2: Talep edilen cüzdan oturumdaki cüzdanla birebir aynı olmalı
    if (requestedWalletAddress) {
      const { normalizedAddress: normalizedRequested } = validateAndNormalizeAddress(
        requestedWalletAddress,
        "Talep edilen cüzdan adresi"
      );
      if (normalizedRequested !== normalizedParticipant) {
        throw ApiError.forbidden(
          "Yetkisiz işlem: Başka bir cüzdan adresi adına sertifika oluşturulamaz.",
          "CERTIFICATE_WALLET_MISMATCH"
        );
      }
    }

    const numEventId = Number(eventId);
    if (!Number.isSafeInteger(numEventId) || numEventId <= 0) {
      throw ApiError.badRequest("Geçersiz etkinlik kimliği (eventId).");
    }

    const cleanDisplayName =
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : null;

    const lockKey = `${chainId}:${contractAddressNormalized}:${numEventId}:${normalizedParticipant}`;
    if (inFlightIssuanceMap.has(lockKey)) {
      const sharedResult = await inFlightIssuanceMap.get(lockKey);
      return {
        certificate: sharedResult.certificate,
        created: false,
        idempotent: true,
      };
    }

    const issuancePromise = (async () => {
      // Koşul 3: İlgili etkinlik blokzincir üzerinde mevcut olmalı
      const onChainEvent = await blockchainService.getOnChainEvent(numEventId);
      if (!onChainEvent) {
        throw ApiError.notFound(
          `Etkinlik #${numEventId} blokzincir üzerinde bulunamadı.`,
          "EVENT_NOT_FOUND"
        );
      }

      // Koşul 4 & 5: Katılım blokzincir üzerinde (attended === true) doğrulanmış olmalı;
      // yalnızca kayıt (registered === true) sertifika için KESİNLİKLE yeterli değildir!
      const onChainState = await blockchainService.getStudentEventOnChainState(
        numEventId,
        checksumParticipant
      );

      if (!onChainState.isRegistered) {
        throw ApiError.forbidden(
          "Bu etkinliğe kayıtlı değilsiniz. Sertifika yalnızca katılımı doğrulanmış öğrencilere verilir.",
          "NOT_REGISTERED_FOR_EVENT"
        );
      }

      if (!onChainState.isAttended) {
        throw ApiError.forbidden(
          "Yalnızca etkinliğe kayıt yaptırmak (UserRegistered) sertifika almak için yeterli değildir. Katılımınızın organizatör tarafından blokzincir üzerinde (AttendanceMarked) doğrulanmış olması gerekir.",
          "ATTENDANCE_NOT_VERIFIED_ONCHAIN"
        );
      }

      // Koşul 6: Indexer katılım kaydını (IndexedAttendance) işlemiş ve checkpoint'i geçmiş olmalı
      const [indexedAtt, checkpoint, metadataRow] = await Promise.all([
        prisma.indexedAttendance.findUnique({
          where: {
            att_event_participant_unique: {
              chainId,
              contractAddress: contractAddressNormalized,
              eventId: numEventId,
              participantAddress: normalizedParticipant,
            },
          },
        }),
        prisma.indexerCheckpoint.findUnique({
          where: {
            chainId_contractAddress: {
              chainId,
              contractAddress: contractAddressNormalized,
            },
          },
        }),
        prisma.eventMetadata.findUnique({
          where: {
            chainId_contractAddress_eventId: {
              chainId,
              contractAddress: contractAddressNormalized,
              eventId: numEventId,
            },
          },
        }),
      ]);

      if (!indexedAtt) {
        throw ApiError.conflict(
          "Katılımınız blokzincirde görünüyor ancak Event Indexer tarafından henüz indekslenmedi. Yanıltıcı kayıt oluşturmamak için lütfen indeksleyici senkronizasyonunun tamamlanmasını bekleyin.",
          "INDEXER_ATTENDANCE_PENDING"
        );
      }

      if (
        !checkpoint ||
        Number(checkpoint.lastProcessedBlock) < Number(indexedAtt.blockNumber)
      ) {
        throw ApiError.conflict(
          "Event Indexer henüz katılımınızın bulunduğu bloğu kesinleştirmedi. Lütfen birkaç saniye sonra tekrar deneyin.",
          "INDEXER_CHECKPOINT_BEHIND"
        );
      }

      if (confirmations > 0) {
        const latestBlock = await blockchainService.getLatestBlockNumber();
        if (
          latestBlock !== null &&
          latestBlock - Number(indexedAtt.blockNumber) < confirmations
        ) {
          throw ApiError.conflict(
            `Katılım işleminiz henüz gerekli blok onay derinliğine (${confirmations} blok) ulaşmadı.`,
            "ATTENDANCE_CONFIRMATIONS_PENDING"
          );
        }
      }

      // Koşul 7 & 8: Atomik transaction ve idempotent mükerrer talep yönetimi
      const txResult = await prisma.$transaction(async (tx) => {
        const existing = await tx.attendanceCertificate.findUnique({
          where: {
            cert_event_participant_unique: {
              chainId,
              contractAddress: contractAddressNormalized,
              eventId: numEventId,
              participantAddress: normalizedParticipant,
            },
          },
        });

        if (existing) {
          const sameAttendanceProof =
            existing.status === CERTIFICATE_STATUS.ACTIVE &&
            existing.attendanceTxHash.toLowerCase() ===
              indexedAtt.transactionHash.toLowerCase() &&
            Number(existing.attendanceBlockNumber) === Number(indexedAtt.blockNumber) &&
            Number(existing.attendanceLogIndex) === Number(indexedAtt.logIndex);

          if (sameAttendanceProof) {
            return {
              record: existing,
              created: false,
              idempotent: true,
            };
          }

          // Önceki kayıt reorg nedeniyle geçersizleşmişse ve yeni kanonik katılım kanıtı varsa yenile
          const reissuedAt = new Date();
          const newCertId = generateSecureCertificateId();
          const baseRecord = {
            version: CERTIFICATE_VERSION,
            certificateId: newCertId,
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: numEventId,
            eventTitle: onChainEvent.title,
            organizerAddress: onChainEvent.organizerNormalized,
            participantAddress: normalizedParticipant,
            attendanceTxHash: indexedAtt.transactionHash.toLowerCase(),
            attendanceBlockNumber: Number(indexedAtt.blockNumber),
            attendanceLogIndex: Number(indexedAtt.logIndex),
            issuedAt: reissuedAt,
          };
          const integrity = computeCertificateIntegrity(baseRecord, signingSecret);

          const updated = await tx.attendanceCertificate.update({
            where: { id: existing.id },
            data: {
              ...baseRecord,
              status: CERTIFICATE_STATUS.ACTIVE,
              displayName: cleanDisplayName ?? existing.displayName,
              certificateHash: integrity.certificateHash,
              integritySignature: integrity.integritySignature,
            },
          });

          return {
            record: updated,
            created: true,
            idempotent: false,
          };
        }

        const issuedAt = new Date();
        const certificateId = generateSecureCertificateId();
        const baseRecord = {
          version: CERTIFICATE_VERSION,
          certificateId,
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
          eventTitle: onChainEvent.title,
          organizerAddress: onChainEvent.organizerNormalized,
          participantAddress: normalizedParticipant,
          attendanceTxHash: indexedAtt.transactionHash.toLowerCase(),
          attendanceBlockNumber: Number(indexedAtt.blockNumber),
          attendanceLogIndex: Number(indexedAtt.logIndex),
          issuedAt,
        };

        const integrity = computeCertificateIntegrity(baseRecord, signingSecret);

        const created = await tx.attendanceCertificate.create({
          data: {
            ...baseRecord,
            status: CERTIFICATE_STATUS.ACTIVE,
            displayName: cleanDisplayName,
            certificateHash: integrity.certificateHash,
            integritySignature: integrity.integritySignature,
            metadataUri: `/verify/${certificateId}`,
          },
        });

        return {
          record: created,
          created: true,
          idempotent: false,
        };
      });

      return {
        certificate: formatCertificateDto(txResult.record, metadataRow, {
          includePrivateDisplayName: true,
        }),
        created: txResult.created,
        idempotent: txResult.idempotent,
      };
    })();

    inFlightIssuanceMap.set(lockKey, issuancePromise);
    try {
      return await issuancePromise;
    } finally {
      inFlightIssuanceMap.delete(lockKey);
    }
  }

  /**
   * Giriş yapmış öğrencinin kendi sertifikalarını (isteğe bağlı gösterim adıyla birlikte) listeler.
   */
  async function getMyCertificates(sessionWalletAddress) {
    if (!sessionWalletAddress) {
      throw ApiError.unauthorized(
        "Sertifikalarınızı görüntülemek için SIWE oturumu gereklidir.",
        "SIWE_SESSION_REQUIRED"
      );
    }

    const { normalizedAddress } = validateAndNormalizeAddress(
      sessionWalletAddress,
      "Oturum cüzdan adresi"
    );

    const [certRows, metadataRows] = await Promise.all([
      prisma.attendanceCertificate.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          participantAddress: normalizedAddress,
        },
        orderBy: { issuedAt: "desc" },
      }),
      prisma.eventMetadata.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
        },
      }),
    ]);

    const metaMap = new Map(metadataRows.map((m) => [Number(m.eventId), m]));
    return certRows.map((row) =>
      formatCertificateDto(row, metaMap.get(Number(row.eventId)) || null, {
        includePrivateDisplayName: true,
      })
    );
  }

  /**
   * Öğrenci profilinde cüzdan adresine göre sertifikaları (kişisel displayName olmadan) listeler.
   */
  async function getCertificatesForWalletPublic(rawWalletAddress) {
    const { normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Öğrenci cüzdan adresi"
    );

    const [certRows, metadataRows] = await Promise.all([
      prisma.attendanceCertificate.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          participantAddress: normalizedAddress,
        },
        orderBy: { issuedAt: "desc" },
      }),
      prisma.eventMetadata.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
        },
      }),
    ]);

    const metaMap = new Map(metadataRows.map((m) => [Number(m.eventId), m]));
    return certRows.map((row) =>
      formatCertificateDto(row, metaMap.get(Number(row.eventId)) || null, {
        includePrivateDisplayName: false,
      })
    );
  }

  /**
   * Sertifika kimliğine göre herkese açık sertifika kaydını döndürür.
   */
  async function getCertificateById(rawCertificateId) {
    const cleanId = String(rawCertificateId || "").trim().toUpperCase();
    if (!CERTIFICATE_ID_REGEX.test(cleanId)) {
      throw ApiError.badRequest(
        "Geçersiz sertifika kimliği formatı.",
        null,
        "INVALID_CERTIFICATE_ID"
      );
    }

    const row = await prisma.attendanceCertificate.findUnique({
      where: { certificateId: cleanId },
    });

    if (!row) {
      throw ApiError.notFound("Sertifika kaydı bulunamadı.", "CERTIFICATE_NOT_FOUND");
    }

    const metadataRow = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId: Number(row.chainId),
          contractAddress: String(row.contractAddress).toLowerCase(),
          eventId: Number(row.eventId),
        },
      },
    });

    return formatCertificateDto(row, metadataRow, {
      includePrivateDisplayName: false,
    });
  }

  /**
   * Herkese açık 4 katmanlı sertifika doğrulama motoru (Cüzdan bağlantısı gerektirmez).
   * Durumlar:
   * - VERIFIED ("Doğrulandı")
   * - NOT_FOUND ("Bulunamadı")
   * - INVALID ("Geçersiz")
   * - UNVERIFIABLE_NOW ("Doğrulama şu anda yapılamıyor" — RPC kesintisi veya indexer gecikmesi)
   */
  async function verifyCertificateById(rawCertificateId) {
    const cleanId = String(rawCertificateId || "").trim().toUpperCase();
    if (!CERTIFICATE_ID_REGEX.test(cleanId)) {
      throw ApiError.badRequest(
        "Geçersiz sertifika kimliği formatı (Beklenen: CP-CERT-<32 hex>).",
        null,
        "INVALID_CERTIFICATE_ID"
      );
    }

    const verifiedAt = new Date().toISOString();

    // 1. Katman: PostgreSQL Sertifika Kaydı Sorgusu
    const certRow = await prisma.attendanceCertificate.findUnique({
      where: { certificateId: cleanId },
    });

    if (!certRow) {
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.NOT_FOUND,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.NOT_FOUND],
        reasonCode: "CERTIFICATE_NOT_FOUND",
        reasonMessage:
          "Bu kimliğe sahip bir katılım sertifikası CampusPass kayıtlarında bulunamadı.",
        verifiedAt,
        certificate: null,
        verificationSources: {
          databaseRecord: { passed: false, detail: "Sertifika kaydı bulunamadı." },
          cryptographicIntegrity: { passed: false, detail: "Kontrol edilemedi." },
          indexedAttendanceLog: { passed: false, detail: "Kontrol edilemedi." },
          liveBlockchainContract: { passed: false, detail: "Kontrol edilemedi." },
        },
      };
    }

    const metadataRow = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId: Number(certRow.chainId),
          contractAddress: String(certRow.contractAddress).toLowerCase(),
          eventId: Number(certRow.eventId),
        },
      },
    });

    const publicCertDto = formatCertificateDto(certRow, metadataRow, {
      includePrivateDisplayName: false,
    });

    if (certRow.status !== CERTIFICATE_STATUS.ACTIVE) {
      const isReorg = certRow.status === CERTIFICATE_STATUS.INVALIDATED_BY_REORG;
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.INVALID,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.INVALID],
        reasonCode: isReorg ? "ATTENDANCE_INVALIDATED_BY_REORG" : "CERTIFICATE_REVOKED",
        reasonMessage: isReorg
          ? "Bu sertifikanın dayandığı blokzincir katılım işlemi ağ yeniden düzenlemesi (reorg) sonucunda geçersizleşmiştir."
          : "Bu sertifika iptal edilmiş veya geçersiz kılınmıştır.",
        verifiedAt,
        certificate: publicCertDto,
        verificationSources: {
          databaseRecord: {
            passed: false,
            detail: `Sertifika durumu aktif değil (${certRow.status}).`,
          },
          cryptographicIntegrity: { passed: false, detail: "Sertifika aktif değil." },
          indexedAttendanceLog: { passed: false, detail: "Katılım kaydı geçersizleşti." },
          liveBlockchainContract: { passed: false, detail: "Sertifika geçersiz." },
        },
      };
    }

    // 2. Katman: Kriptografik Bütünlük (CP-CERT-V1 Hash & HMAC) Kontrolü
    const integrityCheck = verifyCertificateIntegritySeal(certRow, signingSecret);
    if (!integrityCheck.valid) {
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.INVALID,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.INVALID],
        reasonCode: "CERTIFICATE_INTEGRITY_TAMPERED",
        reasonMessage: integrityCheck.reason,
        verifiedAt,
        certificate: publicCertDto,
        verificationSources: {
          databaseRecord: { passed: true, detail: "Sertifika kaydı bulundu." },
          cryptographicIntegrity: {
            passed: false,
            detail: integrityCheck.reason,
          },
          indexedAttendanceLog: { passed: false, detail: "Bütünlük hatası nedeniyle durduruldu." },
          liveBlockchainContract: { passed: false, detail: "Bütünlük hatası nedeniyle durduruldu." },
        },
      };
    }

    // 3. Katman: İndekslenmiş Blokzincir Log Kanıtı (IndexedAttendance) ve Checkpoint Tutarlılığı
    const [indexedAtt, checkpoint] = await Promise.all([
      prisma.indexedAttendance.findUnique({
        where: {
          att_event_participant_unique: {
            chainId: Number(certRow.chainId),
            contractAddress: String(certRow.contractAddress).toLowerCase(),
            eventId: Number(certRow.eventId),
            participantAddress: String(certRow.participantAddress).toLowerCase(),
          },
        },
      }),
      prisma.indexerCheckpoint.findUnique({
        where: {
          chainId_contractAddress: {
            chainId: Number(certRow.chainId),
            contractAddress: String(certRow.contractAddress).toLowerCase(),
          },
        },
      }),
    ]);

    if (
      !checkpoint ||
      Number(checkpoint.lastProcessedBlock) < Number(certRow.attendanceBlockNumber)
    ) {
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW],
        reasonCode: "INDEXER_LAGGING_OR_UNCONFIRMED",
        reasonMessage:
          "Blokzincir indeksleyicisi henüz sertifikanın referans verdiği blok yüksekliğini doğrulamadı. Lütfen kısa süre sonra tekrar kontrol edin.",
        verifiedAt,
        certificate: publicCertDto,
        verificationSources: {
          databaseRecord: { passed: true, detail: "Sertifika kaydı bulundu." },
          cryptographicIntegrity: { passed: true, detail: integrityCheck.reason },
          indexedAttendanceLog: {
            passed: false,
            detail: "Indexer checkpoint henüz hedef bloğa ulaşmadı.",
          },
          liveBlockchainContract: { passed: false, detail: "Indexer senkronizasyonu bekleniyor." },
        },
      };
    }

    if (
      !indexedAtt ||
      indexedAtt.transactionHash.toLowerCase() !==
        certRow.attendanceTxHash.toLowerCase() ||
      Number(indexedAtt.blockNumber) !== Number(certRow.attendanceBlockNumber) ||
      Number(indexedAtt.logIndex) !== Number(certRow.attendanceLogIndex)
    ) {
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.INVALID,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.INVALID],
        reasonCode: "ATTENDANCE_LOG_MISMATCH_OR_REORG",
        reasonMessage:
          "Sertifikadaki işlem özeti veya blok log kaydı kanonik blokzincir indeksinde bulunamadı (Reorg veya geçersiz kanıt).",
        verifiedAt,
        certificate: publicCertDto,
        verificationSources: {
          databaseRecord: { passed: true, detail: "Sertifika kaydı bulundu." },
          cryptographicIntegrity: { passed: true, detail: integrityCheck.reason },
          indexedAttendanceLog: {
            passed: false,
            detail: "İndekslenmiş AttendanceMarked logu bulunamadı veya uyuşmuyor.",
          },
          liveBlockchainContract: { passed: false, detail: "Log kanıtı geçersiz." },
        },
      };
    }

    // 4. Katman: Canlı Monad Testnet Akıllı Sözleşme (CampusPass.sol) Doğrulaması
    let onChainEvent;
    let onChainState;
    try {
      [onChainEvent, onChainState] = await Promise.all([
        blockchainService.getOnChainEvent(Number(certRow.eventId)),
        blockchainService.getStudentEventOnChainState(
          Number(certRow.eventId),
          publicCertDto.participantAddress
        ),
      ]);

      if (confirmations > 0) {
        const latestBlock = await blockchainService.getLatestBlockNumber();
        if (
          latestBlock !== null &&
          latestBlock - Number(certRow.attendanceBlockNumber) < confirmations
        ) {
          return {
            certificateId: cleanId,
            verified: false,
            verificationStatus: VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW,
            verificationLabel:
              VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW],
            reasonCode: "BLOCKCHAIN_CONFIRMATIONS_PENDING",
            reasonMessage:
              "Blokzincir katılım işlemi henüz yeterli onay derinliğine (confirmation) ulaşmadı.",
            verifiedAt,
            certificate: publicCertDto,
            verificationSources: {
              databaseRecord: { passed: true, detail: "Sertifika kaydı bulundu." },
              cryptographicIntegrity: { passed: true, detail: integrityCheck.reason },
              indexedAttendanceLog: {
                passed: true,
                detail: `Blok #${certRow.attendanceBlockNumber} (Log #${certRow.attendanceLogIndex}) eşleşti.`,
              },
              liveBlockchainContract: {
                passed: false,
                detail: "Blok kesinleşme (confirmation) penceresi bekleniyor.",
              },
            },
          };
        }
      }
    } catch (rpcErr) {
      // Kritik Kural: RPC erişilemiyorsa sertifikayı "Geçersiz" olarak işaretleme!
      // "Doğrulama şu anda yapılamıyor" (UNVERIFIABLE_NOW) döndür.
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.UNVERIFIABLE_NOW],
        reasonCode: "RPC_UNAVAILABLE",
        reasonMessage:
          "Monad Testnet blokzincir düğümüne (RPC) şu anda erişilemediği için canlı zincir doğrulaması tamamlanamadı. Sertifika geçersiz sayılmamıştır; lütfen bağlantıyı kontrol edip tekrar deneyin.",
        verifiedAt,
        certificate: publicCertDto,
        verificationSources: {
          databaseRecord: { passed: true, detail: "Sertifika kaydı bulundu." },
          cryptographicIntegrity: { passed: true, detail: integrityCheck.reason },
          indexedAttendanceLog: {
            passed: true,
            detail: `Blok #${certRow.attendanceBlockNumber}, Tx: ${certRow.attendanceTxHash.slice(0, 14)}...`,
          },
          liveBlockchainContract: {
            passed: false,
            detail: `RPC bağlantı hatası: ${rpcErr.message}`,
          },
        },
      };
    }

    if (!onChainEvent || !onChainState || onChainState.isAttended !== true) {
      return {
        certificateId: cleanId,
        verified: false,
        verificationStatus: VERIFICATION_RESULT_STATUS.INVALID,
        verificationLabel:
          VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.INVALID],
        reasonCode: "ONCHAIN_ATTENDANCE_FALSE",
        reasonMessage:
          "Canlı CampusPass akıllı sözleşmesi üzerinde bu katılımcı için doğrulanmış katılım (attended == true) kaydı bulunamadı.",
        verifiedAt,
        certificate: publicCertDto,
        verificationSources: {
          databaseRecord: { passed: true, detail: "Sertifika kaydı bulundu." },
          cryptographicIntegrity: { passed: true, detail: integrityCheck.reason },
          indexedAttendanceLog: {
            passed: true,
            detail: `Blok #${certRow.attendanceBlockNumber} indekste mevcut.`,
          },
          liveBlockchainContract: {
            passed: false,
            detail: "Sözleşme üzerinde attended(eventId, wallet) = false döndü.",
          },
        },
      };
    }

    return {
      certificateId: cleanId,
      verified: true,
      verificationStatus: VERIFICATION_RESULT_STATUS.VERIFIED,
      verificationLabel:
        VERIFICATION_RESULT_LABELS[VERIFICATION_RESULT_STATUS.VERIFIED],
      reasonCode: "VERIFIED_ONCHAIN_AND_DB",
      reasonMessage:
        "Bu katılım sertifikası CampusPass veritabanı, kriptografik bütünlük mührü (CP-CERT-V1) ve Monad Testnet üzerindeki canlı CampusPass.sol akıllı sözleşmesi üzerinden başarıyla doğrulandı.",
      verifiedAt,
      certificate: publicCertDto,
      verificationSources: {
        databaseRecord: {
          passed: true,
          detail: `PostgreSQL sertifika kaydı aktif (${certRow.certificateId}).`,
        },
        cryptographicIntegrity: {
          passed: true,
          detail: `Sürüm ${certRow.version} SHA-256 & HMAC bütünlük mührü doğrulandı.`,
        },
        indexedAttendanceLog: {
          passed: true,
          detail: `AttendanceMarked olayı Blok #${certRow.attendanceBlockNumber} (Log #${certRow.attendanceLogIndex}) üzerinde doğrulandı.`,
        },
        liveBlockchainContract: {
          passed: true,
          detail: `Monad Testnet (${contractAddress}) üzerinde attended(${certRow.eventId}, ${publicCertDto.participantAddress}) = true.`,
        },
      },
    };
  }

  return {
    issueCertificate,
    getMyCertificates,
    getCertificatesForWalletPublic,
    getCertificateById,
    verifyCertificateById,
  };
}
