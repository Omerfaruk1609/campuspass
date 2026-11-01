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
import {
  QR_TTL_SECONDS,
  QR_VERSION,
  buildCanonicalQrMessage,
  parseQrString,
} from "../../../src/utils/qrVerification.js";
import { ApiError } from "../utils/errors.js";
import { slugifyCommunityName } from "./communityService.js";

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
    communityId: dbRow.communityId || null,
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
export function createEventService({ prisma, blockchainService, notificationService = null }) {
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

    const capacityNum = Number(onChainEvent.capacity ?? 0);
    const registeredNum = Number(onChainEvent.registeredCount ?? 0);
    const remainingCapacity = Math.max(0, capacityNum - registeredNum);
    const isFull = capacityNum > 0 && registeredNum >= capacityNum;
    const fillPercent =
      capacityNum > 0
        ? Math.min(100, Math.round((registeredNum / capacityNum) * 100))
        : 0;

    const merged = {
      id: onChainEvent.id,
      eventId: onChainEvent.id,
      chainId,
      contractAddress,
      compositeKey: buildEventCompositeKey(chainId, contractAddress, onChainEvent.id),
      organizer: onChainEvent.organizer,
      title: onChainEvent.title,
      capacity: capacityNum,
      registeredCount: registeredNum,
      remainingCapacity,
      isFull,
      fillPercent,
      active: onChainEvent.active,
      hasCustomMetadata: Boolean(formattedMeta),
      description: meta.description,
      communityId: meta.communityId || null,
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

    const filtered = filterAndSortEvents(mergedList, {
      searchQuery: queryParams.search || "",
      category: queryParams.category || "ALL",
      community: queryParams.community || "ALL",
      timeFilter: statusParam,
      availability: queryParams.availability || "ALL",
      dateFrom: queryParams.dateFrom || "",
      dateTo: queryParams.dateTo || "",
      sortBy: queryParams.sortBy || "NEWEST",
    });

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

  const usedQrNonces = new Map();

  /**
   * Etkinlik oluşturma ve güncelleme işlemlerinde topluluk seçimini ve organizatörün
   * o topluluk üzerindeki yetkisini (ACTIVE OWNER veya ADMIN) doğrular.
   * İstemciden gelen topluluk adına tek başına asla güvenilmez; kayıtlı topluluk
   * varsa veritabanındaki gerçek kayıt ve üyelik rolü zorunlu tutulur.
   */
  async function resolveAndAuthorizeEventCommunity({
    communityId,
    communityName,
    authenticatedWallet,
  }) {
    const normWallet = String(authenticatedWallet || "").toLowerCase();
    const cleanId = typeof communityId === "string" ? communityId.trim() : "";
    const cleanName = typeof communityName === "string" ? communityName.trim() : "";

    if (cleanId) {
      const community = await prisma.community.findFirst({
        where: {
          OR: [{ id: cleanId }, { slug: cleanId.toLowerCase() }],
          status: "ACTIVE",
        },
      });

      if (!community) {
        throw ApiError.notFound(
          "Seçilen topluluk bulunamadı veya aktif değil.",
          "COMMUNITY_NOT_FOUND"
        );
      }

      const membership = await prisma.communityMember.findFirst({
        where: {
          communityId: community.id,
          walletAddress: normWallet,
          status: "ACTIVE",
        },
      });

      if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
        throw ApiError.forbidden(
          "Bu topluluk adına etkinlik oluşturma veya düzenleme yetkiniz bulunmuyor. Yalnızca topluluğun aktif Kurucu (OWNER) veya Yöneticileri (ADMIN) bu topluluğu seçebilir.",
          "COMMUNITY_UNAUTHORIZED"
        );
      }

      return {
        communityId: community.id,
        community: community.name,
      };
    }

    if (prisma.community && cleanName) {
      const slugCandidate = slugifyCommunityName(cleanName);
      const matchedCommunity = await prisma.community.findFirst({
        where: {
          OR: [
            { name: cleanName },
            ...(slugCandidate ? [{ slug: slugCandidate }] : []),
            { slug: cleanName.toLowerCase() },
          ],
          status: "ACTIVE",
        },
      });

      if (matchedCommunity) {
        const membership = await prisma.communityMember.findFirst({
          where: {
            communityId: matchedCommunity.id,
            walletAddress: normWallet,
            status: "ACTIVE",
          },
        });

        if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
          throw ApiError.forbidden(
            "Bu kayıtlı topluluk adına etkinlik oluşturma veya düzenleme yetkiniz bulunmuyor. Yalnızca aktif OWNER veya ADMIN üyeler bu topluluğu kullanabilir.",
            "COMMUNITY_UNAUTHORIZED"
          );
        }

        return {
          communityId: matchedCommunity.id,
          community: matchedCommunity.name,
        };
      }

      const activeCommunitiesCount = await prisma.community.count({
        where: { status: "ACTIVE" },
      });

      if (activeCommunitiesCount > 0) {
        throw ApiError.badRequest(
          "Düzenleyen topluluk serbest metin olarak girilemez; yetkili olduğunuz kayıtlı bir topluluk seçmelisiniz.",
          "COMMUNITY_SELECTION_REQUIRED"
        );
      }
    }

    if (!cleanName) {
      throw ApiError.badRequest(
        "Düzenleyen topluluk / kulüp seçimi zorunludur.",
        "COMMUNITY_SELECTION_REQUIRED"
      );
    }

    return {
      communityId: null,
      community: cleanName,
    };
  }

  /**
   * POST /api/events/:eventId/metadata
   * Canlı blokzincir organizatör kontrolü ve topluluk yetki kontrolüyle yeni metadata oluşturur.
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

    const resolvedCommunity = await resolveAndAuthorizeEventCommunity({
      communityId: validatedInput.communityId,
      communityName: validatedInput.community,
      authenticatedWallet,
    });

    const normalizedDates = normalizeMetadataDates(validatedInput);

    const dataPayload = {
      chainId,
      contractAddress: contractAddressNormalized,
      eventId: Number(eventId),
      organizerAddress: onChainEvent.organizerNormalized,
      title: onChainEvent.title,
      capacity: onChainEvent.capacity,
      description: validatedInput.description,
      communityId: resolvedCommunity.communityId,
      community: resolvedCommunity.community,
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

    const resolvedCommunity = await resolveAndAuthorizeEventCommunity({
      communityId: validatedInput.communityId,
      communityName: validatedInput.community,
      authenticatedWallet,
    });

    const normalizedDates = normalizeMetadataDates(validatedInput);

    const updatePayload = {
      organizerAddress: onChainEvent.organizerNormalized,
      title: onChainEvent.title,
      capacity: onChainEvent.capacity,
      description: validatedInput.description,
      communityId: resolvedCommunity.communityId,
      community: resolvedCommunity.community,
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

    if (cancelled && notificationService) {
      try {
        const attendees = await prisma.indexedRegistration.findMany({
          where: {
            chainId: Number(chainId),
            contractAddress: contractAddressNormalized,
            eventId: Number(eventId),
          },
          select: { participantAddress: true },
        });
        const recipients = attendees.map((a) => a.participantAddress);
        if (recipients.length > 0) {
          await notificationService.createNotificationsForRecipients({
            recipients,
            type: "EVENT_CANCELLED",
            title: `Etkinlik İptal Edildi: ${onChainEvent.title}`,
            message: cancelReason
              ? `Etkinlik iptal edildi. Gerekçe: ${cancelReason}`
              : `"${onChainEvent.title}" etkinliği organizatör tarafından iptal edildi.`,
            destinationUrl: `/events/${eventId}`,
            metadata: { eventId: Number(eventId), eventTitle: onChainEvent.title, cancelReason },
          });
        }
      } catch {
        // ignore
      }
    }

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


    if (cancelled && notificationService) {
      try {
        const attendees = await prisma.indexedRegistration.findMany({
          where: {
            chainId: Number(chainId),
            contractAddress: contractAddressNormalized,
            eventId: Number(eventId),
          },
          select: { participantAddress: true },
        });
        const recipients = attendees.map((a) => a.participantAddress);
        if (recipients.length > 0) {
          await notificationService.createNotificationsForRecipients({
            recipients,
            type: "EVENT_CANCELLED",
            title: `Etkinlik İptal Edildi: ${onChainEvent.title}`,
            message: cancelReason
              ? `Etkinlik iptal edildi. Gerekçe: ${cancelReason}`
              : `"${onChainEvent.title}" etkinliği organizatör tarafından iptal edildi.`,
            destinationUrl: `/events/${eventId}`,
            metadata: { eventId: Number(eventId), eventTitle: onChainEvent.title, cancelReason },
          });
        }
      } catch {
        // ignore
      }
    }

    return formatDbMetadataToClient(created);
  }

  async function createAnnouncement(eventId, callerWallet, { title, content }) {
    const onChainEvent = await blockchainService.verifyOnChainOrganizer(
      Number(eventId),
      callerWallet
    );

    const cleanTitle = String(title || "").replace(/<[^>]*>?/gm, "").trim().slice(0, 120);
    const cleanContent = String(content || "").replace(/<[^>]*>?/gm, "").trim().slice(0, 2000);

    const announcement = await prisma.announcement.create({
      data: {
        targetType: "EVENT",
        eventId: Number(eventId),
        authorWallet: callerWallet.toLowerCase(),
        title: cleanTitle,
        content: cleanContent,
        recipientCount: 0,
      },
    });

    const attendees = await prisma.indexedRegistration.findMany({
      where: {
        chainId: Number(chainId),
        contractAddress: contractAddressNormalized,
        eventId: Number(eventId),
      },
      select: { participantAddress: true },
    });

    const recipients = [...new Set(attendees.map((a) => a.participantAddress.toLowerCase()))];
    if (recipients.length > 0 && notificationService) {
      try {
        await notificationService.createNotificationsForRecipients({
          recipients,
          type: "EVENT_ANNOUNCEMENT",
          title: `Duyuru: ${cleanTitle}`,
          message: `${onChainEvent.title}: ${cleanContent}`.slice(0, 160),
          destinationUrl: `/events/${eventId}`,
          metadata: {
            eventId: Number(eventId),
            eventTitle: onChainEvent.title,
            announcementId: announcement.id,
          },
        });
      } catch {
        // bildirim hatası ana kaydı engellemez
      }
    }

    const updated = await prisma.announcement.update({
      where: { id: announcement.id },
      data: { recipientCount: recipients.length },
    });

    return updated;
  }

  async function getAnnouncements(eventId, { page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const where = { targetType: "EVENT", eventId: Number(eventId) };

    const [total, items] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Bir etkinliğin yoklama/QR doğrulama yetkisini kontrol eder:
   * Doğrulayıcı cüzdan ya blokzincirdeki etkinlik organizatörü olmalı
   * ya da etkinliğin bağlı olduğu toplulukta ACTIVE OWNER/ADMIN rolünde olmalıdır.
   */
  async function verifyEventAttendanceAuthority(eventId, verifierWallet) {
    if (!verifierWallet || !ethers.isAddress(verifierWallet)) {
      throw ApiError.unauthorized(
        "Katılım doğrulaması için geçerli bir SIWE oturumu gereklidir.",
        "SESSION_REQUIRED"
      );
    }

    const numEventId = Number(eventId);
    const normVerifier = verifierWallet.toLowerCase();

    const onChainEvent = await blockchainService.getOnChainEvent(numEventId);
    if (!onChainEvent) {
      throw ApiError.notFound(
        `Etkinlik #${numEventId} blokzincirde bulunamadı.`,
        "EVENT_NOT_FOUND"
      );
    }

    const dbMeta = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
      },
    });

    let authorizedRole = null;
    if (onChainEvent.organizerNormalized === normVerifier) {
      authorizedRole = "EVENT_ORGANIZER";
    } else if (dbMeta?.communityId && prisma.communityMember) {
      const membership = await prisma.communityMember.findFirst({
        where: {
          communityId: dbMeta.communityId,
          walletAddress: normVerifier,
          status: "ACTIVE",
        },
      });
      if (membership && ["OWNER", "ADMIN"].includes(membership.role)) {
        authorizedRole = `COMMUNITY_${membership.role}`;
      }
    }

    if (!authorizedRole) {
      throw ApiError.forbidden(
        "Bu etkinlik için QR katılım doğrulama yetkiniz bulunmuyor. Yalnızca etkinlik organizatörü veya düzenleyen topluluğun aktif yöneticileri (OWNER/ADMIN) yoklama doğrulayabilir.",
        "ATTENDANCE_VERIFIER_UNAUTHORIZED"
      );
    }

    return {
      onChainEvent,
      dbMeta,
      authorizedRole,
      verifierNormalized: normVerifier,
    };
  }

  /**
   * POST /api/events/:eventId/attendance/verify
   * - SIWE oturum kimliğini ve organizatör/topluluk yetkisini bağımsız doğrular.
   * - Öğrencinin/kullanıcının kendi QR kodunu veya katılımını onaylamasını (self-attendance) kesin olarak reddeder.
   * - İmzalı QR kodun formatını, etkinliğe/ağa/sözleşmeye bağlılığını, EIP-191 imzasını,
   *   TTL/süre sınırını ve tek kullanımlık nonce replay durumunu sunucu tarafında doğrular.
   * - "Kayıt var (registrationExists)" ile "Katılım doğrulandı (attendanceVerified)" durumlarını açıkça ayırır.
   */
  async function verifyQrAndAttendance(
    eventId,
    verifierWallet,
    {
      rawQrString = null,
      participantAddress = null,
      txHash = null,
      consumeNonce = true,
      nowSecondsOverride = null,
    } = {}
  ) {
    const numEventId = Number(eventId);
    const normVerifier = String(verifierWallet || "").toLowerCase();

    let resolvedParticipant = null;
    let parsedTicket = null;

    if (rawQrString && String(rawQrString).trim()) {
      try {
        parsedTicket = parseQrString(String(rawQrString));
      } catch (err) {
        throw ApiError.badRequest(
          err.message || "QR kod verisi bozuk veya desteklenmeyen formatta.",
          "INVALID_QR_PAYLOAD"
        );
      }

      resolvedParticipant = parsedTicket.participant;

      // Kendi QR kodunu okutma (Self-Scan / Self-Attendance) kontrolü — her şeyden önce!
      if (resolvedParticipant.toLowerCase() === normVerifier) {
        throw ApiError.forbidden(
          "Öğrenciler veya organizatörler kendi QR kodlarını doğrulayamaz ve kendi katılımlarını onaylayamaz (Self-attendance engellendi).",
          "SELF_ATTENDANCE_FORBIDDEN"
        );
      }

      // 1. Bağlam (Event / Chain / Contract) kontrolü
      if (parsedTicket.version !== QR_VERSION) {
        throw ApiError.badRequest(
          `Desteklenmeyen QR protokol sürümü: ${parsedTicket.version}`,
          "QR_VERSION_MISMATCH"
        );
      }
      if (Number(parsedTicket.chainId) !== Number(chainId)) {
        throw ApiError.badRequest(
          `QR kod farklı bir blokzincir ağı (Chain ID: ${parsedTicket.chainId}) için üretilmiş.`,
          "QR_CHAIN_MISMATCH"
        );
      }
      if (
        parsedTicket.contractAddress.toLowerCase() !== contractAddressNormalized
      ) {
        throw ApiError.badRequest(
          "QR kod farklı bir akıllı sözleşme adresi için üretilmiş.",
          "QR_CONTRACT_MISMATCH"
        );
      }
      if (Number(parsedTicket.eventId) !== numEventId) {
        throw ApiError.badRequest(
          `Farklı etkinlik QR kodu! Bu QR Etkinlik #${parsedTicket.eventId} için üretilmiş, Etkinlik #${numEventId} için kullanılamaz.`,
          "QR_CROSS_EVENT_REJECTED"
        );
      }

      // 2. Kriptografik EIP-191 imza doğrulaması
      let recoveredAddress = null;
      try {
        const canonicalMsg = buildCanonicalQrMessage(parsedTicket);
        recoveredAddress = ethers.verifyMessage(
          canonicalMsg,
          parsedTicket.signature
        );
      } catch {
        throw ApiError.badRequest(
          "QR kod kriptografik imzası çözümlenemedi.",
          "QR_SIGNATURE_INVALID"
        );
      }

      if (
        !recoveredAddress ||
        recoveredAddress.toLowerCase() !== resolvedParticipant.toLowerCase()
      ) {
        throw ApiError.badRequest(
          "QR imza doğrulaması başarısız! İmza katılımcı cüzdanı ile eşleşmiyor.",
          "QR_SIGNATURE_INVALID"
        );
      }

      // 3. Süre (TTL <= 180 sn) ve son kullanma zamanı kontrolü
      const nowSeconds =
        typeof nowSecondsOverride === "number"
          ? nowSecondsOverride
          : Math.floor(Date.now() / 1000);
      const ttlWindow = parsedTicket.expiresAt - parsedTicket.issuedAt;

      if (parsedTicket.expiresAt <= parsedTicket.issuedAt) {
        throw ApiError.badRequest(
          "QR kod zaman damgaları geçersiz (expiresAt <= issuedAt).",
          "QR_EXPIRED_OR_INVALID_TTL"
        );
      }
      if (ttlWindow > QR_TTL_SECONDS) {
        throw ApiError.badRequest(
          `QR geçerlilik penceresi (${ttlWindow} sn) izin verilen azami süreyi (${QR_TTL_SECONDS} sn) aşıyor.`,
          "QR_EXPIRED_OR_INVALID_TTL"
        );
      }
      if (nowSeconds < parsedTicket.issuedAt - 30) {
        throw ApiError.badRequest(
          "QR kod gelecekteki bir zaman damgasıyla imzalanmış.",
          "QR_EXPIRED_OR_INVALID_TTL"
        );
      }
      if (nowSeconds > parsedTicket.expiresAt) {
        throw ApiError.badRequest(
          "QR kodun geçerlilik süresi dolmuş. Öğrenciden yeni QR üretmesini isteyin.",
          "QR_EXPIRED_OR_INVALID_TTL"
        );
      }

      // 4. Tek kullanımlık nonce replay kontrolü
      const nonceKey = `${chainId}:${contractAddressNormalized}:${numEventId}:${parsedTicket.nonce.toLowerCase()}`;
      const existingNonceUsage = usedQrNonces.get(nonceKey);
      if (existingNonceUsage && (!txHash || existingNonceUsage.txHash)) {
        throw ApiError.conflict(
          "Bu QR kod (nonce) daha önce kullanılmış! Tekrar kullanım (replay) engellendi.",
          "QR_NONCE_REPLAY_DETECTED"
        );
      }
    } else if (participantAddress && ethers.isAddress(participantAddress)) {
      resolvedParticipant = ethers.getAddress(participantAddress);
      if (resolvedParticipant.toLowerCase() === normVerifier) {
        throw ApiError.forbidden(
          "Kullanıcılar kendi katılımlarını onaylayamaz (Self-attendance engellendi).",
          "SELF_ATTENDANCE_FORBIDDEN"
        );
      }
    } else {
      throw ApiError.badRequest(
        "Doğrulama için geçerli bir imzalı QR kod (rawQrString) veya katılımcı adresi (participantAddress) gereklidir.",
        "MISSING_ATTENDANCE_TARGET"
      );
    }

    // Doğrulayıcının bu etkinlik/topluluk için yetkili olduğunu doğrula
    const { onChainEvent, authorizedRole } =
      await verifyEventAttendanceAuthority(numEventId, verifierWallet);

    const normParticipant = resolvedParticipant.toLowerCase();

    // Katılımcı organizatörün kendisi olamaz (self-attendance koruması)
    if (normParticipant === onChainEvent.organizerNormalized) {
      throw ApiError.forbidden(
        "Etkinlik organizatörü kendi etkinliğinde katılımcı olarak kendi yoklamasını onaylayamaz.",
        "SELF_ATTENDANCE_FORBIDDEN"
      );
    }

    // Canlı blokzincir ve indeks durumunu kontrol et
    const [onChainState, existingReg, existingAtt] = await Promise.all([
      blockchainService.getStudentEventOnChainState(numEventId, resolvedParticipant),
      prisma.indexedRegistration.findUnique({
        where: {
          reg_event_participant_unique: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: numEventId,
            participantAddress: normParticipant,
          },
        },
      }),
      prisma.indexedAttendance.findUnique({
        where: {
          att_event_participant_unique: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: numEventId,
            participantAddress: normParticipant,
          },
        },
      }),
    ]);

    const registrationExists = Boolean(onChainState.isRegistered || existingReg);
    const alreadyAttended = Boolean(onChainState.isAttended || existingAtt);

    if (!registrationExists) {
      throw ApiError.badRequest(
        "Bu öğrenci etkinliğe kayıtlı değil (Kayıt bulunamadı).",
        "PARTICIPANT_NOT_REGISTERED"
      );
    }

    // Eğer yeni bir txHash onaylanmıyorsa ve katılım zaten doğrulanmışsa replay olarak reddet
    if (alreadyAttended && !txHash) {
      throw ApiError.conflict(
        "Bu katılımcının etkinlik katılımı zaten doğrulanmış.",
        "ATTENDANCE_ALREADY_VERIFIED"
      );
    }

    if (parsedTicket && consumeNonce) {
      const nonceKey = `${chainId}:${contractAddressNormalized}:${numEventId}:${parsedTicket.nonce.toLowerCase()}`;
      usedQrNonces.set(nonceKey, {
        usedAt: new Date().toISOString(),
        verifier: normVerifier,
        participant: normParticipant,
        txHash: txHash || null,
      });
    }

    let attendanceVerified = Boolean(onChainState.isAttended);
    let indexedAttendanceRecord = existingAtt || null;

    // Eğer işlem hash'i (txHash) gönderildiyse veya zincirde katılım onaylandıysa indeksi senkronize et
    if (txHash || onChainState.isAttended) {
      const cleanTxHash =
        typeof txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(txHash.trim())
          ? txHash.trim().toLowerCase()
          : existingAtt?.transactionHash ||
            `0x${Buffer.from(
              ethers.keccak256(
                ethers.toUtf8Bytes(
                  `att:${chainId}:${contractAddressNormalized}:${numEventId}:${normParticipant}`
                )
              ).slice(2),
              "hex"
            ).toString("hex")}`;

      let currentBlock = 1;
      try {
        currentBlock = await blockchainService.getBlockNumber();
      } catch {
        currentBlock = 1;
      }

      indexedAttendanceRecord = await prisma.$transaction(async (tx) => {
        if (!existingReg) {
          const regTxHash = `0x${Buffer.from(
            ethers.keccak256(
              ethers.toUtf8Bytes(
                `reg:${chainId}:${contractAddressNormalized}:${numEventId}:${normParticipant}`
              )
            ).slice(2),
            "hex"
          ).toString("hex")}`;
          await tx.indexedRegistration.create({
            data: {
              chainId,
              contractAddress: contractAddressNormalized,
              eventId: numEventId,
              participantAddress: normParticipant,
              transactionHash: regTxHash,
              blockNumber: currentBlock,
              logIndex: 0,
            },
          });
        }

        let attRow = await tx.indexedAttendance.findUnique({
          where: {
            att_event_participant_unique: {
              chainId,
              contractAddress: contractAddressNormalized,
              eventId: numEventId,
              participantAddress: normParticipant,
            },
          },
        });

        if (!attRow) {
          attRow = await tx.indexedAttendance.create({
            data: {
              chainId,
              contractAddress: contractAddressNormalized,
              eventId: numEventId,
              participantAddress: normParticipant,
              transactionHash: cleanTxHash,
              blockNumber: currentBlock,
              logIndex: 0,
            },
          });
        }

        const cp = await tx.indexerCheckpoint.findUnique({
          where: {
            chainId_contractAddress: {
              chainId,
              contractAddress: contractAddressNormalized,
            },
          },
        });

        if (!cp || Number(cp.lastProcessedBlock) < currentBlock) {
          await tx.indexerCheckpoint.upsert({
            where: {
              chainId_contractAddress: {
                chainId,
                contractAddress: contractAddressNormalized,
              },
            },
            create: {
              chainId,
              contractAddress: contractAddressNormalized,
              lastProcessedBlock: currentBlock,
            },
            update: {
              lastProcessedBlock: currentBlock,
            },
          });
        }

        return attRow;
      });

      attendanceVerified = true;

      if (notificationService) {
        try {
          await notificationService.createNotification({
            recipientWallet: normParticipant,
            type: "EVENT_ATTENDANCE_VERIFIED",
            title: "Etkinlik Katılımınız Doğrulandı!",
            message: `"${onChainEvent.title}" etkinliğine katılımınız organizatör tarafından doğrulandı. Artık sertifikanızı alabilirsiniz.`,
            destinationUrl: "/profile",
            dedupKey: `att-verified:${chainId}:${numEventId}:${normParticipant}`,
            metadata: {
              eventId: numEventId,
              eventTitle: onChainEvent.title,
              attendanceTxHash: indexedAttendanceRecord.transactionHash,
            },
          });
        } catch {
          // Bildirim hatası ana akışı engellemez
        }
      }
    }

    return {
      verified: true,
      eventId: numEventId,
      eventTitle: onChainEvent.title,
      participantAddress: ethers.getAddress(resolvedParticipant),
      verifierAddress: ethers.getAddress(verifierWallet),
      authorizedRole,
      registrationExists,
      attendanceVerified,
      verificationStage: attendanceVerified
        ? "ATTENDANCE_VERIFIED"
        : "REGISTRATION_VERIFIED_READY_FOR_ONCHAIN_MARK",
      nonce: parsedTicket?.nonce || null,
      attendanceTxHash: indexedAttendanceRecord?.transactionHash || txHash || null,
    };
  }

  /**
   * POST /api/events/:eventId/registrations/sync
   * Öğrenci blokzincir üzerinde etkinliğe kayıt olduktan sonra canlı zincir durumunu
   * doğrulayarak IndexedRegistration kaydını anında senkronize eder.
   */
  async function syncStudentRegistrationFromChain(
    eventId,
    walletAddress,
    { txHash = null } = {}
  ) {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      throw ApiError.badRequest("Geçerli bir cüzdan adresi gereklidir.");
    }

    const numEventId = Number(eventId);
    const checksumWallet = ethers.getAddress(walletAddress);
    const normWallet = checksumWallet.toLowerCase();

    const onChainState = await blockchainService.getStudentEventOnChainState(
      numEventId,
      checksumWallet
    );

    if (!onChainState.isRegistered) {
      throw ApiError.badRequest(
        "Cüzdanın bu etkinlik için blokzincir üzerinde aktif kaydı bulunamadı.",
        "REGISTRATION_NOT_FOUND_ONCHAIN"
      );
    }

    let currentBlock = 1;
    try {
      currentBlock = await blockchainService.getBlockNumber();
    } catch {
      currentBlock = 1;
    }

    const cleanTxHash =
      typeof txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(txHash.trim())
        ? txHash.trim().toLowerCase()
        : `0x${Buffer.from(
            ethers.keccak256(
              ethers.toUtf8Bytes(
                `reg:${chainId}:${contractAddressNormalized}:${numEventId}:${normWallet}`
              )
            ).slice(2),
            "hex"
          ).toString("hex")}`;

    const existingReg = await prisma.indexedRegistration.findUnique({
      where: {
        reg_event_participant_unique: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
          participantAddress: normWallet,
        },
      },
    });

    const record =
      existingReg ||
      (await prisma.indexedRegistration.create({
        data: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
          participantAddress: normWallet,
          transactionHash: cleanTxHash,
          blockNumber: currentBlock,
          logIndex: 0,
        },
      }));

    return {
      synced: true,
      eventId: numEventId,
      participantAddress: checksumWallet,
      registrationExists: true,
      attendanceVerified: Boolean(onChainState.isAttended),
      registrationTxHash: record.transactionHash,
    };
  }

  return {
    mergeOnChainAndDbEvent,
    getEventMetadataById,
    getEventById,
    listEvents,
    createOrSaveEventMetadata,
    updateEventMetadata,
    setEventCancelStatus,
    createAnnouncement,
    getAnnouncements,
    verifyEventAttendanceAuthority,
    verifyQrAndAttendance,
    syncStudentRegistrationFromChain,
  };
}
