-- SEC-007: session token revocation. requireAuth compares the JWT's embedded tokenVersion
-- against this column; logout, role changes, and employment-type changes bump it so any
-- token issued before that point is rejected on its very next request.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
