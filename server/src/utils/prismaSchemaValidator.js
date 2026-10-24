import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, "../../prisma/schema.prisma");
const DEFAULT_MIGRATION_LOCK_PATH = path.resolve(
  __dirname,
  "../../prisma/migrations/migration_lock.toml"
);
const DEFAULT_INIT_MIGRATION_PATH = path.resolve(
  __dirname,
  "../../prisma/migrations/20261024000000_init/migration.sql"
);

const REQUIRED_MODELS = {
  EventMetadata: [
    "id",
    "chainId",
    "contractAddress",
    "eventId",
    "organizerAddress",
    "description",
    "community",
    "category",
    "startAt",
    "endAt",
    "registrationDeadline",
    "campus",
    "building",
    "room",
    "posterUrl",
    "cancelled",
    "createdAt",
    "updatedAt",
  ],
  IndexedRegistration: [
    "id",
    "chainId",
    "contractAddress",
    "eventId",
    "participantAddress",
    "transactionHash",
    "blockNumber",
    "logIndex",
    "createdAt",
  ],
  IndexedAttendance: [
    "id",
    "chainId",
    "contractAddress",
    "eventId",
    "participantAddress",
    "transactionHash",
    "blockNumber",
    "logIndex",
    "createdAt",
  ],
  IndexerCheckpoint: [
    "id",
    "chainId",
    "contractAddress",
    "lastProcessedBlock",
    "updatedAt",
  ],
  AuthNonce: ["id", "nonce", "domain", "chainId", "expiresAt", "consumedAt"],
  OrganizerSession: [
    "id",
    "sessionTokenHash",
    "csrfToken",
    "walletAddress",
    "chainId",
    "expiresAt",
  ],
  Community: ["id", "slug", "name", "leadOrganizerAddress"],
  AttendanceCertificate: [
    "id",
    "chainId",
    "contractAddress",
    "eventId",
    "participantAddress",
    "certificateHash",
  ],
};

/**
 * Prisma şemasının yapısal bütünlüğünü, zorunlu modellerini, alanlarını ve
 * benzersiz indekslerini doğrular.
 */
export function validatePrismaSchemaFile(schemaPath = DEFAULT_SCHEMA_PATH) {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Prisma şema dosyası bulunamadı: ${schemaPath}`);
  }

  const content = fs.readFileSync(schemaPath, "utf8");

  if (!/datasource\s+db\s*\{[\s\S]*provider\s*=\s*"postgresql"/m.test(content)) {
    throw new Error("Prisma datasource provider 'postgresql' olarak tanımlanmalıdır.");
  }

  if (!/generator\s+client\s*\{[\s\S]*provider\s*=\s*"prisma-client-js"/m.test(content)) {
    throw new Error("Prisma generator 'prisma-client-js' olarak tanımlanmalıdır.");
  }

  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const parsedModels = {};
  let match = modelRegex.exec(content);
  while (match !== null) {
    parsedModels[match[1]] = match[2];
    match = modelRegex.exec(content);
  }

  for (const [modelName, requiredFields] of Object.entries(REQUIRED_MODELS)) {
    const body = parsedModels[modelName];
    if (!body) {
      throw new Error(`Zorunlu Prisma modeli eksik: ${modelName}`);
    }

    for (const field of requiredFields) {
      const fieldRegex = new RegExp(`^\\s*${field}\\s+\\w+`, "m");
      if (!fieldRegex.test(body)) {
        throw new Error(`${modelName} modelinde zorunlu '${field}' alanı eksik.`);
      }
    }
  }

  // EventMetadata benzersiz indeks kontrolü: @@unique([chainId, contractAddress, eventId])
  if (
    !/@@unique\(\s*\[\s*chainId\s*,\s*contractAddress\s*,\s*eventId\s*\]/.test(
      parsedModels.EventMetadata
    )
  ) {
    throw new Error(
      "EventMetadata modelinde @@unique([chainId, contractAddress, eventId]) indeksi eksik."
    );
  }

  // IndexedRegistration duplicate log engelleme indeksi kontrolü
  if (
    !/@@unique\(\s*\[\s*chainId\s*,\s*contractAddress\s*,\s*transactionHash\s*,\s*logIndex\s*\]/.test(
      parsedModels.IndexedRegistration
    )
  ) {
    throw new Error(
      "IndexedRegistration modelinde duplicate log önleyici @@unique([chainId, contractAddress, transactionHash, logIndex]) indeksi eksik."
    );
  }

  // IndexedAttendance duplicate log engelleme indeksi kontrolü
  if (
    !/@@unique\(\s*\[\s*chainId\s*,\s*contractAddress\s*,\s*transactionHash\s*,\s*logIndex\s*\]/.test(
      parsedModels.IndexedAttendance
    )
  ) {
    throw new Error(
      "IndexedAttendance modelinde duplicate log önleyici @@unique([chainId, contractAddress, transactionHash, logIndex]) indeksi eksik."
    );
  }

  // IndexerCheckpoint benzersiz indeks kontrolü
  if (
    !/@@unique\(\s*\[\s*chainId\s*,\s*contractAddress\s*\]/.test(
      parsedModels.IndexerCheckpoint
    )
  ) {
    throw new Error(
      "IndexerCheckpoint modelinde @@unique([chainId, contractAddress]) indeksi eksik."
    );
  }

  // Migration dosyalarının varlığı ve SQL tablo bütünlüğü kontrolü
  if (schemaPath === DEFAULT_SCHEMA_PATH) {
    if (!fs.existsSync(DEFAULT_MIGRATION_LOCK_PATH)) {
      throw new Error(`Prisma migration_lock.toml bulunamadı: ${DEFAULT_MIGRATION_LOCK_PATH}`);
    }
    if (!fs.existsSync(DEFAULT_INIT_MIGRATION_PATH)) {
      throw new Error(`Prisma başlangıç migration.sql bulunamadı: ${DEFAULT_INIT_MIGRATION_PATH}`);
    }
    const migrationSql = fs.readFileSync(DEFAULT_INIT_MIGRATION_PATH, "utf8");
    for (const modelName of Object.keys(REQUIRED_MODELS)) {
      if (!migrationSql.includes(`CREATE TABLE "${modelName}"`)) {
        throw new Error(`migration.sql içinde '${modelName}' tablosu (CREATE TABLE) eksik.`);
      }
    }
  }

  return {
    valid: true,
    schemaPath,
    migrationPath: DEFAULT_INIT_MIGRATION_PATH,
    models: Object.keys(parsedModels),
  };
}

// Doğrudan CLI üzerinden çalıştırıldığında sonucu yazdır
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const result = validatePrismaSchemaFile();
    console.log(
      `[PRISMA VALIDATE] Başarılı! Doğrulanan modeller (${result.models.length}): ${result.models.join(", ")}`
    );
  } catch (err) {
    console.error(`[PRISMA VALIDATE HATA] ${err.message}`);
    process.exit(1);
  }
}
