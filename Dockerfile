# One image for every service; docker-compose.yml picks the command.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.28.2
WORKDIR /app

FROM base AS app
# Fetch dependencies from the lockfile alone so this layer is cached until it changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# The web app forwards /api/* to the API; inside compose that is the api service.
ENV API_URL=http://api:3001
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN pnpm turbo run build
ENV NODE_ENV=production
