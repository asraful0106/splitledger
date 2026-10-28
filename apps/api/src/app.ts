import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./env";
import { logger } from "./logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { createApiRouter } from "./routes";

export function createApp(): express.Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use("/api/v1", createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
