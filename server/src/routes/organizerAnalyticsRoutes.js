import { createRouter } from "../utils/expressAdapter.js";

export function createOrganizerAnalyticsRoutes({
  organizerAnalyticsController,
  requireOrganizerSession,
}) {
  const router = createRouter();

  // Tüm organizatör analitik endpoint'leri SIWE doğrulamalı organizatör oturumu gerektirir
  router.get("/dashboard", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.getDashboard(req, res)
  );

  router.get("/events", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.getEvents(req, res)
  );

  router.get("/events/:eventId/analytics", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.getEventAnalytics(req, res)
  );

  router.get("/events/:eventId/participants", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.getEventParticipants(req, res)
  );

  router.get("/events/:eventId/export", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.exportCsv(req, res)
  );

  router.get("/analytics/timeseries", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.getTimeseries(req, res)
  );

  router.get("/timeseries", requireOrganizerSession, (req, res) =>
    organizerAnalyticsController.getTimeseries(req, res)
  );

  return router;
}
