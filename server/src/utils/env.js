import { z } from "zod";
import { ethers } from "ethers";

const DEFAULT_CONTRACT_ADDRESS = "0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da";

export const DEFAULT_DEV_SESSION_SECRET = "campuspass-dev-session-secret-key-2026-monad";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (val) =>
        val.startsWith("postgresql://") ||
        val.startsWith("postgres://") ||
        val.startsWith("memory://"),
      "DATABASE_URL 'postgresql://' veya 'postgres://' ile başlamalıdır."
    )
    .default("postgresql://postgres:postgres@localhost:5432/campuspass?schema=public"),
  MONAD_CHAIN_ID: z.coerce.number().int().positive().default(10143),
  MONAD_RPC_URL: z
    .string()
    .url("MONAD_RPC_URL geçerli bir URL olmalıdır.")
    .default("https://testnet-rpc.monad.xyz"),
  CONTRACT_ADDRESS: z
    .string()
    .refine((addr) => ethers.isAddress(addr), "CONTRACT_ADDRESS geçerli bir Ethereum adresi olmalıdır.")
    .default(DEFAULT_CONTRACT_ADDRESS),
  INDEXER_START_BLOCK: z.coerce.number().int().min(0).default(0),
  INDEXER_BATCH_SIZE: z.coerce.number().int().min(1).max(10000).default(100),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(15000),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().min(0).max(64).default(2),
  INDEXER_REORG_LOOKBACK_BLOCKS: z.coerce.number().int().min(0).max(500).default(10),
  INDEXER_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(4),
  INDEXER_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(10).default(1000),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://127.0.0.1:5173"),
  SIWE_DOMAIN: z.string().min(1).default("localhost:5173"),
  SIWE_URI: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET en az 16 karakter olmalıdır.")
    .default(DEFAULT_DEV_SESSION_SECRET),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(86400),
  NONCE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(30),
  MAX_BODY_SIZE_BYTES: z.coerce.number().int().min(1024).default(900 * 1024),
});

/**
 * Ortam değişkenlerini Zod şemasıyla doğrular ve yapılandırılmış nesne döner.
 * Üretim (production) ortamında sahte/in-memory veritabanı URL'lerini ve varsayılan
 * geliştirme oturum sırrını kesin olarak reddeder.
 */
export function loadAndValidateEnv(rawEnv = process.env) {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Ortam değişkeni doğrulama hatası: ${issues}`);
  }

  const data = parsed.data;

  if (data.NODE_ENV === "production") {
    if (!rawEnv.DATABASE_URL || data.DATABASE_URL.startsWith("memory://")) {
      throw new Error(
        "Ortam değişkeni doğrulama hatası: Üretim (production) ortamında gerçek bir PostgreSQL DATABASE_URL zorunludur ('memory://' kullanılamaz)."
      );
    }
    if (
      !rawEnv.SESSION_SECRET ||
      data.SESSION_SECRET === DEFAULT_DEV_SESSION_SECRET ||
      data.SESSION_SECRET.length < 32
    ) {
      throw new Error(
        "Ortam değişkeni doğrulama hatası: Üretim (production) ortamında en az 32 karakterlik benzersiz bir SESSION_SECRET zorunludur."
      );
    }
  }

  const allowedOrigins = data.CORS_ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    ...data,
    CONTRACT_ADDRESS_CHECKSUM: ethers.getAddress(data.CONTRACT_ADDRESS),
    CONTRACT_ADDRESS_NORMALIZED: ethers.getAddress(data.CONTRACT_ADDRESS).toLowerCase(),
    ALLOWED_ORIGINS: allowedOrigins,
  };
}

export const env = loadAndValidateEnv();
