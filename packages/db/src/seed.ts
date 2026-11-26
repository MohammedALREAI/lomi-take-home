// Seeds version 1 of each document in fixtures/documents.json.
//
// Safe to run on every start: an existing document or version is left exactly
// as it is (status, values and reviews included). New versions are created as
// `queued`; the worker's reconciler finds and extracts them, so seeding needs
// no Redis.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDocumentType } from "@app/core";
import { createPrismaClient } from "./client.js";

interface ManifestEntry {
  id: string;
  type: string;
  title: string;
  versions: { version: number; file: string }[];
}

const FIXTURES_DIR =
  process.env.FIXTURES_DIR ?? fileURLToPath(new URL("../../../fixtures", import.meta.url));

export async function seed(fixturesDir = FIXTURES_DIR): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(fixturesDir, "documents.json"), "utf8")) as ManifestEntry[];
  const db = createPrismaClient();
  try {
    for (const entry of manifest) {
      if (!isDocumentType(entry.type)) throw new Error(`Unknown document type ${entry.type} for ${entry.id}`);
      const first = entry.versions.find((v) => v.version === 1);
      if (!first) throw new Error(`${entry.id} has no version 1`);
      const pdf = new Uint8Array(await readFile(path.join(fixturesDir, first.file)));

      await db.document.upsert({
        where: { id: entry.id },
        create: { id: entry.id, type: entry.type, title: entry.title },
        update: {},
      });
      const version = await db.documentVersion.upsert({
        where: { documentId_number: { documentId: entry.id, number: 1 } },
        create: { documentId: entry.id, number: 1, fileName: path.basename(first.file), pdf },
        update: {},
        select: { status: true },
      });
      console.log(`[seed] ${entry.id} v1: ${version.status}`);
    }
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await seed();
}
