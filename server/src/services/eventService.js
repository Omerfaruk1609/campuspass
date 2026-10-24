import { ethers } from "ethers";
import {
  EVENT_STATUS_LABELS,
  buildEventCompositeKey,
  checkRegistrationEligibility,
  computeEventStatus,
  filterAndSortEvents,
  normalizeDeadlineTurkeyIso,
  toTurkeyIsoTimestamp,
} from "../../../src/utils/eventMetadata.js";
import { ApiError } from "../utils/errors.js";

function toDateAndTimePartsTurkey(isoOrDate) {
  const ms = Date.parse(isoOrDate);
  if (Number.isNaN(ms)) {
    return { date: "2026-11-15", time: "14:00" };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const hour = map.hour === "24" ? "00" : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}`,
  };
}

export function formatDbMetadataToClient(dbRow) {
  if (!dbRow) return null;
  const startIso =
    dbRow.startAt instanceof Date
      ? dbRow.startAt.toISOString()
      : String(dbRow.startAt);
  const endIso =
    dbRow.endAt instanceof Date ? dbRow.endAt.toISOString() : String(dbRow.endAt);
  const deadlineIso =
    dbRow.registrationDeadline instanceof Date
      ? dbRow.registrationDeadline.toISOString()
      : String(dbRow.registrationDeadline);

  const startParts = toDateAndTimePartsTurkey(startIso);
  const endParts = toDateAndTimePartsTurkey(endIso);

  const checksumContract = ethers.getAddress(dbRow.contractAddress);
  const checksumOrganizer = ethers.getAddress(dbRow.organizerAddress);

  return {
    id: dbRow.id,
    compositeKey: buildEventCompositeKey(
      dbRow.chainId,
      checksumContract,
      dbRow.eventId
    ),
    chainId: Number(dbRow.chainId),
    contractAddress: checksumContract,
    eventId: Number(dbRow.eventId),
    organizer: checksumOrganizer,
    organizerAddress: checksumOrganizer,
    title: dbRow.title || "",
    capacity: dbRow.capacity ? Number(dbRow.capacity) : null,
    description: dbRow.description,
    community: dbRow.community,
    category: dbRow.category,
    date: startParts.date,
    startTime: startParts.time,
    endTime: endParts.time,
    startAt: startIso,
    endAt: endIso,
    registrationDeadline: deadlineIso,
    campus: dbRow.campus,
    building: dbRow.building,
    room: dbRow.room,
    location: {
      campus: dbRow.campus,
      building: dbRow.building,
      room: dbRow.room,
    },
    posterUrl: dbRow.posterUrl || "",
    cancelled: Boolean(dbRow.cancelled),
    cancelReason: dbRow.cancelReason || "",
    createdAt:
      dbRow.createdAt instanceof Date
        ? dbRow.createdAt.toISOString()
        : String(dbRow.createdAt),
    updatedAt:
      dbRow.updatedAt instanceof Date
        ? dbRow.updatedAt.toISOString()
        : String(dbRow.updatedAt),
  };
}

function normalizeMetadataDates(validatedInput) {
  let startIso = validatedInput.startAt;
  let endIso = validatedInput.endAt;

  if (validatedInput.date && validatedInput.startTime && validatedInput.endTime) {
    startIso = toTurkeyIsoTimestamp(
      validatedInput.date,
      validatedInput.startTime
    ).iso;
    endIso = toTurkeyIsoTimestamp(validatedInput.date, validatedInput.endTime).iso;
  }

  const deadlineIso = normalizeDeadlineTurkeyIso(
    validatedInput.registrationDeadline
  ).iso;

  const campus = validatedInput.location?.campus || validatedInput.campus;
  const building = validatedInput.location?.building || validatedInput.building;
  const room = validatedInput.location?.room || validatedInput.room;

  return {
    startAt: new Date(startIso),
    endAt: new Date(endIso),
    registrationDeadline: new Date(deadlineIso),
    campus,
    building,
    room,
  };
}

/**
 * Etkinlik ve Metadata Yönetim Servisi
 * - Blokzincir verisi ile PostgreSQL (Prisma) metadata ve indeks verilerini birleştirir.
 * - Yazma işlemlerinde organizatör yetkisini blokzincir üzerinden canlı doğrular.
 */
export function createEventService({ prisma, blockchainService }) {
  const { chainId, contractAddress, contractAddressNormalized } = blockchainService;

  function mergeOnChainAndDbEvent(
    onChainEvent,
    dbMetadataRow,
    verifiedAttendanceCount = 0,
    nowMs = Date.now()
  ) {
    const formattedMeta = formatDbMetadataToClient(dbMetadataRow);

    const fallbackMeta = {
      description:
        "Bu etkinlik Monad Testnet üzerinde oluşturulmuştur. Organizatör paneli üzerinden detaylı açıklama, konum ve program bilgilerini güncelleyebilirsiniz.",
      community: "Kampüs Topluluğu",
      category: "Blockchain",
      date: "2026-11-15",
      startTime: "14:00",
      endTime: "17:00",
      startAt: "2026-11-15T14:00:00+03:00",
      endAt: "2026-11-15T17:00:00+03:00",
      registrationDeadline: "2026-11-15T13:30:00+03:00",
      location: {
        campus: "Merkez Kampüs",
        building: "Mühendislik Fakültesi",
        room: "Konferans Salonu",
      },
      posterUrl: "",
      cancelled: false,
      cancelReason: "",
    };

    const meta = formattedMeta || fallbackMeta;
    const status = computeEventStatus(meta, onChainEvent.active, nowMs);

    const merged = {
      id: onChainEvent.id,
      eventId: onChainEvent.id,
      chainId,
      contractAddress,
      compositeKey: buildEventCompositeKey(chainId, contractAddress, onChainEvent.id),
      organizer: onChainEvent.organizer,
      title: onChainEvent.title,
      capacity: onChainEvent.capacity,
      registeredCount: onChainEvent.registeredCount,
      active: onChainEvent.active,
      hasCustomMetadata: Boolean(formattedMeta),
      description: meta.description,
      community: meta.community,
      category: meta.category,
      date: meta.date,
      startTime: meta.startTime,
      endTime: meta.endTime,
      startAt: meta.startAt,
      endAt: meta.endAt,
      registrationDeadline: meta.registrationDeadline,
      location: meta.location,
      posterUrl: meta.posterUrl,
      cancelled: Boolean(meta.cancelled),
      cancelReason: meta.cancelReason || "",
      status,
      statusLabel: EVENT_STATUS_LABELS[status] || "Yaklaşan",
      verifiedAttendanceCount: Number(verifiedAttendanceCount || 0),
      updatedAt: formattedMeta?.updatedAt || null,
    };

    const eligibility = checkRegistrationEligibility(merged, nowMs);
    merged.canRegisterByTime = eligibility.canRegister;
    merged.deadlinePassed = Boolean(eligibility.deadlinePassed);
    merged.registrationBlockReason = eligibility.reason;

    return merged;
  }

  async function getEventMetadataById(eventId) {
    const row = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: Number(eventId),
        },
      },
    });
    return formatDbMetadataToClient(row);
  }

  async function getEventById(eventId, { nowMs = Date.now() } = {}) {
    const onChainEvent = await blockchainService.getOnChainEvent(eventId);
    if (!onChainEvent) {
      throw ApiError.notFound(`Etkinlik #${eventId} blokzincirde bulunamadı.`);
    }

    const [dbMetadataRow, indexedAttendanceCount] = await Promise.all([
      prisma.eventMetadata.findUnique({
        where: {
          chainId_contractAddress_eventId: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: Number(eventId),
          },
        },
      }),
      prisma.indexedAttendance.count({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: Number(eventId),
        },
      }),
    ]);

    return mergeOnChainAndDbEvent(
      onChainEvent,
      dbMetadataRow,
      indexedAttendanceCount,
      nowMs
    );
  }

  async function listEvents(queryParams = {}, { nowMs = Date.now() } = {}) {
    const [onChainEvents, allMetadataRows, allAttendances] = await Promise.all([
      blockchainService.getAllOnChainEvents(),
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

    const metadataByEventId = new Map();
    for (const row of allMetadataRows) {
      metadataByEventId.set(Number(row.eventId), row);
    }

    const attendanceCountByEventId = new Map();
    for (const att of allAttendances) {
      const evId = Number(att.eventId);
      attendanceCountByEventId.set(
        evId,
        (attendanceCountByEventId.get(evId) || 0) + 1
      );
    }

    let mergedList = onChainEvents.map((onChainEv) =>
      mergeOnChainAndDbEvent(
        onChainEv,
        metadataByEventId.get(onChainEv.id) || null,
        attendanceCountByEventId.get(onChainEv.id) || 0,
        nowMs
      )
    );

    if (queryParams.organizer) {
      const targetOrg = queryParams.organizer.toLowerCase();
      mergedList = mergedList.filter(
        (ev) => ev.organizer.toLowerCase() === targetOrg
      );
    }

    const statusParam = queryParams.status || "ALL";
    let timeFilter = "ALL";
    if (["UPCOMING", "PAST", "CANCELLED"].includes(statusParam)) {
      timeFilter = statusParam;
    }

    let filtered = filterAndSortEvents(mergedList, {
      searchQuery: queryParams.search || "",
      category: queryParams.category || "ALL",
      community: queryParams.community || "ALL",
      timeFilter,
      sortBy: queryParams.sortBy || "NEWEST",
    });

    if (["upcoming", "ongoing", "completed", "cancelled"].includes(statusParam)) {
      filtered = filtered.filter((ev) => ev.status === statusParam);
    }

    const page = Number(queryParams.page) || 1;
    const limit = Number(queryParams.limit) || 20;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const items = filtered.slice(offset, offset + limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      metadataMap: Object.fromEntries(
        allMetadataRows.map((row) => {
          const formatted = formatDbMetadataToClient(row);
          return [formatted.compositeKey, formatted];
        })
      ),
    };
  }

  /**
   * POST /api/events/:eventId/metadata
   * Canlı blokzincir organizatör kontrolüyle yeni metadata oluşturur (veya upsert eder).
   */
  async function createOrSaveEventMetadata(
    eventId,
    validatedInput,
    authenticatedWallet
  ) {
    // Sunucu tarafında canlı blokzincir organizatör doğrulaması
    const onChainEvent = await blockchainService.verifyOnChainOrganizer(
      eventId,
      authenticatedWallet
    );

    const normalizedDates = normalizeMetadataDates(validatedInput);

    const dataPayload = {
      chainId,
      contractAddress: contractAddressNormalized,
      eventId: Number(eventId),
      organizerAddress: onChainEvent.organizerNormalized,
      title: onChainEvent.title,
      capacity: onChainEvent.capacity,
      description: validatedInput.description,
      community: validatedInput.community,
      category: validatedInput.category,
      startAt: normalizedDates.startAt,
      endAt: normalizedDates.endAt,
      registrationDeadline: normalizedDates.registrationDeadline,
      campus: normalizedDates.campus,
      building: normalizedDates.building,
      room: normalizedDates.room,
      posterUrl: validatedInput.posterUrl || "",
      cancelled: Boolean(validatedInput.cancelled),
      cancelReason: validatedInput.cancelReason || "",
    };

    const saved = await prisma.eventMetadata.upsert({
      where: {
        chainId_contractAddress_eventId: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: Number(eventId),
        },
      },
      create: dataPayload,
      update: dataPayload,
    });

    return formatDbMetadataToClient(saved);
  }

  /**
   * PATCH /api/events/:eventId/metadata
   */
  async function updateEventMetadata(
    eventId,
    validatedInput,
    authenticatedWallet
  ) {
    const onChainEvent = await blockchainService.verifyOnChainOrganizer(
      eventId,
      authenticatedWallet
    );

    const normalizedDates = normalizeMetadataDates(validatedInput);

    const updatePayload = {
      organizerAddress: onChainEvent.organizerNormalized,
      title: onChainEvent.title,
      capacity: onChainEvent.capacity,
      description: validatedInput.description,
      community: validatedInput.community,
      category: validatedInput.category,
      startAt: normalizedDates.startAt,
      endAt: normalizedDates.endAt,
      registrationDeadline: normalizedDates.registrationDeadline,
      campus: normalizedDates.campus,
      building: normalizedDates.building,
      room: normalizedDates.room,
      posterUrl: validatedInput.posterUrl || "",
      cancelled: Boolean(validatedInput.cancelled),
      cancelReason: validatedInput.cancelReason || "",
    };

    const saved = await prisma.eventMetadata.upsert({
      where: {
        chainId_contractAddress_eventId: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: Number(eventId),
        },
      },
      create: {
        chainId,
        contractAddress: contractAddressNormalized,
        eventId: Number(eventId),
        ...updatePayload,
      },
      update: updatePayload,
    });

    return formatDbMetadataToClient(saved);
  }

  /**
   * POST /api/events/:eventId/cancel & POST /api/events/:eventId/reactivate
   */
  async function setEventCancelStatus(
    eventId,
    { cancelled, cancelReason = "" },
    authenticatedWallet
  ) {
    const onChainEvent = await blockchainService.verifyOnChainOrganizer(
      eventId,
      authenticatedWallet
    );

    const existing = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: Number(eventId),
        },
      },
    });

    if (existing) {
      const updated = await prisma.eventMetadata.update({
        where: {
          chainId_contractAddress_eventId: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: Number(eventId),
          },
        },
        data: {
          cancelled: Boolean(cancelled),
          cancelReason: cancelled ? cancelReason : "",
        },
      });
      return formatDbMetadataToClient(updated);
    }

    // Henüz özel metadata oluşturulmamış bir etkinlik iptal ediliyorsa varsayılanlarla oluştur
    const created = await prisma.eventMetadata.create({
      data: {
        chainId,
        contractAddress: contractAddressNormalized,
        eventId: Number(eventId),
        organizerAddress: onChainEvent.organizerNormalized,
        title: onChainEvent.title,
        capacity: onChainEvent.capacity,
        description:
          "Bu etkinlik Monad Testnet üzerinde oluşturulmuştur.",
        community: "Kampüs Topluluğu",
        category: "Blockchain",
        startAt: new Date("2026-11-15T14:00:00+03:00"),
        endAt: new Date("2026-11-15T17:00:00+03:00"),
        registrationDeadline: new Date("2026-11-15T13:30:00+03:00"),
        campus: "Merkez Kampüs",
        building: "Mühendislik Fakültesi",
        room: "Konferans Salonu",
        posterUrl: "",
        cancelled: Boolean(cancelled),
        cancelReason: cancelled ? cancelReason : "",
      },
    });

    return formatDbMetadataToClient(created);
  }

  return {
    mergeOnChainAndDbEvent,
    getEventMetadataById,
    getEventById,
    listEvents,
    createOrSaveEventMetadata,
    updateEventMetadata,
    setEventCancelStatus,
  };
}
