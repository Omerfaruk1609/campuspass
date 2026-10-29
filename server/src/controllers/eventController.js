import { ApiError } from "../utils/errors.js";
import {
  announcementCreateSchema,
  cancelEventBodySchema,
  eventIdParamSchema,
  eventMetadataInputSchema,
  eventsQuerySchema,
  parseWithZod,
} from "../utils/validation.js";

export function createEventController({ eventService }) {
  return {
    async listEvents(req, res) {
      const query = parseWithZod(eventsQuerySchema, req.query);
      const result = await eventService.listEvents(query);

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
        metadataMap: result.metadataMap,
      });
    },

    async getEventById(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const event = await eventService.getEventById(eventId);

      res.status(200).json({
        success: true,
        data: event,
      });
    },

    async getEventMetadata(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const metadata = await eventService.getEventMetadataById(eventId);

      if (!metadata) {
        throw ApiError.notFound(
          `Etkinlik #${eventId} için kayıtlı özel metadata bulunamadı.`
        );
      }

      res.status(200).json({
        success: true,
        data: metadata,
      });
    },

    async createMetadata(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const validatedInput = parseWithZod(eventMetadataInputSchema, req.body);

      const saved = await eventService.createOrSaveEventMetadata(
        eventId,
        validatedInput,
        req.session.walletAddress
      );

      res.status(201).json({
        success: true,
        data: saved,
      });
    },

    async updateMetadata(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const validatedInput = parseWithZod(eventMetadataInputSchema, req.body);

      const updated = await eventService.updateEventMetadata(
        eventId,
        validatedInput,
        req.session.walletAddress
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    },

    async cancelEvent(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const { cancelReason } = parseWithZod(cancelEventBodySchema, req.body || {});

      const updated = await eventService.setEventCancelStatus(
        eventId,
        { cancelled: true, cancelReason },
        req.session.walletAddress
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    },

    async reactivateEvent(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);

      const updated = await eventService.setEventCancelStatus(
        eventId,
        { cancelled: false, cancelReason: "" },
        req.session.walletAddress
      );

      res.status(200).json({
        success: true,
        data: updated,
      });
    },

    async createAnnouncement(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const validatedInput = parseWithZod(announcementCreateSchema, req.body);

      const result = await eventService.createAnnouncement(
        eventId,
        req.session.walletAddress,
        validatedInput
      );

      res.status(201).json({
        success: true,
        message: "Duyuru başarıyla yayınlandı.",
        data: result,
      });
    },

    async getAnnouncements(req, res) {
      const { eventId } = parseWithZod(eventIdParamSchema, req.params);
      const result = await eventService.getAnnouncements(eventId, req.query);

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    },
  };
}
