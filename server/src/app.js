import { createAuthController } from "./controllers/authController.js";
import { createEventController } from "./controllers/eventController.js";
import { createHealthController } from "./controllers/healthController.js";
import { createStudentController } from "./controllers/studentController.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import {
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
} from "./middleware/securityMiddleware.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createEventRoutes } from "./routes/eventRoutes.js";
import { createHealthRoutes } from "./routes/healthRoutes.js";
import { createStudentRoutes } from "./routes/studentRoutes.js";
import { createAuthService } from "./services/authService.js";
import { createBlockchainService } from "./services/blockchainService.js";
import { createEventService } from "./services/eventService.js";
import { createTransactionalPrismaStore } from "./services/prismaClient.js";
import { createStudentService } from "./services/studentService.js";
import { env } from "./utils/env.js";
import { createApp } from "./utils/expressAdapter.js";

/**
 * CampusPass Backend API Uygulama Fabrikası
 * - Hem gerçek üretim sunucusunda hem de bağımsız entegrasyon testlerinde
 *   bağımlılık enjeksiyonuyla (Prisma, Contract, Provider, CORS, RateLimit) başlatılabilir.
 */
export function buildCampusPassApp({
  prisma = createTransactionalPrismaStore(),
  contract = null,
  provider = null,
  indexer = null,
  chainId = env.MONAD_CHAIN_ID,
  contractAddress = env.CONTRACT_ADDRESS_CHECKSUM,
  allowedOrigins = env.ALLOWED_ORIGINS,
  siweDomain = env.SIWE_DOMAIN,
  siweUri = env.SIWE_URI,
  rateLimitMax = env.RATE_LIMIT_MAX_REQUESTS,
  authRateLimitMax = env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  maxBodySizeBytes = env.MAX_BODY_SIZE_BYTES,
} = {}) {
  const blockchainService = createBlockchainService({
    contract,
    provider,
    chainId,
    contractAddress,
  });

  const authService = createAuthService({
    prisma,
    expectedDomain: siweDomain,
    expectedUri: siweUri,
    expectedChainId: chainId,
  });

  const eventService = createEventService({
    prisma,
    blockchainService,
  });

  const studentService = createStudentService({
    prisma,
    blockchainService,
    eventService,
  });

  const healthController = createHealthController({
    prisma,
    blockchainService,
    indexer,
  });
  const authController = createAuthController({ authService });
  const eventController = createEventController({ eventService });
  const studentController = createStudentController({ studentService });

  const { requireOrganizerSession } = createAuthMiddleware({ authService });

  const globalRateLimiter = createRateLimiter({
    maxRequests: rateLimitMax,
    scope: "api",
  });
  const authRateLimiter = createRateLimiter({
    maxRequests: authRateLimitMax,
    scope: "auth",
  });

  const app = createApp({ maxBodySizeBytes });

  app.use(createSecurityHeadersMiddleware());
  app.use(createCorsMiddleware({ allowedOrigins }));
  app.use(globalRateLimiter);

  app.use("/api/health", createHealthRoutes({ healthController }));
  app.use("/api/auth", createAuthRoutes({ authController, authRateLimiter }));
  app.use(
    "/api/events",
    createEventRoutes({ eventController, requireOrganizerSession })
  );
  app.use("/api/students", createStudentRoutes({ studentController }));

  app.use(createErrorHandler());

  return {
    app,
    services: {
      prisma,
      blockchainService,
      authService,
      eventService,
      studentService,
    },
  };
}
