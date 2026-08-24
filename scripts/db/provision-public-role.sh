#!/usr/bin/env bash
# Provisions the restricted "bliblitalk_public" Postgres role that the public backend
# (bliblitalk-user-fe) connects as. Run once per database (local dev, staging, prod) as a
# superuser/owner. Safe to re-run — the underlying SQL is idempotent.
#
# Required env vars:
#   DATABASE_URL          - superuser connection string to the target database
#   PUBLIC_APP_DB_PASSWORD - password to (re)set on the bliblitalk_public role
#
# Example (local dev):
#   DATABASE_URL="postgresql://blibli:<db-password>@localhost:5432/blibli_talk_admin_split" \
#   PUBLIC_APP_DB_PASSWORD="changeme-for-local-dev" \
#   ./scripts/db/provision-public-role.sh

set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a superuser connection string}"
: "${PUBLIC_APP_DB_PASSWORD:?Set PUBLIC_APP_DB_PASSWORD to the password for the bliblitalk_public role}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="$(node -e "console.log(new URL(process.env.DATABASE_URL).pathname.slice(1))")"

psql -d "$DATABASE_URL" \
  -v "pubapp_password=$PUBLIC_APP_DB_PASSWORD" \
  -v "db_name=$DB_NAME" \
  -f "$SCRIPT_DIR/provision-public-role.sql"

echo "Provisioned bliblitalk_public role on database '$DB_NAME'."
