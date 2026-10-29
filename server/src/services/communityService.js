import { ethers } from "ethers";
import { ApiError } from "../utils/errors.js";

export const COMMUNITY_ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
};

export const MEMBERSHIP_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  REMOVED: "REMOVED",
};

export function slugifyCommunityName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeString(str, maxLen = 2000) {
  if (typeof str !== "string") return "";
  return str
    .replace(/<[^>]*>?/gm, "") // basit HTML tag temizliği
    .trim()
    .slice(0, maxLen);
}

function validateUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw ApiError.badRequest("Geçerli bir web adresi giriniz (http:// veya https://).", "INVALID_URL");
  }
  return trimmed;
}

function validateEmail(email) {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    throw ApiError.badRequest("Geçerli bir e-posta adresi giriniz.", "INVALID_EMAIL");
  }
  return trimmed;
}

export function createCommunityService({ prisma, notificationService = null }) {
  if (!prisma) {
    throw new Error("createCommunityService: prisma dependency is required.");
  }

  /**
   * Topluluğu ID veya slug üzerinden bulur.
   */

  async function notifyCommunityAdmins(community, { type, title, message, metadata = {} }) {
    if (!notificationService) return;
    try {
      const admins = await prisma.communityMember.findMany({
        where: {
          communityId: community.id,
          role: { in: [COMMUNITY_ROLES.OWNER, COMMUNITY_ROLES.ADMIN] },
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        select: { walletAddress: true },
      });
      const recipients = admins.map((a) => a.walletAddress);
      if (recipients.length > 0) {
        await notificationService.createNotificationsForRecipients({
          recipients,
          type,
          title,
          message,
          destinationUrl: `/communities/${community.slug}/manage`,
          metadata: { communityId: community.id, communitySlug: community.slug, ...metadata },
        });
      }
    } catch {
      // Bildirim hatalari ana akisi engellemez
    }
  }

  async function notifyMember(recipientWallet, { type, title, message, destinationUrl, metadata = {} }) {
    if (!notificationService) return;
    try {
      await notificationService.createNotification({
        recipientWallet,
        type,
        title,
        message,
        destinationUrl,
        metadata,
      });
    } catch {
      // Bildirim hatalari ana akisi engellemez
    }
  }

  async function findCommunityByIdOrSlug(idOrSlug) {
    if (!idOrSlug || typeof idOrSlug !== "string") return null;
    const clean = idOrSlug.trim();
    return prisma.community.findFirst({
      where: {
        OR: [{ id: clean }, { slug: clean.toLowerCase() }],
      },
    });
  }

  /**
   * Topluluk Oluşturma
   */
  async function createCommunity({ walletAddress, data }) {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      throw ApiError.badRequest("Geçersiz cüzdan adresi.", "INVALID_WALLET_ADDRESS");
    }

    const rawName = String(data?.name || "").trim();
    if (!rawName || rawName.length < 3 || rawName.length > 60) {
      throw ApiError.badRequest("Topluluk adı 3 ile 60 karakter arasında olmalıdır.", "INVALID_COMMUNITY_NAME");
    }

    const cleanName = sanitizeString(rawName, 60);
    const baseSlug = slugifyCommunityName(cleanName);
    if (!baseSlug || baseSlug.length < 2) {
      throw ApiError.badRequest("Geçerli bir topluluk adı ve URL bağlantısı üretilemedi.", "INVALID_SLUG");
    }

    // Benzersizlik kontrolü (Slug çakışmasında -2, -3 ile güvenli türetme)
    let slug = baseSlug;
    let suffix = 2;
    while (await prisma.community.findFirst({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const universityName = sanitizeString(data?.universityName || "Monad Üniversitesi", 80) || "Monad Üniversitesi";
    const category = sanitizeString(data?.category || "Genel", 40) || "Genel";
    const description = sanitizeString(data?.description || "", 2000);
    const shortDescription = sanitizeString(data?.shortDescription || "", 250);
    const logoUrl = validateUrl(data?.logoUrl);
    const coverImageUrl = validateUrl(data?.coverImageUrl);
    const websiteUrl = validateUrl(data?.websiteUrl);
    const contactEmail = validateEmail(data?.contactEmail);

    const normWallet = walletAddress.toLowerCase();

    // Atomik işlem: Topluluk oluşturulur ve oluşturan kişi doğrudan OWNER (Sahip) atanır
    return prisma.$transaction(async (tx) => {
      const community = await tx.community.create({
        data: {
          name: cleanName,
          slug,
          universityName,
          category,
          description,
          shortDescription,
          logoUrl,
          coverImageUrl,
          websiteUrl,
          contactEmail,
          createdByWallet: normWallet,
          leadOrganizerAddress: normWallet,
          status: "ACTIVE",
          verified: false,
        },
      });

      const member = await tx.communityMember.create({
        data: {
          communityId: community.id,
          walletAddress: normWallet,
          role: COMMUNITY_ROLES.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
          joinedAt: new Date(),
        },
      });

      return {
        ...community,
        membersCount: 1,
        eventsCount: 0,
        currentUserRole: COMMUNITY_ROLES.OWNER,
        currentUserStatus: MEMBERSHIP_STATUS.ACTIVE,
        myRole: COMMUNITY_ROLES.OWNER,
        stats: {
          memberCount: 1,
          eventCount: 0,
        },
        owner: member,
      };
    });
  }

  /**
   * Topluluk Duyurusu Oluşturma
   */
  async function createAnnouncement(idOrSlug, callerWallet, { title, content }) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }
    await requireRole(community.id, callerWallet, [COMMUNITY_ROLES.OWNER, COMMUNITY_ROLES.ADMIN]);

    const cleanTitle = sanitizeString(title, 120);
    const cleanContent = sanitizeString(content, 2000);

    const announcement = await prisma.announcement.create({
      data: {
        targetType: "COMMUNITY",
        communityId: community.id,
        authorWallet: callerWallet.toLowerCase(),
        title: cleanTitle,
        content: cleanContent,
        recipientCount: 0,
      },
    });

    const activeMembers = await prisma.communityMember.findMany({
      where: {
        communityId: community.id,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      select: { walletAddress: true },
    });

    const recipients = activeMembers.map((m) => m.walletAddress);
    if (recipients.length > 0 && notificationService) {
      try {
        await notificationService.createNotificationsForRecipients({
          recipients,
          type: "COMMUNITY_ANNOUNCEMENT",
          title: `Duyuru: ${cleanTitle}`,
          message: `${community.name}: ${cleanContent}`.slice(0, 160),
          destinationUrl: `/communities/${community.slug}`,
          metadata: {
            communityId: community.id,
            communitySlug: community.slug,
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

  /**
   * Topluluk Duyurularını Listeleme
   */
  async function getAnnouncements(idOrSlug, { page = 1, limit = 20 } = {}) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * take;

    const where = {
      targetType: "COMMUNITY",
      communityId: community.id,
    };

    const [total, items] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      items,
      pagination: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Toplulukları Arama ve Listeleme (Keşif)
   */
  async function getCommunities({ search = "", category = "ALL", university = "ALL", page = 1, limit = 20 } = {}) {
    const pageNum = Math.max(1, Number(page) || 1);
    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * take;

    const where = { status: "ACTIVE" };

    if (category && category !== "ALL") {
      where.category = category;
    }
    if (university && university !== "ALL") {
      where.universityName = university;
    }

    const cleanSearch = String(search || "").trim();
    if (cleanSearch) {
      where.OR = [
        { name: { contains: cleanSearch, mode: "insensitive" } },
        { description: { contains: cleanSearch, mode: "insensitive" } },
        { shortDescription: { contains: cleanSearch, mode: "insensitive" } },
        { universityName: { contains: cleanSearch, mode: "insensitive" } },
      ];
    }

    const [total, communities] = await Promise.all([
      prisma.community.count({ where }),
      prisma.community.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Her topluluk için aktif üye ve ilişkili etkinlik sayısını hesapla
    const communityIds = communities.map((c) => c.id);
    const [allMembers, allEvents] = await Promise.all([
      prisma.communityMember.findMany({
        where: {
          communityId: { in: communityIds },
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        select: { communityId: true },
      }),
      prisma.eventMetadata.findMany({
        where: {
          communityId: { in: communityIds },
          cancelled: false,
        },
        select: { communityId: true },
      }),
    ]);

    const memberCountMap = new Map();
    for (const m of allMembers) {
      memberCountMap.set(m.communityId, (memberCountMap.get(m.communityId) || 0) + 1);
    }

    const eventCountMap = new Map();
    for (const e of allEvents) {
      eventCountMap.set(e.communityId, (eventCountMap.get(e.communityId) || 0) + 1);
    }

    const items = communities.map((comm) => ({
      ...comm,
      membersCount: memberCountMap.get(comm.id) || 0,
      eventsCount: eventCountMap.get(comm.id) || 0,
    }));

    return {
      items,
      meta: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Tekil Topluluk Profili Getirme
   */
  async function getCommunityProfile(idOrSlug, callerWallet = null) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("İlgili topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    const [membersCount, eventsCount] = await Promise.all([
      prisma.communityMember.count({
        where: {
          communityId: community.id,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
      }),
      prisma.eventMetadata.count({
        where: {
          communityId: community.id,
          cancelled: false,
        },
      }),
    ]);

    let callerMembership = null;
    if (callerWallet && ethers.isAddress(callerWallet)) {
      callerMembership = await prisma.communityMember.findFirst({
        where: {
          communityId: community.id,
          walletAddress: callerWallet.toLowerCase(),
        },
      });
    }

    const myRole = callerMembership ? callerMembership.role : "NON-MEMBER";

    return {
      ...community,
      membersCount,
      eventsCount,
      myRole,
      stats: {
        memberCount: membersCount,
        eventCount: eventsCount,
      },
      currentUserMembership: callerMembership
        ? {
            role: callerMembership.role,
            status: callerMembership.status,
            joinedAt: callerMembership.joinedAt,
          }
        : null,
    };
  }

  /**
   * Topluluk Etkinlikleri
   */
  async function getCommunityEvents(idOrSlug, { page = 1, limit = 20 } = {}) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * take;

    const where = {
      OR: [
        { communityId: community.id },
        { community: community.name },
      ],
      cancelled: false,
    };

    const [total, events] = await Promise.all([
      prisma.eventMetadata.count({ where }),
      prisma.eventMetadata.findMany({
        where,
        skip,
        take,
        orderBy: { startAt: "desc" },
      }),
    ]);

    return {
      items: events,
      meta: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Topluluğa Katılma Başvurusu (Join Request)
   */
  async function joinCommunity(idOrSlug, walletAddress) {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      throw ApiError.badRequest("Geçerli bir cüzdan adresi gereklidir.", "INVALID_WALLET_ADDRESS");
    }
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community || community.status !== "ACTIVE") {
      throw ApiError.notFound("Topluluk bulunamadı veya aktif değil.", "COMMUNITY_NOT_FOUND");
    }

    const normWallet = walletAddress.toLowerCase();
    const existing = await prisma.communityMember.findFirst({
      where: {
        communityId: community.id,
        walletAddress: normWallet,
      },
    });

    if (existing) {
      if (existing.status === MEMBERSHIP_STATUS.ACTIVE) {
        throw ApiError.conflict("Zaten bu topluluğun aktif bir üyesisiniz.", "ALREADY_ACTIVE_MEMBER");
      }
      if (existing.status === MEMBERSHIP_STATUS.PENDING) {
        throw ApiError.conflict("Üyelik başvurunuz zaten değerlendirme aşamasındadır.", "MEMBERSHIP_PENDING");
      }
      // REJECTED veya REMOVED ise tekrar başvuruya izin ver
      const updated = await prisma.communityMember.update({
        where: { id: existing.id },
        data: {
          status: MEMBERSHIP_STATUS.PENDING,
          role: COMMUNITY_ROLES.MEMBER,
          joinedAt: null,
          updatedAt: new Date(),
        },
      });
      return {
        success: true,
        message: "Topluluk üyelik başvurunuz başarıyla alındı.",
        membership: updated,
      };
    }

    const created = await prisma.communityMember.create({
      data: {
        communityId: community.id,
        walletAddress: normWallet,
        role: COMMUNITY_ROLES.MEMBER,
        status: MEMBERSHIP_STATUS.PENDING,
      },
    });

    return {
      success: true,
      message: "Topluluk üyelik başvurunuz oluşturuldu.",
      ...created,
      membership: created,
    };
  }

  /**
   * Topluluktan Ayrılma (Leave Community)
   */
  async function leaveCommunity(idOrSlug, walletAddress) {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      throw ApiError.badRequest("Geçersiz cüzdan adresi.", "INVALID_WALLET_ADDRESS");
    }
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    const normWallet = walletAddress.toLowerCase();
    const member = await prisma.communityMember.findFirst({
      where: {
        communityId: community.id,
        walletAddress: normWallet,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });

    if (!member) {
      throw ApiError.badRequest("Bu topluluğun aktif bir üyesi değilsiniz.", "NOT_MEMBER");
    }

    // Topluluğun tek OWNER'ı ayrılamaz (Orphan topluluk önlemi)
    if (member.role === COMMUNITY_ROLES.OWNER) {
      const otherOwners = await prisma.communityMember.count({
        where: {
          communityId: community.id,
          role: COMMUNITY_ROLES.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
          id: { not: member.id },
        },
      });
      if (otherOwners === 0) {
        throw ApiError.badRequest(
          "Topluluğun tek kurucusu/sahibi topluluktan ayrılamaz. Lütfen önce başka bir üyeye sahiplik devredin.",
          "CANNOT_ORPHAN_COMMUNITY"
        );
      }
    }

    await prisma.communityMember.update({
      where: { id: member.id },
      data: {
        status: MEMBERSHIP_STATUS.REMOVED,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Topluluk üyeliğinden başarıyla ayrıldınız.",
    };
  }

  /**
   * Yetki Doğrulama Yardımcısı (RBAC)
   */
  async function requireRole(communityId, callerWallet, allowedRoles = [COMMUNITY_ROLES.OWNER, COMMUNITY_ROLES.ADMIN]) {
    if (!callerWallet || !ethers.isAddress(callerWallet)) {
      throw ApiError.unauthorized("Cüzdan kimlik doğrulaması gereklidir.", "UNAUTHORIZED");
    }

    const member = await prisma.communityMember.findFirst({
      where: {
        communityId,
        walletAddress: callerWallet.toLowerCase(),
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      throw ApiError.forbidden("Bu işlem için yetkiniz bulunmuyor.", "FORBIDDEN");
    }

    return member;
  }

  /**
   * Topluluk Üyelerini Listeleme (Yönetici)
   */
  async function getCommunityMembers(idOrSlug, callerWallet, { status = "ACTIVE", search = "", page = 1, limit = 50 } = {}) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    await requireRole(community.id, callerWallet);

    const pageNum = Math.max(1, Number(page) || 1);
    const take = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * take;

    const where = {
      communityId: community.id,
      status: status || MEMBERSHIP_STATUS.ACTIVE,
    };

    const cleanSearch = String(search || "").trim();
    if (cleanSearch) {
      where.walletAddress = { contains: cleanSearch.toLowerCase(), mode: "insensitive" };
    }

    const [total, items] = await Promise.all([
      prisma.communityMember.count({ where }),
      prisma.communityMember.findMany({
        where,
        skip,
        take,
        orderBy: [{ role: "asc" }, { joinedAt: "desc" }],
      }),
    ]);

    return {
      items,
      meta: {
        page: pageNum,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Bekleyen Başvuruları Listeleme
   */
  async function getCommunityApplications(idOrSlug, callerWallet, { page = 1, limit = 50 } = {}) {
    return getCommunityMembers(idOrSlug, callerWallet, {
      status: MEMBERSHIP_STATUS.PENDING,
      page,
      limit,
    });
  }

  /**
   * Başvuru Onaylama
   */
  async function approveApplication(idOrSlug, memberId, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    await requireRole(community.id, callerWallet);

    const target = await prisma.communityMember.findFirst({
      where: { id: memberId, communityId: community.id },
    });

    if (!target || target.status !== MEMBERSHIP_STATUS.PENDING) {
      throw ApiError.badRequest("Onaylanacak beklemede bir başvuru bulunamadı.", "APPLICATION_NOT_FOUND");
    }

    const updated = await prisma.communityMember.update({
      where: { id: target.id },
      data: {
        status: MEMBERSHIP_STATUS.ACTIVE,
        joinedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (notificationService) {
      try {
        await notificationService.createNotification({
          recipientWallet: target.walletAddress,
          type: "COMMUNITY_MEMBERSHIP_APPROVED",
          title: "Topluluk Üyeliğiniz Onaylandı!",
          message: `"${community.name}" topluluğuna katılım başvurunuz onaylandı.`,
          destinationUrl: `/communities/${community.slug}`,
          metadata: {
            communityId: community.id,
            communitySlug: community.slug,
            membershipId: target.id,
          },
        });
      } catch {
        // bildirim hatası ana işlemi engellemez
      }
    }

    return {
      success: true,
      message: "Başvuru onaylandı, üyelik aktifleştirildi.",
      ...updated,
      member: updated,
    };
  }

  /**
   * Başvuru Reddetme
   */
  async function rejectApplication(idOrSlug, memberId, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    await requireRole(community.id, callerWallet);

    const target = await prisma.communityMember.findFirst({
      where: { id: memberId, communityId: community.id },
    });

    if (!target || target.status !== MEMBERSHIP_STATUS.PENDING) {
      throw ApiError.badRequest("Reddedilecek beklemede bir başvuru bulunamadı.", "APPLICATION_NOT_FOUND");
    }

    const updated = await prisma.communityMember.update({
      where: { id: target.id },
      data: {
        status: MEMBERSHIP_STATUS.REJECTED,
        updatedAt: new Date(),
      },
    });

    if (notificationService) {
      try {
        await notificationService.createNotification({
          recipientWallet: target.walletAddress,
          type: "COMMUNITY_MEMBERSHIP_REJECTED",
          title: "Topluluk Başvurusu Sonucu",
          message: `"${community.name}" topluluğuna yaptığınız başvuru onaylanmadı.`,
          destinationUrl: `/communities/${community.slug}`,
          metadata: {
            communityId: community.id,
            communitySlug: community.slug,
            membershipId: target.id,
          },
        });
      } catch {
        // bildirim hatası ana işlemi engellemez
      }
    }

    return {
      success: true,
      message: "Başvuru reddedildi.",
      ...updated,
      member: updated,
    };
  }

  /**
   * Üyeyi Çıkarma (Remove Member)
   */
  async function removeMember(idOrSlug, memberId, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    const callerMember = await requireRole(community.id, callerWallet);

    const target = await prisma.communityMember.findFirst({
      where: { id: memberId, communityId: community.id },
    });

    if (!target) {
      throw ApiError.notFound("Çıkarılacak üye bulunamadı.", "MEMBER_NOT_FOUND");
    }

    // Güvenlik kuralları:
    // 1. ADMIN, OWNER'ı çıkaramaz
    if (callerMember.role === COMMUNITY_ROLES.ADMIN && target.role === COMMUNITY_ROLES.OWNER) {
      throw ApiError.forbidden("Yöneticiler topluluk sahibini çıkaramaz.", "CANNOT_REMOVE_OWNER");
    }
    // 2. ADMIN, başka bir ADMIN'i çıkaramaz (yalnızca OWNER yapabilir)
    if (callerMember.role === COMMUNITY_ROLES.ADMIN && target.role === COMMUNITY_ROLES.ADMIN) {
      throw ApiError.forbidden("Yöneticiler başka yöneticileri çıkaramaz. Yalnızca topluluk sahibi yönetici çıkarabilir.", "CANNOT_REMOVE_ADMIN");
    }
    // 3. Tek kalan OWNER çıkarılamaz
    if (target.role === COMMUNITY_ROLES.OWNER) {
      const otherOwners = await prisma.communityMember.count({
        where: {
          communityId: community.id,
          role: COMMUNITY_ROLES.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
          id: { not: target.id },
        },
      });
      if (otherOwners === 0) {
        throw ApiError.badRequest("Topluluğun tek sahibi çıkarılamaz.", "CANNOT_REMOVE_SOLE_OWNER");
      }
    }

    const updated = await prisma.communityMember.update({
      where: { id: target.id },
      data: {
        status: MEMBERSHIP_STATUS.REMOVED,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Üye topluluktan çıkarıldı.",
      ...updated,
      member: updated,
    };
  }

  /**
   * Rol Güncelleme (Yalnızca OWNER yapabilir)
   */
  async function updateMemberRole(idOrSlug, memberId, newRole, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    // Sadece OWNER rol değiştirebilir
    await requireRole(community.id, callerWallet, [COMMUNITY_ROLES.OWNER]);

    if (![COMMUNITY_ROLES.ADMIN, COMMUNITY_ROLES.MEMBER].includes(newRole)) {
      throw ApiError.badRequest("Yalnızca ADMIN veya MEMBER rolü atanabilir.", "INVALID_ROLE");
    }

    const target = await prisma.communityMember.findFirst({
      where: { id: memberId, communityId: community.id, status: MEMBERSHIP_STATUS.ACTIVE },
    });

    if (!target) {
      throw ApiError.notFound("Rolü değiştirilecek aktif üye bulunamadı.", "MEMBER_NOT_FOUND");
    }

    if (target.role === COMMUNITY_ROLES.OWNER) {
      throw ApiError.badRequest("Topluluk sahibinin rolü buradan değiştirilemez. Sahiplik devri gereklidir.", "CANNOT_DEMOTE_OWNER");
    }

    const updated = await prisma.communityMember.update({
      where: { id: target.id },
      data: {
        role: newRole,
        updatedAt: new Date(),
      },
    });

    if (notificationService) {
      try {
        await notificationService.createNotification({
          recipientWallet: target.walletAddress,
          type: "COMMUNITY_ROLE_CHANGED",
          title: "Topluluk Rolünüz Güncellendi",
          message: `"${community.name}" topluluğundaki rolünüz "${newRole}" olarak güncellendi.`,
          destinationUrl: `/communities/${community.slug}`,
          metadata: {
            communityId: community.id,
            communitySlug: community.slug,
            role: newRole,
          },
        });
      } catch {
        // bildirim hatası ana işlemi engellemez
      }
    }

    return {
      success: true,
      message: `Üye rolü ${newRole} olarak güncellendi.`,
      ...updated,
      member: updated,
    };
  }

  /**
   * Topluluk Bilgilerini Güncelleme
   */
  async function updateCommunity(idOrSlug, updates, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    await requireRole(community.id, callerWallet);

    const updatePayload = {};
    if (typeof updates.description === "string") {
      updatePayload.description = sanitizeString(updates.description, 2000);
    }
    if (typeof updates.shortDescription === "string") {
      updatePayload.shortDescription = sanitizeString(updates.shortDescription, 250);
    }
    if (typeof updates.universityName === "string" && updates.universityName.trim()) {
      updatePayload.universityName = sanitizeString(updates.universityName, 80);
    }
    if (typeof updates.category === "string" && updates.category.trim()) {
      updatePayload.category = sanitizeString(updates.category, 40);
    }
    if (updates.logoUrl !== undefined) {
      updatePayload.logoUrl = validateUrl(updates.logoUrl);
    }
    if (updates.coverImageUrl !== undefined) {
      updatePayload.coverImageUrl = validateUrl(updates.coverImageUrl);
    }
    if (updates.websiteUrl !== undefined) {
      updatePayload.websiteUrl = validateUrl(updates.websiteUrl);
    }
    if (updates.contactEmail !== undefined) {
      updatePayload.contactEmail = validateEmail(updates.contactEmail);
    }

    updatePayload.updatedAt = new Date();

    const updated = await prisma.community.update({
      where: { id: community.id },
      data: updatePayload,
    });

    return {
      success: true,
      message: "Topluluk bilgileri güncellendi.",
      community: updated,
    };
  }

  /**
   * Etkinliği Topluluğa Bağlama (Safe Community-Event Association)
   */
  async function linkEventToCommunity(idOrSlug, eventId, chainId, contractAddress, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    // Çağıran kişi toplulukta OWNER veya ADMIN olmalı
    await requireRole(community.id, callerWallet);

    const event = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId: Number(chainId),
          contractAddress: contractAddress.toLowerCase(),
          eventId: Number(eventId),
        },
      },
    });

    if (!event) {
      throw ApiError.notFound("Bağlanacak etkinlik bulunamadı.", "EVENT_NOT_FOUND");
    }

    // Güvenlik Kuralı: Etkinlik organizatörü çağrıyı yapan kişi olmalı (başka cüzdanın etkinliğini gasp etmeyi önler)
    if (event.organizerAddress.toLowerCase() !== callerWallet.toLowerCase()) {
      throw ApiError.forbidden("Yalnızca kendi oluşturduğunuz etkinlikleri topluluğa bağlayabilirsiniz.", "EVENT_ORGANIZER_MISMATCH");
    }

    const updated = await prisma.eventMetadata.update({
      where: { id: event.id },
      data: {
        communityId: community.id,
        community: community.name,
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: `Etkinlik #${eventId} başarıyla ${community.name} topluluğuna bağlandı.`,
      event: updated,
    };
  }

  /**
   * Etkinlik Bağlantısını Kaldırma
   */
  async function unlinkEventFromCommunity(idOrSlug, eventId, chainId, contractAddress, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    await requireRole(community.id, callerWallet);

    const event = await prisma.eventMetadata.findUnique({
      where: {
        chainId_contractAddress_eventId: {
          chainId: Number(chainId),
          contractAddress: contractAddress.toLowerCase(),
          eventId: Number(eventId),
        },
      },
    });

    if (!event) {
      throw ApiError.notFound("Etkinlik bulunamadı.", "EVENT_NOT_FOUND");
    }

    if (event.communityId !== community.id) {
      throw ApiError.badRequest(
        "Bu etkinlik belirtilen topluluğa bağlı değil.",
        "EVENT_COMMUNITY_MISMATCH"
      );
    }

    const updated = await prisma.eventMetadata.update({
      where: { id: event.id },
      data: {
        communityId: null,
        community: "Genel",
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: `Etkinlik #${eventId} topluluk bağlantısı kaldırıldı.`,
      event: updated,
    };
  }

  /**
   * Topluluk Analitiği (Faz 11 Analitik Yapısının Yeniden Kullanımı)
   */
  async function getCommunityAnalytics(idOrSlug, callerWallet) {
    const community = await findCommunityByIdOrSlug(idOrSlug);
    if (!community) {
      throw ApiError.notFound("Topluluk bulunamadı.", "COMMUNITY_NOT_FOUND");
    }

    await requireRole(community.id, callerWallet);

    // 1. Topluluk Üyeleri Metrikleri
    const [totalActiveMembers, pendingApplications, totalAdmins] = await Promise.all([
      prisma.communityMember.count({
        where: { communityId: community.id, status: MEMBERSHIP_STATUS.ACTIVE },
      }),
      prisma.communityMember.count({
        where: { communityId: community.id, status: MEMBERSHIP_STATUS.PENDING },
      }),
      prisma.communityMember.count({
        where: {
          communityId: community.id,
          status: MEMBERSHIP_STATUS.ACTIVE,
          role: { in: [COMMUNITY_ROLES.OWNER, COMMUNITY_ROLES.ADMIN] },
        },
      }),
    ]);

    // 2. Topluluk Etkinlikleri ve Katılım Metrikleri
    const events = await prisma.eventMetadata.findMany({
      where: {
        OR: [
          { communityId: community.id },
          { community: community.name },
        ],
        cancelled: false,
      },
    });

    const totalEvents = events.length;
    let totalCapacity = 0;
    const eventKeys = events.map((e) => ({
      chainId: e.chainId,
      contractAddress: e.contractAddress.toLowerCase(),
      eventId: e.eventId,
    }));

    for (const ev of events) {
      totalCapacity += Number(ev.capacity || 0);
    }

    let totalRegistrations = 0;
    let totalAttendances = 0;
    const uniqueStudentSet = new Set();
    const uniqueAttendedSet = new Set();

    if (eventKeys.length > 0) {
      const eventIds = eventKeys.map((k) => k.eventId);
      const [registrations, attendances] = await Promise.all([
        prisma.indexedRegistration.findMany({
          where: { eventId: { in: eventIds } },
          select: { eventId: true, participantAddress: true },
        }),
        prisma.indexedAttendance.findMany({
          where: { eventId: { in: eventIds } },
          select: { eventId: true, participantAddress: true },
        }),
      ]);

      totalRegistrations = registrations.length;
      totalAttendances = attendances.length;

      for (const reg of registrations) {
        uniqueStudentSet.add(reg.participantAddress.toLowerCase());
      }
      for (const att of attendances) {
        uniqueAttendedSet.add(att.participantAddress.toLowerCase());
      }
    }

    const attendanceRate =
      totalRegistrations > 0
        ? Math.min(100, Math.round((totalAttendances / totalRegistrations) * 100))
        : 0;

    const fillRate =
      totalCapacity > 0
        ? Math.min(100, Math.round((totalRegistrations / totalCapacity) * 100))
        : 0;

    const summary = {
      totalEvents,
      totalCapacity,
      totalRegistrations,
      totalAttended: totalAttendances,
      averageAttendanceRate: attendanceRate,
      fillRate,
      totalActiveMembers,
      pendingApplications,
      totalAdmins,
    };

    return {
      community: {
        id: community.id,
        name: community.name,
        slug: community.slug,
        universityName: community.universityName,
        category: community.category,
      },
      summary,
      members: {
        totalActive: totalActiveMembers,
        pendingApplications,
        totalAdmins,
      },
      events: {
        totalEvents,
        totalCapacity,
        totalRegistrations,
        totalAttendances,
        uniqueParticipants: uniqueStudentSet.size,
        uniqueAttendedStudents: uniqueAttendedSet.size,
        attendanceRate,
        fillRate,
      },
      eventItems: events,
    };
  }

  /**
   * Kullanıcının Üye Olduğu / Başvurduğu Topluluklar (Öğrenci Profili İçin)
   */
  async function getUserCommunities(walletAddress) {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return { joined: [], pending: [], items: [] };
    }

    const normWallet = walletAddress.toLowerCase();
    const memberships = await prisma.communityMember.findMany({
      where: {
        walletAddress: normWallet,
        status: { in: [MEMBERSHIP_STATUS.ACTIVE, MEMBERSHIP_STATUS.PENDING] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (memberships.length === 0) {
      return { joined: [], pending: [], items: [] };
    }

    const communityIds = memberships.map((m) => m.communityId);
    const communities = await prisma.community.findMany({
      where: { id: { in: communityIds } },
    });

    const commMap = new Map(communities.map((c) => [c.id, c]));

    const joined = [];
    const pending = [];

    for (const m of memberships) {
      const comm = commMap.get(m.communityId) || {};
      const item = {
        id: m.id,
        membershipId: m.id,
        communityId: m.communityId,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        appliedAt: m.createdAt,
        createdAt: m.createdAt,
        community: {
          id: comm.id,
          name: comm.name,
          slug: comm.slug,
          universityName: comm.universityName,
          category: comm.category,
          logoUrl: comm.logoUrl,
          coverImageUrl: comm.coverImageUrl,
          shortDescription: comm.shortDescription,
        },
      };

      if (m.status === MEMBERSHIP_STATUS.ACTIVE) {
        joined.push(item);
      } else if (m.status === MEMBERSHIP_STATUS.PENDING) {
        pending.push(item);
      }
    }

    return {
      joined,
      pending,
      items: [...joined, ...pending],
    };
  }

  return {
    createCommunity,
    getCommunities,
    getCommunityProfile,
    getCommunityEvents,
    joinCommunity,
    leaveCommunity,
    getCommunityMembers,
    getCommunityApplications,
    approveApplication,
    rejectApplication,
    removeMember,
    updateMemberRole,
    updateCommunity,
    linkEventToCommunity,
    unlinkEventFromCommunity,
    getCommunityAnalytics,
    getUserCommunities,
    createAnnouncement,
    getAnnouncements,
  };
}
