import { z } from "zod";
import { ethers } from "ethers";
import {
  EVENT_CATEGORIES,
  MAX_POSTER_SIZE_BYTES,
  normalizeDeadlineTurkeyIso,
  sanitizeAndValidateText,
  toTurkeyIsoTimestamp,
  validatePosterUrl,
} from "../../../src/utils/eventMetadata.js";
import { ApiError } from "./errors.js";

/**
 * Ethereum adresini doğrular:
 * - Karışık büyük/küçük harf (EIP-55) içeriyorsa checksum doğrulaması yapar; bozuk checksum'ı reddeder.
 * - Veritabanında tutarlı sorgulama için küçük harfe (normalized) çevirir, ayrıca EIP-55 checksum halini döner.
 */
export function validateAndNormalizeAddress(rawAddress, fieldLabel = "Cüzdan adresi") {
  if (typeof rawAddress !== "string" || !rawAddress.trim()) {
    throw ApiError.badRequest(`${fieldLabel} zorunludur.`);
  }
  const trimmed = rawAddress.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw ApiError.badRequest(`${fieldLabel} geçerli bir Ethereum adresi formatında değil.`);
  }

  let checksumAddress;
  try {
    // ethers.getAddress bozuk EIP-55 checksum durumunda hata fırlatır
    checksumAddress = ethers.getAddress(trimmed);
  } catch {
    throw ApiError.badRequest(
      `${fieldLabel} EIP-55 checksum doğrulamasından geçemedi.`
    );
  }

  return {
    checksumAddress,
    normalizedAddress: checksumAddress.toLowerCase(),
  };
}

export const ethereumAddressSchema = z
  .string()
  .trim()
  .refine((val) => {
    try {
      validateAndNormalizeAddress(val);
      return true;
    } catch {
      return false;
    }
  }, "Geçersiz Ethereum adresi veya hatalı EIP-55 checksum.");

export const eventIdParamSchema = z.object({
  eventId: z.coerce
    .number()
    .int("eventId tam sayı olmalıdır.")
    .positive("eventId pozitif bir sayı olmalıdır."),
});

export const walletAddressParamSchema = z.object({
  walletAddress: ethereumAddressSchema,
});

export const eventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional().default(""),
  category: z.string().max(60).optional().default("ALL"),
  community: z.string().max(120).optional().default("ALL"),
  status: z
    .enum(["ALL", "UPCOMING", "PAST", "CANCELLED", "upcoming", "ongoing", "completed", "cancelled"])
    .optional()
    .default("ALL"),
  organizer: z.string().optional(),
  sortBy: z
    .enum(["NEWEST", "DATE_ASC", "DATE_DESC", "FILL_DESC"])
    .optional()
    .default("NEWEST"),
});

const safeTextField = (label, maxLen, required = true) =>
  z
    .string()
    .transform((val, ctx) => {
      try {
        return sanitizeAndValidateText(val, label, maxLen, required);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
        });
        return z.NEVER;
      }
    });

export const eventMetadataInputSchema = z
  .object({
    chainId: z.coerce.number().int().positive().optional(),
    contractAddress: ethereumAddressSchema.optional(),
    title: safeTextField("Etkinlik başlığı", 120, false).optional(),
    capacity: z.coerce.number().int().min(0).optional(),
    description: safeTextField("Etkinlik açıklaması", 2000, true),
    community: safeTextField("Düzenleyen topluluk / kulüp", 120, true),
    category: z.enum(EVENT_CATEGORIES, {
      errorMap: () => ({ message: "Geçersiz etkinlik kategorisi seçildi." }),
    }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    registrationDeadline: z.string().min(1, "Kayıt son tarihi zorunludur."),
    campus: safeTextField("Kampüs adı", 100, false).optional(),
    building: safeTextField("Bina adı", 100, false).optional(),
    room: safeTextField("Salon / Amfi", 100, false).optional(),
    location: z
      .object({
        campus: safeTextField("Kampüs adı", 100, true),
        building: safeTextField("Bina adı", 100, true),
        room: safeTextField("Salon / Amfi", 100, true),
      })
      .optional(),
    posterUrl: z
      .string()
      .optional()
      .default("")
      .transform((val, ctx) => {
        try {
          return validatePosterUrl(val || "");
        } catch (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: err.message,
          });
          return z.NEVER;
        }
      }),
    cancelled: z.boolean().optional().default(false),
    cancelReason: safeTextField("İptal gerekçesi", 300, false).optional().default(""),
    organizerAddress: z.string().optional(), // İstemciden gelse bile sunucu bunu tek başına kabul etmez!
  })
  .superRefine((data, ctx) => {
    const campus = data.location?.campus || data.campus;
    const building = data.location?.building || data.building;
    const room = data.location?.room || data.room;

    if (!campus || !building || !room) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "Kampüs, bina ve salon bilgileri zorunludur.",
      });
    }

    let startMs = NaN;
    let endMs = NaN;

    if (data.date && data.startTime && data.endTime) {
      try {
        startMs = toTurkeyIsoTimestamp(data.date, data.startTime).ms;
        endMs = toTurkeyIsoTimestamp(data.date, data.endTime).ms;
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["date"],
          message: err.message,
        });
        return;
      }
    } else if (data.startAt && data.endAt) {
      startMs = Date.parse(data.startAt);
      endMs = Date.parse(data.endAt);
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startAt"],
          message: "Geçersiz başlangıç veya bitiş zamanı (ISO 8601 bekleniyor).",
        });
        return;
      }
    } else {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: "Etkinlik tarih ve başlangıç/bitiş saatleri zorunludur.",
      });
      return;
    }

    if (endMs <= startMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Etkinlik bitiş saati, başlangıç saatinden sonra olmalıdır.",
      });
    }

    try {
      const deadlineObj = normalizeDeadlineTurkeyIso(data.registrationDeadline);
      if (deadlineObj.ms > startMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["registrationDeadline"],
          message:
            "Kayıt son tarihi, etkinliğin başlangıç tarih ve saatinden sonra olamaz.",
        });
      }
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationDeadline"],
        message: err.message,
      });
    }
  });

export const cancelEventBodySchema = z.object({
  cancelReason: safeTextField("İptal gerekçesi", 300, false).optional().default(""),
});

export const siweNonceQuerySchema = z.object({
  walletAddress: ethereumAddressSchema.optional(),
});

export const siweVerifyBodySchema = z.object({
  message: z.string().min(20, "SIWE mesajı zorunludur.").max(4000),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]{130}$/, "Geçersiz kriptografik cüzdan imzası formatı."),
});

export const migrateMetadataBodySchema = z.object({
  records: z.array(z.record(z.any())).min(1).max(100),
});

export const CERTIFICATE_ID_REGEX = /^CP-CERT-[0-9A-F]{32}$/i;

export const certificateIdParamSchema = z.object({
  certificateId: z
    .string()
    .trim()
    .regex(
      CERTIFICATE_ID_REGEX,
      "Geçersiz sertifika kimliği formatı (Beklenen: CP-CERT-<32 hex>)."
    )
    .transform((val) => val.toUpperCase()),
});

export const certificateIssueBodySchema = z.object({
  eventId: z.coerce
    .number()
    .int("eventId tam sayı olmalıdır.")
    .positive("eventId pozitif bir sayı olmalıdır."),
  walletAddress: ethereumAddressSchema.optional(),
  participantAddress: ethereumAddressSchema.optional(),
  displayName: safeTextField("Sertifika görüntüleme adı", 80, false)
    .optional()
    .default(""),
});

export function parseWithZod(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "root",
      message: issue.message,
    }));
    throw ApiError.badRequest(details[0]?.message || "Geçersiz istek verisi.", details);
  }
  return result.data;
}

export { MAX_POSTER_SIZE_BYTES };
