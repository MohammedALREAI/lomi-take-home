import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Local development keeps its settings in the root .env. Variables already set
// (Docker sets DATABASE_URL) win, and the image never contains a .env file.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` runs at image build time without a database, so the URL
    // is only required by the commands that connect (migrate, seed).
    url: process.env.DATABASE_URL ?? "",
  },
});
