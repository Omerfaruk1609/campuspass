import { ethers } from "ethers";
import { ApiError } from "../utils/errors.js";
import { validateAndNormalizeAddress } from "../utils/validation.js";

/**
 * CSV Spreadsheet Formula Injection koruması
 * Hücre başında =, +, -, @, \t, \r bulunursa Excel formül çalıştırmasın diye önüne tek tırnak (') ekler
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function buildCsvRow(fields) {
  return fields
    .map((field) => {
      const sanitized = sanitizeCsvCell(field);
      const escaped = String(sanitized).replace(/"/g, '""');
      return `"${escaped}"`;
    })
    .join(",");
}

export function createOrganizerAnalyticsService({
  prisma,
  blockchainService,
  eventService,
}) {
  const { chainId, contractAddressNormalized } = blockchainService;

  /**
   * Organizatörün yetkili olup olmadığını doğrular ve etkinliklerini çeker.
   * Canlı blokzincir + PostgreSQL senkronizasyonunu kontrol eder.
   */
  async function getOrganizerEvents(organizerWalletAddress, { nowMs = Date.now() } = {}) {
    const { normalizedAddress, checksumAddress } = validateAndNormalizeAddress(
      organizerWalletAddress,
      "Organizatör cüzdan adresi"
    );

    const [onChainEvents, allDbMeta, allIndexedAtts, allIndexedRegs, allCerts, checkpoint] =
      await Promise.all([
        blockchainService.getAllOnChainEvents(),
        prisma.eventMetadata.findMany({
          where: {
            chainId,
            contractAddress: contractAddressNormalized,
            organizerAddress: normalizedAddress,
          },
        }),
        prisma.indexedAttendance.findMany({
          where: {
            chainId,
            contractAddress: contractAddressNormalized,
          },
        }),
        prisma.indexedRegistration.findMany({
          where: {
            chainId,
            contractAddress: contractAddressNormalized,
          },
        }),
        prisma.attendanceCertificate.findMany({
          where: {
            chainId,
            contractAddress: contractAddressNormalized,
            organizerAddress: normalizedAddress,
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
      ]);

    // Organizatöre ait etkinlikleri belirle (Blockchain'deki organizer bilgisi Source of Truth'tur)
    const myOnChainEvents = onChainEvents.filter(
      (ev) => ev.organizerNormalized === normalizedAddress
    );

    const metaMap = new Map(allDbMeta.map((m) => [Number(m.eventId), m]));
    
    // Etkinlik bazında katılım sayıları
    const attCountMap = new Map();
    for (const att of allIndexedAtts) {
      const evId = Number(att.eventId);
      attCountMap.set(evId, (attCountMap.get(evId) || 0) + 1);
    }

    // Etkinlik bazında kayıt sayıları (Indexer)
    const regCountMap = new Map();
    for (const reg of allIndexedRegs) {
      const evId = Number(reg.eventId);
      regCountMap.set(evId, (regCountMap.get(evId) || 0) + 1);
    }

    // Etkinlik bazında sertifika sayıları
    const certCountMap = new Map();
    for (const cert of allCerts) {
      const evId = Number(cert.eventId);
      const cur = certCountMap.get(evId) || { total: 0, active: 0, revoked: 0, reorg: 0 };
      cur.total += 1;
      if (cert.status === "ACTIVE") cur.active += 1;
      else if (cert.status === "REVOKED") cur.revoked += 1;
      else if (cert.status === "INVALIDATED_BY_REORG") cur.reorg += 1;
      certCountMap.set(evId, cur);
    }

    const eventList = myOnChainEvents.map((onChainEv) => {
      const dbMeta = metaMap.get(onChainEv.id);
      const merged = eventService.mergeOnChainAndDbEvent(
        onChainEv,
        dbMeta || null,
        attCountMap.get(onChainEv.id) || 0,
        nowMs
      );

      const uniqueRegs = regCountMap.get(onChainEv.id) || onChainEv.registeredCount || 0;
      const verifiedAtts = attCountMap.get(onChainEv.id) || 0;
      const certData = certCountMap.get(onChainEv.id) || { total: 0, active: 0, revoked: 0, reorg: 0 };

      // Katılım Oranı: attendanceRate = verifiedAttendanceCount / uniqueRegistrationCount * 100
      const attendanceRate =
        uniqueRegs > 0
          ? Math.min(100, Math.round((verifiedAtts / uniqueRegs) * 1000) / 10)
          : 0;

      return {
        ...merged,
        uniqueRegistrationCount: uniqueRegs,
        verifiedAttendanceCount: verifiedAtts,
        unattendedCount: Math.max(0, uniqueRegs - verifiedAtts),
        attendanceRate,
        certificates: certData,
      };
    });

    eventList.sort((a, b) => b.id - a.id);

    return {
      organizerAddress: checksumAddress,
      events: eventList,
      checkpoint: checkpoint
        ? {
            lastProcessedBlock: Number(checkpoint.lastProcessedBlock),
            updatedAt: checkpoint.updatedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * GET /api/organizer/dashboard
   * Organizatörün genel KPI özeti ve analitik metrikleri
   */
  async function getOrganizerDashboard(organizerWalletAddress, { nowMs = Date.now() } = {}) {
    const data = await getOrganizerEvents(organizerWalletAddress, { nowMs });
    const events = data.events;

    let totalCapacity = 0;
    let totalRegistrations = 0;
    let totalVerifiedAttendances = 0;
    let totalCertificates = 0;
    let activeCertificates = 0;
    let upcomingCount = 0;
    let ongoingCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    // Tekil katılımcı ve kayıt olan cüzdan kümesi (Benzersiz kişi sayısı vs Toplam katılım ayrımı)
    const myEventIds = events.map((e) => e.id);
    let uniqueRegisteredStudents = 0;
    let uniqueAttendedStudents = 0;

    if (myEventIds.length > 0) {
      const [allMyRegs, allMyAtts] = await Promise.all([
        prisma.indexedRegistration.findMany({
          where: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: { in: myEventIds },
          },
          select: { participantAddress: true },
        }),
        prisma.indexedAttendance.findMany({
          where: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: { in: myEventIds },
          },
          select: { participantAddress: true },
        }),
      ]);

      uniqueRegisteredStudents = new Set(
        allMyRegs.map((r) => r.participantAddress.toLowerCase())
      ).size;
      uniqueAttendedStudents = new Set(
        allMyAtts.map((a) => a.participantAddress.toLowerCase())
      ).size;
    }

    for (const ev of events) {
      totalCapacity += Number(ev.capacity || 0);
      totalRegistrations += Number(ev.uniqueRegistrationCount || 0);
      totalVerifiedAttendances += Number(ev.verifiedAttendanceCount || 0);
      totalCertificates += ev.certificates.total;
      activeCertificates += ev.certificates.active;

      if (ev.cancelled || ev.status === "cancelled") cancelledCount += 1;
      else if (ev.status === "completed") completedCount += 1;
      else if (ev.status === "ongoing") ongoingCount += 1;
      else upcomingCount += 1;
    }

    const overallAttendanceRate =
      totalRegistrations > 0
        ? Math.min(100, Math.round((totalVerifiedAttendances / totalRegistrations) * 1000) / 10)
        : 0;

    // En son blok kontrolü ve senkronizasyon gecikmesi
    let latestBlock = null;
    let blockLag = 0;
    try {
      latestBlock = await blockchainService.getLatestBlockNumber();
      if (latestBlock !== null && data.checkpoint?.lastProcessedBlock !== undefined) {
        blockLag = Math.max(0, latestBlock - data.checkpoint.lastProcessedBlock);
      }
    } catch {
      // RPC erişilemiyorsa güvenli fallback
    }

    const stats = {
      totalEvents: events.length,
      totalCapacity,
      totalRegistrations,
      totalVerifiedAttendances,
      uniqueRegisteredStudents,
      uniqueAttendedStudents,
      overallAttendanceRate,
      totalCertificates,
      activeCertificates,
      upcomingCount,
      ongoingCount,
      completedCount,
      cancelledCount,
    };

    const syncInfo = {
      lastProcessedBlock: data.checkpoint?.lastProcessedBlock ?? null,
      checkpointBlock: data.checkpoint?.lastProcessedBlock ?? null,
      latestChainBlock: latestBlock,
      headBlock: latestBlock,
      blockLag,
      lagBlocks: blockLag,
      isSynced: blockLag <= 2,
      lastSyncAt: data.checkpoint?.updatedAt ?? null,
    };

    return {
      organizerAddress: data.organizerAddress,
      stats,
      kpis: stats,
      syncStatus: syncInfo,
      indexerStatus: syncInfo,
      events: events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        community: ev.community,
        category: ev.category,
        date: ev.date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        startAt: ev.startAt,
        status: ev.status,
        statusLabel: ev.statusLabel,
        capacity: ev.capacity,
        registeredCount: ev.uniqueRegistrationCount,
        uniqueRegistrationCount: ev.uniqueRegistrationCount,
        verifiedAttendanceCount: ev.verifiedAttendanceCount,
        attendanceRate: ev.attendanceRate,
        certificateCount: ev.certificates.total,
        activeCertificates: ev.certificates.active,
      })),
    };
  }

  /**
   * GET /api/organizer/events/:eventId/analytics
   * Belirli bir etkinliğe ait ayrıntılı yönetim ve katılım analitiği
   */
  async function getEventAnalytics(eventId, organizerWalletAddress, { nowMs = Date.now() } = {}) {
    const numEventId = Number(eventId);
    if (!Number.isSafeInteger(numEventId) || numEventId <= 0) {
      throw ApiError.badRequest("Geçersiz etkinlik kimliği (eventId).");
    }

    // Yetki kontrolü: Yalnızca etkinlik organizatörü erişebilir
    const onChainEvent = await blockchainService.verifyOnChainOrganizer(
      numEventId,
      organizerWalletAddress
    );

    const [dbMeta, indexedRegs, indexedAtts, certs, checkpoint] = await Promise.all([
      prisma.eventMetadata.findUnique({
        where: {
          chainId_contractAddress_eventId: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: numEventId,
          },
        },
      }),
      prisma.indexedRegistration.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
        orderBy: { blockNumber: "asc" },
      }),
      prisma.indexedAttendance.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
        orderBy: { blockNumber: "asc" },
      }),
      prisma.attendanceCertificate.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
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
    ]);

    const merged = eventService.mergeOnChainAndDbEvent(
      onChainEvent,
      dbMeta || null,
      indexedAtts.length,
      nowMs
    );

    const uniqueRegs = indexedRegs.length;
    const verifiedAtts = indexedAtts.length;
    const attendanceRate =
      uniqueRegs > 0
        ? Math.min(100, Math.round((verifiedAtts / uniqueRegs) * 100))
        : 0;

    const certStats = {
      total: certs.length,
      active: certs.filter((c) => c.status === "ACTIVE").length,
      revoked: certs.filter((c) => c.status === "REVOKED").length,
      invalidatedByReorg: certs.filter((c) => c.status === "INVALIDATED_BY_REORG").length,
    };

    return {
      event: merged,
      metrics: {
        capacity: merged.capacity,
        registeredCount: uniqueRegs,
        totalRegistered: uniqueRegs,
        verifiedAttendanceCount: verifiedAtts,
        verifiedAttended: verifiedAtts,
        unattendedCount: Math.max(0, uniqueRegs - verifiedAtts),
        attendanceRate,
        occupancyRate:
          merged.capacity > 0
            ? Math.min(100, Math.round((uniqueRegs / merged.capacity) * 100))
            : 0,
        capacityOccupancyRate:
          merged.capacity > 0
            ? Math.min(100, Math.round((uniqueRegs / merged.capacity) * 100))
            : 0,
        dropOffRate:
          uniqueRegs > 0
            ? Math.max(0, Math.round(((uniqueRegs - verifiedAtts) / uniqueRegs) * 100))
            : 0,
        certificateCount: certStats.total,
        certificateRate:
          verifiedAtts > 0
            ? Math.min(100, Math.round((certStats.active / verifiedAtts) * 100))
            : 0,
        certificates: certStats,
      },
      checkpoint: checkpoint
        ? {
            lastProcessedBlock: Number(checkpoint.lastProcessedBlock),
            updatedAt: checkpoint.updatedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * GET /api/organizer/events/:eventId/participants
   * Sayfalanmış, filtrelenebilir katılımcı listesi
   */
  async function getEventParticipants(
    eventId,
    organizerWalletAddress,
    { page = 1, limit = 20, search = "", status = "ALL" } = {}
  ) {
    const numEventId = Number(eventId);
    if (!Number.isSafeInteger(numEventId) || numEventId <= 0) {
      throw ApiError.badRequest("Geçersiz etkinlik kimliği (eventId).");
    }

    // Yetki kontrolü: Yalnızca etkinlik organizatörü erişebilir
    await blockchainService.verifyOnChainOrganizer(numEventId, organizerWalletAddress);

    const [indexedRegs, indexedAtts, certs] = await Promise.all([
      prisma.indexedRegistration.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
        orderBy: { blockNumber: "asc" },
      }),
      prisma.indexedAttendance.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
      }),
      prisma.attendanceCertificate.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
      }),
    ]);

    const attMap = new Map(indexedAtts.map((a) => [a.participantAddress.toLowerCase(), a]));
    const certMap = new Map(certs.map((c) => [c.participantAddress.toLowerCase(), c]));

    let participants = indexedRegs.map((reg) => {
      const pAddr = reg.participantAddress.toLowerCase();
      const att = attMap.get(pAddr);
      const cert = certMap.get(pAddr);

      const isAttended = Boolean(att);
      const hasCertificate = Boolean(cert && cert.status === "ACTIVE");

      return {
        walletAddress: ethers.getAddress(reg.participantAddress),
        participantAddress: ethers.getAddress(reg.participantAddress),
        normalizedAddress: pAddr,
        registrationTxHash: reg.transactionHash,
        registrationBlockNumber: Number(reg.blockNumber),
        registeredAt: reg.createdAt.toISOString(),
        isAttended,
        attendanceTxHash: att ? att.transactionHash : null,
        attendanceBlockNumber: att ? Number(att.blockNumber) : null,
        attendedAt: att ? att.createdAt.toISOString() : null,
        certificateId: cert ? cert.certificateId : null,
        certificateStatus: cert ? cert.status : null,
        hasCertificate,
      };
    });

    // Filtreleme (Arama)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      participants = participants.filter(
        (p) =>
          p.normalizedAddress.includes(q) ||
          p.participantAddress.toLowerCase().includes(q) ||
          (p.certificateId && p.certificateId.toLowerCase().includes(q))
      );
    }

    // Durum Filtresi
    if (status === "ATTENDED") {
      participants = participants.filter((p) => p.isAttended);
    } else if (status === "REGISTERED_ONLY") {
      participants = participants.filter((p) => !p.isAttended);
    } else if (status === "CERTIFIED") {
      participants = participants.filter((p) => p.hasCertificate);
    }

    const total = participants.length;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const offset = (safePage - 1) * safeLimit;
    const items = participants.slice(offset, offset + safeLimit);

    return {
      eventId: numEventId,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalCount: total,
        totalPages,
        hasMore: safePage < totalPages,
      },
      items,
      participants: items,
    };
  }

  /**
   * GET /api/organizer/analytics/timeseries
   * Zaman serisi analitiği (Zaman içinde kayıt ve katılım eğilimleri)
   */
  async function getTimeseriesAnalytics(organizerWalletAddress) {
    const data = await getOrganizerEvents(organizerWalletAddress);
    const events = data.events;

    // Etkinlik bazında karşılaştırmalı seriler
    const eventComparisons = events.map((ev) => ({
      eventId: ev.id,
      title: ev.title.length > 25 ? `${ev.title.slice(0, 24)}…` : ev.title,
      fullTitle: ev.title,
      date: ev.date,
      startAt: ev.startAt,
      category: ev.category,
      community: ev.community,
      registeredCount: ev.uniqueRegistrationCount,
      attendedCount: ev.verifiedAttendanceCount,
      attendanceRate: ev.attendanceRate,
      certificateCount: ev.certificates.active,
    }));

    const eventsSeries = eventComparisons.map((ev) => ({
      id: ev.eventId,
      ...ev,
      verifiedAttendanceCount: ev.attendedCount,
    }));

    return {
      organizerAddress: data.organizerAddress,
      totalEvents: events.length,
      eventComparisons,
      eventsSeries,
    };
  }

  /**
   * GET /api/organizer/events/:eventId/export
   * CSV Rapor İndirme (Formula injection korumalı, UTF-8 BOM destekli)
   */
  async function exportEventCsv(eventId, organizerWalletAddress, { type = "participants" } = {}) {
    const numEventId = Number(eventId);
    if (!Number.isSafeInteger(numEventId) || numEventId <= 0) {
      throw ApiError.badRequest("Geçersiz etkinlik kimliği (eventId).");
    }

    // Yetki kontrolü: Yalnızca etkinlik organizatörü indirebilir
    const onChainEvent = await blockchainService.verifyOnChainOrganizer(
      numEventId,
      organizerWalletAddress
    );

    const [dbMeta, indexedRegs, indexedAtts, certs] = await Promise.all([
      prisma.eventMetadata.findUnique({
        where: {
          chainId_contractAddress_eventId: {
            chainId,
            contractAddress: contractAddressNormalized,
            eventId: numEventId,
          },
        },
      }),
      prisma.indexedRegistration.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
        orderBy: { blockNumber: "asc" },
      }),
      prisma.indexedAttendance.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
      }),
      prisma.attendanceCertificate.findMany({
        where: {
          chainId,
          contractAddress: contractAddressNormalized,
          eventId: numEventId,
        },
      }),
    ]);

    const attMap = new Map(indexedAtts.map((a) => [a.participantAddress.toLowerCase(), a]));
    const certMap = new Map(certs.map((c) => [c.participantAddress.toLowerCase(), c]));

    const lines = [];
    // Excel'in Türkçe karakterleri düzgün tanıması için UTF-8 BOM
    const BOM = "\uFEFF";

    if (type === "summary") {
      lines.push(buildCsvRow(["Alan", "Deger"]));
      lines.push(buildCsvRow(["Etkinlik ID", onChainEvent.id]));
      lines.push(buildCsvRow(["Baslik", onChainEvent.title]));
      lines.push(buildCsvRow(["Organizator", onChainEvent.organizer]));
      lines.push(buildCsvRow(["Topluluk", dbMeta?.community || "Kampus Toplulugu"]));
      lines.push(buildCsvRow(["Kategori", dbMeta?.category || "Genel"]));
      lines.push(buildCsvRow(["Tarih", dbMeta?.startAt ? new Date(dbMeta.startAt).toISOString() : ""]));
      lines.push(buildCsvRow(["Kontenjan", onChainEvent.capacity]));
      lines.push(buildCsvRow(["Kayitli Sayisi", indexedRegs.length]));
      lines.push(buildCsvRow(["Dogrulanmis Katilim", indexedAtts.length]));
      const rate = indexedRegs.length > 0 ? (indexedAtts.length / indexedRegs.length) * 100 : 0;
      lines.push(buildCsvRow(["Katilim Orani (%)", rate.toFixed(1)]));
      lines.push(buildCsvRow(["Aktif Sertifika Sayisi", certs.filter((c) => c.status === "ACTIVE").length]));
    } else {
      // Katılımcı listesi CSV
      lines.push(
        buildCsvRow([
          "Sira",
          "Katilimci Cuzdan Adresi",
          "Kayit Durumu",
          "Kayit Tarihi",
          "Kayit Tx Hash",
          "Katilim Durumu",
          "Katilim Tarihi",
          "Katilim Tx Hash",
          "Sertifika ID",
          "Sertifika Durumu",
        ])
      );

      indexedRegs.forEach((reg, idx) => {
        const pAddr = reg.participantAddress.toLowerCase();
        const att = attMap.get(pAddr);
        const cert = certMap.get(pAddr);

        lines.push(
          buildCsvRow([
            idx + 1,
            ethers.getAddress(reg.participantAddress),
            "Kayitli",
            reg.createdAt.toISOString(),
            reg.transactionHash,
            att ? "Katildi" : "Katilmadi",
            att ? att.createdAt.toISOString() : "",
            att ? att.transactionHash : "",
            cert ? cert.certificateId : "",
            cert ? cert.status : "",
          ])
        );
      });
    }

    const csvContent = BOM + lines.join("\r\n");
    const fileName = `CampusPass_Etkinlik_${numEventId}_${type}_${Date.now()}.csv`;

    return {
      csvContent,
      fileName,
    };
  }

  return {
    getOrganizerEvents,
    getOrganizerDashboard,
    getEventAnalytics,
    getEventParticipants,
    getTimeseriesAnalytics,
    exportEventCsv,
  };
}
