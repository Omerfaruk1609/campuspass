import { createRouter } from "../utils/expressAdapter.js";

export function createStudentRoutes({ studentController }) {
  const router = createRouter();

  router.get("/:walletAddress/events", (req, res) =>
    studentController.getStudentEvents(req, res)
  );
  router.get("/:walletAddress/attendance", (req, res) =>
    studentController.getStudentAttendance(req, res)
  );

  return router;
}
