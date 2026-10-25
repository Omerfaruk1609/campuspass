import { createRouter } from "../utils/expressAdapter.js";

export function createStudentRoutes({
  studentController,
  requireAuthSession,
  optionalAuthSession,
}) {
  const router = createRouter();

  const optionalAuth = optionalAuthSession || ((req, res, next) => next());
  const requireAuth = requireAuthSession || ((req, res, next) => next());

  // Profil güncelleme (SIWE oturumu ve CSRF doğrulaması gerektirir)
  router.patch("/profile", requireAuth, (req, res) =>
    studentController.updateProfile(req, res)
  );

  // Profil sorgulama (herkese açık veya oturum açılmışsa detaylı)
  router.get("/:walletAddress/profile", optionalAuth, (req, res) =>
    studentController.getProfile(req, res)
  );

  router.get("/:walletAddress/events", (req, res) =>
    studentController.getStudentEvents(req, res)
  );
  router.get("/:walletAddress/attendance", (req, res) =>
    studentController.getStudentAttendance(req, res)
  );

  return router;
}
