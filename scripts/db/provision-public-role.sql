-- Provisions (idempotently) the restricted Postgres role the public backend
-- (bliblitalk-user-fe) connects as. Least privilege per the split plan decision #3:
-- read only the tables that backend actually reads, write only the participant-owned rows,
-- and on "User" write only the columns a participant may change. Everything else — admin
-- tables, DDL, DELETE anywhere — stays unreachable from this role.
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

-- Start from nothing every run. This is what makes the script idempotent in the *shrinking*
-- direction: before SEC-031 it granted SELECT on ALL TABLES plus a default privilege, and
-- re-running a narrower GRANT list would not have taken those away. Revoking first means the
-- privileges a database ends up with are exactly the ones listed below, whatever it had
-- before. Revoking a table privilege also drops the column-level grants derived from it.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM bliblitalk_public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM bliblitalk_public;

-- SEC-031: read access is enumerated, and the ALTER DEFAULT PRIVILEGES that used to hand
-- this role SELECT on every *future* table is gone. A new admin-only table is now unreadable
-- by the internet-facing app until someone adds it here on purpose.
--
-- This list is derived from what apps/backend actually queries in bliblitalk-user-fe,
-- relations included: Event pulls in EventCategory and Speaker, MyEvents pulls Registration
-- -> SpeedDatingRegistration/Certificate/Feedback, and the landing page reads Announcement,
-- SiteSettings and ModuleSettings.
GRANT SELECT ON
  "User", "OtpChallenge", "Event", "EventCategory", "Speaker", "Registration",
  "SpeedDatingRegistration", "Certificate", "Feedback", "Announcement",
  "SiteSettings", "ModuleSettings"
  TO bliblitalk_public;

-- Deliberately NOT readable by this role: MarketingContact, EmailCampaign,
-- EmailCampaignRecipient, EventReminder, EventStatusHistory. They are admin-owned, and the
-- public backend queries none of them.

-- Write access limited to the six participant-owned tables (decision #3). No DELETE
-- anywhere, and no INSERT/UPDATE on any other table, including every admin-owned one.
--
-- SiteSettings is no longer here: the portal's GET used to upsert the singleton row just to
-- read it, which is why this role once needed to write a settings table at all. That read is
-- now a plain SELECT with the schema default as its fallback, and creating the row is the
-- admin CMS's job.
--
-- OtpChallenge (added 2026-08 with email-OTP login) is written on every code request and
-- marked consumed on verify — both INSERT and UPDATE. It needs no DELETE: expiry is a
-- timestamp check and consumption sets consumedAt, deliberately so this role's no-DELETE
-- rule holds.
GRANT INSERT, UPDATE ON
  "Registration", "SpeedDatingRegistration", "Feedback", "Certificate", "OtpChallenge"
  TO bliblitalk_public;

-- "User" is split: a participant may create their own account and edit their own profile,
-- but must never be able to write "role", "employmentType", "email" or "passwordHash" — the
-- columns that would turn a participant row into a staff one. Table-wide UPDATE made
-- application code the only thing standing between the two; column-level UPDATE makes it the
-- database's rule.
--
-- INSERT stays table-wide on purpose. Prisma decides which columns appear in an INSERT
-- statement (client-generated ids, omitted columns falling through to DB defaults), so a
-- column list here would be a guess about generated SQL that breaks registration in
-- production while every local test — which connects as the owner role — still passes.
-- Registration is the one write path where failure is silent until a real user hits it.
-- "tokenVersion" is in the UPDATE list because logout bumps it (SEC-007); without it,
-- logging out 500s.
GRANT INSERT ON "User" TO bliblitalk_public;
GRANT UPDATE ("name", "institution", "position", "yearsOfExperience", "tokenVersion")
  ON "User" TO bliblitalk_public;

-- OPERATIONAL: re-run this script in every environment (local, staging, prod) after any
-- migration that adds a table or a column the public backend touches. Nothing applies it
-- automatically, and the failure mode is a 500 in production while every local test passes,
-- because tests connect as the owner role rather than as bliblitalk_public. To check what a
-- database actually granted:  \dp public."User"   and   \dp public.*
