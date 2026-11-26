import { defineConfig } from "vitest/config";

// Each package gets its own test database so turbo can run them in parallel.
process.env.TEST_DATABASE_URL ??= "postgresql://app:app@localhost:5433/app_test_api";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
