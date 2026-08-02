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
- [ ] Phase 6 — Move uploads to Google Cloud Storage; rewrite persisted relative URLs to absolute.
- [ ] Phase 7 — Two Dockerfiles, path-routed ingress, split env per app, CI, governance doc updates.

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
- **Auth splits by user population, not by route prefix.** Each backend's `/api/auth/login` now
  explicitly rejects the other population's accounts as "not found" (401 `INVALID_CREDENTIALS`) —
  this repo's admin login rejects `PARTICIPANT` accounts; the public backend's login rejects admin
  accounts. Both still share the same JWT secret and the same `User.tokenVersion` column, so
  session revocation (logout, role change) stays consistent across both backends even though they
  never call each other.
- **Every `ADMIN_ROLES` tier needs live seed coverage, not just `SUPER_ADMIN`/`EVENT_ADMIN`.**
  `viewer@gdn-commerce.com` (`VIEWER`) and `hrta@gdn-commerce.com` (`HR_TA`) were added to
  `seed.ts` during Phase 5 specifically so RBAC-denial tests have a real, authenticatable account
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

## Current State

Backend serves admin-only routes as of Phase 5 (150/150 Vitest tests green — trimmed down from the
prior count after deleting the public-route test files, offset by new RBAC-fix tests). Admin FE has
zero automated tests (P8 Task 4 added the first: `LifecycleActionBar`, plus the Vitest+RTL infra
itself — no further FE coverage added since). No CI/CD in either repo yet (Phase 7 of the active
split plan). Uploads are still local-disk with relative URLs (Phase 6 will move them to GCS and
rewrite the persisted URLs). `PROJECT.md`'s independent-review and final go-live gate for this repo
are still open — paused pending the split plan's Phase 7 governance-doc refresh. Immediate next
step: Phase 6 — move uploads to Google Cloud Storage.
