import { env } from "../utils/env.js";
import { ApiError } from "../utils/errors.js";

export function createSecurityHeadersMiddleware() {
  return function securityHeaders(req, res, next) {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'"
    );
    next();
  };
}

export function createCorsMiddleware({
  allowedOrigins = env.ALLOWED_ORIGINS,
} = {}) {
  const allowSet = new Set(allowedOrigins.map((o) => o.toLowerCase()));

  return function corsMiddleware(req, res, next) {
    const origin = req.get("origin");

    if (origin) {
      if (!allowSet.has(origin.toLowerCase())) {
        return next(
          ApiError.forbidden(
            `CORS politikası gereği '${origin}' kaynağından gelen isteklere izin verilmiyor.`,
            "CORS_ORIGIN_FORBIDDEN"
          )
        );
      }

      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
      res.setHeader(
        "access-control-allow-methods",
        "GET, POST, PATCH, DELETE, OPTIONS"
      );
      res.setHeader(
        "access-control-allow-headers",
        "Content-Type, X-CSRF-Token, Authorization"
      );
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
