import express from "express";
import type { Router } from "express";

export const healthRouter: Router = express.Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});
