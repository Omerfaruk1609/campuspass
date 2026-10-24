import crypto from "node:crypto";
import { ethers } from "ethers";
import { env } from "../utils/env.js";
import { ApiError } from "../utils/errors.js";
import { validateAndNormalizeAddress } from "../utils/validation.js";

export const SESSION_COOKIE_NAME = "campuspass_session";
export const CSRF_HEADER_NAME = "x-csrf-token";

function hashToken(rawToken) {
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(String(rawToken))
    .digest("hex");
}

/**
 * EIP-4361 (Sign-In with Ethereum / SIWE) standart mesaj metnini oluşturur.
 */
export function buildSiweMessage({
  domain = env.SIWE_DOMAIN,
  address,
  statement = "CampusPass organizator yonetim oturumu icin cuzdaninizi dogrulayin.",
  uri = env.SIWE_URI,
  version = "1",
  chainId = env.MONAD_CHAIN_ID,
  nonce,
  issuedAt,
  expirationTime,
}) {
  const checksumAddr = ethers.getAddress(address);
  const lines = [
    `${domain} wants you to sign in with your Ethereum account:`,
    checksumAddr,
    "",
    statement,
    "",
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${Number(chainId)}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ];
  if (expirationTime) {
    lines.push(`Expiration Time: ${expirationTime}`);
  }
  return lines.join("\n");
}

/**
 * EIP-4361 SIWE mesajını ayrıştırır ve alanlarını doğrular.
 */
export function parseSiweMessage(rawMessage) {
  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    throw ApiError.badRequest("SIWE mesajı boş olamaz.");
  }

  const lines = rawMessage.replace(/\r\n/g, "\n").split("\n");
  const headerSuffix = " wants you to sign in with your Ethereum account:";
  if (!lines[0] || !lines[0].endsWith(headerSuffix)) {
    throw ApiError.badRequest(
      "SIWE mesaj başlığı EIP-4361 standardına uygun değil."
    );
  }

  const domain = lines[0].slice(0, -headerSuffix.length).trim();
  const addressLine = (lines[1] || "").trim();

  if (!domain) {
    throw ApiError.badRequest("SIWE mesajında domain bilgisi eksik.");
  }

  const { checksumAddress, normalizedAddress } = validateAndNormalizeAddress(
    addressLine,
    "SIWE mesajındaki cüzdan adresi"
  );

  const fields = {};
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(
      /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time):\s*(.+)$/
    );
    if (match) {
      fields[match[1]] = match[2].trim();
    }
  }

  const uri = fields["URI"];
  const version = fields["Version"];
  const chainId = Number(fields["Chain ID"]);
  const nonce = fields["Nonce"];
  const issuedAt = fields["Issued At"];
  const expirationTime = fields["Expiration Time"] || null;

  if (!uri || version !== "1" || !Number.isSafeInteger(chainId) || !nonce || !issuedAt) {
    throw ApiError.badRequest(
      "SIWE mesajında zorunlu alanlar (URI, Version: 1, Chain ID, Nonce, Issued At) eksik veya geçersiz."
    );
  }

  try {
    const parsedUri = new URL(uri);
    if (parsedUri.protocol !== "http:" && parsedUri.protocol !== "https:") {
      throw new Error("Invalid URI protocol");
    }
  } catch {
    throw ApiError.badRequest("SIWE URI alanı geçerli bir HTTP/HTTPS adresi olmalıdır.");
  }

  if (!/^[a-zA-Z0-9]{16,64}$/.test(nonce)) {
    throw ApiError.badRequest("SIWE nonce formatı geçersiz.");
  }

  const issuedMs = Date.parse(issuedAt);
  if (Number.isNaN(issuedMs)) {
    throw ApiError.badRequest("SIWE Issued At tarihi geçerli bir ISO 8601 zamanı değil.");
  }

  let expirationMs = null;
  if (expirationTime) {
    expirationMs = Date.parse(expirationTime);
    if (Number.isNaN(expirationMs)) {
      throw ApiError.badRequest(
        "SIWE Expiration Time geçerli bir ISO 8601 zamanı değil."
      );
    }
  }

  return {
    domain,
    address: checksumAddress,
    normalizedAddress,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    issuedMs,
    expirationTime,
    expirationMs,
  };
}

/**
 * Cüzdan tabanlı kimlik doğrulama (SIWE) ve güvenli oturum yönetim servisi.
 */
export function createAuthService({
  prisma,
  expectedDomain = env.SIWE_DOMAIN,
  expectedUri = env.SIWE_URI,
  expectedChainId = env.MONAD_CHAIN_ID,
  nonceTtlSeconds = env.NONCE_TTL_SECONDS,
  sessionTtlSeconds = env.SESSION_TTL_SECONDS,
} = {}) {
  const consumingNonces = new Set();

  /**
   * 1. Adım: Kriptografik olarak rastgele, tek kullanımlık SIWE nonce üretir.
   */
  async function issueNonce({ walletAddress = null, nowMs = Date.now() } = {}) {
    let normalizedWallet = null;
    if (walletAddress) {
      normalizedWallet = validateAndNormalizeAddress(walletAddress).normalizedAddress;
    }

    // 128-bit kriptografik rastgele alfanümerik/hex nonce (EIP-4361 uyumlu)
    const nonce = crypto.randomBytes(16).toString("hex");
    const issuedAt = new Date(nowMs);
    const expiresAt = new Date(nowMs + nonceTtlSeconds * 1000);

    await prisma.authNonce.create({
      data: {
        nonce,
        walletAddress: normalizedWallet,
        domain: expectedDomain,
        chainId: Number(expectedChainId),
        issuedAt,
        expiresAt,
        consumedAt: null,
      },
    });

    return {
      nonce,
      domain: expectedDomain,
      uri: expectedUri,
      chainId: Number(expectedChainId),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * 2-5. Adımlar: SIWE mesajını ve imzayı doğrular, nonce'u atomik olarak tüketir
   * ve süreli oturum + CSRF token oluşturur.
   */
  async function verifySiweAndCreateSession({
    message,
    signature,
    nowMs = Date.now(),
  }) {
    const parsed = parseSiweMessage(message);

    if (parsed.domain !== expectedDomain) {
      throw ApiError.unauthorized(
        `SIWE domain uyuşmazlığı: Beklenen '${expectedDomain}', gelen '${parsed.domain}'.`,
        "SIWE_DOMAIN_MISMATCH"
      );
    }

    if (parsed.uri !== expectedUri) {
      throw ApiError.unauthorized(
        `SIWE URI uyuşmazlığı: Beklenen '${expectedUri}', gelen '${parsed.uri}'.`,
        "SIWE_URI_MISMATCH"
      );
    }

    if (parsed.chainId !== Number(expectedChainId)) {
      throw ApiError.unauthorized(
        `SIWE Chain ID uyuşmazlığı: Beklenen '${expectedChainId}', gelen '${parsed.chainId}'.`,
        "SIWE_CHAIN_MISMATCH"
      );
    }

    if (parsed.expirationMs !== null && nowMs > parsed.expirationMs) {
      throw ApiError.unauthorized(
        "SIWE mesajının geçerlilik süresi (Expiration Time) dolmuş.",
        "SIWE_MESSAGE_EXPIRED"
      );
    }

    if (parsed.issuedMs > nowMs + 60 * 1000) {
      throw ApiError.unauthorized(
        "SIWE mesajı gelecekteki bir zaman damgasıyla oluşturulmuş.",
        "SIWE_INVALID_ISSUED_AT"
      );
    }

    // Kriptografik imza doğrulaması (özel anahtar asla istenmez)
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      throw ApiError.unauthorized(
        "Cüzdan imzası geçersiz veya çözümlenemedi.",
        "INVALID_SIGNATURE"
      );
    }

    if (recoveredAddress.toLowerCase() !== parsed.normalizedAddress) {
      throw ApiError.unauthorized(
        "SIWE mesajındaki cüzdan adresi ile imzalayan cüzdan adresi eşleşmiyor.",
        "SIGNATURE_ADDRESS_MISMATCH"
      );
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionTokenHash = hashToken(sessionToken);
    const csrfToken = crypto.randomBytes(24).toString("hex");
    const sessionExpiresAt = new Date(nowMs + sessionTtlSeconds * 1000);

    if (consumingNonces.has(parsed.nonce)) {
      throw ApiError.unauthorized(
        "Giriş nonce değeri eşzamanlı başka bir istekte tüketildi.",
        "NONCE_REPLAY_DETECTED"
      );
    }
    consumingNonces.add(parsed.nonce);

    try {
      // Nonce'un atomik tüketimi ve oturum kaydı tek bir transaction içinde yapılır
      await prisma.$transaction(async (tx) => {
        const nonceRecord = await tx.authNonce.findUnique({
          where: { nonce: parsed.nonce },
        });

        if (!nonceRecord) {
          throw ApiError.unauthorized(
            "Geçersiz veya sunucu tarafından üretilmemiş giriş nonce değeri.",
            "NONCE_NOT_FOUND"
          );
        }

        if (nonceRecord.consumedAt !== null && nonceRecord.consumedAt !== undefined) {
          throw ApiError.unauthorized(
            "Bu giriş nonce değeri daha önce kullanılmış (Replay saldırısı engellendi).",
            "NONCE_REPLAY_DETECTED"
          );
        }

        const nonceExpMs = new Date(nonceRecord.expiresAt).getTime();
        if (nowMs > nonceExpMs) {
          throw ApiError.unauthorized(
            "Giriş nonce değerinin süresi dolmuş. Lütfen yeni bir nonce alın.",
            "NONCE_EXPIRED"
          );
        }

        if (
          nonceRecord.walletAddress &&
          nonceRecord.walletAddress.toLowerCase() !== parsed.normalizedAddress
        ) {
          throw ApiError.unauthorized(
            "Bu nonce farklı bir cüzdan adresi için üretilmiş.",
            "NONCE_WALLET_MISMATCH"
          );
        }

        const updateResult = await tx.authNonce.updateMany({
          where: {
            nonce: parsed.nonce,
            consumedAt: null,
          },
          data: {
            consumedAt: new Date(nowMs),
            walletAddress: parsed.normalizedAddress,
          },
        });

        if (!updateResult || updateResult.count !== 1) {
          throw ApiError.unauthorized(
            "Giriş nonce değeri eşzamanlı başka bir istekte tüketildi.",
            "NONCE_REPLAY_DETECTED"
          );
        }

        await tx.organizerSession.create({
          data: {
            sessionTokenHash,
            csrfToken,
            walletAddress: parsed.normalizedAddress,
            chainId: parsed.chainId,
            expiresAt: sessionExpiresAt,
            revokedAt: null,
          },
        });
      });
    } finally {
      consumingNonces.delete(parsed.nonce);
    }

    return {
      sessionToken,
      csrfToken,
      walletAddress: parsed.address,
      normalizedWalletAddress: parsed.normalizedAddress,
      chainId: parsed.chainId,
      expiresAt: sessionExpiresAt.toISOString(),
      maxAgeSeconds: sessionTtlSeconds,
    };
  }

  async function verifySession(rawSessionToken, { nowMs = Date.now() } = {}) {
    if (!rawSessionToken || typeof rawSessionToken !== "string") {
      return null;
    }

    const tokenHash = hashToken(rawSessionToken);
    const session = await prisma.organizerSession.findUnique({
      where: { sessionTokenHash: tokenHash },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (nowMs > new Date(session.expiresAt).getTime()) return null;

    return {
      id: session.id,
      walletAddress: ethers.getAddress(session.walletAddress),
      normalizedWalletAddress: session.walletAddress.toLowerCase(),
      chainId: Number(session.chainId),
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  async function revokeSession(rawSessionToken) {
    if (!rawSessionToken || typeof rawSessionToken !== "string") {
      return false;
    }
    const tokenHash = hashToken(rawSessionToken);
    const res = await prisma.organizerSession.updateMany({
      where: { sessionTokenHash: tokenHash },
      data: { revokedAt: new Date() },
    });
    return res.count > 0;
  }

  return {
    issueNonce,
    verifySiweAndCreateSession,
    verifySession,
    revokeSession,
    buildSiweMessage,
    parseSiweMessage,
  };
}
