import express from "express";
import type { Router } from "express";
import { createAccountsRouter } from "../accounts/routes";
import { createAuthRouter } from "../auth/routes";
import { createInsightsRouter } from "../insights/routes";
import { createLedgerRouter } from "../ledger/routes";
import { healthRouter } from "./health";

export function createApiRouter(): Router {
  const router = express.Router();

  router.use(healthRouter);
  router.use("/auth", createAuthRouter());
  router.use("/accounts", createAccountsRouter());
  router.use("/transactions", createLedgerRouter());
  router.use("/insights", createInsightsRouter());

  return router;
}
