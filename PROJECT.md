# PROJECT.md

Go-live review dossier for this tool. Reviewers and approvers read this file before the tool is released to others. Complete it via the `project-documenter` skill before pushing to GitHub or going live. Fields marked **(owner input)** must come from the project owner; never invent them. Keep this file updated when facts change: a material change to risk level, data used, or access scope may trigger re-review.

## Problem Being Solved

<!-- What problem this tool solves and for whom. One short paragraph. -->

## Project Owner

<!-- (owner input) Person or team requesting and responsible for the tool. -->

## Support Contact

<!-- (owner input) Person or team contacted when issues occur. -->

## Vibe Start

2026-07-13 (stamped by `/adopt-vibe` from the earliest git commit date, per that skill's rule for
brownfield projects.)

## Label

<!-- (owner input) GCP labels for cost and budget management. Provide all three below.
- Company: exactly one of gdn, gdpu, gdpa, gdv, gdr, gtn, gan, gdnus, gdni, rise, gem (owning sister company).
- Division: exactly one of operations, finance, marketing, commercial.
- Department: free text — the owning department name (non-empty), recorded in lowercase.
Asked during /start-vibe; /vibe-check will not pass while Company or Division is empty/invalid or Department is empty. -->

- Company:
- Division:
- Department:

## Design Overview

<!-- Simple design overview: main components, data flow, key integrations. Detail lives in docs/ARCHITECTURE.md; the full design-review document (diagrams, transaction flows, database schema, external connections, financial-risk analysis) lives in docs/DESIGN.md. Keep this reviewer-readable. -->

## Risk Level

<!-- (owner input, confirm) Low / Medium / High per the Non-Tech Change Management playbook.
Low: small personal tool, no sensitive data.
Medium: used by a team, connects to company systems, uses internal company data, automates regular work, or affects team decisions.
High: accessible outside the company or internet-facing, handles payments or money, uses sensitive personal or company data, or supports critical business processes.
A tool is not automatically Low just because it is small. When in doubt, consult Information Security. -->

## Access Status

<!-- Internal-only or external access. State which and why. -->

## Data Used

<!-- Classification: Public / Internal / Confidential. List the actual datasets and source systems. -->

## Data That Must Not Be Entered

<!-- e.g. KTP, payroll data, customer data, passwords, access codes, financial data, confidential company information. -->

## Login Method

<!-- Apps Gateway (approved company SSO, default) or Company Google OAuth login (external users without a company account, or fallback while Apps Gateway is not yet configured). No other method is permitted. -->

## Access Levels

<!-- Roles and permissions. Least privilege: users get only the access they need; not everyone is an administrator. Required detail for Medium and High risk. -->

## Access Approval Process

<!-- (owner input) Who approves access requests and how. -->

## Go-Live Steps

<!-- Deployment route and the approvals required for this risk level. Low: owner check. Medium: independent review. High: Architecture, SRE, and Information Security approval. -->

## Review Evidence

<!-- (owner input) Who reviewed, when, and the sign-off record (approval email, review notes). Required before go-live for Medium and High risk. -->

## Security Notes

<!-- Key security measures and known gaps. Cross-reference docs/SECURITY.md rather than duplicating it. -->

Remediation backlog: docs/REMEDIATION.md — 4 BLOCKING open / 26 ADVISORY open (last audited 2026-07-24).

## Hosting Location

<!-- The approved company platform where the tool runs. Personal or public platforms require formal approval. -->

## Recovery Procedures

<!-- Rollback and restore steps: how to return to the previous working version. Mandatory for Medium and High risk. -->
