# P8 — QA Hardening & Go-Live Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run this org's formal go-live gate on both `bliblitalk-admin` and `bliblitalk-user-fe`,
close whatever it finds, and produce an honest READY/NOT READY/CONDITIONAL verdict per repo.

**Architecture:** Unlike prior phases, most of this plan's tasks are not new code — they are
invocations of existing, already-installed governance skills (`project-scaffold:adopt-vibe`,
`golive-gate:assess-risk-level`, `code-review:audit-security`, `scan-dependency:scan-dependencies`,
`golive-gate:generate-test-scenarios`, `golive-gate:seal-review-proof`, `golive-gate:
check-golive-readiness`), run in a fixed order per repo because each writes into artifacts
(`PROJECT.md`, `docs/TEST-SCENARIO.md`, `docs/REVIEW-PROOF.md`) the next one reads. The one
substantial code task is closing the admin FE's zero-test-coverage gap. Several of these skills are
themselves interactive (they interview the user, or — for `seal-review-proof` at Medium+ risk —
require a human reviewer who is not a repo commit author) and cannot be delegated to a subagent that
has no access to the actual user; see the note under Execution Handoff at the end of this plan.

**Tech Stack:** the existing per-repo stacks (Vitest/Supertest for `bliblitalk-admin` backend,
nothing yet for its admin FE — this plan adds Vitest + React Testing Library + jsdom there;
Playwright already present in `bliblitalk-user-fe`). No new stack choices beyond that.

## Global Constraints

- No new CI/CD pipeline in either repo.
- No applied Kubernetes manifests — `bliblitalk-admin/k8s/README.md` stays a documented placeholder.
- No production deployment, no real secrets provisioning, no cluster target selection.
- Every finding an audit skill reports as Critical or Important gets fixed (with a regression test)
  before that repo's Task N ("Close audit findings") is considered done. Minor findings not fixed
  outright get recorded in `PROJECT.md`'s backlog, not silently dropped.
- `docs/DESIGN.md` (already exists for `bliblitalk-admin`) and the new one for `bliblitalk-user-fe`
  (Task 8) are read, not modified, by this plan's later tasks.
- For `seal-review-proof` (Tasks 6 and 13): if a repo's risk classification comes back Medium or
  higher, the skill's own rule is the reviewer must not be a repo commit author. Since every commit
  in both repos has Claude as co-author, that step cannot be executed by an agent alone — it stops
  and asks the user who will perform the review, per that task's own instructions below.

---

### Task 1: `bliblitalk-admin` — Governance scaffold + risk classification

**Files:**
- Create/modify: `PROJECT.md` (produced by the skills below; exact fields depend on skill output —
  no placeholder content is written by this plan itself).

**Interfaces:**
- Consumes: existing `TECH_STACK.md`, `docs/DESIGN.md`, and the live codebase (RBAC roles, SSO/email
  login, CORS allow-lists) that `adopt-vibe` and `assess-risk-level` read to fill `PROJECT.md`.
- Produces: `PROJECT.md` with a recorded Risk Level, Access Status, and Login Method — consumed by
  every later task in this repo's sequence (Tasks 2, 3, 5, 6, 7).

- [ ] **Step 1: Scaffold `PROJECT.md`**

From the `bliblitalk-admin` repo root, invoke:

```
Skill: project-scaffold:adopt-vibe
```

This is designed to reconcile against what already exists (safe to re-run), so it will not duplicate
`TECH_STACK.md`. Let it run its baseline audits and produce the tiered remediation backlog it
describes.

- [ ] **Step 2: Verify `PROJECT.md` was created**

Run: `cat PROJECT.md | head -5` (or open the file). Expected: the file exists at the repo root and
has non-placeholder content in at least the Access Status / Login Method sections (the skill fills
these from code it can already read — SSO + email login, RBAC roles).

- [ ] **Step 3: Run risk classification**

Invoke:

```
Skill: golive-gate:assess-risk-level
```

Answer its interview truthfully — this repo handles real employee PII (name, email, phone,
department, position) for an internal talent-engagement tool, no payments, no financial transactions
(confirmed in `docs/DESIGN.md`'s Financial Risks section, already `N/A`). Let the skill verify every
answer against the actual code rather than accepting the interview answers at face value — that
verification is the skill's own job, not something to shortcut.

- [ ] **Step 4: Verify the risk level was recorded**

Run: `grep -A2 "Risk Level" PROJECT.md`. Expected: a non-empty risk level (Low/Medium/High) with
verification evidence, not a blank placeholder.

- [ ] **Step 5: Commit**

```bash
git add PROJECT.md
git commit -m "chore(p8): scaffold PROJECT.md and record risk classification"
```

---

### Task 2: `bliblitalk-admin` — Security + dependency audit

**Files:** none created directly by this task — both skills are read-only audits.

**Interfaces:**
- Consumes: `PROJECT.md`'s risk level from Task 1 (informs audit depth/priority, per those skills'
  own logic).
- Produces: two findings lists (security, dependency) — consumed by Task 3, which fixes them.

- [ ] **Step 1: Run the security audit**

Invoke:

```
Skill: code-review:audit-security
```

This is the **full** audit (`/audit-security`), not the diff-scoped `/review-code` — it must sweep
the entire `bliblitalk-admin` codebase (backend + admin FE), not just recent changes.

- [ ] **Step 2: Run the dependency audit**

Invoke:

```
Skill: scan-dependency:scan-dependencies
```

Against this repo's lockfile (`pnpm-lock.yaml`) — OSV vulnerability scan + open-source license
policy check.

- [ ] **Step 3: Record both findings lists**

Write down (in your own working notes for Task 3 — not a new committed file) every Critical,
Important, and Minor finding from both audits, with file:line references. If either audit reports
zero findings, record that explicitly too — Task 3's exit condition depends on knowing the exact
count, not "it seemed clean."

No commit for this task — nothing changed in the repo yet.

---

### Task 3: `bliblitalk-admin` — Close audit findings

**Files:** depends entirely on Task 2's findings — cannot be enumerated in advance. This is the one
task in this plan whose diff is discovered at execution time rather than pre-specified, by design
(the spec's Decision 3: the gate drives the backlog, not the reverse).

**Interfaces:**
- Consumes: Task 2's findings lists.
- Produces: a codebase with zero unresolved Critical/Important findings, and an updated `PROJECT.md`
  backlog section listing any accepted Minor findings — consumed by Task 6/7's readiness check.

- [ ] **Step 1: Triage**

For each finding from Task 2, classify it Critical / Important / Minor exactly as the audit skill
labeled it (do not downgrade severity to avoid fixing something).

- [ ] **Step 2: Fix every Critical and Important finding**

For each one: write the fix, write a regression test proving the specific vulnerability/issue is
closed (e.g. an injection payload that used to succeed now gets rejected; a vulnerable dependency
version now resolves to a patched one), run that test to confirm it passes, then commit:

```bash
git add <changed files>
git commit -m "fix(security): <finding summary> [P8]"
```

One commit per finding (mirrors this project's established per-issue commit pattern from P1–P7's
review-fix loops).

- [ ] **Step 3: Record unfixed Minor findings**

For any Minor finding you are not fixing outright, add a line to `PROJECT.md`'s backlog/remediation
section (added by Task 1's `adopt-vibe` run) describing the finding and why it's accepted as-is.
Get the user's explicit acknowledgment of this list before moving on — do not silently accept risk
on the user's behalf.

- [ ] **Step 4: Re-run both audits**

Re-invoke `code-review:audit-security` and `scan-dependency:scan-dependencies`. Expected: zero
Critical/Important findings remain (Minor findings may persist if Step 3 explicitly accepted them).

- [ ] **Step 5: Commit the `PROJECT.md` backlog update (if any)**

```bash
git add PROJECT.md
git commit -m "docs(p8): record accepted Minor findings in PROJECT.md backlog"
```

---

### Task 4: `bliblitalk-admin` — Admin FE test infrastructure + `LifecycleActionBar` coverage

**Files:**
- Modify: `apps/frontend/vite.config.ts`
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/src/test/setup.ts`
- Create: `apps/frontend/src/components/LifecycleActionBar.test.tsx`

**Interfaces:**
- Consumes: `LifecycleActionBar` (`apps/frontend/src/components/LifecycleActionBar.tsx`) — reads
  `event.status` and `event.id`, calls `allowedFrom` from `@repo/shared-types`, `api.post` from
  `../services/api`, `useToastStore` from `../store/toastStore`, and renders `EndEventDialog`.
- Produces: a working `pnpm --filter @repo/frontend test` command and one real, passing test suite —
  the template for any future admin-FE test file (later phases can follow this exact pattern).

- [ ] **Step 1: Add test dependencies**

Modify `apps/frontend/package.json` — add to `devDependencies` (matching the version already used
elsewhere in this monorepo, `packages/shared-utils/package.json`'s `"vitest": "^2.0.0"`):

```json
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^25.0.0",
    "vitest": "^2.0.0"
```

Add to `scripts`:

```json
    "test": "vitest run"
```

- [ ] **Step 2: Run install**

```bash
pnpm install
```

Expected: exits 0, lockfile updated.

- [ ] **Step 3: Add the Vitest config block**

Modify `apps/frontend/vite.config.ts` — change the import and add a `test` block:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5184,
    proxy: {
      // Backend now owns the /api prefix itself (mounts at /api/public, /api/admin) —
      // forward as-is, no path rewrite.
      "/api": {
        target: "http://localhost:4001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
```

- [ ] **Step 4: Add the test setup file**

Create `apps/frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Register jest-dom's types**

Modify `apps/frontend/tsconfig.json` — add `"@testing-library/jest-dom"` to the `types` array:

```json
{
  "extends": "@repo/tsconfig/base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 6: Write the failing test**

Create `apps/frontend/src/components/LifecycleActionBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventStatus } from "@repo/shared-types";
import type { EventDTO } from "@repo/shared-types";
import { LifecycleActionBar } from "./LifecycleActionBar";
import { api, ApiRequestError } from "../services/api";

vi.mock("../services/api", async () => {
  const actual = await vi.importActual<typeof import("../services/api")>("../services/api");
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});

function makeEvent(status: EventStatus): EventDTO {
  return { id: "evt_1", status } as unknown as EventDTO;
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LifecycleActionBar", () => {
  it("renders exactly the buttons allowed from the current status", () => {
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={vi.fn()} />);
    // DRAFT -> [PUBLISHED, CANCELLED] per ALLOWED_TRANSITIONS
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Registration" })).not.toBeInTheDocument();
  });

  it("fires the transition and reports success for a non-confirm target", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const onChanged = vi.fn();
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/events/evt_1/transition", { to: EventStatus.PUBLISHED }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("does not fire when the user cancels a confirm-guarded target", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("fires when the user confirms a confirm-guarded target", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({});
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/events/evt_1/transition", { to: EventStatus.CANCELLED }));
  });

  it("opens EndEventDialog instead of firing immediately for the COMPLETED target", () => {
    render(<LifecycleActionBar event={makeEvent(EventStatus.ONGOING)} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "End Event" }));

    expect(screen.getByText("End Event Now?")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("on a 409 conflict, shows the actual status and still calls onChanged", async () => {
    const onChanged = vi.fn();
    vi.mocked(api.post).mockRejectedValue(
      new ApiRequestError(409, { code: "CONFLICT", message: "conflict", details: { from: "CANCELLED" } }),
    );
    render(<LifecycleActionBar event={makeEvent(EventStatus.DRAFT)} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
```

- [ ] **Step 7: Run the test to verify it currently fails**

Run: `pnpm --filter @repo/frontend test`

Expected: FAIL — before Steps 1–5, there is no `test` script and no test runner configured, so this
step is really "confirm the infra doesn't exist yet" (run it right after Step 6 but before double
checking Steps 1–5 landed, if executing strictly in order it will simply fail with "Missing script"
or a module-resolution error). If you executed Steps 1–5 first (as ordered above), this step instead
validates the test file itself is wired correctly by temporarily corrupting one assertion (e.g.
change `"Publish"` to `"Publish!!"` in the first test) and confirming that one test fails, then
revert.

- [ ] **Step 8: Run the test suite for real**

Run: `pnpm --filter @repo/frontend test`

Expected: PASS, 6/6 tests in `LifecycleActionBar.test.tsx`.

- [ ] **Step 9: Full frontend verification**

```bash
pnpm --filter @repo/frontend typecheck
pnpm --filter @repo/frontend lint
```

Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/package.json apps/frontend/vite.config.ts apps/frontend/tsconfig.json apps/frontend/src/test/setup.ts apps/frontend/src/components/LifecycleActionBar.test.tsx pnpm-lock.yaml
git commit -m "test(admin-fe): add Vitest + RTL infra, cover LifecycleActionBar"
```

---

### Task 5: `bliblitalk-admin` — Test-scenario dossier

**Files:**
- Create/modify: `docs/TEST-SCENARIO.md`

**Interfaces:**
- Consumes: `docs/DESIGN.md` (already exists) and the full codebase.
- Produces: `docs/TEST-SCENARIO.md`, consumed by Task 6's reviewer and Task 7's final gate.

- [ ] **Step 1: Generate the dossier**

Invoke:

```
Skill: golive-gate:generate-test-scenarios
```

- [ ] **Step 2: Run the agent-checkable scenarios**

Follow the skill's own output — it distinguishes agent-checkable scenarios (which you run and mark
PASS/FAIL with evidence) from human-judgment scenarios (left for Task 6's independent reviewer).

- [ ] **Step 3: Verify no agent-checkable scenario is left unrun**

Read `docs/TEST-SCENARIO.md` and confirm every scenario has a status — none left blank.

- [ ] **Step 4: Commit**

```bash
git add docs/TEST-SCENARIO.md
git commit -m "docs(p8): generate and run test-scenario dossier"
```

---

### Task 6: `bliblitalk-admin` — Independent review

**Files:**
- Create: `docs/REVIEW-PROOF.md`
- Modify: `PROJECT.md` (Review Evidence section)

**Interfaces:**
- Consumes: `PROJECT.md`'s risk level (Task 1), the closed audit findings (Task 3), and
  `docs/TEST-SCENARIO.md` (Task 5).
- Produces: `docs/REVIEW-PROOF.md` and an updated `PROJECT.md` Review Evidence section — consumed by
  Task 7's final gate.

- [ ] **Step 1: Read the recorded risk level**

```bash
grep -A2 "Risk Level" PROJECT.md
```

- [ ] **Step 2: Branch on risk level**

**If Low:** invoke `golive-gate:seal-review-proof` — for Low risk this self-certifies per that
skill's own stated behavior. Proceed to Step 3.

**If Medium or High:** stop here and tell the user directly: *"This repo classified as [level] risk.
`seal-review-proof`'s own rule requires the reviewer not be a repo commit author — every commit here
has Claude as co-author, so I cannot perform this review myself. Would you like to run
`golive-gate:seal-review-proof` yourself in your own checkout, or arrange for a colleague to?"* Do
not attempt to self-certify a Medium/High-risk repo under any circumstance. Wait for the user's
review to land (as a commit or an updated `docs/REVIEW-PROOF.md`) before proceeding to Task 7.

- [ ] **Step 3: Verify the review proof exists and is commit-bound**

```bash
cat docs/REVIEW-PROOF.md | head -10
git log -1 --format=%H
```

Expected: `docs/REVIEW-PROOF.md` references a specific commit SHA that matches (or precedes) the
current `HEAD` — a review sealed against a stale commit is not valid evidence for Task 7.

- [ ] **Step 4: Commit (if not already committed by the skill itself)**

```bash
git add docs/REVIEW-PROOF.md PROJECT.md
git commit -m "docs(p8): seal independent review proof" --allow-empty
```

(`--allow-empty` only matters if the skill already committed these files itself — check
`git status` first; drop the flag and the `git add` if there is nothing to commit.)

---

### Task 7: `bliblitalk-admin` — Final go-live gate

**Files:** none created by this task — it reads and reports.

**Interfaces:**
- Consumes: `PROJECT.md` (Tasks 1, 3, 6), `docs/TEST-SCENARIO.md` (Task 5), `docs/REVIEW-PROOF.md`
  (Task 6).
- Produces: a READY/NOT READY/CONDITIONAL verdict for `bliblitalk-admin`, held for Task 15's combined
  report.

- [ ] **Step 1: Run the final gate**

Invoke:

```
Skill: golive-gate:check-golive-readiness
```

- [ ] **Step 2: Record the verdict**

Write down the exact verdict and, if not READY, the exact list of reasons — this feeds Task 15
verbatim. Do not paraphrase a CONDITIONAL verdict as READY.

No commit for this task unless the skill itself writes something new into `PROJECT.md` (in which
case commit that update: `git commit -am "docs(p8): record go-live gate verdict"`).

---

### Task 8: `bliblitalk-user-fe` — Design document

**Files:**
- Create: `docs/DESIGN.md` (and, if a local PDF toolchain is available, `docs/DESIGN.pdf` —
  gitignored, not committed, per that skill's own rules).

**Interfaces:**
- Consumes: `bliblitalk-user-fe`'s existing `README.md`, `TECH_STACK.md`, and codebase (routes,
  Prisma-free — this repo has no DB, it consumes `bliblitalk-admin`'s public API).
- Produces: `docs/DESIGN.md`, consumed by Task 12 (`generate-test-scenarios`) — resolves the design
  spec's Open Question 1 (recommended option (a): scaffold this repo's own design doc for parity with
  `bliblitalk-admin` rather than relying on `generate-test-scenarios`'s codebase-only fallback).

- [ ] **Step 1: Generate the design document**

From the `bliblitalk-user-fe` repo root, invoke:

```
Skill: project-scaffold:design-document
```

- [ ] **Step 2: Interview to close gaps**

Follow the skill's own Phase 3 — it will ask batched questions per section where the code alone
can't settle intent (e.g. the actual business workflow across HR/admin/participant roles, why Speed
Dating exists). Answer them; let the skill mark anything genuinely unknown as `⚠️` rather than
inventing an answer.

- [ ] **Step 3: Validate every Mermaid block parses**

The skill's own Phase 2 gate — follow it; do not finalize with an unparseable diagram.

- [ ] **Step 4: Verify the document is non-empty and finalized**

```bash
grep -c "⚠️" docs/DESIGN.md
```

Expected: either `0`, or every remaining `⚠️` is one you and the skill explicitly agreed to leave as
an owner-acknowledged gap in Step 2 (not an oversight).

- [ ] **Step 5: Commit**

```bash
git add docs/DESIGN.md
git commit -m "docs(p8): design document for bliblitalk-user-fe"
```

---

### Task 9: `bliblitalk-user-fe` — Governance scaffold + risk classification

Same procedure as Task 1, run against this repo.

**Files:** `PROJECT.md` (created/modified).

**Interfaces:**
- Consumes: `TECH_STACK.md`, `docs/DESIGN.md` (Task 8), and the codebase.
- Produces: `PROJECT.md` with a recorded Risk Level — consumed by Tasks 10, 11, 13, 14.

- [ ] **Step 1: Scaffold `PROJECT.md`**

```
Skill: project-scaffold:adopt-vibe
```

- [ ] **Step 2: Verify `PROJECT.md` was created**

Same check as Task 1 Step 2, against this repo.

- [ ] **Step 3: Run risk classification**

```
Skill: golive-gate:assess-risk-level
```

This repo is participant-facing (public-ish, but behind the same unified login as the admin CMS —
verify the actual access model with the skill rather than assuming) and reads the same PII classes
via `bliblitalk-admin`'s public API. Let the skill verify against the actual code.

- [ ] **Step 4: Verify the risk level was recorded**

```bash
grep -A2 "Risk Level" PROJECT.md
```

- [ ] **Step 5: Commit**

```bash
git add PROJECT.md
git commit -m "chore(p8): scaffold PROJECT.md and record risk classification"
```

---

### Task 10: `bliblitalk-user-fe` — Security + dependency audit

Same procedure as Task 2, run against this repo (frontend-only codebase — no backend/DB here, so the
security audit's surface is narrower: XSS, auth-token handling, CORS assumptions on the consumed API,
not injection/DB concerns).

**Files:** none created directly.

**Interfaces:**
- Consumes: `PROJECT.md`'s risk level (Task 9).
- Produces: findings lists consumed by Task 11.

- [ ] **Step 1: Run the security audit**

```
Skill: code-review:audit-security
```

- [ ] **Step 2: Run the dependency audit**

```
Skill: scan-dependency:scan-dependencies
```

- [ ] **Step 3: Record both findings lists**

Same as Task 2 Step 3.

---

### Task 11: `bliblitalk-user-fe` — Close audit findings

Same procedure as Task 3, run against this repo's findings.

**Files:** discovered at execution time (see Task 3's note).

- [ ] **Step 1: Triage**
- [ ] **Step 2: Fix every Critical and Important finding** (fix + regression test + one commit each,
  same message format as Task 3 Step 2)
- [ ] **Step 3: Record unfixed Minor findings in `PROJECT.md`, with the user's explicit sign-off**
- [ ] **Step 4: Re-run both audits — confirm zero unresolved Critical/Important findings**
- [ ] **Step 5: Commit the `PROJECT.md` backlog update**

```bash
git add PROJECT.md
git commit -m "docs(p8): record accepted Minor findings in PROJECT.md backlog"
```

---

### Task 12: `bliblitalk-user-fe` — Test-scenario dossier

Same procedure as Task 5, run against this repo. This repo already has two Playwright e2e specs
(`apps/frontend/e2e/login.spec.ts`, `shortlist-badge.spec.ts`) — the generated dossier should
reference and reuse these where they already cover a scenario, not duplicate them.

**Files:** `docs/TEST-SCENARIO.md`.

- [ ] **Step 1: Generate the dossier**

```
Skill: golive-gate:generate-test-scenarios
```

- [ ] **Step 2: Run the agent-checkable scenarios**, including the existing Playwright specs where
  they satisfy a scenario:

```bash
pnpm --filter @repo/frontend e2e
```

(Confirm this command actually exists and runs — if the earlier-noted missing `test`/`e2e` script
gap in `apps/frontend/package.json` is still present, add the missing script pointing at whatever
Playwright CLI invocation `playwright.config.ts` expects, as its own small fix, before relying on it
here.)

- [ ] **Step 3: Verify no agent-checkable scenario is left unrun**
- [ ] **Step 4: Commit**

```bash
git add docs/TEST-SCENARIO.md apps/frontend/package.json
git commit -m "docs(p8): generate and run test-scenario dossier"
```

---

### Task 13: `bliblitalk-user-fe` — Independent review

Same procedure as Task 6, run against this repo's own risk classification (Task 9) — the Low vs.
Medium+ branch is independent per repo; `bliblitalk-user-fe` could classify differently from
`bliblitalk-admin`.

**Files:** `docs/REVIEW-PROOF.md`, `PROJECT.md`.

- [ ] **Step 1: Read the recorded risk level**
- [ ] **Step 2: Branch on risk level** (same Low vs. Medium/High handling as Task 6 Step 2)
- [ ] **Step 3: Verify the review proof exists and is commit-bound**
- [ ] **Step 4: Commit (if not already committed by the skill itself)**

---

### Task 14: `bliblitalk-user-fe` — Final go-live gate

Same procedure as Task 7, run against this repo.

**Files:** none created — reads and reports.

- [ ] **Step 1: Run the final gate**

```
Skill: golive-gate:check-golive-readiness
```

- [ ] **Step 2: Record the verdict**

---

### Task 15: Present both verdicts

**Files:** none — this is a reporting task.

- [ ] **Step 1: Run both repos' full verification one more time, from a clean state**

```bash
cd bliblitalk-admin && pnpm --filter @repo/backend test && pnpm --filter @repo/frontend test && pnpm turbo run typecheck lint
cd ../bliblitalk-user-fe && pnpm --filter @repo/frontend typecheck && pnpm --filter @repo/frontend lint
```

Expected: all exit 0.

- [ ] **Step 2: Present the combined report to the user**

State, for each repo: the recorded risk level, the number of Critical/Important findings fixed, the
number of Minor findings accepted into backlog, the test-scenario dossier's pass count, and the
final `check-golive-readiness` verdict (READY / NOT READY / CONDITIONAL) with reasons for anything
short of READY. Do not round a CONDITIONAL or NOT READY verdict up to READY in the summary.

- [ ] **Step 3: Hand off to `finishing-a-development-branch`**

Once both verdicts are presented and the user has seen them, proceed exactly as P1–P7 did: verify
tests, detect environment, present the 4 standard options (merge/PR/keep/discard) for whatever
branch this work landed on.

---

## Self-Review Notes

- **Spec coverage:** design spec Steps 1–8 (per repo) map 1:1 to Tasks 1–3, 5–7 (`bliblitalk-admin`)
  and Tasks 9–14 (`bliblitalk-user-fe`), with Task 4 (admin FE test coverage) and Task 8
  (`bliblitalk-user-fe` design doc) covering the spec's Decision 3 and Open Question 1 respectively.
  Non-goals (no CI/CD, no k8s, no deployment) are carried into Global Constraints.
- **Placeholder scan:** Task 4 has complete, real code (verified against the actual
  `LifecycleActionBar.tsx`, `api.ts`, `toastStore.ts`, `EndEventDialog.tsx`, and
  `ALLOWED_TRANSITIONS` source at plan-writing time — the test cases' expected button labels and
  API call shapes are not guessed). Tasks whose content is genuinely unknowable until an audit skill
  runs (Tasks 3, 11) specify a concrete triage-and-fix *procedure* rather than vague instructions —
  this is a deliberate, spec-mandated exception (Decision 3: "the gate drives the backlog"), not an
  oversight; every other task's steps are fully concrete skill invocations with exact verification
  commands.
- **Type consistency:** `EventDTO`, `EventStatus`, `allowedFrom`, `ApiRequestError` names in Task 4's
  test file match their real exports (`@repo/shared-types`, `apps/frontend/src/services/api.ts`)
  exactly, confirmed by reading the source files, not from memory of an earlier phase.
- **Verified during planning, not assumed:** `packages/shared-utils` and `packages/shared-types`
  already have test coverage for `validateEventDates`, `allowedFrom`/`canTransition`, and the
  status-color helpers — so this plan does not re-propose testing those (they're already covered);
  the actual, real gap is React-component-level behavior in `apps/frontend/src`, which is what Task 4
  targets.

## Execution Handoff Note

Most of this plan's tasks are single skill invocations with a verification check, not multi-step
code changes — the classic Subagent-Driven pattern (fresh implementer + reviewer per task) fits
Task 4 well, but poorly for Tasks 1, 5, 7, 8, 9, 12, 14 (they're better run inline, in this session,
since several of the underlying skills interview *you* directly and can't be answered by a subagent
that has no access to you). Tasks 3, 6, 11, and 13 sit in between — mechanical once the inputs are
known, but Tasks 6/13 may require pausing entirely for a human reviewer outside this session. Keep
this in mind when choosing an execution approach below.
