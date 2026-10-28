import { defineConfig } from "vitest/config";

process.env.NODE_ENV = "test";

export default defineConfig({
  resolve: {
    alias: {
      "virtual:pwa-register/react": new URL(
        "./src/test/pwa-register-stub.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    env: { NODE_ENV: "test" },
  },
});
