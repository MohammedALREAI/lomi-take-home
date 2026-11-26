import { defineConfig } from "vitest/config";

// Runs against a real Postgres (docker compose publishes it on localhost:5433).
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Tests share one database, so they must not run in parallel.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
