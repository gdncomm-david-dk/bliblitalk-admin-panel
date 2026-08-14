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
RUN pnpm --filter @repo/backend generate

FROM deps AS build-frontend
RUN pnpm --filter @repo/frontend build

FROM base AS run
ENV NODE_ENV=production
# Review Finding 13: the image ran as root, so a process compromise started with uid 0 and
# every file in the image writable. `node` is a non-root uid the base image already ships.
COPY --from=build-frontend --chown=node:node /app .
# The backend writes uploaded images here (adminUploads.routes.ts resolves it from cwd), so
# it has to exist and be owned by `node` before the process drops to that uid — a fresh
# mkdir at runtime would fail once the tree is no longer writable by the running user.
RUN mkdir -p /app/apps/backend/uploads && chown -R node:node /app/apps/backend/uploads
USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@repo/backend", "start"]
