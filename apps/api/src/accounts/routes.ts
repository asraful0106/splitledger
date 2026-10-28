import express from "express";
import type { Router } from "express";
import {
  createAccountSchema,
  depositSchema,
  replacePartsSchema,
  updateAccountSchema,
  withdrawalSchema,
} from "shared";
import { asyncHandler } from "../http/async-handler";
import * as ledgerController from "../ledger/controller";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../middleware/validate";
import * as controller from "./controller";

export function createAccountsRouter(): Router {
  const router = express.Router();

  router.use(requireAuth);

  router.get("/", asyncHandler(controller.list));
  router.post("/", validate({ body: createAccountSchema }), asyncHandler(controller.create));

  router.get("/:id", asyncHandler(controller.get));
  router.patch("/:id", validate({ body: updateAccountSchema }), asyncHandler(controller.update));
  router.post("/:id/archive", asyncHandler(controller.archive));
  router.get("/:id/parts", asyncHandler(controller.listParts));
  router.put(
    "/:id/parts",
    validate({ body: replacePartsSchema }),
    asyncHandler(controller.replaceParts),
  );

  router.post(
    "/:id/deposits",
    validate({ body: depositSchema }),
    asyncHandler(ledgerController.deposit),
  );
  router.post(
    "/:id/withdrawals",
    validate({ body: withdrawalSchema }),
    asyncHandler(ledgerController.withdraw),
  );
  router.get("/:id/transactions", asyncHandler(ledgerController.listTransactions));
  router.get("/:id/summary", asyncHandler(ledgerController.summary));

  return router;
}
