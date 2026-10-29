import { createRouter } from "../utils/expressAdapter.js";

export function createEventRoutes({ eventController, requireOrganizerSession }) {
  const router = createRouter();

  // Herkese açık endpoint'ler
  router.get("/", (req, res) => eventController.listEvents(req, res));
  router.get("/:eventId", (req, res) => eventController.getEventById(req, res));
  router.get("/:eventId/metadata", (req, res) =>
    eventController.getEventMetadata(req, res)
  );

  // Etkinlik Duyuruları (GET herkese açık, POST organizatör oturumu gerektirir)
  router.get("/:eventId/announcements", (req, res) =>
    eventController.getAnnouncements(req, res)
  );
  router.post("/:eventId/announcements", requireOrganizerSession, (req, res) =>
    eventController.createAnnouncement(req, res)
  );

  // Organizatör yetkisi (SIWE Oturumu + CSRF + Canlı Blokzincir Organizatör Kontrolü) gerektiren endpoint'ler
  router.post("/:eventId/metadata", requireOrganizerSession, (req, res) =>
    eventController.createMetadata(req, res)
  );
  router.patch("/:eventId/metadata", requireOrganizerSession, (req, res) =>
    eventController.updateMetadata(req, res)
  );
  router.post("/:eventId/cancel", requireOrganizerSession, (req, res) =>
    eventController.cancelEvent(req, res)
  );
  router.post("/:eventId/reactivate", requireOrganizerSession, (req, res) =>
    eventController.reactivateEvent(req, res)
  );

  return router;
}
