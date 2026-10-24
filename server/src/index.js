import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCampusPassApp } from "./app.js";
import { createEventIndexer } from "./indexer/eventIndexer.js";
import {
  createTransactionalPrismaStore,
  getPrismaClient,
} from "./services/prismaClient.js";
import { env } from "./utils/env.js";
import { createLogger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createLogger("ServerMain");

async function startServer() {
  let prisma = await getPrismaClient();
  if (prisma.$isTransactionalMemoryStore) {
    const localDbFile = path.resolve(__dirname, "../data/local-db.json");
    prisma = createTransactionalPrismaStore({ persistFilePath: localDbFile });
  }

  const indexer = createEventIndexer({ prisma });
  const { app } = buildCampusPassApp({ prisma, indexer });

  app.listen(env.PORT, () => {
    logger.info("CampusPass Backend API sunucusu dinlemede", {
      port: env.PORT,
      environment: env.NODE_ENV,
      chainId: env.MONAD_CHAIN_ID,
      contractAddress: env.CONTRACT_ADDRESS_CHECKSUM,
      databaseMode: prisma.$isTransactionalMemoryStore
        ? "local-persistent-json"
        : "postgresql",
    });
  });

  // Başlangıçta arka planda ilk indeksleme senkronizasyonunu tetikle
  indexer.syncOnce().catch((err) => {
    logger.warn("İlk başlangıç indeksleme senkronizasyonu tamamlanamadı", {
      error: err.message,
    });
  });
}

startServer().catch((err) => {
  logger.error("Sunucu başlatılırken kritik hata oluştu", {
    error: err.message,
  });
  process.exit(1);
});
