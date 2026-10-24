import { getPrismaClient } from "../services/prismaClient.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";
import { createEventIndexer } from "./eventIndexer.js";

const logger = createLogger("IndexerRunner");

async function main() {
  const prisma = await getPrismaClient();
  const indexer = createEventIndexer({ prisma, logger });

  logger.info("CampusPass Monad Testnet Event Indexer başlatılıyor...", {
    chainId: env.MONAD_CHAIN_ID,
    contractAddress: env.CONTRACT_ADDRESS_CHECKSUM,
    startBlock: env.INDEXER_START_BLOCK,
    batchSize: env.INDEXER_BATCH_SIZE,
    pollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
  });

  const runCycle = async () => {
    try {
      const res = await indexer.syncOnce();
      logger.info("Indexer durumu", {
        ...res,
        metrics: indexer.getMetrics(),
      });
    } catch (err) {
      logger.error("Indexer döngüsünde hata oluştu", { error: err.message });
    }
  };

  await runCycle();

  if (process.argv.includes("--once")) {
    await prisma.$disconnect();
    return;
  }

  setInterval(runCycle, env.INDEXER_POLL_INTERVAL_MS);
}

main().catch((err) => {
  logger.error("Indexer başlatılamadı", { error: err.message });
  process.exit(1);
});
