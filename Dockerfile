# syntax=docker/dockerfile:1
# bliblitalk-admin — single fullstack container: the Express backend serves the
# built admin FE (Vite) statically from the same process. Build context is the
# repo root: `docker build -t bliblitalk-admin .`
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable
# Prisma needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile
RUN npm rebuild @tailwindcss/oxide || true
RUN pnpm --filter @repo/backend generate

FROM deps AS build-frontend
RUN pnpm --filter @repo/frontend build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build-frontend /app .
EXPOSE 4000
CMD ["pnpm", "--filter", "@repo/backend", "start"]
