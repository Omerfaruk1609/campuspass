import {
  buildStudentTimeline,
  calculateStudentStats,
  classifyStudentAttendanceState,
} from "../../../src/utils/studentProfile.js";
import { validateAndNormalizeAddress } from "../utils/validation.js";

/**
 * Öğrenci Etkinlik ve Katılım Sorgulama Servisi
 * - Yalnızca herkese açık blokzincir verilerini ve etkinlik metadata'sını döndürür.
 * - İndekslenmiş veritabanı kayıtları ile canlı blokzincir durumu arasında çelişki olursa
 *   blokzinciri temel doğruluk kaynağı (Source of Truth) kabul eder.
 */
export function createStudentService({
  prisma,
  blockchainService,
  eventService,
}) {
  const { chainId, contractAddressNormalized } = blockchainService;

  async function getStudentProfileFromChainAndIndex(
    rawWalletAddress,
    { nowMs = Date.now() } = {}
  ) {
    const { checksumAddress, normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Öğrenci cüzdan adresi"
    );

    const [
      onChainEvents,
      indexedRegs,
      indexedAtts,
      allMetadataRows,
      allAttendanceRows,
    ] = await Promise.all([
      blockchainService.getAllOnChainEvents(),
      prisma.indexedRegistration.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          participantAddress: normalizedAddress,
        },
      }),
      prisma.indexedAttendance.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          participantAddress: normalizedAddress,
        },
      }),
      prisma.eventMetadata.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
        },
      }),
      prisma.indexedAttendance.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
        },
      }),
    ]);

    const regTxByEventId = new Map();
    for (const r of indexedRegs) {
      regTxByEventId.set(Number(r.eventId), r.transactionHash);
    }

    const attTxByEventId = new Map();
    for (const a of indexedAtts) {
      attTxByEventId.set(Number(a.eventId), a.transactionHash);
    }

    const metadataByEventId = new Map();
    for (const row of allMetadataRows) {
      metadataByEventId.set(Number(row.eventId), row);
    }

    const attCountByEventId = new Map();
    for (const att of allAttendanceRows) {
      const evId = Number(att.eventId);
      attCountByEventId.set(evId, (attCountByEventId.get(evId) || 0) + 1);
    }

    // Her etkinlik için canlı blokzincir doğrulaması (Blockchain = Source of Truth)
    const onChainStates = await Promise.all(
      onChainEvents.map(async (ev) => {
        const state = await blockchainService.getStudentEventOnChainState(
          ev.id,
          checksumAddress
        );
        return { event: ev, ...state };
      })
    );

    const registeredEvents = onChainStates
      .filter((item) => item.isRegistered === true)
      .map(({ event, isRegistered, isAttended }) => {
        const merged = eventService.mergeOnChainAndDbEvent(
          event,
          metadataByEventId.get(event.id) || null,
          Math.max(attCountByEventId.get(event.id) || 0, isAttended ? 1 : 0),
          nowMs
        );

        const enriched = {
          ...merged,
          isRegistered,
          isAttended,
          registrationTxHash: regTxByEventId.get(event.id) || null,
          attendanceTxHash: attTxByEventId.get(event.id) || null,
        };
        enriched.attendanceState = classifyStudentAttendanceState(enriched);
        return enriched;
      });

    registeredEvents.sort(
      (a, b) => (Date.parse(b.startAt) || 0) - (Date.parse(a.startAt) || 0)
    );

    const upcomingEvents = registeredEvents.filter(
      (ev) => ev.status === "upcoming" || ev.status === "ongoing"
    );
    const pastEvents = registeredEvents.filter(
      (ev) => ev.status === "completed" || ev.status === "cancelled"
    );
    const attendedEvents = registeredEvents.filter((ev) => ev.isAttended === true);

    const stats = calculateStudentStats(registeredEvents);
    const timeline = buildStudentTimeline(registeredEvents, { direction: "DESC" });

    return {
      walletAddress: checksumAddress,
      normalizedWalletAddress: normalizedAddress,
      privacyNotice:
        "Bu endpoint yalnızca herkese açık blokzincir (CampusPass.sol) kayıt ve katılım verilerini döndürür. Özel profil verisi içermez.",
      registeredEvents,
      upcomingEvents,
      pastEvents,
      attendedEvents,
      stats,
      timeline,
    };
  }

  return {
    getStudentProfileFromChainAndIndex,
  };
}
