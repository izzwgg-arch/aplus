-- CreateTable ParentTrainingGoal
CREATE TABLE "ParentTrainingGoal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "skillArea" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentTrainingGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on clientId
CREATE INDEX "ParentTrainingGoal_clientId_idx" ON "ParentTrainingGoal"("clientId");

-- CreateIndex on status
CREATE INDEX "ParentTrainingGoal_status_idx" ON "ParentTrainingGoal"("status");

-- AddForeignKey
ALTER TABLE "ParentTrainingGoal" ADD CONSTRAINT "ParentTrainingGoal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
