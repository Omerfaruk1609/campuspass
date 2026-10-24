export class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = Number(statusCode) || 500;
    this.code = code || "INTERNAL_ERROR";
    this.details = details;
  }

  static badRequest(message, details = null, code = "VALIDATION_ERROR") {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = "Kimlik doğrulaması gerekli.", code = "UNAUTHORIZED") {
    return new ApiError(401, code, message);
  }

  static forbidden(message = "Bu işlem için yetkiniz bulunmuyor.", code = "FORBIDDEN") {
    return new ApiError(403, code, message);
  }

  static notFound(message = "Kayıt bulunamadı.", code = "NOT_FOUND") {
    return new ApiError(404, code, message);
  }

  static conflict(message = "Kayıt çakışması oluştu.", code = "CONFLICT") {
    return new ApiError(409, code, message);
  }

  static payloadTooLarge(message = "İstek boyutu izin verilen sınırı aşıyor.") {
    return new ApiError(413, "PAYLOAD_TOO_LARGE", message);
  }

  static tooManyRequests(message = "Çok fazla istek gönderildi. Lütfen biraz bekleyin.") {
    return new ApiError(429, "RATE_LIMIT_EXCEEDED", message);
  }

  static badGateway(message = "Blokzincir RPC bağlantı hatası oluştu.", details = null) {
    return new ApiError(502, "RPC_ERROR", message, details);
  }

  static serviceUnavailable(
    message = "Veritabanı bağlantısı şu anda kullanılamıyor.",
    code = "DATABASE_UNAVAILABLE"
  ) {
    return new ApiError(503, code, message);
  }
}

function isDatabaseConnectivityError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  if (
    ["P1001", "P1002", "P1008", "P1017", "ECONNREFUSED", "DATABASE_UNAVAILABLE"].includes(
      code
    )
  ) {
    return true;
  }
  if (err.name === "PrismaClientInitializationError") {
    return true;
  }
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("can't reach postgresql") || msg.includes("can't reach database server");
}

export function formatErrorResponse(err) {
  if (err instanceof ApiError) {
    return {
      statusCode: err.statusCode,
      body: {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
    };
  }

  if (isDatabaseConnectivityError(err)) {
    return {
      statusCode: 503,
      body: {
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message:
            "Veritabanı bağlantısı şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
        },
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Sunucu tarafında beklenmeyen bir hata oluştu.",
      },
    },
  };
}
