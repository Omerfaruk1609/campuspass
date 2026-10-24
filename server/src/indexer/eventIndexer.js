import { ethers } from "ethers";
import { CAMPUS_PASS_ABI } from "../../../src/data/events.js";
import { env } from "../utils/env.js";
import { createLogger } from "../utils/logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitOrTransientRpcError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("server error")
  );
}

/**
 * CampusPass Blockchain Event Indexer
 * - EventCreated, UserRegistered ve AttendanceMarked olaylarını parçalı (chunked) olarak tarar.
 * - Reorg güvenliği için confirmation penceresi ve geriye dönük yeniden tarama (reorgLookbackBlocks) uygular.
 * - İndekslenen kayıtları ve IndexerCheckpoint'i aynı veritabanı transaction'ı ($transaction) içinde atomik günceller.
 * - RPC rate-limit durumunda üstel geri çekilmeyle (exponential backoff) kontrollü yeniden dener.
 */
export function createEventIndexer({
  prisma,
  contract = null,
  provider = null,
  chainId = env.MONAD_CHAIN_ID,
  contractAddress = env.CONTRACT_ADDRESS_CHECKSUM,
  rpcUrl = env.MONAD_RPC_URL,
  startBlock = env.INDEXER_START_BLOCK,
  batchSize = env.INDEXER_BATCH_SIZE,
  confirmations = env.INDEXER_CONFIRMATIONS,
  reorgLookbackBlocks = env.INDEXER_REORG_LOOKBACK_BLOCKS,
  maxRetries = env.INDEXER_MAX_RETRIES,
  retryBaseDelayMs = env.INDEXER_RETRY_BASE_DELAY_MS,
  logger = createLogger("EventIndexer", { silent: process.env.NODE_ENV === "test" }),
} = {}) {
  const checksumContract = ethers.getAddress(contractAddress);
  const normalizedContract = checksumContract.toLowerCase();
  const iface = new ethers.Interface(CAMPUS_PASS_ABI);

  const metrics = {
    batchesProcessed: 0,
    eventsCreatedIndexed: 0,
    registrationsIndexed: 0,
    attendancesIndexed: 0,
    duplicatesSkipped: 0,
    reorgRemovedCount: 0,
    retriesCount: 0,
    lastProcessedBlock: null,
    lastRunAt: null,
    lastError: null,
  };

  function getActiveContractAndProvider() {
    if (contract) {
      const p = contract.runner?.provider || contract.provider || provider;
      return { activeContract: contract, activeProvider: p };
    }
    const activeProvider =
      provider ||
      new ethers.JsonRpcProvider(
        rpcUrl,
        {
          name: "monad-testnet",
          chainId: Number(chainId),
        },
        {
          staticNetwork: true,
        }
      );
    const activeContract = new ethers.Contract(
      checksumContract,
      CAMPUS_PASS_ABI,
      activeProvider
    );
    return { activeContract, activeProvider };
  }

  async function executeWithRetry(operationFn, label) {
    let attempt = 0;
    while (true) {
      try {
        return await operationFn();
      } catch (err) {
        attempt += 1;
        if (attempt >= maxRetries || !isRateLimitOrTransientRpcError(err)) {
          metrics.lastError = {
            label,
            message: err.message || String(err),
            timestamp: new Date().toISOString(),
          };
          logger.error(`Indexer RPC hatası (${label})`, {
            attempt,
            error: err.message,
          });
          throw err;
        }
        metrics.retriesCount += 1;
        const delayMs = retryBaseDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`RPC rate-limit/geçici hata (${label}), yeniden deneniyor...`, {
          attempt,
          delayMs,
        });
        await sleep(delayMs);
      }
    }
  }

  async function getCheckpoint() {
    return prisma.indexerCheckpoint.findUnique({
      where: {
        chainId_contractAddress: {
          chainId: Number(chainId),
          contractAddress: normalizedContract,
        },
      },
    });
  }

  async function fetchBatchLogs(fromBlock, toBlock) {
    const { activeContract, activeProvider } = getActiveContractAndProvider();

    return executeWithRetry(async () => {
      if (typeof activeContract.queryFilter === "function") {
        const [createdLogs, registeredLogs, attendanceLogs] = await Promise.all([
          activeContract.queryFilter(
            activeContract.filters.EventCreated(),
            fromBlock,
            toBlock
          ),
          activeContract.queryFilter(
            activeContract.filters.UserRegistered(),
            fromBlock,
            toBlock
          ),
          activeContract.queryFilter(
            activeContract.filters.AttendanceMarked(),
            fromBlock,
            toBlock
          ),
        ]);

        const normalizeLog = (log, eventName) => ({
          eventName,
          args: log.args,
          transactionHash: String(log.transactionHash).toLowerCase(),
          blockNumber: Number(log.blockNumber),
          logIndex: Number(log.index ?? log.logIndex ?? 0),
        });

        const combined = [
          ...createdLogs.map((l) => normalizeLog(l, "EventCreated")),
          ...registeredLogs.map((l) => normalizeLog(l, "UserRegistered")),
          ...attendanceLogs.map((l) => normalizeLog(l, "AttendanceMarked")),
        ];

        combined.sort((a, b) =>
          a.blockNumber !== b.blockNumber
            ? a.blockNumber - b.blockNumber
            : a.logIndex - b.logIndex
        );
        return combined;
      }

      const rawLogs = await activeProvider.getLogs({
        address: checksumContract,
        fromBlock,
        toBlock,
      });

      const parsedLogs = [];
      for (const raw of rawLogs) {
        try {
          const parsed = iface.parseLog(raw);
          if (parsed) {
            parsedLogs.push({
              eventName: parsed.name,
              args: parsed.args,
              transactionHash: String(raw.transactionHash).toLowerCase(),
              blockNumber: Number(raw.blockNumber),
              logIndex: Number(raw.index ?? raw.logIndex ?? 0),
            });
          }
        } catch {
          // Sözleşmeye ait olmayan log varsa atla
        }
      }
      return parsedLogs;
    }, `getLogs(${fromBlock}..${toBlock})`);
  }

  /**
   * Belirli bir blok aralığındaki logları ve checkpoint'i tek bir veritabanı
   * transaction'ında ($transaction) atomik ve idempotent olarak işler.
   */
  async function processBlockBatch(fromBlock, toBlock, isReorgRescan = false) {
    const logs = await fetchBatchLogs(fromBlock, toBlock);

    await prisma.$transaction(async (tx) => {
      // Reorg taraması ise bu blok aralığındaki geçersizleşmiş işlem özetlerini temizle
      if (isReorgRescan) {
        const validTxLogKeys = new Set(
          logs.map((l) => `${l.transactionHash}:${l.logIndex}`)
        );

        const existingRegsInRange = await tx.indexedRegistration.findMany({
          where: {
            chainId: Number(chainId),
            contractAddress: normalizedContract,
            blockNumber: {
              gte: fromBlock,
              lte: toBlock,
            },
          },
        });

        for (const reg of existingRegsInRange) {
          const key = `${reg.transactionHash.toLowerCase()}:${reg.logIndex}`;
          if (!validTxLogKeys.has(key)) {
            await tx.indexedRegistration.delete({ where: { id: reg.id } });
            metrics.reorgRemovedCount += 1;
          }
        }

        const existingAttsInRange = await tx.indexedAttendance.findMany({
          where: {
            chainId: Number(chainId),
            contractAddress: normalizedContract,
            blockNumber: {
              gte: fromBlock,
              lte: toBlock,
            },
          },
        });

        for (const att of existingAttsInRange) {
          const key = `${att.transactionHash.toLowerCase()}:${att.logIndex}`;
          if (!validTxLogKeys.has(key)) {
            await tx.indexedAttendance.delete({ where: { id: att.id } });
            metrics.reorgRemovedCount += 1;
          }
        }
      }

      for (const item of logs) {
        if (item.eventName === "EventCreated") {
          const eventId = Number(item.args.eventId ?? item.args[0]);
          const organizer = String(
            item.args.organizer ?? item.args[1]
          ).toLowerCase();
          const title = String(item.args.title ?? item.args[2] ?? "");
          const capacity = Number(item.args.capacity ?? item.args[3] ?? 0);

          const existingMeta = await tx.eventMetadata.findUnique({
            where: {
              chainId_contractAddress_eventId: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                eventId,
              },
            },
          });

          if (existingMeta) {
            await tx.eventMetadata.update({
              where: {
                chainId_contractAddress_eventId: {
                  chainId: Number(chainId),
                  contractAddress: normalizedContract,
                  eventId,
                },
              },
              data: {
                organizerAddress: organizer,
                title,
                capacity,
              },
            });
          } else {
            await tx.eventMetadata.create({
              data: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                eventId,
                organizerAddress: organizer,
                title,
                capacity,
                description:
                  "Bu etkinlik Monad Testnet üzerinde oluşturulmuştur. Organizatör paneli üzerinden detaylı açıklama, konum ve program bilgilerini güncelleyebilirsiniz.",
                community: "Kampüs Topluluğu",
                category: "Blockchain",
                startAt: new Date("2026-11-15T14:00:00+03:00"),
                endAt: new Date("2026-11-15T17:00:00+03:00"),
                registrationDeadline: new Date("2026-11-15T13:30:00+03:00"),
                campus: "Merkez Kampüs",
                building: "Mühendislik Fakültesi",
                room: "Konferans Salonu",
                posterUrl: "",
                cancelled: false,
                cancelReason: "",
              },
            });
            metrics.eventsCreatedIndexed += 1;
          }
        } else if (item.eventName === "UserRegistered") {
          const eventId = Number(item.args.eventId ?? item.args[0]);
          const participantAddress = String(
            item.args.participant ?? item.args[1]
          ).toLowerCase();

          // Duplicate kontrolü (hem txHash+logIndex hem de eventId+participant)
          const existingByTx = await tx.indexedRegistration.findUnique({
            where: {
              reg_tx_log_unique: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                transactionHash: item.transactionHash,
                logIndex: item.logIndex,
              },
            },
          });

          const existingByParticipant = await tx.indexedRegistration.findUnique({
            where: {
              reg_event_participant_unique: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                eventId,
                participantAddress,
              },
            },
          });

          if (existingByTx || existingByParticipant) {
            metrics.duplicatesSkipped += 1;
          } else {
            await tx.indexedRegistration.create({
              data: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                eventId,
                participantAddress,
                transactionHash: item.transactionHash,
                blockNumber: item.blockNumber,
                logIndex: item.logIndex,
              },
            });
            metrics.registrationsIndexed += 1;
          }
        } else if (item.eventName === "AttendanceMarked") {
          const eventId = Number(item.args.eventId ?? item.args[0]);
          const participantAddress = String(
            item.args.participant ?? item.args[1]
          ).toLowerCase();

          const existingByTx = await tx.indexedAttendance.findUnique({
            where: {
              att_tx_log_unique: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                transactionHash: item.transactionHash,
                logIndex: item.logIndex,
              },
            },
          });

          const existingByParticipant = await tx.indexedAttendance.findUnique({
            where: {
              att_event_participant_unique: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                eventId,
                participantAddress,
              },
            },
          });

          if (existingByTx || existingByParticipant) {
            metrics.duplicatesSkipped += 1;
          } else {
            await tx.indexedAttendance.create({
              data: {
                chainId: Number(chainId),
                contractAddress: normalizedContract,
                eventId,
                participantAddress,
                transactionHash: item.transactionHash,
                blockNumber: item.blockNumber,
                logIndex: item.logIndex,
              },
            });
            metrics.attendancesIndexed += 1;
          }
        }
      }

      // Checkpoint güncellemesi veri yazımlarıyla AYNI transaction içinde gerçekleştirilir
      await tx.indexerCheckpoint.upsert({
        where: {
          chainId_contractAddress: {
            chainId: Number(chainId),
            contractAddress: normalizedContract,
          },
        },
        create: {
          chainId: Number(chainId),
          contractAddress: normalizedContract,
          lastProcessedBlock: toBlock,
        },
        update: {
          lastProcessedBlock: toBlock,
        },
      });
    });

    metrics.batchesProcessed += 1;
    metrics.lastProcessedBlock = toBlock;
    metrics.lastRunAt = new Date().toISOString();
    return { fromBlock, toBlock, logsProcessed: logs.length };
  }

  /**
   * Başlangıç blokundan veya son checkpoint'ten itibaren güvenli son bloğa kadar senkronize eder.
   */
  async function syncOnce({ targetBlockOverride = null } = {}) {
    const { activeProvider } = getActiveContractAndProvider();

    const latestBlock =
      targetBlockOverride !== null
        ? Number(targetBlockOverride)
        : await executeWithRetry(
            () => activeProvider.getBlockNumber(),
            "getBlockNumber"
          );

    const safeTargetBlock = Math.max(0, latestBlock - confirmations);
    const checkpoint = await getCheckpoint();

    let scanFromBlock;
    let isReorgRescan = false;

    if (!checkpoint) {
      scanFromBlock =
        Number(startBlock) > 0
          ? Number(startBlock)
          : safeTargetBlock > batchSize * 2
            ? Math.max(0, safeTargetBlock - batchSize + 1)
            : 0;
    } else if (reorgLookbackBlocks > 0) {
      scanFromBlock = Math.max(
        Number(startBlock),
        Number(checkpoint.lastProcessedBlock) - reorgLookbackBlocks + 1
      );
      isReorgRescan = scanFromBlock <= Number(checkpoint.lastProcessedBlock);
    } else {
      scanFromBlock = Number(checkpoint.lastProcessedBlock) + 1;
    }

    if (scanFromBlock > safeTargetBlock) {
      metrics.lastProcessedBlock = checkpoint
        ? Number(checkpoint.lastProcessedBlock)
        : safeTargetBlock;
      metrics.lastRunAt = new Date().toISOString();
      return {
        synced: true,
        fromBlock: scanFromBlock,
        toBlock: safeTargetBlock,
        batches: 0,
        lastProcessedBlock: metrics.lastProcessedBlock,
      };
    }

    let batches = 0;
    for (
      let cursor = scanFromBlock;
      cursor <= safeTargetBlock;
      cursor += batchSize
    ) {
      const batchEnd = Math.min(safeTargetBlock, cursor + batchSize - 1);
      await processBlockBatch(cursor, batchEnd, isReorgRescan);
      batches += 1;
    }

    logger.info("Indexer senkronizasyon turu tamamlandı.", {
      fromBlock: scanFromBlock,
      toBlock: safeTargetBlock,
      batches,
    });

    return {
      synced: true,
      fromBlock: scanFromBlock,
      toBlock: safeTargetBlock,
      batches,
      lastProcessedBlock: safeTargetBlock,
    };
  }

  function getMetrics() {
    return { ...metrics };
  }

  return {
    syncOnce,
    processBlockBatch,
    getCheckpoint,
    getMetrics,
  };
}
