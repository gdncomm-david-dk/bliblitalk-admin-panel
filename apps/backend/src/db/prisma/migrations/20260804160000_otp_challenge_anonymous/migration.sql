-- Zero-persistence registration (bliblitalk-user-fe, 2026-08). Registering used to create the
-- User row immediately and only then email the first code, so an address that was never verified
-- still left a full profile behind — and its createdAt, the timestamp the GRC audit reads as the
-- registration/consent record, recorded an intent rather than a completed registration.
--
-- The registration code is now issued against a challenge with no owner: nothing about the
-- applicant is persisted until they prove the address. The profile they typed travels in a
-- short-lived signed token held by their browser; the User row is created at verify time, so
-- createdAt is the moment the registration actually completed.
ALTER TABLE "OtpChallenge" ALTER COLUMN "userId" DROP NOT NULL;
