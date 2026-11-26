import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { E2E_ENV } from "./env.js";

// Prepares a clean database, then starts the worker (it has no HTTP port, so
// it cannot be one of Playwright's web servers). Returns the teardown.
export default async function globalSetup() {
  process.env.TEST_DATABASE_URL = E2E_ENV.DATABASE_URL;
  const { prepareTestDatabase, resetDb, testDb } = await import("@app/db/testing");
  await prepareTestDatabase();
  const db = testDb();
  await resetDb(db);
  await db.$disconnect();

  const worker = spawn(process.execPath, [fileURLToPath(new URL("../worker/dist/main.js", import.meta.url))], {
    env: { ...process.env, ...E2E_ENV },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  if (worker.exitCode !== null) throw new Error(`The worker exited with code ${worker.exitCode}`);

  return async () => {
    worker.kill();
  };
}
