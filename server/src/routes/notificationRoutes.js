import { createRouter } from "../utils/expressAdapter.js";

export function createNotificationRoutes({
  notificationController,
  requireAuthSession,
}) {
  const router = createRouter();

  // SSE canlı bildirim akışı (SIWE oturumu gerektirir)
  router.get("/stream", requireAuthSession, (req, res) =>
    notificationController.stream(req, res)
  );

  // Okunmamış bildirim sayısı
  router.get("/unread-count", requireAuthSession, (req, res) =>
    notificationController.getUnreadCount(req, res)
  );

  // Bildirim tercihleri (GET / PATCH)
  router.get("/preferences", requireAuthSession, (req, res) =>
    notificationController.getPreferences(req, res)
  );
  router.patch("/preferences", requireAuthSession, (req, res) =>
    notificationController.updatePreferences(req, res)
  );

  // Tümünü okundu olarak işaretle
  router.patch("/read-all", requireAuthSession, (req, res) =>
    notificationController.markAllRead(req, res)
  );

  // Tekil bildirimi okundu olarak işaretle
  router.patch("/:notificationId/read", requireAuthSession, (req, res) =>
    notificationController.markRead(req, res)
  );

  // Tekil bildirim sil
  router.delete("/:notificationId", requireAuthSession, (req, res) =>
    notificationController.deleteNotification(req, res)
  );

  // Bildirim listesi (sayfalı / filtreli)
  router.get("/", requireAuthSession, (req, res) =>
    notificationController.getNotifications(req, res)
  );

  return router;
}
