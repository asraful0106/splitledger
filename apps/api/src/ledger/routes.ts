import express from "express";
import type { Router } from "express";
import { asyncHandler } from "../http/async-handler";
import { requireAuth } from "../middleware/require-auth";
import * as controller from "./controller";

export function createLedgerRouter(): Router {
  const router = express.Router();

  router.use(requireAuth);

  router.post("/:id/reverse", asyncHandler(controller.reverse));

  return router;
}
