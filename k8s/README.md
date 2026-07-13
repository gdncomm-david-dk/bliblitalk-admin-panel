# k8s — Kubernetes manifests (placeholder)

Deployment target for `bliblitalk-admin` once it moves off single-host Docker Compose.
Manifests are **not wired yet** — this directory documents the intended shape so the
image built from the root `Dockerfile` maps cleanly onto cluster resources.

## Intended topology

| Resource               | Backs                          | Notes                                             |
| ----------------------- | ------------------------------ | -------------------------------------------------- |
| `Deployment` admin       | root `Dockerfile`               | single fullstack container (backend + built admin FE), 2+ replicas, `/api/health` readiness probe |
| `StatefulSet` postgres  | `postgres:15`                   | or a managed Postgres (RDS/CloudSQL) instead        |
| `Service` + `Ingress`   | internal Load Balancer          | admin CMS is not public-facing                     |
| `Secret` admin-secrets  | `DATABASE_URL`, `ADMIN_JWT_SECRET` | never commit real values — `kubectl create secret` |
| `ConfigMap` admin-config | `LOG_LEVEL`, `COOKIE_NAME`, `PUBLIC_FE_ORIGIN`, `ADMIN_FE_ORIGIN` | |

`bliblitalk-user-fe` is a separate repo/deployment (static build, its own CDN/host) —
it is not part of this cluster topology. `PUBLIC_FE_ORIGIN` here is only used for the
CORS allow-list on `/api/public/*`.

Add concrete YAML (or a Helm chart / Kustomize base) here when a cluster target is chosen.
