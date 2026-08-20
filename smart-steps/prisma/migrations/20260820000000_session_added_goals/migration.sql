-- Goals attached to a session without trial data of their own.
CREATE TABLE "SessionTarget" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionTarget_sessionId_targetId_key" ON "SessionTarget"("sessionId", "targetId");
CREATE INDEX "SessionTarget_sessionId_idx" ON "SessionTarget"("sessionId");
CREATE INDEX "SessionTarget_targetId_idx" ON "SessionTarget"("targetId");

ALTER TABLE "SessionTarget" ADD CONSTRAINT "SessionTarget_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionTarget" ADD CONSTRAINT "SessionTarget_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionTarget" ADD CONSTRAINT "SessionTarget_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
