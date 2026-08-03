<!-- managed-by: golive-gate test-scenario v1 -->
# Test Scenarios — bliblitalk-admin

Managed by golive-gate:generate-test-scenarios. Rules: scenarios that already PASSED are not
regenerated or re-run unless the code they cover changed (then STALE → re-verify); IDs are
assigned once and never renumbered; entries and history are never deleted. Agent-checkable
scenarios are run by the builder on request; human-judgment scenarios are verified by the
independent reviewer at /vibe-review. Blocking rule: /vibe-check will not return READY at
Medium/High while an important or sensitive scenario is FAILED or STALE.

Last generated: 2026-07-24 · Aligned to docs/DESIGN.md

## Summary

| Metric | Count |
|---|---|
| Total | 24 |
| Passed | 21 |
| Failed | 0 |
| Pending | 3 |
| Stale | 0 |

## Scenarios

### TS-001 — Participant browses and registers for an event (FCFS instant-confirm, duplicate guard, auto-waitlist)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Browse & register for an event (participant, role-based selection-mode branch)"
- Category: core
- Verify: agent
- Preconditions: a REGISTRATION_OPEN event with capacity; a full event with `waitingListEnabled` at its default
- Steps: GET /api/public/events (confirms DRAFT/CANCELLED/ARCHIVED never returned); POST /api/public/events/:slug/register — once with capacity available, once as a duplicate, once against a full event
- Expected: instant `REGISTERED` while capacity remains; a duplicate active registration is rejected 409 `ALREADY_REGISTERED`; a full event with waitlisting enabled auto-assigns `WAITING`
- Covers: `apps/backend/src/routes/public/events/events.service.ts:56-113`, `apps/backend/src/routes/public/events/events.routes.test.ts`
- Last-verified-commit: 32ba496
- Note: the **CURATED** branch (`showRemainingSeats=false` → every registrant starts `WAITING` regardless of capacity, `decideInitialStatus` in `events.service.ts:115-126`) has **no automated test** anywhere in the repo — confirmed by grep, no test file references `showRemainingSeats`, `CURATED`, or `selectionMode`. This scenario's PASSED status covers only the FCFS branches actually exercised above; CURATED remains an open coverage gap.

### TS-002 — Admin creates and publishes an event via the single transitionEvent write path  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Admin creates and publishes an event (single write path via transitionEvent)"
- Category: core
- Verify: agent
- Preconditions: authenticated as an admin holding EVENT_CREATE/EVENT_PUBLISH
- Steps: POST /api/admin/events (status forced DRAFT); POST /api/admin/events/:id/publish; verify a concurrent second publish attempt gets 409 INVALID_TRANSITION, not a duplicate history row
- Expected: exactly one EventStatusHistory row per real transition; illegal transitions rejected with 409 + allowed list
- Covers: `apps/backend/src/lib/lifecycle/transitionEvent.ts:24-89`, `apps/backend/src/routes/admin/adminEvents.routes.test.ts`
- Last-verified-commit: 32ba496

### TS-003 — Automated lifecycle scheduler transitions events on schedule, race-safe  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Automated lifecycle scheduler (system-actor, no HTTP call)"
- Category: core
- Verify: agent
- Preconditions: events past a status boundary (registrationOpensAt, deadline, start, end+grace)
- Steps: run `sweepEventLifecycle`; verify each candidate advances via `decideTarget` + compare-and-swap `transitionEvent`; verify a concurrent race for the same target resolves to exactly one history row
- Expected: no double-transitions, no lost updates, isOverdue flips correctly at end+gracePeriod
- Covers: `apps/backend/src/lib/lifecycle/sweepEventLifecycle.ts`, `apps/backend/src/lib/lifecycle/sweepEventLifecycle.test.ts`, `apps/backend/src/lib/lifecycle/transitionEvent.test.ts` (CAS race test), `apps/backend/src/lib/lifecycle/scheduleDecisions.test.ts`
- Last-verified-commit: 32ba496

### TS-004 — Admin shortlists / rejects / waitlists a registrant  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Admin manages participants and attendance"
- Category: important
- Verify: agent
- Preconditions: authenticated admin holding PARTICIPANT_SHORTLIST, an event with registrations
- Steps: POST /api/admin/registrations/:id/shortlist and equivalent reject/waitlist actions
- Expected: Registration.status updates correctly; non-permitted roles rejected
- Covers: `apps/backend/src/routes/admin/adminParticipants.routes.test.ts`
- Last-verified-commit: 32ba496

### TS-005 — Admin checks in / marks absent on event day  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Admin manages participants and attendance"
- Category: important
- Verify: agent
- Preconditions: authenticated admin holding ATTENDANCE_MANAGE, a registered participant
- Steps: POST /api/admin/registrations/:id/check-in; mark-absent equivalent
- Expected: Registration.attendance updates correctly
- Covers: `apps/backend/src/routes/admin/adminParticipants.routes.test.ts`
- Last-verified-commit: 32ba496

### TS-006 — Feedback submission gated chain (not-attended / disabled / already-submitted / eligible)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Feedback submission and certificate download (gated chain)"
- Category: important
- Verify: agent
- Preconditions: registrations in each attendance/feedback-config state
- Steps: POST /api/public/me/registrations/:id/feedback under each branch
- Expected: 400 NOT_ATTENDED / FEEDBACK_DISABLED / ALREADY_SUBMITTED as appropriate; Feedback row created only on the eligible branch
- Covers: `apps/backend/src/routes/public/registrations/feedback.routes.test.ts`
- Last-verified-commit: 32ba496

### TS-007 — Certificate download gated chain (attendance → feedback-required → disabled → eligible)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Feedback submission and certificate download (gated chain)"
- Category: sensitive
- Verify: agent
- Preconditions: registrations in each attendance/feedback/certificate-config state
- Steps: GET /api/public/me/registrations/:id/certificate under each branch
- Expected: 403 before attendance, 400 FEEDBACK_REQUIRED / CERTIFICATES_DISABLED as appropriate, PDF served only when eligible; find-or-create Certificate row is idempotent (same verificationCode on repeat download)
- Covers: `apps/backend/src/routes/public/registrations/feedback.routes.test.ts` (lines 91-120), `apps/backend/src/routes/public/registrations/certificate.pdf.ts`
- Last-verified-commit: 32ba496

### TS-008 — Marketing email campaign send with per-recipient failure tolerance  [PENDING]
- Feature / flow: DESIGN.md §B "Marketing email campaign (real SMTP integration)"
- Category: important
- Verify: agent
- Preconditions: authenticated admin holding MARKETING_MANAGE, a recipient list with a mix of valid/invalid addresses
- Steps: POST /api/admin/marketing/campaigns
- Expected: recipients deduped by lowercased email; one send per recipient; a single recipient's SMTP failure does not abort the rest of the batch; sentCount/failedCount and per-recipient status recorded accurately
- Covers: `apps/backend/src/routes/admin/adminMarketing.service.ts`, `apps/backend/src/lib/shared/mailer.ts`
- Last-verified-commit: —
- Note: **no automated test file exists for this route today** (`adminMarketing.routes.test.ts` is absent from the repo) — this scenario cannot be marked PASSED by inspection alone; it needs either a new regression test or a human-verified manual run before /vibe-check can treat it as covered.

### TS-009 — Event reminders: scheduled two-audience send (shortlisted vs. everyone else)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Event reminders — scheduled two-audience send"
- Category: important
- Verify: agent
- Preconditions: a scheduled EventReminder with sendAt in the past, both SHORTLISTED and non-shortlisted registrants
- Steps: run `sweepDueReminders`
- Expected: CUSTOM reminders email only SHORTLISTED registrants; SHORTLIST_RESULT reminders email both audiences with their respective templates in parallel; a per-recipient SMTP failure marks that reminder FAILED without blocking the rest
- Covers: `apps/backend/src/routes/admin/adminReminders.routes.test.ts`
- Last-verified-commit: 32ba496

### TS-010 — Mock SSO/OAuth providers are blocked in production (SEC-001/SEC-002)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: auth — mock provider production gate
- Category: sensitive
- Verify: agent
- Preconditions: `config.isProd = true`
- Steps: POST /api/auth/google and /api/auth/microsoft
- Expected: both return 404 under production; both still work in dev/test
- Covers: `apps/backend/src/routes/public/auth/auth.routes.ts:27-32,53,73`, `apps/backend/src/routes/public/auth/auth.routes.test.ts` ("SEC-001/SEC-002: mock providers are blocked in production")
- Last-verified-commit: 32ba496

### TS-011 — Production boot fails fast on a missing/placeholder/short JWT secret (SEC-003)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: config — JWT secret validation
- Category: sensitive
- Verify: agent
- Preconditions: NODE_ENV=production with JWT_SECRET unset, a known placeholder, or under 32 characters
- Steps: call `resolveJwtSecret(env)` for each case
- Expected: throws in all three cases; accepts a valid ≥32-char non-placeholder secret; dev/test keeps the fallback
- Covers: `apps/backend/src/config.ts:11-23`, `apps/backend/src/config.test.ts`
- Last-verified-commit: 32ba496

### TS-012 — Seed script requires SEED_ADMIN_PASSWORD, no hardcoded credential (SEC-004)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: seed — admin password provisioning
- Category: sensitive
- Verify: agent
- Preconditions: SEED_ADMIN_PASSWORD unset vs. set
- Steps: call `resolveSeedPassword(env)`
- Expected: throws when unset; returns the configured value when set; `seed.ts` contains no literal password
- Covers: `apps/backend/src/db/prisma/seedConfig.ts`, `apps/backend/src/db/prisma/seedConfig.test.ts`
- Last-verified-commit: 32ba496

### TS-013 — Auth endpoints are rate-limited, and proxied requests bucket by real client IP (SEC-005 + follow-up)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: rate limiting — /api/auth/*
- Category: sensitive
- Verify: agent
- Preconditions: default `createAuthRateLimiter()` config; `app.set("trust proxy", 1)` active
- Steps: send 51 requests from one client, confirm the 51st is 429; send requests from two distinct `X-Forwarded-For` values behind the same proxy, confirm independent buckets; confirm two separate `createApp()` instances don't share state
- Expected: 50/15min per real client IP, not per proxy hop or shared globally
- Covers: `apps/backend/src/middleware/rateLimit.ts`, `apps/backend/src/app.ts` (trust proxy), `apps/backend/src/middleware/rateLimit.test.ts`, `apps/backend/src/app.test.ts` ("SEC-005 follow-up")
- Last-verified-commit: 32ba496

### TS-014 — Session cookie never appears in logs, request or response side (SEC-006)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: logging — session cookie redaction
- Category: sensitive
- Verify: agent
- Preconditions: a capturing pino logger
- Steps: send a request carrying a session cookie; issue a response that sets one via `res.cookie`
- Expected: neither the request `Cookie` header nor the response `Set-Cookie` header's live value appears in captured log output; both show `[Redacted]`
- Covers: `apps/backend/src/app.ts:33-40` (`LOG_REDACT_PATHS`), `apps/backend/src/app.test.ts` (both redaction tests)
- Last-verified-commit: 32ba496

### TS-015 — Session is revoked immediately on logout and on role change (SEC-007)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: auth — tokenVersion-based session revocation
- Category: sensitive
- Verify: agent
- Preconditions: a logged-in user; a SUPER_ADMIN able to change another user's role
- Steps: log in, capture the cookie, call /api/auth/logout, replay the same cookie against /api/auth/me; separately, capture a user's cookie, have a SUPER_ADMIN PATCH their role, replay their original cookie
- Expected: both replays return 401 "Session has been revoked" — the cookie is dead the instant tokenVersion is bumped, not after its full 7-day life
- Covers: `apps/backend/src/middleware/requireAuth.ts:26-41`, `apps/backend/src/routes/public/auth/auth.routes.ts:132-147`, `apps/backend/src/routes/admin/adminUsers.service.ts:87-93`, `apps/backend/src/routes/public/auth/auth.routes.test.ts` ("logout revokes the session"), `apps/backend/src/routes/admin/adminUsers.routes.test.ts` ("SEC-007: changing a user's role revokes...")
- Last-verified-commit: 32ba496

### TS-016 — Event Admin's user list is scoped to their own events, never platform-wide (SEC-008)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: admin users — PII scoping
- Category: sensitive
- Verify: agent
- Preconditions: an EVENT_ADMIN scoped to 2 events, a SUPER_ADMIN with platform-wide access
- Steps: GET /api/admin/users as each role
- Expected: EVENT_ADMIN sees only users registered on their own events; SUPER_ADMIN sees everyone
- Covers: `apps/backend/src/routes/admin/adminUsers.service.ts:43-46`, `apps/backend/src/routes/admin/adminUsers.routes.test.ts` ("SEC-008: scopes an event admin...")
- Last-verified-commit: 32ba496

### TS-017 — JWT verification rejects tokens signed with a non-allowlisted algorithm (SEC-020)  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: auth — algorithm allowlist
- Category: sensitive
- Verify: agent
- Preconditions: a token forged with the correct secret but a different algorithm (HS384)
- Steps: call `verifyToken` on the forged token
- Expected: rejected (returns null), even though the secret is correct
- Covers: `apps/backend/src/routes/public/auth/auth.service.ts:13,19`, `apps/backend/src/routes/public/auth/auth.service.test.ts`
- Last-verified-commit: 32ba496

### TS-018 — EVENT_ADMIN access is scoped to assigned events; other admin roles are not  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: DESIGN.md §B "Admin manages participants and attendance" (role-based access difference)
- Category: sensitive
- Verify: agent
- Preconditions: an EVENT_ADMIN assigned to some events but not others; a SUPER_ADMIN/HR_TA/VIEWER
- Steps: GET /api/admin/events/:id/registrations for an event the EVENT_ADMIN does and does not own; same for the unscoped roles
- Expected: EVENT_ADMIN is rejected/empty for events they don't own; unscoped roles see every event, gated only by the permission matrix
- Covers: `packages/auth/src/rbac.ts:82-84` (`isEventScoped`), `apps/backend/src/middleware/eventScope.test.ts`, `apps/backend/src/routes/admin/adminEvents.routes.test.ts` ("scopes an event admin's list + access...")
- Last-verified-commit: 32ba496

### TS-019 — LifecycleActionBar renders only legal transitions and confirms destructive ones  [PASSED (2026-07-24, 32ba496, agent)]
- Feature / flow: admin FE — lifecycle action bar (Task 4 of this plan)
- Category: important
- Verify: agent
- Preconditions: none — pure component test
- Steps: render for each EventStatus; click each button
- Expected: exactly the buttons `allowedFrom(status)` returns; Cancel/Archive require `window.confirm`; COMPLETED opens EndEventDialog instead of firing immediately; a 409 conflict still calls `onChanged`
- Covers: `apps/frontend/src/components/LifecycleActionBar.tsx`, `apps/frontend/src/components/LifecycleActionBar.test.tsx`
- Last-verified-commit: 32ba496

### TS-020 — HR_TA / VIEWER as cross-event (unscoped) roles is the intended org model, not an oversight  [PENDING]
- Feature / flow: DESIGN.md §B, flagged ⚠️ — role-scoping intent
- Category: important
- Verify: human
- Preconditions: none — this is a business-intent question, not a code check
- Steps: confirm with the project owner whether HR_TA (Talent Acquisition) and VIEWER are meant to see every event platform-wide (as the code currently does), or whether they should be event-scoped like EVENT_ADMIN
- Expected: an explicit owner decision recorded here or in DESIGN.md, resolving the ⚠️
- Covers: `packages/auth/src/rbac.ts:82-84`
- Last-verified-commit: —

### TS-021 — Mock SSO/OAuth is acceptable for this go-live, or real Entra ID/Google OAuth must ship first (GLG-001)  [PASSED (2026-07-24, 8017db0, reviewer)]
- Feature / flow: login-method policy compliance
- Category: sensitive
- Verify: human
- Preconditions: none — business/policy decision, not a code check
- Steps: independent reviewer / Information Security confirms whether shipping with mock (dev-only, prod-gated) SSO/OAuth is acceptable, or whether real provider verification is a go-live blocker
- Expected: an explicit decision recorded in `docs/REMEDIATION.md` GLG-001 and `PROJECT.md`
- Covers: `docs/REMEDIATION.md` GLG-001
- Last-verified-commit: 8017db0
- Note: David Kurniawan, acting as the project's named Information Security sign-off, waived this **for the current pre-deployment/dev milestone only** — real SSO/OAuth is still required before an actual production deployment, at which point this finding re-opens. This is the owner's own sign-off, not the separate independent (non-builder) review required by Task 6 for the overall High-risk go-live gate.

### TS-022 — Repo hosting location outside the approved GitHub org (GLG-002)  [PASSED (2026-07-24, 8017db0, reviewer)]
- Feature / flow: repo-homing policy compliance
- Category: sensitive
- Verify: human
- Preconditions: none — business/policy decision
- Steps: owner decides: migrate to the approved org, or record a formal exception
- Expected: an explicit decision recorded in `docs/REMEDIATION.md` GLG-002
- Covers: `docs/REMEDIATION.md` GLG-002
- Last-verified-commit: 8017db0
- Note: decision recorded (migrate to `gdncomm-ops`), which is this scenario's full scope — but the underlying GLG-002 finding stays OPEN in `docs/REMEDIATION.md` until the migration is actually executed (owner action; no `gh` CLI/API token available to the agent). Do not conflate this PASSED status with the migration being complete.

### TS-023 — License exceptions for png-js / caniuse-lite are formally accepted or remediated (DEP-002/DEP-003)  [PASSED (2026-07-24, 8017db0, reviewer)]
- Feature / flow: dependency license policy compliance
- Category: important
- Verify: human
- Preconditions: none — business/policy decision
- Steps: owner decides: accept the documented exceptions, or replace the flagged dependencies
- Expected: an explicit decision recorded in `docs/REMEDIATION.md` DEP-002/DEP-003
- Covers: `docs/REMEDIATION.md` DEP-002, DEP-003
- Last-verified-commit: 8017db0
- Note: David Kurniawan, acting as the project's named Information Security sign-off, accepted both as documented exceptions (metadata/attribution-only gaps, not actual restrictive licenses).

### TS-024 — Registration capacity edge case: full event with waitlist disabled  [PENDING]
- Feature / flow: DESIGN.md §B "Browse & register for an event" — the full/no-waitlist branch
- Category: important
- Verify: agent
- Preconditions: an event at capacity with `waitingListEnabled = false`
- Steps: POST /api/public/events/:slug/register
- Expected: 400 `EVENT_FULL` (verified against `events.service.ts:87-88` — DESIGN.md originally documented this as 409; corrected to 400 to match the actual code); no Registration row created
- Covers: `apps/backend/src/routes/public/events/events.service.ts:87-88`
- Last-verified-commit: —
- Note: **no automated test exists for this branch** — confirmed by reading `events.routes.test.ts` in full; only the waitlist-enabled full-capacity case ("auto-waitlists once capacity is full") is covered. Cannot be marked PASSED by inspection alone; needs a new regression test or a human-verified manual run.

## History

- 2026-07-24 · TS-001 through TS-024 · created (PENDING)
- 2026-07-24 · TS-001 · PENDING → PASSED (agent, commit 32ba496) · corrected 409→400 EVENT_FULL note per DESIGN.md fix
- 2026-07-24 · TS-002 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-003 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-004 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-005 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-006 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-007 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-009 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-010 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-011 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-012 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-013 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-014 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-015 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-016 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-017 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-018 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-019 · PENDING → PASSED (agent, commit 32ba496)
- 2026-07-24 · TS-024 · Expected text corrected to 400 `EVENT_FULL` (was 409) to match `events.service.ts:87-88`; remains PENDING — no automated test covers this exact branch
- 2026-07-24 · TS-008 · remains PENDING — no automated test file exists for the marketing-campaign route (`adminMarketing.routes.test.ts` absent)
- 2026-07-24 · TS-021 · PENDING → PASSED (reviewer, commit 8017db0) · owner/InfoSec sign-off on GLG-001 recorded (waived for pre-deployment milestone only)
- 2026-07-24 · TS-022 · PENDING → PASSED (reviewer, commit 8017db0) · owner decision on GLG-002 recorded (migrate to gdncomm-ops; execution still pending)
- 2026-07-24 · TS-023 · PENDING → PASSED (reviewer, commit 8017db0) · owner/InfoSec sign-off on DEP-002/DEP-003 recorded (both waived)
