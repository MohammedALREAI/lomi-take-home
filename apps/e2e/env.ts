// Where the e2e stack runs: the dev or CI Postgres and Redis, in a database of
// its own, with the worker's test-only rule extractor (no API key needed).
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://app:app@localhost:5433/app_e2e",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6380",
  EXTRACTOR: "rules",
};
