-- One certificate per person per event, enforced by the database.
--
-- Two independent code paths issue certificates, and both are check-then-insert:
-- bliblitalk-admin's bulk issue reads the event's existing rows into an in-memory Set and
-- inserts the difference, while bliblitalk-user-fe's self-service download does a findFirst
-- and then a create. Either one can interleave with itself, and because they run as separate
-- processes against this shared database they can also interleave with each other, so the
-- same attendee ends up with two certificates and two different verification codes for one
-- event. The existing unique index on "verificationCode" does not catch this: every insert
-- mints a fresh code, so the duplicates are unique by that constraint and entirely legal.
--
-- The application checks stay where they are as the fast path. This index is the guarantee
-- underneath them.
--
-- The DELETE below is required, not incidental: PostgreSQL refuses to build a unique index
-- over a column pair that already has duplicates, so any pre-existing duplicate must be
-- resolved first. It keeps the earliest-issued row of each group and removes the later ones,
-- because the earliest is the one most likely to have already been downloaded and had its
-- verification code shared. `ctid` breaks ties within the same issuedAt — the rows are
-- otherwise indistinguishable, and one of them has to win.
--
-- On a database with no duplicates this statement removes nothing.

-- Deduplicate before indexing
DELETE FROM "Certificate" a
USING "Certificate" b
WHERE a."userId" = b."userId"
  AND a."eventId" = b."eventId"
  AND (a."issuedAt", a.ctid) > (b."issuedAt", b.ctid);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_userId_eventId_key" ON "Certificate"("userId", "eventId");
