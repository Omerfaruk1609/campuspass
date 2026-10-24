import { formatErrorResponse } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function createErrorHandler({ customLogger = logger } = {}) {
  return function errorHandler(err, req, res, _next) {
    const formatted = formatErrorResponse(err);

    if (formatted.statusCode >= 500) {
      customLogger.error("Sunucu hatası", {
        method: req.method,
        path: req.path,
        statusCode: formatted.statusCode,
        error: err.message,
      });
    } else {
      customLogger.warn("İstemci / Yetki hatası", {
        method: req.method,
        path: req.path,
        statusCode: formatted.statusCode,
        code: formatted.body.error.code,
        message: formatted.body.error.message,
      });
    }

    res.status(formatted.statusCode).json(formatted.body);
  };
}
