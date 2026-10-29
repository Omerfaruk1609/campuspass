import {
  parseWithZod,
  notificationQuerySchema,
  notificationIdParamSchema,
  notificationPreferencesUpdateSchema,
} from "../utils/validation.js";

export function createNotificationController({ notificationService }) {
  return {
    async getNotifications(req, res) {
      const walletAddress = req.session.walletAddress;
      const query = parseWithZod(notificationQuerySchema, req.query);
      const data = await notificationService.getNotificationsForUser(walletAddress, query);

      res.status(200).json({
        success: true,
        data: data.items,
        pagination: {
          page: data.page,
          limit: data.limit,
          total: data.total,
          unreadCount: data.unreadCount,
          hasMore: data.hasMore,
          nextCursor: data.nextCursor,
        },
      });
    },

    async getUnreadCount(req, res) {
      const walletAddress = req.session.walletAddress;
      const data = await notificationService.getUnreadNotificationCount(walletAddress);

      res.status(200).json({
        success: true,
        data,
      });
    },

    async markRead(req, res) {
      const walletAddress = req.session.walletAddress;
      const { notificationId } = parseWithZod(notificationIdParamSchema, req.params);
      const updated = await notificationService.markNotificationAsRead(walletAddress, notificationId);

      res.status(200).json({
        success: true,
        message: "Bildirim okundu olarak işaretlendi.",
        data: updated,
      });
    },

    async markAllRead(req, res) {
      const walletAddress = req.session.walletAddress;
      const result = await notificationService.markAllNotificationsAsRead(walletAddress);

      res.status(200).json({
        success: true,
        message: "Tüm bildirimler okundu olarak işaretlendi.",
        data: result,
      });
    },

    async deleteNotification(req, res) {
      const walletAddress = req.session.walletAddress;
      const { notificationId } = parseWithZod(notificationIdParamSchema, req.params);
      await notificationService.deleteNotification(walletAddress, notificationId);

      res.status(200).json({
        success: true,
        message: "Bildirim silindi.",
      });
    },

    async getPreferences(req, res) {
      const walletAddress = req.session.walletAddress;
      const preferences = await notificationService.getPreferences(walletAddress);

      res.status(200).json({
        success: true,
        data: preferences,
      });
    },

    async updatePreferences(req, res) {
      const walletAddress = req.session.walletAddress;
      const validatedData = parseWithZod(notificationPreferencesUpdateSchema, req.body);
      const updated = await notificationService.updatePreferences(walletAddress, validatedData);

      res.status(200).json({
        success: true,
        message: "Bildirim tercihleri başarıyla güncellendi.",
        data: updated,
      });
    },

    stream(req, res) {
      const walletAddress = req.session.walletAddress;
      notificationService.registerStreamClient(walletAddress, req, res);
    },
  };
}
