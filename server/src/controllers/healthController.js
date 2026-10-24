import { env } from "../utils/env.js";

export function createHealthController({ prisma, blockchainService, indexer = null }) {
  return {
    async getHealth(req, res) {
      let dbStatus = "ok";
      let checkpoint = null;
      try {
        await prisma.$queryRaw`SELECT 1`;
        checkpoint = await prisma.indexerCheckpoint.findUnique({
          where: {
            chainId_contractAddress: {
              chainId: blockchainService.chainId,
              contractAddress: blockchainService.contractAddressNormalized,
            },
          },
        });
      } catch {
        dbStatus = "error";
      }

      const httpStatus = dbStatus === "ok" ? 200 : 503;

      res.status(httpStatus).json({
        success: dbStatus === "ok",
        ...(dbStatus !== "ok"
          ? {
              error: {
                code: "DATABASE_UNAVAILABLE",
                message: "Veritabanı bağlantısı şu anda kullanılamıyor.",
              },
            }
          : {}),
        data: {
          status: dbStatus === "ok" ? "healthy" : "degraded",
          service: "campuspass-backend",
          environment: env.NODE_ENV,
          database: {
            status: dbStatus,
            mode: prisma.$isTransactionalMemoryStore
              ? "transactional-local-store"
              : "postgresql-prisma",
          },
          blockchain: {
            chainId: blockchainService.chainId,
            contractAddress: blockchainService.contractAddress,
          },
          indexer: {
            lastProcessedBlock: checkpoint
              ? Number(checkpoint.lastProcessedBlock)
              : null,
            updatedAt: checkpoint?.updatedAt || null,
            ...(indexer ? { metrics: indexer.getMetrics() } : {}),
          },
          timestamp: new Date().toISOString(),
        },
      });
    },
  };
}
