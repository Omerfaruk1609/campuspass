import { createRouter } from "../utils/expressAdapter.js";

export function createAuthRoutes({ authController, authRateLimiter }) {
  const router = createRouter();

  router.get("/nonce", authRateLimiter, (req, res) =>
    authController.getNonce(req, res)
  );
  router.post("/verify", authRateLimiter, (req, res) =>
    authController.verifySiwe(req, res)
  );
  router.get("/session", (req, res) => authController.getSession(req, res));
  router.post("/logout", (req, res) => authController.logout(req, res));

  return router;
}
