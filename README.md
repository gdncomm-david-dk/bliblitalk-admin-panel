# Bliblitalk Admin

Admin CMS (React SPA) **+** Express backend **+** PostgreSQL for the Blibli Talk event platform.
This is the **only** repo that contains backend code and database access. See [TECH_STACK.md](./TECH_STACK.md) for the full stack, Zone declaration, and vibe-coding rules.

## Architecture

```
apps/frontend/   Admin CMS — React 19 + Vite (app/, features/, components/, services/, store/, pages/, ...)
apps/backend/    Express + TypeScript — the only backend in the Bliblitalk system
  src/routes/public/   consumed by bliblitalk-user-fe via /api/public/*
  src/routes/admin/    consumed by this repo's admin FE via /api/admin/*
  src/db/              Prisma schema, migrations, seed (PostgreSQL 15)
packages/shared-types/  DTOs/enums shared between admin FE and backend (@repo/shared-types)
packages/shared-utils/  Shared utility functions (@repo/shared-utils)
packages/auth/          RBAC/claims shared between admin FE and backend (@repo/auth)
k8s/             Kubernetes manifests for GKE deployment
```

The backend serves two audiences behind per-prefix CORS allow-lists (never a wildcard):

| Prefix | Consumer | Auth |
|---|---|---|
| `/api/public/*` | `bliblitalk-user-fe` (separate repo) | public / participant session |
| `/api/admin/*` | this repo's admin FE | admin session required |
| `/api/auth/*` | both frontends (single unified login) | — |
| `/api/health` | GKE probe | — |

In production, the backend also serves the built admin FE statically — one fullstack Docker container.

## Local development

### Prerequisites
- Node.js 22 LTS (`nvm use`)
- pnpm
- PostgreSQL 15 (or Docker)

### Run without Docker
```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env   # fill in DATABASE_URL, ADMIN_JWT_SECRET, etc.
pnpm --filter @repo/backend db:migrate
pnpm --filter @repo/backend db:seed
pnpm --filter @repo/backend dev     # Terminal 1 — http://localhost:4000
pnpm --filter @repo/frontend dev    # Terminal 2 — http://localhost:5174 (proxies /api → :4000)
```

### Run with Docker
```bash
cp apps/backend/.env.example apps/backend/.env
docker-compose up --build
# App: http://localhost:4000   Postgres: localhost:5432
```

### Verify
```bash
curl http://localhost:4000/api/health   # {"status":"ok"}
pnpm turbo run lint typecheck test build
```

## Related repo

`bliblitalk-user-fe` — the public participant-facing SPA. It contains zero backend code and only
calls this repo's `/api/public/*` and `/api/auth/*`. Its origin must be added to `PUBLIC_FE_ORIGIN`
here for CORS to allow it.
