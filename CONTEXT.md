# CONTEXT.md

Living state of this project: progress tracker and AI context. Agents: read this before non-trivial work; update the affected sections when changes are material (structure, plan, milestones, decisions). Keep it current-state, not a changelog — git history records history. If this file contradicts the code, the code wins: fix this file. Go-live and review information does not live here; it lives in PROJECT.md, the review dossier.

## Overview

Blibli Talk 2.0 admin CMS + Express backend + PostgreSQL for Blibli's internal Talent Engagement
event platform (talks, workshops, speed-dating sessions for employees). As of the repo-split
architecture (see Plan And Milestones), this backend is **internal-only / admin-only**: it no
longer serves any public API. A separate repo, `bliblitalk-user-fe`, has its own `apps/backend`
that serves the participant portal, connecting directly to the **same shared Postgres database**
(no proxy between the two backends). This repo remains the sole owner of `schema.prisma` and all
migrations; `bliblitalk-user-fe` mirrors a generated copy and only runs `prisma generate`, never
`migrate`/`seed`.

## Structure

- `apps/backend/` — Express + TypeScript API, admin-only. `src/routes/admin/*` serves this repo's
  own admin FE; `src/routes/auth/*` is admin-only login (Microsoft SSO mock + email/password),
  rejecting any non-admin (`PARTICIPANT`) account the same as "not found" — participant auth lives
  entirely in `bliblitalk-user-fe`'s backend now. `src/db/prisma/` holds the schema, migrations, and
  `seed.ts` (PostgreSQL 15) — unchanged as the single source of truth for both repos.
  `src/lib/lifecycle/` is the event-status-transition engine (`transitionEvent`, the scheduler,
  the pure boundary-decision logic). PDF certificate generation (`pdfkit`) moved to
  `bliblitalk-user-fe` (participant-facing download) — this repo no longer depends on it.
- `apps/frontend/` — Admin CMS, React 19 + Vite. No automated test coverage yet (as of P8's start —
  see Plan And Milestones).
- `packages/shared-types/` — DTOs, enums, and the lifecycle transition table (`lifecycle.ts`),
  shared between backend and admin FE.
- `packages/shared-utils/` — shared pure utilities (date formatting/validation, status color/label
  mapping) — has Vitest coverage.
- `packages/auth/` — RBAC/claims shared between backend and admin FE.
- `docs/DESIGN.md` — the design-review document (architecture, sequence, DB schema, financial-risk
  diagrams). `docs/superpowers/specs/` and `docs/superpowers/plans/` hold every phase's design spec
  and implementation plan, in date order — the authoritative history of *why* things are the way
  they are.
- `k8s/` — Kubernetes manifests, **explicitly a documented placeholder** ("not wired yet") — no
  actual YAML, no chosen cluster target. `docker-compose.yml` + root `Dockerfile` work for
  local/single-host use only.

## Plan And Milestones

**Active plan — repo split into two full-stack apps on one shared database** (Tech R&D request;
plan file `resilient-skipping-meteor.md`, supersedes the P1–P8 lifecycle roadmap below — P1–P7 of
that roadmap are merged, P8's QA-hardening/go-live remnants are tracked separately, not dropped):

- [x] Phase 0 — Land pending work, tag both repos at a green rollback point.
- [x] Phase 1 — Untangle public/admin boundary in this repo while still one app (relocate shared
  infra, split mappers, gate both schedulers behind `ENABLE_SCHEDULERS`, make side-effecting GETs
  explicit). Full backend suite stayed green throughout.
- [x] Phase 2 — Scaffold `bliblitalk-user-fe`'s new `apps/backend` + `packages/*`, adopt Turborepo,
  provision its restricted DB role.
- [x] Phase 3 — Move `routes/public/*` + participant auth + certificate PDF generation into
  `bliblitalk-user-fe`'s backend.
- [x] Phase 4 — Collapse `bliblitalk-user-fe`'s hand-duplicated FE/BE types into `packages/shared-types`.
- [x] Phase 5 — Trim this backend to admin-only: deleted `routes/public/*` and its CORS/mount
  block, dropped `pdfkit`/`svg-to-pdfkit`, made `/api/auth/login` reject non-admin accounts
  (mirrors the equivalent Phase 3 fix on the public backend), seeded `VIEWER`/`HR_TA` accounts so
  every `ADMIN_ROLES` tier has live test coverage, and fixed the resulting RBAC-test regressions
  (10 files — role-swapped or removed now-unreachable "rejects participants" tests; see Key
  Decisions). Exit: 150/150 backend tests green, zero `/api/public/*` surface.
- [ ] Phase 6 — **Deferred by owner decision**: no GCS project/bucket exists yet, so uploads stay
  local-disk for now (`apps/backend/src/routes/admin/adminUploads.routes.ts`, unchanged). Resume
  once a bucket is provisioned. Known consequence of deferring: uploaded images remain served only
  from this backend's local filesystem — `bliblitalk-user-fe` cannot render admin-uploaded images
  (banners, speaker avatars) until this lands, and the pre-existing ephemerality bug (no volume in
  compose/k8s) is still open.
- [ ] Phase 7 — Two Dockerfiles, path-routed ingress, split env per app, CI, governance doc updates.
  Landed this session, verified (typecheck/lint/test green — 150/150 backend tests after a reseed
  cleared a stale P4-era e2e fixture row), pending commit: `ADMIN_JWT_SECRET` renamed to `JWT_SECRET`
  throughout (it stopped being admin-only the moment `bliblitalk-user-fe` needed the same value),
  deleted the stale unused root `.env.example`, rewrote `k8s/README.md` for the two-repo topology,
  added `.github/workflows/ci.yml`, and added a `⚠️ STALE` banner to `docs/DESIGN.md` (14 mentions of
  the now-deleted `/api/public/*`).

**Completed — 8-phase event-lifecycle & status-consistency overhaul** (each phase separately
specced and planned under `docs/superpowers/`):

- [x] P1 — 8-state `EventStatus` enum + `transitionEvent()` as the sole status writer + audit trail
  (`EventStatusHistory`).
- [x] P2 — real 60s scheduler (`sweepEventLifecycle`) replacing the old lazy read-time sweep.
- [x] P3 — admin FE lifecycle UI (status header, history tab, lifecycle-gated actions).
- [x] P4 — user-FE participant-badge matrix + Shortlisted-Only fix.
- [x] P5 — category taxonomy (`EventCategory` table replaces free-text `category`).
- [x] P6 — create/edit event form restructure (Identity/Schedule/Behavior sections).
- [x] P7 — lifecycle backfill & reconciliation (closed the gap P1's migration deferred; every
  non-DRAFT event now has ≥1 `EventStatusHistory` row, backed by a permanent regression test).
- [ ] P8 — QA hardening & go-live gate: independent review + final go-live gate for this repo are
  still open (tracked in the task list) — paused when the repo-split request arrived; resume once
  the split's Phase 7 governance-doc updates land, since the risk profile and `PROJECT.md` facts
  they'd review are still shifting.

## Key Decisions

- **`transitionEvent()` is the sole writer of `event.status`** — every other code path (admin
  actions, the scheduler) calls through it. It's CAS-guarded and writes one `EventStatusHistory` row
  per transition. Never bypass it with a direct Prisma `update`.
- **Two independently deployable backends, one shared Postgres, no proxy.** `bliblitalk-user-fe`
  now has its own `apps/backend` connecting directly to the same database via its own Prisma
  client and a restricted DB role (write access limited to participant-owned tables). This repo
  stays the sole owner of `schema.prisma`/migrations; the other repo mirrors a generated copy and
  never runs `migrate`/`seed`. There is still no pnpm/npm workspace link between the two repos —
  each has its own `packages/*`; the schema/shared-types are synced by a script, not shared by
  reference. UI-only logic with no backend counterpart (e.g. the participant-badge matrix, or
  `bliblitalk-user-fe`'s `utils/date.ts`) stays duplicated by design, per repo.
- **Auth splits by user population, and since 2026-08-06 by mechanism too.** The two backends no
  longer share an authentication surface at all: this repo has no login and no session (Apps
  Gateway authenticates staff at the edge and forwards `X-User-Id`), while `bliblitalk-user-fe`
  signs participants in with an emailed one-time code and issues its own JWT cookie. The shared
  `JWT_SECRET` that the split plan assumed is gone from this repo, so nothing has to be kept
  byte-identical between them. `User.tokenVersion` is still shared: this repo bumps it on a role
  change, and `bliblitalk-user-fe`'s `requireAuth` is what enforces the resulting revocation.
- **The `VIEWER` role is retired (owner decision, 2026-08-06).** Read-only observers were never
  part of the intended org model, so `VIEWER` was removed from the `Role` enum outright — not
  merely hidden from the UI. Because `Role` is a Postgres enum and Postgres cannot drop an enum
  value in place, `migrations/20260806120000_drop_viewer_role` recreates the type; existing
  `VIEWER` rows are moved to `PARTICIPANT` (least privilege — they lose CMS access rather than
  silently gaining rights) and a Super Admin re-grants a real role if needed. Consequence worth
  knowing: `VIEWER` was the only admin tier without `USER_MANAGE`, so listing users is no longer
  deniable to any Admin CMS role; `adminUsers.routes.test.ts` now proves the `ROLE_MANAGE`
  boundary instead, which only `SUPER_ADMIN` holds.
- **Every `ADMIN_ROLES` tier needs live seed coverage, not just `SUPER_ADMIN`/`EVENT_ADMIN`.**
  `hrta@gdn-commerce.com` (`HR_TA`) is in `seed.ts` specifically so RBAC-denial tests have a
  real account
  that genuinely lacks the permission under test — `PARTICIPANT` accounts can no longer log in to
  this backend at all, so they stopped being usable as the "authenticated but unauthorized" test
  fixture. When a route's permission is held by literally every `ADMIN_ROLES` member (e.g.
  `EVENT_READ`, `PARTICIPANT_READ`), there is no valid account to prove a permission-denial with —
  the correct fix is removing that specific assertion (the unauthenticated-401 case already covers
  the route), not forcing a technically-passing-but-meaningless substitute.
- **Never bump a shared seed account's `tokenVersion` from a test that runs in file-parallel.**
  Vitest's default `fileParallelism` runs test files concurrently against one live Postgres. A
  logout/role-change test that revokes a heavily-shared fixture account's session (e.g.
  `superadmin@gdn-commerce.com`) can race another file's in-flight session for that same account.
  The established fix (see `adminUsers.routes.test.ts`'s and `auth.routes.test.ts`'s SEC-007 tests)
  is a disposable, single-purpose account created via `prisma.user.create` + cleaned up in
  `afterAll` — never reuse a hot shared fixture for a session-revoking test.
- **`seed.ts` wipes and recreates all data on every run.** A migration-only data fix is transient
  unless mirrored in `seed.ts` itself — P5 and P7 both needed a matching migration + seed fix pair
  for this reason.
- **This repo is scaffolded by the company's `vibe-stack` playbook** (`TECH_STACK.md`, Zone 1 — no
  external LLM/API calls, no payments) but had never been through the full governance/go-live
  process until P8.
- **Local dev Postgres is a portable, non-persistent install** (not Docker, not a service) — it does
  not survive a reboot and needs manual restart; see the project's own memory notes for the exact
  command if a Prisma call fails with a connection error.
- **This repo's login is Apps Gateway SSO, admin-only** (planned 2026-08-03, implemented 2026-08-06).
  Apps Gateway fits this repo because its entire user population (`SUPER_ADMIN`/`EVENT_ADMIN`/
  `HR_TA`) is internal staff — it does not fit `bliblitalk-user-fe` (external participants,
  no company-account requirement), which signs participants in with an emailed one-time code
  (2026-08-04) and carries its own OPEN governance finding for that non-approved mechanism.
  What changed: `/api/auth/login`, `/api/auth/microsoft` (the mocked SSO, `GLG-001`) and JWT/cookie
  sessions are gone; identity comes from the gateway's `X-User-Id` header (the user's email), and
  the browser learns who it is from the gateway's own `GET /auth/api/me`. `packages/auth/src/rbac.ts`'s
  `ROLE_PERMISSIONS`/`isAdminRole` are unchanged and remain the app-layer authorization, now keyed by
  `User.email` rather than the JWT's `sub` — owner confirmed access must still be role-based ("by role
  juga nanti aksesnya"). The gateway's own `admin` flag is deliberately **not** reused as an app role.
  Locally there is no gateway, so `/dev-login` stores an email and a DEV-only helper sends the header;
  both are excluded from production builds.
  **Still blocked on DevOps** (the app cannot serve real users until these land, and none of them are
  code): subdomain + named owner emails registered at `/auth/ui/apps`; this app moved to its own
  hostname (today's `k8s/README.md` topology path-routes it at `/admin`, but gateway registration is
  subdomain-based); no ingress of its own, so `X-User-Id` is trustworthy; and Phase 6 (uploads → GCS),
  because `/api/uploads/**` is unauthenticated static serving that the portal uses as `<img src>` and
  would otherwise start redirecting to the login UI. See `PROJECT.md` "Login Method" for the exact
  registration values to hand over.

## Current State

Backend serves admin-only routes as of Phase 5 (150/150 Vitest tests green — trimmed down from the
prior count after deleting the public-route test files, offset by new RBAC-fix tests). Admin FE has
zero automated tests (P8 Task 4 added the first: `LifecycleActionBar`, plus the Vitest+RTL infra
itself — no further FE coverage added since). Phase 7 (CI, two Dockerfiles/docker-compose already
existed from the split; k8s docs, JWT_SECRET rename, governance-doc corrections) is made and
verified but not yet committed — see Plan And Milestones above. Uploads are still local-disk with
relative URLs (Phase 6, deferred by owner decision, will move them to GCS and rewrite the persisted
URLs). Also pending (not yet implemented, just planned): migrating this repo's login to Apps Gateway
SSO, admin-only — see the Key Decisions entry above and `docs/REMEDIATION.md` `GLG-001`.
`PROJECT.md`'s independent-review and final go-live gate for this repo are still open — paused
pending the split plan's Phase 7 governance-doc refresh. Immediate next step: commit Phase 7.
