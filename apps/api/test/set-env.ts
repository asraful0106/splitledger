import "../src/load-env";
import { testDatabaseUrl } from "./helpers/test-db";

process.env.TEST_DATABASE_URL = testDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl();
