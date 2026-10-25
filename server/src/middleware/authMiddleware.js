import crypto from "node:crypto";
import {
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
} from "../services/authService.js";
import { ApiError } from "../utils/errors.js";

function safeCompareStrings(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Organizatör oturumunu (HttpOnly Cookie) ve durum değiştiren isteklerde
 * CSRF başlığını (X-CSRF-Token) doğrular.
 */
export function createAuthMiddleware({ authService }) {
  async function requireOrganizerSession(req, res, next) {
    const rawSessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawSessionToken) {
      return next(
        ApiError.unauthorized(
          "Bu işlem için organizatör cüzdan imzasıyla (SIWE) oturum açmanız gerekiyor.",
          "SESSION_REQUIRED"
        )
      );
    }

    const session = await authService.verifySession(rawSessionToken);
    if (!session) {
      return next(
        ApiError.unauthorized(
          "Oturumunuz geçersiz veya süresi dolmuş. Lütfen cüzdanınızla yeniden giriş yapın.",
          "SESSION_EXPIRED"
        )
      );
    }

    // Durum değiştiren HTTP metotlarında CSRF koruması zorunludur
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      const csrfHeader = req.get(CSRF_HEADER_NAME);
      if (!csrfHeader || !safeCompareStrings(csrfHeader, session.csrfToken)) {
        return next(
          ApiError.forbidden(
            "CSRF doğrulaması başarısız: X-CSRF-Token başlığı eksik veya geçersiz.",
            "CSRF_TOKEN_INVALID"
          )
        );
      }
    }

    req.session = session;
    next();
  }

  async function optionalAuthSession(req, res, next) {
    const rawSessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawSessionToken) {
      try {
        const session = await authService.verifySession(rawSessionToken);
        if (session) {
          req.session = session;
        }
      } catch {
        // İsteğe bağlı oturum; hata fırlatılmaz
      }
    }
    next();
  }

  return {
    requireOrganizerSession,
    optionalAuthSession,
  };
}
