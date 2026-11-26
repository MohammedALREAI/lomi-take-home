import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // PDF bytes are only read by the worker, which asks for them explicitly.
    omit: { documentVersion: { pdf: true } },
  });
}

export type Db = ReturnType<typeof createPrismaClient>;
