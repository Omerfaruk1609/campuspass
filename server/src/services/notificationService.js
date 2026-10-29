import {
  NOTIFICATION_TYPES,
  sanitizeDestinationUrl,
} from "../utils/notifications.js";
import { validateAndNormalizeAddress } from "../utils/validation.js";
import { ApiError } from "../utils/errors.js";

/**
 * CampusPass — Faz 15 Bildirim ve Gerçek Zamanlı Güncelleme Servisi
 * - Kalıcı PostgreSQL bildirimi
 * - Kullanıcı tercihleri kontrolü
 * - Sunucu Gönderimli Olaylar (Server-Sent Events — SSE) ile anlık iletim
 * - Tekilleştirme (Idempotency / dedupKey) desteği
 * - Açık yönlendirme (Open Redirect) ve XSS koruması
 */
export function createNotificationService({ prisma }) {
  // Aktif SSE abonelikleri: Map<normalizedWallet, Set<expressResponse>>
  const activeStreamSubscribers = new Map();

  // SSE bağlantılarını canlı tutmak ve düşen bağlantıları tespit etmek için heartbeat
  const heartbeatInterval = setInterval(() => {
    for (const [wallet, responseSet] of activeStreamSubscribers.entries()) {
      for (const res of responseSet) {
        try {
          res.write(": heartbeat\n\n");
        } catch {
          responseSet.delete(res);
        }
      }
      if (responseSet.size === 0) {
        activeStreamSubscribers.delete(wallet);
      }
    }
  }, 25000);

  if (typeof heartbeatInterval.unref === "function") {
    heartbeatInterval.unref();
  }

  // --- SSE YÖNETİMİ ---

  function registerStreamClient(rawWalletAddress, req, res) {
    const { normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Bildirim akışı cüzdan adresi"
    );

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    if (!activeStreamSubscribers.has(normalizedAddress)) {
      activeStreamSubscribers.set(normalizedAddress, new Set());
    }
    const clientSet = activeStreamSubscribers.get(normalizedAddress);
    clientSet.add(res);

    // İlk el sıkışma olayı
    res.write("event: connected\ndata: " + JSON.stringify({ status: "connected", walletAddress: normalizedAddress }) + "\n\n");

    req.on("close", () => {
      clientSet.delete(res);
      if (clientSet.size === 0) {
        activeStreamSubscribers.delete(normalizedAddress);
      }
    });
  }

  function broadcastRealtime(normalizedWallet, eventType, payload) {
    const clientSet = activeStreamSubscribers.get(normalizedWallet);
    if (!clientSet || clientSet.size === 0) return;

    const sseMessage = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clientSet) {
      try {
        res.write(sseMessage);
      } catch {
        clientSet.delete(res);
      }
    }
  }

  // --- KULLANICI TERCİHLERİ ---

  async function getPreferences(rawWalletAddress) {
    const { checksumAddress, normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const pref = await prisma.notificationPreference.findUnique({
      where: { walletAddress: normalizedAddress },
    });

    if (!pref) {
      return {
        walletAddress: checksumAddress,
        eventUpdates: true,
        community: true,
        announcements: true,
        certificates: true,
        exists: false,
      };
    }

    return {
      walletAddress: checksumAddress,
      eventUpdates: pref.eventUpdates,
      community: pref.community,
      announcements: pref.announcements,
      certificates: pref.certificates,
      createdAt: pref.createdAt,
      updatedAt: pref.updatedAt,
      exists: true,
    };
  }

  async function updatePreferences(rawWalletAddress, newPreferences) {
    const { checksumAddress, normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const updateData = {};
    if (typeof newPreferences.eventUpdates === "boolean") updateData.eventUpdates = newPreferences.eventUpdates;
    if (typeof newPreferences.community === "boolean") updateData.community = newPreferences.community;
    if (typeof newPreferences.announcements === "boolean") updateData.announcements = newPreferences.announcements;
    if (typeof newPreferences.certificates === "boolean") updateData.certificates = newPreferences.certificates;

    const saved = await prisma.notificationPreference.upsert({
      where: { walletAddress: normalizedAddress },
      update: updateData,
      create: {
        walletAddress: normalizedAddress,
        eventUpdates: updateData.eventUpdates ?? true,
        community: updateData.community ?? true,
        announcements: updateData.announcements ?? true,
        certificates: updateData.certificates ?? true,
      },
    });

    return {
      walletAddress: checksumAddress,
      eventUpdates: saved.eventUpdates,
      community: saved.community,
      announcements: saved.announcements,
      certificates: saved.certificates,
      updatedAt: saved.updatedAt,
    };
  }

  async function isNotificationAllowedByPreference(normalizedWallet, type) {
    // Zorunlu işlem ve hesap bildirimleri tercihlerden bağımsız her zaman iletilir
    const ESSENTIAL_TYPES = [
      NOTIFICATION_TYPES.EVENT_REGISTRATION_CONFIRMED,
      NOTIFICATION_TYPES.EVENT_REGISTRATION_CANCELLED,
      NOTIFICATION_TYPES.SYSTEM_NOTIFICATION,
    ];
    if (ESSENTIAL_TYPES.includes(type)) return true;

    const pref = await prisma.notificationPreference.findUnique({
      where: { walletAddress: normalizedWallet },
    });
    if (!pref) return true; // Varsayılan: tüm kategoriler açık

    if (
      (type === NOTIFICATION_TYPES.EVENT_UPDATED || type === NOTIFICATION_TYPES.EVENT_CANCELLED) &&
      !pref.eventUpdates
    ) {
      return false;
    }

    if (
      (type === NOTIFICATION_TYPES.COMMUNITY_JOIN_REQUEST ||
        type === NOTIFICATION_TYPES.COMMUNITY_MEMBERSHIP_APPROVED ||
        type === NOTIFICATION_TYPES.COMMUNITY_MEMBERSHIP_REJECTED ||
        type === NOTIFICATION_TYPES.COMMUNITY_ROLE_CHANGED) &&
      !pref.community
    ) {
      return false;
    }

    if (
      (type === NOTIFICATION_TYPES.COMMUNITY_ANNOUNCEMENT ||
        type === NOTIFICATION_TYPES.EVENT_ANNOUNCEMENT) &&
      !pref.announcements
    ) {
      return false;
    }

    if (type === NOTIFICATION_TYPES.CERTIFICATE_ISSUED && !pref.certificates) {
      return false;
    }

    return true;
  }

  // --- BİLDİRİM OLUŞTURMA & YÖNETİMİ ---

  async function createNotification({
    recipientWallet,
    type,
    title,
    message,
    destinationUrl = null,
    metadata = null,
    dedupKey = null,
  }) {
    const { normalizedAddress } = validateAndNormalizeAddress(
      recipientWallet,
      "Bildirim alıcısı cüzdan adresi"
    );

    // 1. Kullanıcı tercih kontrolü
    const allowed = await isNotificationAllowedByPreference(normalizedAddress, type);
    if (!allowed) {
      return null;
    }

    // 2. Tekilleştirme kontrolü (dedupKey)
    if (dedupKey) {
      const existing = await prisma.notification.findFirst({
        where: {
          recipientWallet: normalizedAddress,
          dedupKey: String(dedupKey),
        },
      });
      if (existing) {
        return existing;
      }
    }

    // 3. Güvenli link ve metadata hazırlığı
    const safeUrl = sanitizeDestinationUrl(destinationUrl);
    const metaString =
      metadata && typeof metadata === "object"
        ? JSON.stringify(metadata)
        : typeof metadata === "string"
          ? metadata
          : null;

    const notification = await prisma.notification.create({
      data: {
        recipientWallet: normalizedAddress,
        type: String(type),
        title: String(title).slice(0, 120),
        message: String(message).slice(0, 500),
        destinationUrl: safeUrl,
        metadata: metaString,
        dedupKey: dedupKey ? String(dedupKey) : null,
        read: false,
        readAt: null,
      },
    });

    // 4. Gerçek zamanlı SSE yayını
    broadcastRealtime(normalizedAddress, "notification", notification);

    // Güncel okunmamış sayısını da gönder
    const unreadCount = await prisma.notification.count({
      where: { recipientWallet: normalizedAddress, read: false },
    });
    broadcastRealtime(normalizedAddress, "unread_count", { unreadCount });

    return notification;
  }

  async function createNotificationsForRecipients(recipientsArg, notificationTemplate = {}) {
    let list = recipientsArg;
    let template = notificationTemplate;
    if (recipientsArg && !Array.isArray(recipientsArg) && Array.isArray(recipientsArg.recipients)) {
      list = recipientsArg.recipients;
      const { recipients, ...rest } = recipientsArg;
      template = rest;
    }
    if (!Array.isArray(list) || list.length === 0) return [];

    const createdNotifications = [];
    for (const rawRecipient of list) {
      try {
        const notif = await createNotification({
          ...template,
          recipientWallet: rawRecipient,
          dedupKey: template.dedupKey
            ? `${template.dedupKey}:${String(rawRecipient).toLowerCase()}`
            : null,
        });
        if (notif) createdNotifications.push(notif);
      } catch (err) {
        console.warn(`[NOTIFICATION] Alıcıya bildirim oluşturulamadı (${rawRecipient}):`, err.message);
      }
    }
    return createdNotifications;
  }

  async function getNotificationsForUser(
    rawWalletAddress,
    { page = 1, limit = 20, unreadOnly = false, cursor = null } = {}
  ) {
    const { checksumAddress, normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const where = {
      recipientWallet: normalizedAddress,
      ...(unreadOnly ? { read: false } : {}),
    };

    const takeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    let items;
    let total;

    if (cursor) {
      // Cursor-based pagination
      [items, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          take: takeLimit + 1,
          skip: 1,
          cursor: { id: cursor },
          orderBy: { createdAt: "desc" },
        }),
        prisma.notification.count({ where }),
      ]);
    } else {
      // Offset-based pagination
      const skip = Math.max((Number(page) || 1) - 1, 0) * takeLimit;
      [items, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          take: takeLimit,
          skip,
          orderBy: { createdAt: "desc" },
        }),
        prisma.notification.count({ where }),
      ]);
    }

    const unreadCount = await prisma.notification.count({
      where: { recipientWallet: normalizedAddress, read: false },
    });

    let nextCursor = null;
    let hasMore = false;
    if (cursor && items.length > takeLimit) {
      hasMore = true;
      const nextItem = items.pop();
      nextCursor = nextItem.id;
    } else if (!cursor) {
      const skip = Math.max((Number(page) || 1) - 1, 0) * takeLimit;
      hasMore = skip + items.length < total;
    }

    return {
      walletAddress: checksumAddress,
      items,
      total,
      unreadCount,
      hasMore,
      nextCursor,
      page: Number(page) || 1,
      limit: takeLimit,
    };
  }

  async function getUnreadNotificationCount(rawWalletAddress) {
    const { checksumAddress, normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const unreadCount = await prisma.notification.count({
      where: { recipientWallet: normalizedAddress, read: false },
    });

    return {
      walletAddress: checksumAddress,
      unreadCount,
    };
  }

  async function markNotificationAsRead(rawWalletAddress, notificationId) {
    const { normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing || existing.recipientWallet !== normalizedAddress) {
      throw ApiError.notFound("Bildirim bulunamadı veya bu işlem için yetkiniz yok.");
    }

    if (existing.read) {
      return existing;
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    const unreadCount = await prisma.notification.count({
      where: { recipientWallet: normalizedAddress, read: false },
    });
    broadcastRealtime(normalizedAddress, "unread_count", { unreadCount });

    return updated;
  }

  async function markAllNotificationsAsRead(rawWalletAddress) {
    const { normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const result = await prisma.notification.updateMany({
      where: {
        recipientWallet: normalizedAddress,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    broadcastRealtime(normalizedAddress, "unread_count", { unreadCount: 0 });

    return {
      updatedCount: result.count,
    };
  }

  async function deleteNotification(rawWalletAddress, notificationId) {
    const { normalizedAddress } = validateAndNormalizeAddress(
      rawWalletAddress,
      "Cüzdan adresi"
    );

    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing || existing.recipientWallet !== normalizedAddress) {
      throw ApiError.notFound("Bildirim bulunamadı veya bu işlem için yetkiniz yok.");
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    const unreadCount = await prisma.notification.count({
      where: { recipientWallet: normalizedAddress, read: false },
    });
    broadcastRealtime(normalizedAddress, "unread_count", { unreadCount });

    return { success: true };
  }

  // --- DUYURU YÖNETİMİ (COMMUNITY & EVENT ANNOUNCEMENTS) ---

  async function createAnnouncementRecord({
    targetType,
    communityId = null,
    eventId = null,
    chainId = null,
    contractAddress = null,
    authorWallet,
    title,
    content,
    recipientCount = 0,
  }) {
    const { normalizedAddress } = validateAndNormalizeAddress(authorWallet, "Yazar cüzdan adresi");

    return await prisma.announcement.create({
      data: {
        targetType,
        communityId,
        eventId: eventId ? Number(eventId) : null,
        chainId: chainId ? Number(chainId) : null,
        contractAddress: contractAddress ? contractAddress.toLowerCase() : null,
        authorWallet: normalizedAddress,
        title: String(title).slice(0, 120),
        content: String(content).slice(0, 2000),
        recipientCount: Number(recipientCount) || 0,
      },
    });
  }

  return {
    registerStreamClient,
    getPreferences,
    updatePreferences,
    createNotification,
    createNotificationsForRecipients,
    getNotificationsForUser,
    getUnreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    createAnnouncementRecord,
    closeAllStreams() {
      clearInterval(heartbeatInterval);
      for (const responseSet of activeStreamSubscribers.values()) {
        for (const res of responseSet) {
          try {
            res.end();
          } catch {}
        }
      }
      activeStreamSubscribers.clear();
    },
  };
}
