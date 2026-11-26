// Helpers for integration tests in any package. They run against a separate
// database (app_test) so tests never touch development data.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPrismaClient, type Db } from "./client.js";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://app:app@localhost:5433/app_test";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

export function testDb(): Db {
  return createPrismaClient(TEST_DATABASE_URL);
}

/** Creates the test database if needed and applies the migrations. For a vitest globalSetup. */
export async function prepareTestDatabase(): Promise<void> {
  const admin = createPrismaClient(TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1"));
  try {
    const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
    const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync("pnpm exec prisma migrate deploy", {
    cwd: PACKAGE_DIR,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

export async function resetDb(db: Db): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE "Review", "ExtractedValue", "ExtractionRun", "DocumentVersion", "Document" RESTART IDENTITY CASCADE`,
  );
}
