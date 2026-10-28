import "./load-env";
import { createApp } from "./app";
import { closePool } from "./db/pool";
import { env } from "./env";
import { logger } from "./logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`api listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
