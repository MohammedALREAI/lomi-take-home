# One image for every service; docker-compose.yml picks the command.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.28.2
WORKDIR /app

FROM base AS app
# Fetch dependencies from the lockfile alone so this layer stays cached.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# Copy workspace manifests before sources so code edits never re-run pnpm install.
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/e2e/package.json apps/e2e/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/queue/package.json packages/queue/package.json
RUN pnpm install --offline --frozen-lockfile

COPY . .
# The web app forwards /api/* to the API; inside compose that is the api service.
ENV API_URL=http://api:3001
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=!@app/e2e
ENV NODE_ENV=production
