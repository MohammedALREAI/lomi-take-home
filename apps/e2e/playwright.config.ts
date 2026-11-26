import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV } from "./env.js";

// Runs the built API, worker and web app end to end. Build first (turbo's
// test:e2e task does), and have Postgres and Redis up on :5433 / :6380.
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: "http://localhost:3001/health",
      env: { ...E2E_ENV, PORT: "3001" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node ../web/node_modules/next/dist/bin/next start ../web --port 3000",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
