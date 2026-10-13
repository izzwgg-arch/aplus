-- CreateTable Transportation
CREATE TABLE "Transportation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3),
    "paidBy" TEXT,
    "notes" TEXT,
    "quickbooksItemId" TEXT,
    "quickbooksSyncStatus" TEXT NOT NULL DEFAULT 'NOT_SYNCED',
    "quickbooksSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transportation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transportation_clientId_idx" ON "Transportation"("clientId");

-- CreateIndex
CREATE INDEX "Transportation_serviceDate_idx" ON "Transportation"("serviceDate");

-- CreateIndex
CREATE INDEX "Transportation_paymentStatus_idx" ON "Transportation"("paymentStatus");

-- AddForeignKey
ALTER TABLE "Transportation" ADD CONSTRAINT "Transportation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
