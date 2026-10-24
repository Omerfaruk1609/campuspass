import { createRouter } from "../utils/expressAdapter.js";

export function createCertificateRoutes({
  certificateController,
  requireOrganizerSession,
  certificateWriteRateLimiter,
  certificateVerifyRateLimiter,
}) {
  const router = createRouter();

  const writeMw = certificateWriteRateLimiter
    ? [certificateWriteRateLimiter, requireOrganizerSession]
    : [requireOrganizerSession];

  const verifyMw = certificateVerifyRateLimiter
    ? [certificateVerifyRateLimiter]
    : [];

  // Giriş yapmış öğrencinin sertifika oluşturma ve listeleme endpoint'leri (SIWE Oturumu zorunlu)
  router.post("/", ...writeMw, (req, res) =>
    certificateController.issueCertificate(req, res)
  );
  router.get("/me", requireOrganizerSession, (req, res) =>
    certificateController.getMyCertificates(req, res)
  );

  // Herkese açık öğrenci cüzdanı sertifika listesi (displayName hariç)
  router.get("/wallet/:walletAddress", ...verifyMw, (req, res) =>
    certificateController.getWalletCertificates(req, res)
  );

  // Herkese açık sertifika doğrulama ve detay endpoint'leri (Cüzdan bağlantısı gerektirmez)
  router.get("/:certificateId/verify", ...verifyMw, (req, res) =>
    certificateController.verifyCertificate(req, res)
  );
  router.get("/:certificateId", ...verifyMw, (req, res) =>
    certificateController.getCertificateById(req, res)
  );

  return router;
}
