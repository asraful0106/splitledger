import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      JWT_ACCESS_SECRET: "test-access-secret-000000",
      JWT_REFRESH_SECRET: "test-refresh-secret-00000",
    },
  },
});
