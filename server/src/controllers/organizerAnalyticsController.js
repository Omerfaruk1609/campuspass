import {
  eventIdParamSchema,
  organizerExportQuerySchema,
  organizerParticipantQuerySchema,
  parseWithZod,
} from "../utils/validation.js";

export function createOrganizerAnalyticsController({ organizerAnalyticsService }) {
  return {
    async getDashboard(req, res) {
      const data = await organizerAnalyticsService.getOrganizerDashboard(
        req.session.walletAddress
      );
      res.status(200).json({
        success: true,
        data,
      });
    },

    async getEvents(req, res) {
      const data = await organizerAnalyticsService.getOrganizerEvents(
        req.session.walletAddress
      );
      res.status(200).json({
        success: true,
        data: data.events,
        checkpoint: data.checkpoint,
      });
    },

    async getEventAnalytics(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const data = await organizerAnalyticsService.getEventAnalytics(
        eventId,
        req.session.walletAddress
      );
      res.status(200).json({
        success: true,
        data,
      });
    },

    async getEventParticipants(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const query = parseWithZod(organizerParticipantQuerySchema, req.query);
      const data = await organizerAnalyticsService.getEventParticipants(
        eventId,
        req.session.walletAddress,
        query
      );
      res.status(200).json({
        success: true,
        data,
      });
    },

    async getTimeseries(req, res) {
      const data = await organizerAnalyticsService.getTimeseriesAnalytics(
        req.session.walletAddress
      );
      res.status(200).json({
        success: true,
        data,
      });
    },

    async exportCsv(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const { type } = parseWithZod(organizerExportQuerySchema, req.query);
      const { csvContent, fileName } = await organizerAnalyticsService.exportEventCsv(
        eventId,
        req.session.walletAddress,
        { type }
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.status(200).send(csvContent);
    },
  };
}
