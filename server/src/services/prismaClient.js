import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../utils/env.js";

function createUniqueConstraintError(targetFields) {
  const err = new Error(
    `Unique constraint failed on the fields: (${targetFields.join(", ")})`
  );
  err.code = "P2002";
  err.meta = { target: targetFields };
  return err;
}

function createNotFoundError(modelName) {
  const err = new Error(`${modelName} record not found.`);
  err.code = "P2025";
  return err;
}

function cloneState(state) {
  return structuredClone(state);
}

function normalizeRowAddresses(row) {
  const copy = { ...row };
  for (const field of [
    "contractAddress",
    "organizerAddress",
    "participantAddress",
    "walletAddress",
    "leadOrganizerAddress",
  ]) {
    if (typeof copy[field] === "string" && copy[field].startsWith("0x")) {
      copy[field] = copy[field].toLowerCase();
    }
  }
  return copy;
}

function matchesWhere(row, where = {}) {
  if (!where || typeof where !== "object") return true;

  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;

    if (key === "OR" && Array.isArray(expected)) {
      if (!expected.some((subWhere) => matchesWhere(row, subWhere))) {
        return false;
      }
      continue;
    }

    if (key === "AND" && Array.isArray(expected)) {
      if (!expected.every((subWhere) => matchesWhere(row, subWhere))) {
        return false;
      }
      continue;
    }

    // Bileşik unique anahtarlar
    if (key === "chainId_contractAddress_eventId" && typeof expected === "object") {
      if (
        Number(row.chainId) !== Number(expected.chainId) ||
        String(row.contractAddress).toLowerCase() !==
          String(expected.contractAddress).toLowerCase() ||
        Number(row.eventId) !== Number(expected.eventId)
      ) {
        return false;
      }
      continue;
    }

    if (key === "chainId_contractAddress" && typeof expected === "object") {
      if (
        Number(row.chainId) !== Number(expected.chainId) ||
        String(row.contractAddress).toLowerCase() !==
          String(expected.contractAddress).toLowerCase()
      ) {
        return false;
      }
      continue;
    }

    if (key === "reg_tx_log_unique" || key === "att_tx_log_unique") {
      if (
        Number(row.chainId) !== Number(expected.chainId) ||
        String(row.contractAddress).toLowerCase() !==
          String(expected.contractAddress).toLowerCase() ||
        String(row.transactionHash).toLowerCase() !==
          String(expected.transactionHash).toLowerCase() ||
        Number(row.logIndex) !== Number(expected.logIndex)
      ) {
        return false;
      }
      continue;
    }

    if (
      key === "reg_event_participant_unique" ||
      key === "att_event_participant_unique" ||
      key === "cert_event_participant_unique"
    ) {
      if (
        Number(row.chainId) !== Number(expected.chainId) ||
        String(row.contractAddress).toLowerCase() !==
          String(expected.contractAddress).toLowerCase() ||
        Number(row.eventId) !== Number(expected.eventId) ||
        String(row.participantAddress).toLowerCase() !==
          String(expected.participantAddress).toLowerCase()
      ) {
        return false;
      }
      continue;
    }

    if (key === "community_member_unique" && typeof expected === "object") {
      if (
        String(row.communityId) !== String(expected.communityId) ||
        String(row.walletAddress).toLowerCase() !==
          String(expected.walletAddress).toLowerCase()
      ) {
        return false;
      }
      continue;
    }

    const actual = row[key];
    if (typeof expected === "string" && expected.startsWith("0x") && typeof actual === "string") {
      if (actual.toLowerCase() !== expected.toLowerCase()) return false;
    } else if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      if ("in" in expected && Array.isArray(expected.in)) {
        if (!expected.in.includes(actual)) return false;
      }
      if ("equals" in expected) {
        if (actual !== expected.equals) return false;
      }
      if ("contains" in expected) {
        const actualStr = String(actual || "").toLowerCase();
        const searchStr = String(expected.contains || "").toLowerCase();
        if (!actualStr.includes(searchStr)) return false;
      }
      if ("not" in expected) {
        if (actual === expected.not) return false;
      }
      if ("gte" in expected) {
        if (!(actual >= expected.gte)) return false;
      }
      if ("lte" in expected) {
        if (!(actual <= expected.lte)) return false;
      }
      if ("gt" in expected) {
        if (!(actual > expected.gt)) return false;
      }
      if ("lt" in expected) {
        if (!(actual < expected.lt)) return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }

  return true;
}

function createDatabaseUnreachableError(details = "Can't reach PostgreSQL database server.") {
  const err = new Error(details);
  err.code = "P1001";
  err.name = "PrismaClientInitializationError";
  return err;
}

/**
 * Prisma ORM şemasıyla birebir uyumlu, ACID transaction ($transaction rollback) ve
 * benzersiz indeks (@@unique) kısıtlarını zorunlu kılan veritabanı motoru.
 * Gerçek PostgreSQL bağlantısı olmadığında yerel geliştirmede ve birim testlerinde
 * deterministik olarak çalışır.
 */
export function createTransactionalPrismaStore({ persistFilePath = null } = {}) {
  let state = {
    eventMetadata: [],
    indexedRegistration: [],
    indexedAttendance: [],
    indexerCheckpoint: [],
    authNonce: [],
    organizerSession: [],
    community: [],
    communityMember: [],
    attendanceCertificate: [],
    studentProfile: [],
    notification: [],
    announcement: [],
    notificationPreference: [],
  };

  if (persistFilePath && fs.existsSync(persistFilePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(persistFilePath, "utf8"));
      if (parsed && typeof parsed === "object") {
        state = { ...state, ...parsed };
      }
    } catch {
      // Bozuk yerel dosya varsa temiz başlat
    }
  }

  function flushToDisk() {
    if (!persistFilePath) return;
    try {
      fs.mkdirSync(path.dirname(persistFilePath), { recursive: true });
      fs.writeFileSync(persistFilePath, JSON.stringify(state, null, 2), "utf8");
    } catch {
      // Yazma hatası olursa bellek içi devam et
    }
  }

  function checkUniqueConstraints(tableName, candidate, ignoreId = null) {
    const rows = state[tableName].filter((r) => r.id !== ignoreId);

    if (tableName === "eventMetadata") {
      const dup = rows.find(
        (r) =>
          Number(r.chainId) === Number(candidate.chainId) &&
          r.contractAddress.toLowerCase() === candidate.contractAddress.toLowerCase() &&
          Number(r.eventId) === Number(candidate.eventId)
      );
      if (dup) {
        throw createUniqueConstraintError(["chainId", "contractAddress", "eventId"]);
      }
    }

    if (tableName === "indexedRegistration" || tableName === "indexedAttendance") {
      const dupTxLog = rows.find(
        (r) =>
          Number(r.chainId) === Number(candidate.chainId) &&
          r.contractAddress.toLowerCase() === candidate.contractAddress.toLowerCase() &&
          r.transactionHash.toLowerCase() === candidate.transactionHash.toLowerCase() &&
          Number(r.logIndex) === Number(candidate.logIndex)
      );
      if (dupTxLog) {
        throw createUniqueConstraintError([
          "chainId",
          "contractAddress",
          "transactionHash",
          "logIndex",
        ]);
      }

      const dupParticipant = rows.find(
        (r) =>
          Number(r.chainId) === Number(candidate.chainId) &&
          r.contractAddress.toLowerCase() === candidate.contractAddress.toLowerCase() &&
          Number(r.eventId) === Number(candidate.eventId) &&
          r.participantAddress.toLowerCase() === candidate.participantAddress.toLowerCase()
      );
      if (dupParticipant) {
        throw createUniqueConstraintError([
          "chainId",
          "contractAddress",
          "eventId",
          "participantAddress",
        ]);
      }
    }

    if (tableName === "indexerCheckpoint") {
      const dup = rows.find(
        (r) =>
          Number(r.chainId) === Number(candidate.chainId) &&
          r.contractAddress.toLowerCase() === candidate.contractAddress.toLowerCase()
      );
      if (dup) {
        throw createUniqueConstraintError(["chainId", "contractAddress"]);
      }
    }

    if (tableName === "authNonce") {
      const dup = rows.find((r) => r.nonce === candidate.nonce);
      if (dup) {
        throw createUniqueConstraintError(["nonce"]);
      }
    }

    if (tableName === "organizerSession") {
      const dup = rows.find((r) => r.sessionTokenHash === candidate.sessionTokenHash);
      if (dup) {
        throw createUniqueConstraintError(["sessionTokenHash"]);
      }
    }

    if (tableName === "community") {
      const dupSlug = rows.find((r) => r.slug === candidate.slug);
      if (dupSlug) {
        throw createUniqueConstraintError(["slug"]);
      }
    }

    if (tableName === "communityMember") {
      const dup = rows.find(
        (r) =>
          String(r.communityId) === String(candidate.communityId) &&
          String(r.walletAddress).toLowerCase() === String(candidate.walletAddress).toLowerCase()
      );
      if (dup) {
        throw createUniqueConstraintError(["communityId", "walletAddress"]);
      }
    }

    if (tableName === "notificationPreference") {
      const dupWallet = rows.find(
        (r) => String(r.walletAddress).toLowerCase() === String(candidate.walletAddress).toLowerCase()
      );
      if (dupWallet) {
        throw createUniqueConstraintError(["walletAddress"]);
      }
    }

    if (tableName === "studentProfile") {
      const dupWallet = rows.find(
        (r) => String(r.walletAddress).toLowerCase() === String(candidate.walletAddress).toLowerCase()
      );
      if (dupWallet) {
        throw createUniqueConstraintError(["walletAddress"]);
      }
    }

    if (tableName === "attendanceCertificate") {
      if (candidate.certificateId) {
        const dupCertId = rows.find((r) => r.certificateId === candidate.certificateId);
        if (dupCertId) {
          throw createUniqueConstraintError(["certificateId"]);
        }
      }
      const dupHash = rows.find((r) => r.certificateHash === candidate.certificateHash);
      if (dupHash) {
        throw createUniqueConstraintError(["certificateHash"]);
      }
      const dupParticipant = rows.find(
        (r) =>
          Number(r.chainId) === Number(candidate.chainId) &&
          r.contractAddress.toLowerCase() === candidate.contractAddress.toLowerCase() &&
          Number(r.eventId) === Number(candidate.eventId) &&
          r.participantAddress.toLowerCase() === candidate.participantAddress.toLowerCase()
      );
      if (dupParticipant) {
        throw createUniqueConstraintError([
          "chainId",
          "contractAddress",
          "eventId",
          "participantAddress",
        ]);
      }
    }
  }

  let simulatedOffline = false;

  function assertOnline() {
    if (simulatedOffline) {
      throw createDatabaseUnreachableError(
        "Can't reach PostgreSQL database server (veritabanı bağlantısı kapalı)."
      );
    }
  }

  function buildDelegate(tableName, autoSave = true) {
    return {
      async findUnique({ where }) {
        assertOnline();
        const found = state[tableName].find((r) => matchesWhere(r, where));
        return found ? structuredClone(found) : null;
      },

      async findFirst({ where, orderBy } = {}) {
        assertOnline();
        const list = await this.findMany({ where, orderBy });
        return list[0] || null;
      },

      async findMany({ where, orderBy, skip, take } = {}) {
        assertOnline();
        let rows = state[tableName]
          .filter((r) => matchesWhere(r, where))
          .map((r) => structuredClone(r));

        if (orderBy && typeof orderBy === "object") {
          const [field, dir] = Object.entries(orderBy)[0] || [];
          if (field) {
            const factor = String(dir).toLowerCase() === "desc" ? -1 : 1;
            rows.sort((a, b) => {
              const va = a[field] instanceof Date ? a[field].getTime() : a[field];
              const vb = b[field] instanceof Date ? b[field].getTime() : b[field];
              if (va < vb) return -1 * factor;
              if (va > vb) return 1 * factor;
              return 0;
            });
          }
        }

        if (typeof skip === "number" && skip > 0) {
          rows = rows.slice(skip);
        }
        if (typeof take === "number" && take >= 0) {
          rows = rows.slice(0, take);
        }
        return rows;
      },

      async count({ where } = {}) {
        assertOnline();
        return state[tableName].filter((r) => matchesWhere(r, where)).length;
      },

      async create({ data }) {
        assertOnline();
        const now = new Date();
        const normalized = normalizeRowAddresses({
          id: data.id || crypto.randomUUID(),
          ...data,
          createdAt: data.createdAt ? new Date(data.createdAt) : now,
          updatedAt: data.updatedAt ? new Date(data.updatedAt) : now,
        });

        checkUniqueConstraints(tableName, normalized);
        state[tableName].push(normalized);
        if (autoSave) flushToDisk();
        return structuredClone(normalized);
      },

      async update({ where, data }) {
        assertOnline();
        const idx = state[tableName].findIndex((r) => matchesWhere(r, where));
        if (idx === -1) {
          throw createNotFoundError(tableName);
        }
        const existing = state[tableName][idx];
        const updated = normalizeRowAddresses({
          ...existing,
          ...data,
          updatedAt: new Date(),
        });

        checkUniqueConstraints(tableName, updated, existing.id);
        state[tableName][idx] = updated;
        if (autoSave) flushToDisk();
        return structuredClone(updated);
      },

      async updateMany({ where, data }) {
        assertOnline();
        let count = 0;
        for (let i = 0; i < state[tableName].length; i++) {
          if (matchesWhere(state[tableName][i], where)) {
            state[tableName][i] = normalizeRowAddresses({
              ...state[tableName][i],
              ...data,
              updatedAt: new Date(),
            });
            count += 1;
          }
        }
        if (count > 0 && autoSave) flushToDisk();
        return { count };
      },

      async upsert({ where, create: createData, update: updateData }) {
        assertOnline();
        const existing = await this.findUnique({ where });
        if (existing) {
          return this.update({ where, data: updateData });
        }
        return this.create({ data: createData });
      },

      async delete({ where }) {
        assertOnline();
        const idx = state[tableName].findIndex((r) => matchesWhere(r, where));
        if (idx === -1) {
          throw createNotFoundError(tableName);
        }
        const [removed] = state[tableName].splice(idx, 1);
        if (autoSave) flushToDisk();
        return structuredClone(removed);
      },

      async deleteMany({ where } = {}) {
        assertOnline();
        const before = state[tableName].length;
        state[tableName] = state[tableName].filter((r) => !matchesWhere(r, where));
        const deletedCount = before - state[tableName].length;
        if (deletedCount > 0 && autoSave) flushToDisk();
        return { count: deletedCount };
      },
    };
  }

  const client = {
    $isTransactionalMemoryStore: true,
    eventMetadata: buildDelegate("eventMetadata"),
    indexedRegistration: buildDelegate("indexedRegistration"),
    indexedAttendance: buildDelegate("indexedAttendance"),
    indexerCheckpoint: buildDelegate("indexerCheckpoint"),
    authNonce: buildDelegate("authNonce"),
    organizerSession: buildDelegate("organizerSession"),
    community: buildDelegate("community"),
    communityMember: buildDelegate("communityMember"),
    attendanceCertificate: buildDelegate("attendanceCertificate"),
    studentProfile: buildDelegate("studentProfile"),
    notification: buildDelegate("notification"),
    announcement: buildDelegate("announcement"),
    notificationPreference: buildDelegate("notificationPreference"),

    /**
     * Atomik veritabanı transaction'ı:
     * İşlem sırasında herhangi bir hata fırlatılırsa tüm tablolar işlem öncesi
     * snapshot durumuna geri döndürülür (Rollback).
     */
    async $transaction(fnOrArray) {
      assertOnline();
      const snapshot = cloneState(state);
      const txClient = {
        eventMetadata: buildDelegate("eventMetadata", false),
        indexedRegistration: buildDelegate("indexedRegistration", false),
        indexedAttendance: buildDelegate("indexedAttendance", false),
        indexerCheckpoint: buildDelegate("indexerCheckpoint", false),
        authNonce: buildDelegate("authNonce", false),
        organizerSession: buildDelegate("organizerSession", false),
        community: buildDelegate("community", false),
        communityMember: buildDelegate("communityMember", false),
        attendanceCertificate: buildDelegate("attendanceCertificate", false),
        studentProfile: buildDelegate("studentProfile", false),
        notification: buildDelegate("notification", false),
        announcement: buildDelegate("announcement", false),
        notificationPreference: buildDelegate("notificationPreference", false),
      };

      try {
        let result;
        if (typeof fnOrArray === "function") {
          result = await fnOrArray(txClient);
        } else if (Array.isArray(fnOrArray)) {
          result = await Promise.all(fnOrArray);
        } else {
          throw new Error("$transaction bir fonksiyon veya Promise dizisi bekliyor.");
        }
        flushToDisk();
        return result;
      } catch (err) {
        // Atomik Rollback: tüm değişiklikleri geri al
        state = snapshot;
        throw err;
      }
    },

    async $queryRaw() {
      assertOnline();
      return [{ ok: 1 }];
    },

    async $disconnect() {
      flushToDisk();
    },

    $setSimulatedOffline(isOffline) {
      simulatedOffline = Boolean(isOffline);
    },

    $resetForTesting() {
      simulatedOffline = false;
      for (const key of Object.keys(state)) {
        state[key] = [];
      }
    },
  };

  return client;
}

let sharedPrismaInstance = null;

/**
 * @prisma/client kurulu ve PostgreSQL erişilebilir olduğunda gerçek PrismaClient döner.
 * Üretim (NODE_ENV=production) veya REQUIRE_REAL_POSTGRES=true durumunda sahte/in-memory
 * veritabanına geri dönüşe (fallback) ASLA izin verilmez; bağlantı hatası fırlatılır.
 */
export async function getPrismaClient({
  forceMemory = false,
  envOverride = process.env,
  resetShared = false,
} = {}) {
  const isStrictPostgresRequired =
    envOverride.NODE_ENV === "production" ||
    envOverride.REQUIRE_REAL_POSTGRES === "true";

  if (forceMemory) {
    if (isStrictPostgresRequired) {
      const err = new Error(
        "Üretim (production) ortamında sahte/in-memory veritabanı (forceMemory) kullanılamaz."
      );
      err.code = "PRODUCTION_MEMORY_STORE_FORBIDDEN";
      throw err;
    }
    return createTransactionalPrismaStore();
  }

  if (!resetShared && sharedPrismaInstance) {
    return sharedPrismaInstance;
  }

  const dbUrl =
    envOverride === process.env
      ? envOverride.DATABASE_URL || env.DATABASE_URL
      : envOverride.DATABASE_URL || "";
  if (isStrictPostgresRequired && (!dbUrl || dbUrl.startsWith("memory://"))) {
    const err = new Error(
      "Üretim (production) ortamında geçerli bir PostgreSQL DATABASE_URL zorunludur."
    );
    err.code = "PRODUCTION_DATABASE_URL_INVALID";
    throw err;
  }

  if (dbUrl && !dbUrl.startsWith("memory://")) {
    try {
      const prismaModule = await import("@prisma/client");
      if (prismaModule && prismaModule.PrismaClient) {
        const realClient = new prismaModule.PrismaClient({
          datasources: { db: { url: dbUrl } },
        });
        await realClient.$connect();
        sharedPrismaInstance = realClient;
        return sharedPrismaInstance;
      }
      if (isStrictPostgresRequired) {
        throw createDatabaseUnreachableError(
          "@prisma/client üretilmemiş veya yüklenemedi. Lütfen 'npm run db:generate' çalıştırın."
        );
      }
    } catch (err) {
      if (isStrictPostgresRequired) {
        throw createDatabaseUnreachableError(
          `Gerçek PostgreSQL bağlantısı kurulamadı: ${err.message}`
        );
      }
      // Yalnızca yerel geliştirme / test ortamında PostgreSQL çevrimdışı ise yerel transactional store'a geç
    }
  }

  sharedPrismaInstance = createTransactionalPrismaStore();
  return sharedPrismaInstance;
}
