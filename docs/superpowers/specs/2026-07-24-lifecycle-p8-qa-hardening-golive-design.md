# P8 — QA Hardening & Go-Live Gate — Design Spec

## Goal

The roadmap's final phase, P8, reads: *"QA hardening → production (all). Gated behind full QA
sign-off."* Neither repo (`bliblitalk-admin`, `bliblitalk-user-fe`) has been through this org's
formal go-live process yet — both have `TECH_STACK.md` (from `vibe-stack`) but no `PROJECT.md`, no
risk classification, no security/dependency audit, and no reviewer sign-off. P8 runs that process
end-to-end on both repos and closes whatever gaps it surfaces, producing an honest READY /
NOT READY / CONDITIONAL verdict per repo — not a rubber-stamp.

**Exit criterion:** both repos have a `PROJECT.md` with a recorded risk level and review evidence,
a security + dependency audit with all findings resolved or explicitly accepted, a test-scenario
dossier with the agent-checkable scenarios run, and a final `check-golive-readiness` verdict. No new
CI/CD pipeline and no applied Kubernetes manifests are in scope — those are separate, later efforts.

## Context: what research found

- **`bliblitalk-admin`**: 156 backend tests across 23 files (Vitest + Supertest against seeded
  Postgres) — solid backend coverage. **Zero test files** anywhere under `apps/frontend/src`
  (grep for `*.test.*` returns nothing) — the admin CMS has no automated test coverage at all,
  relying entirely on manual browser verification during each prior phase.
- **`bliblitalk-user-fe`**: two Playwright e2e specs (`apps/frontend/e2e/login.spec.ts`,
  `shortlist-badge.spec.ts`) plus a `playwright.config.ts` — but **no unit tests**, and the root
  `package.json`'s `test`/`e2e` scripts delegate to `@repo/frontend`, whose own `package.json` has
  **no matching `test` script defined** (only `dev`/`build`/`preview`/`lint`/`typecheck`) — running
  `pnpm test` at the repo root would fail with "Missing script."
- **No CI/CD in either repo** — no `.github/` directory in either. All verification to date has been
  manual (`pnpm test`, `pnpm typecheck`, live browser checks) run by the agent per phase.
- **No `PROJECT.md`, `SECURITY.md`, or `DEPENDENCIES.md` in either repo** — the `golive-gate` and
  `project-scaffold` skill family's expected artifacts don't exist yet. Both repos do have
  `TECH_STACK.md` (Zone 1 — no external LLM/API calls, no payments) from an earlier `vibe-stack` run,
  confirming this org's standard playbook is already partially in use here.
- **`bliblitalk-admin/k8s/README.md` explicitly says manifests are "not wired yet"** — it documents
  the *intended* topology (Deployment, StatefulSet/managed Postgres, internal LB, Secrets, ConfigMap)
  but contains no actual YAML and no chosen cluster target. `docker-compose.yml` + root `Dockerfile`
  exist and work for local/single-host use only.
- **Data handled**: real employee-facing PII — name, email, phone, department, position — for an
  internal Blibli talent-engagement platform. No payments, no financial transactions (confirmed
  during the earlier `docs/DESIGN.md` interview — Financial Risks sections are `N/A`).
- **Prior phases' own verification pattern** (P1–P7) already covers much of what a go-live gate's
  test-scenario dossier would ask for — each phase's plan ended with a full-suite run plus a live
  browser walkthrough. P8 formalizes and completes that pattern rather than starting over.

## Decisions (locked with the owner)

1. **Scope = QA hardening + the formal go-live gate**, not a build-out of real deployment
   infrastructure. No CI/CD pipeline gets created; the `k8s/` placeholder stays a placeholder.
2. **Both repos are in scope** — `bliblitalk-admin` and `bliblitalk-user-fe` each get their own full
   pass through the gate, since they deploy independently and have different risk surfaces (internal
   admin tool vs. participant-facing portal).
3. **The gate drives the hardening backlog, not the reverse.** Rather than pre-guessing what to fix,
   run the audits first (security, dependency, risk classification) and let their findings define the
   concrete work. The one gap already known and treated as in-scope regardless of what the audits
   say: `bliblitalk-admin`'s admin FE has zero test coverage, which is a real, visible hole in this
   project's own "verify before claiming done" discipline going forward.

## Design

### Sequence (repeated per repo — `bliblitalk-admin` first, then `bliblitalk-user-fe`)

**Step 1 — Scaffold governance file.** Run `project-scaffold:adopt-vibe` in the repo. It reconciles
against what already exists (it's designed to be safe to re-run) rather than duplicating — expected
to produce `PROJECT.md` with the Access Status / Login Method / Access Levels sections filled from
what the code already proves (SSO/email login, RBAC roles, internal-only admin vs. public participant
portal), and to run baseline audits into a tiered remediation backlog.

**Step 2 — Risk classification.** Run `golive-gate:assess-risk-level`. It interviews against
`data/risk-criteria.json` and verifies every answer against the actual codebase (per its own
"never classify from interview answers alone" rule) — the expected outcome is Low or Medium given
real employee PII but no payments/financial surface, but the skill's own classification is
authoritative, not this spec's guess. Records the result in `PROJECT.md`.

**Step 3 — Security audit.** Run `code-review:audit-security` — a full OWASP sweep of the entire
codebase (not just a diff), per repo. For `bliblitalk-admin` this covers the Express backend + admin
FE; for `bliblitalk-user-fe`, the portal frontend.

**Step 4 — Dependency audit.** Run `scan-dependency:scan-dependencies` per repo — OSV vulnerability
scan + open-source license policy check against each repo's lockfile.

**Step 5 — Close findings.** Every Critical/Important finding from Steps 3–4 gets fixed (mirroring
the same subagent-driven pattern used in P1–P7: implement, verify, commit). Minor findings get
recorded in `PROJECT.md`'s remediation backlog if not fixed outright — not silently dropped.
Additionally and unconditionally (Decision 3): add test coverage for `bliblitalk-admin`'s admin FE.
Scope of that coverage is decided at plan-writing time based on what's highest-value to cover
first (the plan will enumerate specific critical flows — e.g. the lifecycle action bar's
transition-gating logic, the create/edit form's date-validation helper — rather than attempting
exhaustive coverage in one pass).

**Step 6 — Test-scenario dossier.** Run `golive-gate:generate-test-scenarios` per repo, which reads
`docs/DESIGN.md` (already exists for `bliblitalk-admin`; `bliblitalk-user-fe` does not have one —
see Open Question below) plus the codebase to produce `docs/TEST-SCENARIO.md`. Run every
agent-checkable scenario; human-judgment scenarios are left for Step 7's reviewer.

**Step 7 — Independent review.** Run `golive-gate:seal-review-proof` (the `/vibe-review` flow). This
skill's own rule: for Medium/High risk, **the reviewer must not be a repo commit author** — since
every commit in both repos has Claude as co-author, that reviewer must be a human (you, or a
colleague), not me. If Step 2 classifies either repo as Medium or higher, this step surfaces that
requirement plainly and pauses for you to either perform the review yourself or arrange one — it is
not self-certified. If a repo classifies as Low risk, `check-golive-readiness` (Step 8) runs this
automatically as a self-certification per that skill's own stated behavior.

**Step 8 — Final gate.** Run `golive-gate:check-golive-readiness` (`/vibe-check`) per repo — approvals,
access defaults, SSO login, permissions, approved platform, safe logging, backup/recovery, and
ownership, cross-checked against `PROJECT.md`. Reports READY / NOT READY / CONDITIONAL per repo, with
reasons for anything short of READY.

### Ordering rationale

Steps 1–2 must run before 3–8 (later steps write into `PROJECT.md`, which Step 1 creates). Steps 3
and 4 are independent of each other but both must complete before Step 5 (which fixes their combined
findings). Step 6 depends on `docs/DESIGN.md` existing (per repo). Step 7 depends on Steps 3–6 being
complete (the review checklist references security/dependency/test evidence). Step 8 depends on
Step 7's evidence being recorded.

## Non-goals

- No new CI/CD pipeline in either repo (Decision 1).
- No applied Kubernetes manifests — `bliblitalk-admin/k8s/README.md` stays a documented placeholder.
- No production deployment, no real secrets provisioning, no cluster target selection.
- No rewrite of existing passing tests or working code outside what Steps 3–5 actually flag.

## Open questions to resolve before planning

1. **`bliblitalk-user-fe` has no `docs/DESIGN.md`.** `generate-test-scenarios` (Step 6) reads it as
   its primary input. Options: (a) run `project-scaffold:design-document` on `bliblitalk-user-fe`
   first, mirroring what `bliblitalk-admin` already has, or (b) let `generate-test-scenarios` fall
   back to reading the codebase directly if `DESIGN.md` is absent (the skill's own description says
   it scans "the codebase and the design-review document," implying the doc is not strictly
   required, just preferred). Recommend (a) for parity between the two repos and because the
   Product Overview / Business Workflow sections are genuinely useful reviewer context that the code
   alone won't reveal (e.g. *why* Speed Dating exists, the actual business workflow across HR/admin/
   participant roles) — adds one extra step but produces a more complete artifact.
2. **Reviewer identity for Step 7, if risk comes back Medium+.** Not resolvable now — depends on
   Step 2's actual classification. The plan will treat this as a runtime branch: if Low, proceed
   automatically; if Medium/High, stop and ask the user who will perform the independent review.

## Verification

- `PROJECT.md` exists in both repos with Risk Level, Access Status, Login Method, and Review Evidence
  sections filled (not left as scaffold placeholders).
- Security audit findings: zero unresolved Critical/Important findings (Minor findings may be
  recorded as accepted backlog rather than fixed, with the owner's explicit sign-off).
- Dependency audit: zero unresolved vulnerabilities above the policy's acceptance threshold; no
  Forbidden-licensed packages.
- `bliblitalk-admin` admin FE has new test coverage for at least the flows identified in Step 5 (exact
  list finalized at plan-writing time), and `pnpm --filter @repo/frontend test` runs and passes.
- `docs/TEST-SCENARIO.md` exists per repo with agent-checkable scenarios marked PASS.
- `docs/REVIEW-PROOF.md` exists per repo, commit-bound and reviewer-sealed.
- `check-golive-readiness` reports a verdict (READY / NOT READY / CONDITIONAL) per repo, with the
  plan's final task presenting both verdicts to the user rather than assuming READY.
