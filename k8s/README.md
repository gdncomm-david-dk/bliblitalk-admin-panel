# k8s — Kubernetes manifests (placeholder)

Deployment target for `bliblitalk-admin` once it moves off single-host Docker Compose.
Manifests are **not wired yet** — this directory documents the intended shape so the
image built from the root `Dockerfile` maps cleanly onto cluster resources.

Updated for the repo-split architecture (Phase 7): `bliblitalk-user-fe` now has its own
backend and its own Deployment — it shares this cluster's ingress and database, so its
topology is documented here alongside this repo's own, not as a separate footnote.

## Target topology (both repos, one cluster)

```
                      one Ingress, path-routed
        internet ──► /            → public Service  → bliblitalk-user-fe Deployment
   corp network ──► /admin       → admin Service    → bliblitalk-admin Deployment (this repo)
                                        │                       │
                                        └── shared Postgres ────┘
                                       (StatefulSet or managed Cloud SQL;
                                        this repo owns migrations/seed)
```

- **One Ingress**, path-routed: `/` to the public app's Service, `/admin` to this repo's
  Service. The admin path must additionally be restricted to the corporate network (internal
  LB annotation / IP allowlist / VPN-only ingress class — whichever this cluster's ingress
  controller supports) — admin was never meant to be reachable from the public internet, and
  path-routing alone does not enforce that; it only picks which backend a request reaches.
- **Two Deployments**, one per repo — each is the single-fullstack-container pattern (backend
  serves its own built FE), 2+ replicas, `/api/health` readiness probe.
- **One shared Postgres** (`StatefulSet` or managed Cloud SQL) — both apps connect directly,
  no proxy between them (split-plan decision #1). This repo is the sole owner of
  `schema.prisma`/migrations; `bliblitalk-user-fe` only runs `prisma generate`.
- **Schedulers** (reminder sweep, lifecycle sweep) run in exactly one process — this repo's
  Deployment, via `ENABLE_SCHEDULERS` (default on here, must stay `false` on the public app).

## Resources

| Resource | Backs | Notes |
| ----------------------- | ------------------------------ | -------------------------------------------------- |
| `Deployment` admin | this repo's root `Dockerfile` | single fullstack container (backend + built admin FE), 2+ replicas, `/api/health` readiness probe |
| `Deployment` public | `bliblitalk-user-fe`'s root `Dockerfile` | same pattern, separate repo/image — see that repo's own `k8s/README.md` |
| `StatefulSet` postgres | `postgres:15` | or a managed Postgres (Cloud SQL) instead; shared by both Deployments |
| `Service` + `Ingress` | one Ingress, path-routed (see topology above) | `/admin` restricted to the corporate network; `/` public |
| `Secret` admin-secrets | `DATABASE_URL` (admin superuser role) | never commit real values — `kubectl create secret` |
| `Secret` public-secrets | `DATABASE_URL` (restricted `bliblitalk_public` role — see `scripts/db/provision-public-role.sh`), `JWT_SECRET` | lives in `bliblitalk-user-fe`'s own Secret; that app still issues participant sessions |
| `ConfigMap` admin-config | `LOG_LEVEL`, `ADMIN_FE_ORIGIN` | |

`JWT_SECRET` and `COOKIE_NAME` no longer apply to this repo (Apps Gateway migration,
2026-08-06): it issues no session and verifies no token. They remain
`bliblitalk-user-fe`'s own config, and the two apps no longer need a shared value.

`PUBLIC_FE_ORIGIN` likewise no longer applies here (Phase 5 removed `/api/public/*` and its
CORS block entirely) — it is now `bliblitalk-user-fe`'s own config, for its own frontend's CORS.

**Gateway routing is a hard prerequisite for this repo's Deployment.** The admin app must sit
on its own hostname, be reachable *only* through Apps Gateway (no ingress of its own), and rely
on the gateway to strip any client-supplied `X-User-Id` before injecting its own. Exposing the
admin Deployment directly would let any caller assert an identity via that header. Registration
of the subdomain and its access list is performed by DevOps at `/auth/ui/apps` — see
`PROJECT.md`'s Login Method section for the values to apply.

Add concrete YAML (or a Helm chart / Kustomize base) here when a cluster target is chosen.

## Pod security context (required when the YAML is written)

Review Finding 13 was closed at the image level — the root `Dockerfile` now copies with
`--chown=node:node` and ends with `USER node`, so the container no longer starts as uid 0.
An image default is not an enforcement point, though: a manifest can override it with
`runAsUser: 0`. Pin it at deploy time as well, on **both** Deployments:

```yaml
securityContext:                 # pod level
  runAsNonRoot: true
  runAsUser: 1000                # `node` in node:22-slim
  seccompProfile: { type: RuntimeDefault }
containers:
  - name: app
    securityContext:             # container level
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities: { drop: ["ALL"] }
```

`readOnlyRootFilesystem: true` needs one writable mount on **this** repo's Deployment:
`apps/backend/uploads`, which `adminUploads.routes.ts` writes to. Give it an `emptyDir` with
a `sizeLimit` — that also closes the "no quota on the uploads directory" half of SEC-017,
which is otherwise unbounded until Phase 6 moves the files to GCS. `bliblitalk-user-fe`
writes nothing to disk and needs no such mount.
