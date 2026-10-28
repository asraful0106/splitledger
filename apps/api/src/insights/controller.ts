import type { Request, Response } from "express";
import { exportQuerySchema, insightsQuerySchema } from "shared";
import { currentUserId } from "../http/current-user";
import * as service from "./service";

export async function summary(req: Request, res: Response): Promise<void> {
  const query = insightsQuerySchema.parse(req.query);
  const result = await service.summary({
    userId: currentUserId(req),
    accountId: query.accountId,
    from: new Date(query.from),
    to: new Date(query.to),
    granularity: query.granularity,
  });
  res.json({ data: result });
}

export async function alerts(req: Request, res: Response): Promise<void> {
  const result = await service.alerts({ userId: currentUserId(req) });
  res.json({ data: result });
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  const query = exportQuerySchema.parse(req.query);
  const { filename, csv } = await service.exportCsv({
    userId: currentUserId(req),
    accountId: query.accountId,
    from: new Date(query.from),
    to: new Date(query.to),
    type: query.type,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}
