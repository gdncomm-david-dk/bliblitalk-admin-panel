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

The backend serves the admin CMS only, behind a per-prefix CORS allow-list (never a wildcard).
Apps Gateway authenticates every request at the edge and forwards the signed-in user's email in
`X-User-Id`; this app issues no session and verifies no token of its own.

| Prefix | Consumer | Auth |
|---|---|---|
| `/api/admin/*` | this repo's admin FE | `X-User-Id` + an Admin CMS role on that email |
| `/api/me` | this repo's admin FE | same — returns the caller's profile and role |
| `/api/health`, `/api/version` | GKE and gateway probes | none, by gateway design (exact-match paths) |

`/api/public/*` moved to `bliblitalk-user-fe` in Phase 5, and `/api/auth/*` was deleted in the
Apps Gateway migration — `/auth/**` belongs to the gateway and must never be claimed by this app.

In production, the backend also serves the built admin FE statically — one fullstack Docker container.

## Local development

### Prerequisites
- Node.js 22 LTS (`nvm use`)
- pnpm
- PostgreSQL 15 (or Docker)

### Run without Docker
```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env   # fill in DATABASE_URL, etc.
pnpm --filter @repo/backend db:migrate
pnpm --filter @repo/backend db:seed
pnpm --filter @repo/backend dev     # Terminal 1 — http://localhost:4000
pnpm --filter @repo/frontend dev    # Terminal 2 — http://localhost:5174 (proxies /api → :4000)
```

### Signing in locally
The CMS sits behind Apps Gateway, which authenticates the user and forwards their email in
`X-User-Id`. The gateway is not available locally, so the dev build serves `/dev-login`: pick
one of the seeded admin accounts and the frontend sends that email as `X-User-Id` on every API
call. No password is involved, and the whole mechanism is compiled out of production builds.

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

`bliblitalk-user-fe` — the participant-facing app. Since Phase 5 it has its own backend and calls
nothing here; the two share only the Postgres database (it connects through the restricted
`bliblitalk_public` role) and the generated contracts this repo owns, which it mirrors with
`pnpm sync:admin`. It authenticates participants itself, by emailed one-time code — it is not
behind Apps Gateway, and deliberately so: its users are external and hold no company account.
