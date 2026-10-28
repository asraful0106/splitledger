import express from "express";
import type { Router } from "express";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../middleware/require-auth";
import * as controller from "./controller";

export function createInsightsRouter(): Router {
  const router = express.Router();

  router.use(requireAuth);

  router.get("/summary", asyncHandler(controller.summary));
  router.get("/alerts", asyncHandler(controller.alerts));
  router.get("/export.csv", asyncHandler(controller.exportCsv));

  return router;
}
