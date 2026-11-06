import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS,
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  callWithRetry,
  parseBlockchainError,
} from "../data/events.js";
import { mergeOnChainEventWithMetadata } from "./eventMetadata.js";

export const ATTENDANCE_STATE = {
  ATTENDED_VERIFIED: "ATTENDED_VERIFIED",
  REGISTERED_PENDING: "REGISTERED_PENDING",
  COMPLETED_NOT_ATTENDED: "COMPLETED_NOT_ATTENDED",
  CANCELLED_EVENT: "CANCELLED_EVENT",
  NOT_REGISTERED: "NOT_REGISTERED",
};

export const ATTENDANCE_STATE_LABELS = {
  [ATTENDANCE_STATE.ATTENDED_VERIFIED]: "Katılım doğrulandı",
  [ATTENDANCE_STATE.REGISTERED_PENDING]: "Kayıtlı, katılım henüz doğrulanmadı",
  [ATTENDANCE_STATE.COMPLETED_NOT_ATTENDED]:
    "Etkinlik tamamlandı, katılım doğrulanmadı",
  [ATTENDANCE_STATE.CANCELLED_EVENT]: "Etkinlik iptal edildi",
  [ATTENDANCE_STATE.NOT_REGISTERED]: "Kayıtlı değil",
};

/**
 * Öğrencinin bir etkinlikteki kayıt ve katılım durumunu net olarak sınıflandırır.
 * Katılımı doğrulanmamış bir öğrenciye asla katılmış görünümü vermez.
 */
export function classifyStudentAttendanceState(eventItem) {
  if (!eventItem || !eventItem.isRegistered) {
    return {
      code: ATTENDANCE_STATE.NOT_REGISTERED,
      label: ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.NOT_REGISTERED],
      badgeClass: "inactive",
    };
  }

  if (eventItem.isAttended === true) {
    return {
      code: ATTENDANCE_STATE.ATTENDED_VERIFIED,
      label: ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.ATTENDED_VERIFIED],
      badgeClass: "attended",
    };
  }

  if (eventItem.status === "cancelled" || eventItem.cancelled === true || eventItem.active === false) {
    return {
      code: ATTENDANCE_STATE.CANCELLED_EVENT,
      label: ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.CANCELLED_EVENT],
      badgeClass: "cancelled",
    };
  }

  if (eventItem.status === "completed") {
    return {
      code: ATTENDANCE_STATE.COMPLETED_NOT_ATTENDED,
      label: ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.COMPLETED_NOT_ATTENDED],
      badgeClass: "warning",
    };
  }

  return {
    code: ATTENDANCE_STATE.REGISTERED_PENDING,
    label: ATTENDANCE_STATE_LABELS[ATTENDANCE_STATE.REGISTERED_PENDING],
    badgeClass: "registered",
  };
}

/**
 * Öğrencinin kayıtlı olduğu etkinlikler üzerinden istatistikleri hesaplar.
 * - Sıfıra bölme hatasını engeller.
 * - İptal edilmiş (ve katılımı doğrulanmamış) etkinlikleri oran paydasından hariç tutarak
 *   yanıltıcı başarı/başarısızlık oluşmasını önler.
 */
export function calculateStudentStats(registeredEvents = []) {
  const safeList = Array.isArray(registeredEvents)
    ? registeredEvents.filter((ev) => Boolean(ev && ev.isRegistered))
    : [];

  const totalRegistered = safeList.length;
  let verifiedAttended = 0;
  let upcomingCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let completedUnattendedCount = 0;

  for (const ev of safeList) {
    if (ev.isAttended === true) {
      verifiedAttended += 1;
    }

    if (ev.status === "cancelled" || ev.cancelled === true || ev.active === false) {
      cancelledCount += 1;
    } else if (ev.status === "completed") {
      completedCount += 1;
      if (!ev.isAttended) {
        completedUnattendedCount += 1;
      }
    } else {
      // upcoming veya ongoing
      upcomingCount += 1;
    }
  }

  // İptal edilmiş (ve katılımı onaylanmamış) etkinlikler doğrulama oranı paydasına dahil edilmez
  const eligibleForRate = safeList.filter(
    (ev) => ev.isAttended === true || (ev.status !== "cancelled" && !ev.cancelled && ev.active !== false)
  ).length;

  const attendanceRate =
    eligibleForRate > 0
      ? Math.min(100, Math.round((verifiedAttended / eligibleForRate) * 100))
      : 0;

  return {
    totalRegistered,
    verifiedAttended,
    upcomingCount,
    completedCount,
    cancelledCount,
    completedUnattendedCount,
    eligibleForRate,
    attendanceRate,
    scopeDescription:
      "İstatistikler bağlı cüzdanın blokzincir üzerindeki kayıtlarını kapsar. İptal edilen etkinlikler katılım doğrulama oranı hesabına dahil edilmez.",
  };
}

/**
 * Öğrencinin kayıtlı etkinliklerini kronolojik zaman çizelgesine dönüştürür.
 * Yalnızca gerçek işlem hash'i (txHash) bilinen kayıtlar için Monad Explorer bağlantısı üretir;
 * bilinmeyenler için sahte bağlantı üretmez.
 */
export function buildStudentTimeline(
  registeredEvents = [],
  { explorerBaseUrl = MONAD_EXPLORER_URL, direction = "DESC" } = {}
) {
  const safeList = Array.isArray(registeredEvents)
    ? registeredEvents.filter((ev) => Boolean(ev && ev.isRegistered))
    : [];

  const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

  const items = safeList.map((ev) => {
    const attendanceState = classifyStudentAttendanceState(ev);
    const startTimestampMs = ev.startAt ? Date.parse(ev.startAt) : 0;

    const validRegTx =
      typeof ev.registrationTxHash === "string" &&
      TX_HASH_REGEX.test(ev.registrationTxHash)
        ? ev.registrationTxHash
        : null;

    const validAttTx =
      typeof ev.attendanceTxHash === "string" &&
      TX_HASH_REGEX.test(ev.attendanceTxHash)
        ? ev.attendanceTxHash
        : null;

    // Varsa katılım doğrulama işlemini, yoksa kayıt işlemini gerçek Explorer bağlantısı olarak sun
    const primaryTxHash = validAttTx || validRegTx;
    const explorerTxUrl = primaryTxHash
      ? `${explorerBaseUrl.replace(/\/$/, "")}/tx/${primaryTxHash}`
      : null;

    return {
      eventId: ev.id,
      title: ev.title,
      community: ev.community || "Kampüs Topluluğu",
      category: ev.category || "Genel",
      date: ev.date,
      startTime: ev.startTime,
      endTime: ev.endTime,
      startAt: ev.startAt,
      startTimestampMs: Number.isNaN(startTimestampMs) ? 0 : startTimestampMs,
      location: ev.location,
      status: ev.status,
      statusLabel: ev.statusLabel,
      isRegistered: true,
      isAttended: Boolean(ev.isAttended),
      attendanceState,
      registrationTxHash: validRegTx,
      attendanceTxHash: validAttTx,
      explorerTxUrl,
    };
  });

  items.sort((a, b) => {
    const diff = a.startTimestampMs - b.startTimestampMs;
    if (diff !== 0) {
      return direction === "ASC" ? diff : -diff;
    }
    return direction === "ASC" ? a.eventId - b.eventId : b.eventId - a.eventId;
  });

  return items;
}

/**
 * RPC sağlayıcısının blok aralığı sınırlarını dikkate alarak parçalı (chunked) olay taraması yapar.
 */
export async function queryContractEventsChunked(
  contract,
  filter,
  { maxLookbackBlocks = 90, chunkSize = 90 } = {}
) {
  if (!contract || !filter || typeof contract.queryFilter !== "function") {
    return [];
  }

  try {
    const provider = contract.runner?.provider || contract.provider;
    if (!provider || typeof provider.getBlockNumber !== "function") {
      return await callWithRetry(() => contract.queryFilter(filter)).catch(() => []);
    }

    const latestBlock = await callWithRetry(() => provider.getBlockNumber()).catch(() => null);
    if (!latestBlock) return [];
    const startBlock = Math.max(0, latestBlock - maxLookbackBlocks);
    const collectedLogs = [];

    for (let toBlock = latestBlock; toBlock >= startBlock; toBlock -= chunkSize) {
      const fromBlock = Math.max(startBlock, toBlock - chunkSize + 1);
      try {
        const chunkLogs = await callWithRetry(() => contract.queryFilter(filter, fromBlock, toBlock));
        if (Array.isArray(chunkLogs)) {
          collectedLogs.push(...chunkLogs);
        }
      } catch {
        // RPC belirli bir blok aralığını reddederse veya rate limit verirse güvenli şekilde sonlandır
        break;
      }
      if (fromBlock === 0) break;
    }

    return collectedLogs;
  } catch {
    return [];
  }
}

/**
 * Sınırlı eşzamanlılık (bounded concurrency) yardımcı fonksiyonu.
 * İstekleri paralel chunk'lara bölerek RPC ve ağ darboğazını çözer, rate limit aşımını önler.
 */
export async function runBoundedConcurrency(items, fn, concurrency = 6) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkRes = await Promise.all(chunk.map((item, idx) => fn(item, i + idx)));
    results.push(...chunkRes);
  }
  return results;
}

// Cüzdan bazlı, kimlik-güvenli istemci içi profil önbelleği (30 saniye TTL)
export const studentProfileCache = new Map();
export const CACHE_TTL_MS = 30_000;

export function invalidateStudentProfileCache(walletAddress = null) {
  if (walletAddress) {
    try {
      studentProfileCache.delete(ethers.getAddress(walletAddress).toLowerCase());
    } catch {
      studentProfileCache.clear();
    }
  } else {
    studentProfileCache.clear();
  }
}

/**
 * Bağlı öğrencinin kayıt ve katılım verilerini blokzincir + metadata katmanından güvenilir biçimde okur.
 */
export async function fetchStudentProfileData({
  walletAddress,
  contract,
  chainId = MONAD_CHAIN_ID,
  contractAddress = CONTRACT_ADDRESS,
  nowMs = Date.now(),
}) {
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return {
      walletAddress: null,
      registeredEvents: [],
      upcomingEvents: [],
      pastEvents: [],
      attendedEvents: [],
      stats: calculateStudentStats([]),
      timeline: [],
      error: null,
    };
  }

  const normalizedWallet = ethers.getAddress(walletAddress);

  if (!contract) {
    throw new Error("Blokzincir sözleşme bağlantısı bulunamadı.");
  }

  try {
    const nextIdBigInt = await callWithRetry(() => contract.nextEventId());
    const totalEvents = Number(nextIdBigInt) - 1;

    if (totalEvents <= 0) {
      return {
        walletAddress: normalizedWallet,
        registeredEvents: [],
        upcomingEvents: [],
        pastEvents: [],
        attendedEvents: [],
        stats: calculateStudentStats([]),
        timeline: [],
        error: null,
      };
    }

    const ids = Array.from({ length: totalEvents }, (_, idx) => idx + 1);

    // Kayıt bayraklarını sınırlı eşzamanlılıkla (bounded concurrency = 6) hızlıca sorgula
    const regCheckResults = await runBoundedConcurrency(
      ids,
      async (id) => {
        try {
          const isReg = await callWithRetry(() => contract.registered(id, normalizedWallet));
          return isReg ? id : null;
        } catch {
          return null;
        }
      },
      6
    );
    const registeredIds = regCheckResults.filter(Boolean);

    // Yalnızca kayıtlı etkinlik varsa işlem hash'lerini (isteğe bağlı) parçalı olay sorgusuyla topla
    const regTxByEvent = {};
    const attTxByEvent = {};

    if (registeredIds.length > 0 && contract.filters) {
      try {
        const [regLogs, attLogs] = await Promise.all([
          typeof contract.filters.UserRegistered === "function"
            ? queryContractEventsChunked(
                contract,
                contract.filters.UserRegistered(null, normalizedWallet)
              )
            : Promise.resolve([]),
          typeof contract.filters.AttendanceMarked === "function"
            ? queryContractEventsChunked(
                contract,
                contract.filters.AttendanceMarked(null, normalizedWallet)
              )
            : Promise.resolve([]),
        ]);

        for (const log of (regLogs || [])) {
          const evId = Number(log.args?.eventId);
          if (evId && log.transactionHash) {
            regTxByEvent[evId] = log.transactionHash;
          }
        }

        for (const log of (attLogs || [])) {
          const evId = Number(log.args?.eventId);
          if (evId && log.transactionHash) {
            attTxByEvent[evId] = log.transactionHash;
          }
        }
      } catch {
        // İsteğe bağlı olay geçmişi sorgusu ana profil akışını kesmez
      }
    }

    // Kayıtlı olunan etkinliklerin detaylarını sınırlı eşzamanlılıkla (bounded concurrency = 6) çek
    const registeredEventsRaw = await runBoundedConcurrency(
      registeredIds,
      async (id) => {
        try {
          const [ev, att] = await Promise.all([
            callWithRetry(() => contract.events(id)),
            callWithRetry(() => contract.attended(id, normalizedWallet)),
          ]);

          const baseOnChain = {
            id: Number(ev.id),
            organizer: ev.organizer,
            title: ev.title,
            capacity: Number(ev.capacity),
            registeredCount: Number(ev.registeredCount),
            active: Boolean(ev.active),
            isRegistered: true,
            isAttended: Boolean(att),
            registrationTxHash: regTxByEvent[id] || null,
            attendanceTxHash: attTxByEvent[id] || null,
          };

          const merged = mergeOnChainEventWithMetadata(baseOnChain, {
            chainId,
            contractAddress,
            nowMs,
          });

          merged.attendanceState = classifyStudentAttendanceState(merged);
          return merged;
        } catch {
          return null;
        }
      },
      6
    );

    const registeredEvents = registeredEventsRaw.filter(Boolean);

    // Kronolojik sıralama (en yakın/yeni üstte)
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
      walletAddress: normalizedWallet,
      registeredEvents,
      upcomingEvents,
      pastEvents,
      attendedEvents,
      stats,
      timeline,
      error: null,
    };
  } catch (err) {
    throw new Error(parseBlockchainError(err));
  }
}
