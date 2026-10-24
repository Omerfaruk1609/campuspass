import { createAuthController } from "./controllers/authController.js";
import { createCertificateController } from "./controllers/certificateController.js";
import { createEventController } from "./controllers/eventController.js";
import { createHealthController } from "./controllers/healthController.js";
import { createOrganizerAnalyticsController } from "./controllers/organizerAnalyticsController.js";
import { createStudentController } from "./controllers/studentController.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import {
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
} from "./middleware/securityMiddleware.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createCertificateRoutes } from "./routes/certificateRoutes.js";
import { createEventRoutes } from "./routes/eventRoutes.js";
import { createHealthRoutes } from "./routes/healthRoutes.js";
import { createOrganizerAnalyticsRoutes } from "./routes/organizerAnalyticsRoutes.js";
import { createStudentRoutes } from "./routes/studentRoutes.js";
import { createAuthService } from "./services/authService.js";
import { createBlockchainService } from "./services/blockchainService.js";
import { createCertificateService } from "./services/certificateService.js";
import { createEventService } from "./services/eventService.js";
import { createOrganizerAnalyticsService } from "./services/organizerAnalyticsService.js";
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
  certificateWriteRateLimitMax = 30,
  certificateVerifyRateLimitMax = 90,
  certificateConfirmations = 0,
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

  const certificateService = createCertificateService({
    prisma,
    blockchainService,
    confirmations: certificateConfirmations,
  });

  const organizerAnalyticsService = createOrganizerAnalyticsService({
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
  const certificateController = createCertificateController({
    certificateService,
  });
  const organizerAnalyticsController = createOrganizerAnalyticsController({
    organizerAnalyticsService,
  });

  const { requireOrganizerSession } = createAuthMiddleware({ authService });

  const globalRateLimiter = createRateLimiter({
    maxRequests: rateLimitMax,
    scope: "api",
  });
  const authRateLimiter = createRateLimiter({
    maxRequests: authRateLimitMax,
    scope: "auth",
  });
  const certificateWriteRateLimiter = createRateLimiter({
    maxRequests: certificateWriteRateLimitMax,
    scope: "cert-write",
  });
  const certificateVerifyRateLimiter = createRateLimiter({
    maxRequests: certificateVerifyRateLimitMax,
    scope: "cert-verify",
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
  app.use(
    "/api/certificates",
    createCertificateRoutes({
      certificateController,
      requireOrganizerSession,
      certificateWriteRateLimiter,
      certificateVerifyRateLimiter,
    })
  );
  app.use(
    "/api/organizer",
    createOrganizerAnalyticsRoutes({
      organizerAnalyticsController,
      requireOrganizerSession,
    })
  );

  app.use(createErrorHandler());

  return {
    app,
    services: {
      prisma,
      blockchainService,
      authService,
      eventService,
      studentService,
      certificateService,
      organizerAnalyticsService,
    },
  };
}
