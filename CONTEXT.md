# CONTEXT.md

Living state of this project: progress tracker and AI context. Agents: read this before non-trivial work; update the affected sections when changes are material (structure, plan, milestones, decisions). Keep it current-state, not a changelog — git history records history. If this file contradicts the code, the code wins: fix this file. Go-live and review information does not live here; it lives in PROJECT.md, the review dossier.

## Overview

Blibli Talk 2.0 admin CMS + Express backend + PostgreSQL for Blibli's internal Talent Engagement
event platform (talks, workshops, speed-dating sessions for employees). This repo is the **only**
one with backend code and database access; a separate repo, `bliblitalk-user-fe`, is the
participant-facing portal and consumes this repo's public API — there is no shared package between
the two repos (deliberately duplicated logic with matching contract tests where needed, e.g. the
participant-badge util).

## Structure

- `apps/backend/` — Express + TypeScript API. `src/routes/public/*` serves `bliblitalk-user-fe`;
  `src/routes/admin/*` serves this repo's own admin FE; `src/routes/auth/*` serves both (unified
  login). `src/db/prisma/` holds the schema, migrations, and `seed.ts` (PostgreSQL 15).
  `src/lib/lifecycle/` is the event-status-transition engine (`transitionEvent`, the scheduler,
  the pure boundary-decision logic).
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

An 8-phase event-lifecycle & status-consistency overhaul (roadmap originally at
`resilient-skipping-meteor.md`), executed sequentially, each phase separately specced and planned
under `docs/superpowers/`:

- [x] P1 — 8-state `EventStatus` enum + `transitionEvent()` as the sole status writer + audit trail
  (`EventStatusHistory`).
- [x] P2 — real 60s scheduler (`sweepEventLifecycle`) replacing the old lazy read-time sweep.
- [x] P3 — admin FE lifecycle UI (status header, history tab, lifecycle-gated actions).
- [x] P4 — user-FE participant-badge matrix + Shortlisted-Only fix.
- [x] P5 — category taxonomy (`EventCategory` table replaces free-text `category`).
- [x] P6 — create/edit event form restructure (Identity/Schedule/Behavior sections).
- [x] P7 — lifecycle backfill & reconciliation (closed the gap P1's migration deferred; every
  non-DRAFT event now has ≥1 `EventStatusHistory` row, backed by a permanent regression test).
- [ ] P8 — QA hardening & go-live gate (in progress): scaffold this org's governance files
  (`PROJECT.md`, this file), risk-classify both repos, run security/dependency audits and close
  findings, add admin-FE test coverage (currently zero), generate a test-scenario dossier, get an
  independent review, and reach a final READY/NOT READY/CONDITIONAL verdict per repo. Explicitly
  **not** in scope: a new CI/CD pipeline, or turning the `k8s/` placeholder into applied manifests.

## Key Decisions

- **`transitionEvent()` is the sole writer of `event.status`** — every other code path (admin
  actions, the scheduler) calls through it. It's CAS-guarded and writes one `EventStatusHistory` row
  per transition. Never bypass it with a direct Prisma `update`.
- **Split-repo architecture, no shared package across repos.** `bliblitalk-user-fe` has no backend
  and no DB; it consumes this repo's public API only. Logic that must exist in both (e.g. the
  participant-badge matrix) is deliberately duplicated with matching tests, not shared, because
  there is no cross-repo workspace.
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

Backend has solid test coverage (156 Vitest tests as of P7). Admin FE has zero automated tests
(P8 Task 4 is adding the first: `LifecycleActionBar`, plus the Vitest+RTL infra itself). No CI/CD in
either repo. `PROJECT.md` in this repo is a bare skeleton as of this commit — risk classification and
the owner-input dossier fields are filled in the next steps of P8's plan
(`docs/superpowers/plans/2026-07-24-lifecycle-p8-qa-hardening-golive.md`). Immediate next step:
Phase 2 of `adopt-vibe` — run the baseline security/dependency/tech-stack/structure audits.
