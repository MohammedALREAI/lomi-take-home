import { execSync } from "node:child_process";
import { createPrismaClient } from "../src/client.js";
import { TEST_DATABASE_URL } from "./db.js";

// Creates the test database if needed and applies the migrations to it.
export default async function setup() {
  const admin = createPrismaClient(TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1"));
  try {
    const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
    const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
