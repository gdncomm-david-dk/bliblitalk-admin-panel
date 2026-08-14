# PROJECT.md

Go-live review dossier for this tool. Reviewers and approvers read this file before the tool is released to others. Complete it via the `project-documenter` skill before pushing to GitHub or going live. Fields marked **(owner input)** must come from the project owner; never invent them. Keep this file updated when facts change: a material change to risk level, data used, or access scope may trigger re-review.

## Problem Being Solved

<!-- What problem this tool solves and for whom. One short paragraph. -->

## Project Owner

<!-- (owner input) Person or team requesting and responsible for the tool. -->

David Kurniawan — GitHub `gdncomm-david-dk` (recorded 2026-08-07).

Membership of the approved `gdncomm-ops` org was verified, not assumed: `gh api
user/memberships/orgs/gdncomm-ops` returned `state=active role=member`. This is the same person as
`## Support Contact` below, which is a deliberate owner decision and has one consequence worth
stating plainly: the independent-review exclusion set is now a single identity, so **David Kurniawan
cannot be the reviewer**. Someone else must run `/vibe-review` in their own checkout under their own
git identity.

## Support Contact

<!-- (owner input) Person or team contacted when issues occur. -->

David Kurniawan — david.dk@gdn-commerce.com (recorded 2026-08-07).

This value is not only a contact address. The AIVA platform reads `support-contact` from
`vibe-release.json` and turns it into three things: the Kubernetes label `app-owner`, the Apps
Gateway `owners` value (which is what the default WHITELIST admits), and the Keycloak **staging**
username/email. A named individual was chosen deliberately over a shared mailbox, since the value
becomes a login identity.

Consequence for review independence: the independent reviewer must be someone other than this
person. See `## Review Evidence`.

## Vibe Start

2026-07-13 (stamped by `/adopt-vibe` from the earliest git commit date, per that skill's rule for
brownfield projects.)

## Label

<!-- (owner input) GCP labels for cost and budget management. Provide all three below.
- Company: exactly one of gdn, gdpu, gdpa, gdv, gdr, gtn, gan, gdnus, gdni, rise, gem (owning sister company).
- Division: exactly one of operations, finance, marketing, commercial.
- Department: free text — the owning department name (non-empty), recorded in lowercase.
Asked during /start-vibe; /vibe-check will not pass while Company or Division is empty/invalid or Department is empty. -->

- Company: gdn
- Division: operations
- Department: automation-data-insight

Recorded 2026-08-07 from the owner. The department is "Automation, Data, Insight"; it is written
here hyphenated because AIVA copies this value verbatim into the Kubernetes label `departement`,
and a Kubernetes label value may not contain spaces or commas. Same three values are mirrored in
`vibe-release.json`, which is what AIVA actually reads.

## Design Overview

<!-- Simple design overview: main components, data flow, key integrations. Detail lives in docs/ARCHITECTURE.md; the full design-review document (diagrams, transaction flows, database schema, external connections, financial-risk analysis) lives in docs/DESIGN.md. Keep this reviewer-readable. -->

## Risk Level

<!-- (owner input, confirm) Low / Medium / High per the Non-Tech Change Management playbook.
Low: small personal tool, no sensitive data.
Medium: used by a team, connects to company systems, uses internal company data, automates regular work, or affects team decisions.
High: accessible outside the company or internet-facing, handles payments or money, uses sensitive personal or company data, or supports critical business processes.
A tool is not automatically Low just because it is small. When in doubt, consult Information Security. -->

**High** — classified 2026-07-24 by Claude via `golive-gate:assess-risk-level`.

Matched criterion: *accessible outside the company or internet-facing* (owner-confirmed).

Answer verification (per `data/risk-criteria.json`'s interview):
- **users** — team + external participants. CONFIRMED: RBAC roles `SUPER_ADMIN`/`EVENT_ADMIN`/`HR_TA`/`PARTICIPANT` (`packages/shared-types/src/enums.ts`; `VIEWER` was retired 2026-08-06), shared deployment config (`k8s/README.md`, `docker-compose.yml`).
- **systems** — connects to company systems. CONFIRMED: Postgres via Prisma, SMTP mailer for marketing/reminder emails (`apps/backend/src/config.ts` `smtp` block).
- **data** — internal + participant personal data (name, email, phone, institution, department, position, years of experience). CONFIRMED via `schema.prisma` `User` model. No KTP/payroll/financial fields found — per the playbook's `personalDataRule`, this alone would not reach High, but combines with the exposure criterion below.
- **automation** — automates regular work. CONFIRMED: `sweepEventLifecycle` and `sweepDueReminders` (60s interval sweeps, `apps/backend/src/index.ts`), marketing email campaigns (`adminMarketing.service.ts`).
- **exposure** — **owner-confirmed: Yes**, the companion `bliblitalk-user-fe` participant portal is meant to be reachable by external event participants (not just gdn-commerce staff), e.g. via Google OAuth registration. This is the criterion that sets the High tier (owner confirmation governs per `exposureRule`; consistent with the code — participant registration has no company-domain restriction, unlike the admin CMS's Microsoft-SSO-gated login).
- **money** — no payment/checkout code found anywhere in the codebase (confirmed during the `docs/DESIGN.md` financial-surface review). Not a High trigger by itself.
- **criticality** — **owner-confirmed: No**, not a critical business process; events could run with manual workarounds if the tool broke. Not a High trigger by itself — High is reached via the exposure criterion alone.

Per the High tier's requirements (see Go-Live Steps below): formal review and approval, monitoring, recovery procedures, and an independent (non-builder) reviewer are all still outstanding as of this classification.

## Access Status

External — the companion `bliblitalk-user-fe` participant portal is designed to be reachable by people outside gdn-commerce (event participants/job-seekers registering via Google OAuth). The admin CMS (`bliblitalk-admin`, this repo) itself is intended for internal staff only, gated behind Microsoft SSO — but the shared backend/database this repo owns is the same trust boundary the external-facing portal talks to via its public API, which is why the High classification above applies to this repo too. Currently **not deployed anywhere** (local-only, confirmed 2026-07-24) — this section describes the intended access pattern once live, not current reachability.

## Data Used

Internal / Participant Personal Data. Datasets: registrant/participant records (name, email, phone, institution, department, position, years of experience — `User` table), event data, registrations, feedback, certificates. Source: this repo's own Postgres database (no external data source). No KTP, payroll, health, or financial-account data is collected or stored anywhere in the schema.

## Data That Must Not Be Entered

KTP/NIK, payroll or salary data, financial account data, health data, passwords or access codes for other systems, or any other confidential company information — none of these fields exist in the current schema; this is a standing constraint on future changes, not a description of data already present.

## Login Method

**Apps Gateway SSO.** This app implements no login, no sessions and no JWTs: the gateway
authenticates at the edge and forwards the signed-in user's email in the `X-User-Id` header. The
app reads that header, looks the address up in `User`, and applies its own role matrix
(`@repo/auth`). Adopted 2026-08-06, replacing the mocked Microsoft SSO and the password login
(`docs/REMEDIATION.md` SEC-001 / GLG-001).

Apps Gateway is the correct method here because this app's entire population — `SUPER_ADMIN`,
`EVENT_ADMIN`, `HR_TA` — is internal staff with company accounts. It is **not** a fit for
`bliblitalk-user-fe`, whose population is external participants with no company account; that app
is tracked separately under its own `GLG-003`.

### Gateway registration — values for DevOps to apply (not performed by this project)

Registration decides who may enter the app and is authenticated with a credential this project
never holds. It is done by DevOps at `/auth/ui/apps`, or automatically by the AIVA platform at
onboarding. Nobody here calls `POST /auth/api/apps/register`.

| Field | Value |
|---|---|
| Subdomain | ⚠️ **owner input** — pattern `<service>.<public-domain>`; `bliblitalk-admin.blibli.io` (prod) / `bliblitalk-admin-staging.blibli.dev` (staging) fits the convention |
| Owners | `david.dk@gdn-commerce.com` — resolved 2026-08-07 from `## Support Contact` below (the gateway `owners` value is an email, not a GitHub username, so it comes from Support Contact and not from `## Project Owner`) |
| Access mode | `WHITELIST` (gateway default: owners + access list). Correct for an internal CMS — `EVERYONE` would admit any signed-in company user and leave the app's own RBAC as the only gate |
| Applied by | DevOps at `/auth/ui/apps`, or AIVA at onboarding |

**Owners is not a formality.** For AIVA-onboarded apps the `support-contact` becomes the registered
owner *and* a staging Keycloak login identity. A shared or group mailbox there is a shared
credential with no accountable person — name an individual.

### Deployment prerequisites, not automatable

1. **The app needs its own hostname.** `k8s/README.md` documents one path-routed Ingress (`/` →
   participant portal, `/admin` → this app). Gateway registration is subdomain-based, so this app
   must move to its own host before routing works.
2. **The app must be reachable only through the gateway** in production — no ingress of its own.
   `X-User-Id` is trusted by network isolation, nothing else.
3. **`/api/uploads/**` must be resolved first.** It is unauthenticated static file serving that the
   participant portal references as `<img src>`. Behind the gateway every non-probe path is
   login-required, so those images would redirect anonymous visitors to the login UI and break.
   The fix is Phase 6 (move uploads to GCS), already planned; do not work around it by widening the
   public prefix.

## Access Levels

Role-based access control via `@repo/auth`'s permission matrix: `SUPER_ADMIN` (full access, including staff account provisioning and role management), `EVENT_ADMIN` (scoped to their own assigned events — participants, registrations, workspace tabs), `HR_TA` (Talent Acquisition, registrant/candidate visibility), `PARTICIPANT` (self-service registration and event participation only, no admin access). Enforced server-side via `requireAuth`/`requirePermission`/`requireRole` middleware on every admin route — required detail for High risk (per the risk criteria).

**Corrected 2026-08-07:** this list previously also named a `VIEWER` (read-only) tier. That role was
removed from the `Role` enum on 2026-08-06 (migration `20260806120000_drop_viewer_role`) and this
section was missed at the time — the four roles above are the complete set. One consequence is worth
stating for a reviewer rather than leaving implicit: with `VIEWER` gone, **every remaining Admin CMS
role holds `USER_MANAGE`**, so listing users is no longer deniable to any admin tier. The narrowest
surviving privilege boundary is `ROLE_MANAGE`, which only `SUPER_ADMIN` holds.

## Access Approval Process

<!-- (owner input) Who approves access requests and how. -->

## Go-Live Steps

<!-- Deployment route and the approvals required for this risk level. Low: owner check. Medium: independent review. High: Architecture, SRE, and Information Security approval. -->

Seeded from the **High** tier (`golive-gate` `risk-criteria.json`), 2026-07-24:

**Requirements:**
- [ ] Formal review and approval required before go-live
- [ ] Monitoring in place
- [ ] Recovery procedures mandatory
- [x] Access levels and permissions defined (see Access Levels above)
- [ ] Independent reviewer (not the builder) — every commit in this repo has Claude as co-author, so this cannot be self-certified; see Task 6 of the P8 plan

**Approvals needed:**
- [ ] Tech R&D / Architecture
- [ ] SRE
- [ ] Information Security
- [ ] GRC (as applicable)

## Review Evidence

<!-- (owner input) Who reviewed, when, and the sign-off record (approval email, review notes). Required before go-live for Medium and High risk. -->

- **2026-07-24 — Information Security sign-off (David Kurniawan) — 3 BLOCKING waivers:**
  - **GLG-001** (login method is not real SSO/OAuth): waived for the current pre-deployment/dev milestone only. Owner's stated condition: "its okay, because its mockup only, but in reality (production) will use real SSO gateway" — real Apps Gateway SSO / verified Google OAuth is still required before any actual production deployment; this finding is re-opened at that point. See `docs/REMEDIATION.md` GLG-001.
  - **DEP-002** (png-js undeclared license metadata): waived — shipped `LICENSE` manually verified as MIT. See `docs/REMEDIATION.md` DEP-002.
  - **DEP-003** (caniuse-lite CC-BY-4.0, unlisted): waived — attribution-only, build-time-only dependency. See `docs/REMEDIATION.md` DEP-003.
- **GLG-002** (repo outside approved GitHub org): not a waiver — owner decided 2026-07-24 to migrate this repo (and `bliblitalk-user-fe`) to the `gdncomm-ops` org. Execution pending owner action (no `gh` CLI/API token available in the agent's environment to do it directly). See `docs/REMEDIATION.md` GLG-002.
- **2026-08-03 — `/vibe-review` (`golive-gate:seal-review-proof`) attempted, refused to seal — INCOMPLETE, no proof written:**
  - Independent-reviewer identity could not be established in this session: `git config user.name` / `git config user.email` are unset at both the local (this repo) and global scope — the skill's own step 2 requires stopping and asking the reviewer to configure their identity rather than proceeding, so no `docs/REVIEW-PROOF.md` was written and nothing was committed under a fabricated identity.
  - Independently, `## Project Owner` and `## Support Contact` above are both still empty, so even with a resolvable reviewer identity the independence exclusion set cannot be resolved (`review-proof.json` `ownerSupportResolution`) — per that spec, both empty → independence `UNDETERMINED` → verdict capped at INCOMPLETE, never a default pass.
  - This repeats the exact blocker recorded in this project's own prior-session memory (`p8_golive_gate_blocked_on_owner.md`, 2026-07-24): every commit in this repo is authored solely by David Kurniawan, who also holds this project's named Information Security sign-off role — he cannot pass the independence check either. The owner said he would arrange a colleague; no such colleague's git identity is configured in any session observed so far.
  - **Action needed (owner):** (1) fill in `## Project Owner` (GitHub username, `gdncomm-ops` member) and `## Support Contact` (company email) above; (2) have a person who is neither of those two run `git config user.name`/`user.email` (and `gh auth login`) with their **own** identity in their **own** checkout, then run `/vibe-review` themselves. No AI agent session can satisfy this step on anyone's behalf.
  - Checked by: Claude (fresh reviewer session, no prior memory of this repo's build history), 2026-08-03.
- **2026-08-03 — `check-golive-readiness` (`/vibe-check`) run — verdict NOT READY:**
  - Blocking items (must all clear before READY):
    1. **`review-proof-sealed`** — no `docs/REVIEW-PROOF.md` exists for High risk; see the entry immediately above. Fix: an independent reviewer (not David Kurniawan) runs `/vibe-review` in their own checkout.
    2. **`remediation-blocking-clear`** — `docs/REMEDIATION.md` GLG-002 is still OPEN (repo origin `github.com/gdncomm-david-dk/bliblitalk-admin`, not the approved `gdncomm-ops` org; confirmed live via `git remote -v`, 2026-08-03). Fix: complete the already-decided migration to `gdncomm-ops`, or record a formal exception.
    3. **`ownership-support-contacts`** — `## Project Owner` and `## Support Contact` are both empty. Fix: owner supplies a GitHub username (verified `gdncomm-ops` member) and a company email.
    4. **`gcp-label-set`** — `## Label` Company/Division/Department are all empty. Fix: owner supplies all three.
    5. **`approvals-complete`** (High) — no named Tech R&D/Architecture, SRE, Information Security, or GRC go-live sign-off is recorded (distinct from the issue-specific InfoSec waivers on GLG-001/DEP-002/DEP-003 above, which cover only those three findings, not the overall go-live approval). Fix: obtain and record the four named sign-offs listed under Go-Live Steps.
    6. **`sso-login-only`** — `## Login Method` is a mocked Microsoft "SSO" / mocked Google "OAuth" (`apps/backend/src/routes/auth/auth.routes.ts:56`, prod-gated but still not a real IdP integration); neither Apps Gateway SSO nor Company Google OAuth is implemented. GLG-001's waiver is explicit that it covers only the pre-deployment/dev milestone, not an actual production go-live. Fix: ship real Apps Gateway SSO (plan already drafted, see `CONTEXT.md` Key Decisions) before go-live.
    7. **`backup-recovery`** — `## Recovery Procedures` is empty (mandatory for High). Fix: owner/SRE documents rollback/restore steps.
    8. **`approved-platform-only`** — `## Hosting Location` is empty; no real infrastructure is provisioned anywhere (`k8s/` is a documented placeholder only, confirmed no manifests exist). Fix: record the approved target platform once provisioned.
  - Non-blocking cautions recorded for the record: `docs/DESIGN.md` is self-flagged STALE as of 2026-08-02 (still describes the deleted `/api/public/*` surface in ~14 places) — recommend regenerating before the eventual independent review relies on it; 3 `important`-category scenarios in `docs/TEST-SCENARIO.md` remain PENDING (TS-008, TS-020, TS-024) with no automated coverage — does not block per the written rule (only FAILED/STALE blocks), but is a real coverage gap; `docs/REMEDIATION.md` SEC-002/SEC-024 still cite `apps/backend/src/routes/public/auth/auth.routes.ts` — that path and the `/auth/register`, `/auth/google` endpoints it described no longer exist in this repo at all (moved to `bliblitalk-user-fe` during the repo split) — the underlying risk is gone but the backlog text is stale and should be corrected to avoid misleading a future reviewer.
  - Advisory backlog at gate time: 24 OPEN advisory findings (SEC-009 through SEC-023, DEP-004 through DEP-007, STK-001/002, STR-001 through STR-008) — documented, none blocking, tracked in `docs/REMEDIATION.md`.
  - `vibe-release.json` written at repo root for commit `d2239bb` — not committed (per policy, the owner commits and pushes governance docs, e.g. via `/push-github`).
  - Checked by: Claude, 2026-08-03.
- **2026-08-03 — GLG-002 (repo outside approved GitHub org) resolved:** owner chose "Hold — migrate to `gdncomm-ops` first" rather than push to the non-approved `gdncomm-david-dk` remote. Migration completed: `origin` renamed to `backup-origin` (kept, untouched), new `origin` set to `https://github.com/gdncomm-ops/bliblitalk-admin.git`, `feat/qa-hardening-p8` pushed as a verified fast-forward (`b0e6aec..970d353`, confirmed non-divergent via `git merge-base --is-ancestor` before push), tag `pre-split-2026-08-02` pushed, both verified landed via `git ls-remote`. See `docs/REMEDIATION.md` GLG-002 (now FIXED) for full detail. This clears blocking item 2 (`remediation-blocking-clear`, GLG-002 specifically) from the 2026-08-03 `check-golive-readiness` run above; the other 7 blocking items on that list are unaffected and remain open pending owner action.
  - Checked by: Claude, 2026-08-03.
- **2026-08-07 — `check-golive-readiness` (`/vibe-check`) run — verdict NOT READY** (tier High, evaluated at commit `0fb7488`, working tree clean at entry):
  - **PASS (8):** `company-only-access-default` (Access Status: External, stated and justified); **`sso-login-only` — now passing**, `## Login Method` is Apps Gateway SSO, one of the two allowed values, replacing the mocked Microsoft SSO that failed this item on 2026-08-03; `permissions-defined` (Access Levels filled; corrected this run, see below); `approved-platform-only` (Hosting Location recorded this run as GKE via the AIVA platform — an approved company platform; nothing is deployed to any unapproved platform, because nothing is deployed at all); `useful-logs-no-secrets` (scanned every `console.*`/`logger.*` call in `apps/*/src` against `never-log.json`; one match, `apps/backend/src/lib/shared/mailer.ts:56` logging `{ email, err }` — **not** a violation, that file's own guidance states email/name/role are not forbidden data); `ownership-support-contacts` (both filled 2026-08-07; `gdncomm-david-dk` confirmed a `User` and an **active member** of `gdncomm-ops` via `gh api`, and `david.dk@gdn-commerce.com` matches no denied domain or shared-account pattern); `gcp-label-set` (gdn / operations / automation-data-insight); `remediation-blocking-clear` (every `## Blocking` finding is FIXED or WAIVED with a named Information Security approver and a matching Review Evidence entry above).
  - **FAIL (5) — these block READY:**
    1. **`review-proof-sealed`** — no `docs/REVIEW-PROOF.md` exists in this repo at all. Fix: an independent reviewer runs `/vibe-review` in their own checkout under their own git identity.
    2. **`approvals-complete`** (High) — no named Tech R&D/Architecture, SRE, Information Security, or GRC go-live sign-off is recorded. The issue-specific InfoSec waivers on GLG-001/DEP-002/DEP-003 cover only those findings, not the go-live decision.
    3. **`backup-recovery`** — `## Recovery Procedures` is empty. Owner decided this run (2026-08-07) to defer it to SRE rather than write a placeholder; recorded as deferred, still failing. No Postgres backup is configured anywhere in this repo (verified: none in `k8s/`, `docker-compose.yml`, or CI).
    4. **`design-document-complete`** — `docs/DESIGN.md` carries its own "⚠️ ALSO STALE as of 2026-08-06" banner. Fix: regenerate via the `design-document` skill.
    5. **`test-scenario-complete`** — `docs/TEST-SCENARIO.md` has 4 STALE and 3 PENDING scenarios (27 total, 16 passed). At High every `sensitive` scenario must be PASSED; STALE means the covered code changed since it last passed. Fix: re-run `/test-scenarios`.
  - **Corrections made to this dossier during the run** (both were stale records, not new decisions): `## Access Levels` still listed a `VIEWER` (read-only) tier that was removed from the `Role` enum on 2026-08-06 — corrected, with the resulting `USER_MANAGE` consequence stated explicitly for a reviewer. `## Hosting Location` was filled from the owner's answer this run.
  - Worth a reviewer's attention: **GLG-001 is still recorded WAIVED**, and that waiver was explicitly scoped to "the pre-deployment/dev milestone only… re-opened before any actual production deployment". The condition it was waiting for has now been met — this app genuinely runs on Apps Gateway SSO — so GLG-001 looks resolvable to FIXED rather than waived. Not changed here: it carries a named Information Security approver, so the correction belongs to that approver, not to this gate run.
  - Advisory backlog at gate time: 27 OPEN advisory findings — documented, none blocking, tracked in `docs/REMEDIATION.md`.
  - `vibe-release.json` regenerated at repo root for commit `0fb7488`.
  - Checked by: Claude, 2026-08-07.

- **2026-08-10 — go-live gate re-run (`/vibe-check`), commit `6bd48ed`: NOT READY.** Re-run after
  three commits landed today (auth-crash fix, admin-editable landing testimonials, Settings folded
  into one tabbed page), which invalidated the previous record's `target-commit-hash` `0fb7488`.
  - **PASS** — `company-only-access-default`, `sso-login-only` (Apps Gateway SSO), `permissions-defined`,
    `approved-platform-only` (GKE via AIVA), `useful-logs-no-secrets`, `backup-recovery`,
    `ownership-support-contacts` (`gdncomm-david-dk` / `david.dk@gdn-commerce.com`),
    `gcp-label-set` (gdn / operations / automation-data-insight), `design-document-complete`,
    `remediation-blocking-clear` — every `## Blocking` finding is FIXED or carries a recorded
    Information Security waiver; none is OPEN.
  - **FAIL — `review-proof-sealed`.** `docs/REVIEW-PROOF.md` **does not exist in this repo at all.**
    High tier requires a proof sealed by a reviewer who is neither the Project Owner nor the Support
    Contact. Both are David Kurniawan, so the exclusion set is one identity and he cannot seal it;
    someone else must run `/vibe-review` in their own checkout.
  - **FAIL — `approvals-complete`.** No named Tech R&D/Architecture, SRE, Information Security or GRC
    go-live sign-off is recorded here. The 2026-07-24 InfoSec waivers above cover GLG-001/DEP-002/
    DEP-003 only, not the go-live decision. Note for the owner: names were supplied on 2026-08-10 for
    the *sibling repo's* GLG-003 OTP waiver (InfoSec/SRE Andrew Saghita; Architecture Eko Kurniawan
    Khaenedy and Hidayat; GRC Dyah Inastra; dated 2026-07-29). Whether those same people also signed
    off the **go-live of this repo** is not something the agent may assume — if they did, record it
    here explicitly and re-run the gate.
  - **FAIL — `test-scenario-complete`.** `docs/TEST-SCENARIO.md` reports 4 STALE and 3 PENDING of 27.
    STALE blocks at High. The count is also now understated: today's commits changed
    `middleware/requireAuth.ts`, `routes/admin/adminModuleSettings.routes.ts`, `layouts/AdminShell.tsx`
    and `pages/settings/SiteSettingsPage.tsx`, so further PASSED scenarios covering those files are
    stale as of `6bd48ed` and the dossier has not been re-reconciled against this commit.
  - **Not covered by any scenario:** the new per-tab permission gating in `SiteSettingsPage.tsx`
    (`visibleSettingsTabs`) decides which settings surfaces each role can reach. It was verified
    manually in the browser for all three roles this session, but nothing asserts it automatically.
    UI gating only — the API still enforces `requirePermission` — but it deserves a test.

- **2026-08-10 (later, second run) — go-live gate re-run (`/vibe-check`), commit `0e42316`: NOT READY.**
  Re-run because `0e42316` added the `UpdateProfileInput` contract to `packages/shared-types`
  (authored here, mirrored into `bliblitalk-user-fe` for its Account Settings page), which moved
  HEAD past the `6bd48ed` the record above evaluated. Working tree clean at entry.
  - **PASS (8 of 13):** `ownership-support-contacts`, `gcp-label-set` (gdn / operations /
    automation-data-insight), `sso-login-only` (Apps Gateway SSO — unchanged by this commit),
    `company-only-access-default`, `permissions-defined`, `approved-platform-only` (GKE via AIVA),
    `useful-logs-no-secrets` (this commit adds no logging; the previous scan stands),
    `remediation-blocking-clear` (re-verified this run: every `## Blocking` finding is FIXED or
    WAIVED, 0 OPEN; 25 ADVISORY open — SEC-009…SEC-023, DEP-004…DEP-007, STK-001/002,
    STR-001…STR-008 — which never block).
  - **FAIL — `review-proof-sealed`.** `docs/REVIEW-PROOF.md` still does not exist in this repo at
    all. High tier requires a proof sealed by a reviewer who is neither the Project Owner nor the
    Support Contact; both are David Kurniawan, so someone else must run `/vibe-review` in their own
    checkout under their own git identity. Unchanged since 2026-08-03.
  - **FAIL — `approvals-complete`.** Still no named Tech R&D/Architecture, SRE, Information Security
    or GRC **go-live** sign-off recorded for this repo. The 2026-07-24 InfoSec waivers cover
    GLG-001/DEP-002/DEP-003 only; the 2026-07-29 names recorded in the sibling repo cover the OTP
    login mechanism, not this repo's release.
  - **FAIL — `backup-recovery`.** `## Recovery Procedures` is still the ⚠️ deferred-to-SRE
    placeholder — no backup schedule, no retention, no tested restore path. **Correction to the
    record above:** the earlier 2026-08-10 entry listed `backup-recovery` under PASS. That was
    wrong; the section has not changed since it was deferred on 2026-08-07 and this item has been
    failing continuously since then.
  - **FAIL — `design-document-complete`.** `docs/DESIGN.md` still carries all three of its own
    staleness banners (2026-08-02 repo-split, 2026-08-06 Apps Gateway, 2026-08-06 `VIEWER` removal)
    at lines 8, 14 and 38. **Correction to the record above:** the earlier 2026-08-10 entry listed
    this as PASS; the banners were never removed and the document was never regenerated. Fix:
    re-run the `design-document` skill.
  - **FAIL — `test-scenario-complete`.** `docs/TEST-SCENARIO.md` is materially out of date, worse
    than its own `## Summary` claims. Measured this run against HEAD: of its 24 `[PASSED]`
    scenarios, **20 are stale** — 17 (TS-001…TS-007, TS-009…TS-018) are anchored at
    `Last-verified-commit: 32ba496` and cover files that have changed since, and 3 (TS-025, TS-026,
    TS-027) carry **no `Last-verified-commit` at all**, so their freshness cannot be established
    either way. 3 remain PENDING (TS-008, TS-020, TS-024). The `## Summary` block still reports
    "16 passed / 4 stale", which no longer matches the scenario entries below it. Fix: re-run
    `/test-scenarios` to reconcile against `0e42316`.
  - `vibe-release.json` regenerated at repo root for commit `0e42316`; not committed by the gate.
  - Checked by: Claude, 2026-08-10.

## Security Notes

<!-- Key security measures and known gaps. Cross-reference docs/SECURITY.md rather than duplicating it. -->

Remediation backlog: docs/REMEDIATION.md — **4 BLOCKING open (SEC-025, SEC-027, SEC-029, SEC-030)** / 15 BLOCKING fixed / 3 BLOCKING waived / 18 ADVISORY open / 15 ADVISORY fixed (last audited 2026-08-11, external Information Security review; statuses last reconciled 2026-08-14). Also closed on 2026-08-14: SEC-015 (outbound email HTML now allowlist-sanitised at the mailer chokepoint) and SEC-011's export half (both participant CSVs moved server-side behind a new `registrant:export` permission held only by SUPER_ADMIN and HR_TA, each export writing an `AuditLog` row); SEC-011's masking half was declined by owner decision — a product call, not an InfoSec waiver, recorded in full on the finding. The earlier 2026-08-14 reconciliation transcribed and closed the last of that review's Low/Informational findings — SEC-033…SEC-036 as new entries, plus SEC-012, SEC-021, DEP-004 and DEP-006 closed and SEC-017 partially closed under their existing IDs. Two sub-parts stay open by external constraint (CodeQL and secret scanning need GitHub Advanced Security, not enabled for private repos in this org — see SEC-036). The BLOCKING count is unchanged: none of this work touched a blocking finding, so go-live remains held on the same four.

The four open items are the ones that need somebody other than the agent: **SEC-025** (X-User-Id is trusted without proof of gateway origin) needs an Apps Gateway platform answer; **SEC-027** (unauthenticated uploads route) is Phase 6, uploads → GCS; **SEC-029** (no audit trail of admin actions) is a schema-and-design change; **SEC-030** (MARKETING_MANAGE scope) is a product decision about who may mass-email — its staff-address-leak half was fixed 2026-08-13. Also open and not yet transcribed: the review's 6 Low and 1 Informational findings.

## Hosting Location

<!-- The approved company platform where the tool runs. Personal or public platforms require formal approval. -->

**Google Kubernetes Engine, deployed through the AIVA platform** (owner decision, 2026-08-07).
Pipeline: git push → Tekton (dependencies/tests → SonarQube quality gate → Kaniko image build →
Artifact Registry → Trivy scan) → GitOps image-tag update → Argo CD syncs the cluster. Staging host
`bliblitalk-admin-staging.blibli.dev`; production `bliblitalk-admin.blibli.io` (production requires
an explicit `deploy … to production` instruction plus a human approval task). No personal or
public platform is involved.

**Stated plainly: nothing is deployed yet.** This section records the approved *target* platform,
not current reachability — as of 2026-08-07 this app runs locally only, and `k8s/` is documented
placeholder material rather than applied manifests. Two prerequisites in `## Login Method` above
(its own hostname, and being reachable only through the gateway) must be satisfied by DevOps before
the target above is real.

## Recovery Procedures

<!-- Rollback and restore steps: how to return to the previous working version. Mandatory for Medium and High risk. -->

⚠️ **Outstanding — deliberately deferred to SRE (owner decision, 2026-08-07).** This is a mandatory
item for High risk and it is **not** satisfied; `/vibe-check` fails `backup-recovery` because of it.
It is recorded as deferred rather than filled because a real rollback/restore procedure cannot be
written before the infrastructure above exists, and a plausible-looking placeholder here would
mislead the approvers who read this file. Specifically still needed from SRE: Postgres backup
schedule, retention, and a *tested* restore path — no database backup is configured anywhere in
this repo today (verified: no backup job in `k8s/`, `docker-compose.yml`, or CI).
