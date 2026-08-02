-- Provisions (idempotently) the restricted Postgres role the public backend
-- (bliblitalk-user-fe) connects as. Least privilege per the split plan decision #3:
-- SELECT broadly, INSERT/UPDATE only on the six participant-owned tables. Everything
-- else — admin tables, DDL, DELETE anywhere — stays unreachable from this role.
--
-- Run via provision-public-role.sh, which supplies :'pubapp_password' from an env var —
-- never hardcode the password here or pass it on the command line in plaintext history.
--
-- No DO $$ ... $$ block: psql's :'var' interpolation does not reach inside dollar-quoted
-- bodies, so the substitution would go through literally as ":'pubapp_password'" and fail
-- to parse. \gexec instead builds the CREATE/ALTER ROLE statement as plain, already-
-- substituted SQL text and executes it.
SELECT format('ALTER ROLE bliblitalk_public LOGIN PASSWORD %L', :'pubapp_password')
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'bliblitalk_public')
UNION ALL
SELECT format('CREATE ROLE bliblitalk_public LOGIN PASSWORD %L', :'pubapp_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'bliblitalk_public')
\gexec

GRANT CONNECT ON DATABASE :"db_name" TO bliblitalk_public;
GRANT USAGE ON SCHEMA public TO bliblitalk_public;

-- Broad read access — the public API reads across most tables (events, speakers,
-- categories, module settings, etc.), just never writes to them.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bliblitalk_public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bliblitalk_public;

-- Write access limited to the six participant-owned tables (decision #3). No DELETE
-- anywhere, and no INSERT/UPDATE on any other table, including every admin-owned one.
GRANT INSERT, UPDATE ON "User", "Registration", "SpeedDatingRegistration", "Feedback", "Certificate", "SiteSettings"
  TO bliblitalk_public;
