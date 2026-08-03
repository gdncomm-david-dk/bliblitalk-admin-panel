-- CreateIndex
CREATE INDEX "Event_status_registrationOpensAt_idx" ON "Event"("status", "registrationOpensAt");

-- CreateIndex
CREATE INDEX "Event_status_registrationDeadline_idx" ON "Event"("status", "registrationDeadline");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_status_endsAt_idx" ON "Event"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Registration_eventId_status_idx" ON "Registration"("eventId", "status");
