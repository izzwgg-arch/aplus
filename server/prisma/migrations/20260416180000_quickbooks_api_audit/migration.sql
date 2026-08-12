-- QuickBooks API audit + rate-control support (logs written by quickbooksApiClient)

CREATE TABLE "QuickBooksApiCallLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickBooksApiCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuickBooksApiCallLog_tenantId_createdAt_idx" ON "QuickBooksApiCallLog"("tenantId", "createdAt");
CREATE INDEX "QuickBooksApiCallLog_feature_createdAt_idx" ON "QuickBooksApiCallLog"("feature", "createdAt");
CREATE INDEX "QuickBooksApiCallLog_endpoint_createdAt_idx" ON "QuickBooksApiCallLog"("endpoint", "createdAt");
