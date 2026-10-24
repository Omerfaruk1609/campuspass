import { createRouter } from "../utils/expressAdapter.js";

export function createHealthRoutes({ healthController }) {
  const router = createRouter();
  router.get("/", (req, res) => healthController.getHealth(req, res));
  return router;
}
