-- Whether a BCBA supervised this BT session, and who.
-- Direct-supervision (DSU) notes generate ONLY from sessions flagged here, so a
-- session that was never supervised can no longer be written up as one.
ALTER TABLE "Session" ADD COLUMN "supervised" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "supervisorId" TEXT;

CREATE INDEX "Session_supervisorId_idx" ON "Session"("supervisorId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
