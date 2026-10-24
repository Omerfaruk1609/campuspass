const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /private[_-]?key/i,
  /database[_-]?url/i,
  /cookie/i,
  /authorization/i,
  /csrf/i,
  /session[_-]?token/i,
  /signature/i,
];

const DB_URL_CREDENTIAL_REGEX = /(postgres(?:ql)?:\/\/[^:\s/]+:)([^@\s]+)(@)/gi;
const HEX_PRIVATE_KEY_REGEX = /\b0x[0-9a-fA-F]{64}\b/g;

/**
 * Log çıktılarındaki parola, oturum anahtarı, imza ve özel anahtar gibi
 * hassas verileri maskeler.
 */
export function maskSensitiveValue(value, keyName = "") {
  if (value === null || value === undefined) return value;

  if (
    keyName &&
    SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(keyName))
  ) {
    if (typeof value === "string" && value.length > 8) {
      return `${value.slice(0, 4)}***REDACTED***`;
    }
    return "***REDACTED***";
  }

  if (typeof value === "string") {
    return value
      .replace(DB_URL_CREDENTIAL_REGEX, "$1***REDACTED***$3")
      .replace(HEX_PRIVATE_KEY_REGEX, (match) => `${match.slice(0, 6)}...REDACTED`);
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveValue(item));
  }

  if (typeof value === "object") {
    const maskedObj = {};
    for (const [k, v] of Object.entries(value)) {
      maskedObj[k] = maskSensitiveValue(v, k);
    }
    return maskedObj;
  }

  return value;
}

export function createLogger(scope = "CampusPassServer", { silent = false } = {}) {
  function write(level, message, meta) {
    if (silent) return null;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message: maskSensitiveValue(String(message)),
      ...(meta ? { meta: maskSensitiveValue(meta) } : {}),
    };

    if (level === "ERROR") {
      console.error(JSON.stringify(entry));
    } else if (level === "WARN") {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
    return entry;
  }

  return {
    info: (msg, meta) => write("INFO", msg, meta),
    warn: (msg, meta) => write("WARN", msg, meta),
    error: (msg, meta) => write("ERROR", msg, meta),
  };
}

export const logger = createLogger("CampusPassAPI", {
  silent: process.env.NODE_ENV === "test",
});
