-- AlterEnum: add SOLA_PAYMENTS to PaymentProcessor
ALTER TYPE "PaymentProcessor" ADD VALUE 'SOLA_PAYMENTS';

-- AlterTable: Payment — add Sola-specific fields
ALTER TABLE "Payment"
  ADD COLUMN "solaXRefNum" TEXT,
  ADD COLUMN "solaXToken"  TEXT;

-- AlterTable: Client — add card-on-file token and QB customer ID
ALTER TABLE "Client"
  ADD COLUMN "solaXToken"           TEXT,
  ADD COLUMN "quickbooksCustomerId" TEXT;
