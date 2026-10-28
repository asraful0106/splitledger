import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../../.env");

if (existsSync(envPath)) {
  config({ path: envPath });
}
