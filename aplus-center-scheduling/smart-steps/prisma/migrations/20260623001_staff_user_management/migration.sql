-- SmartSteps: Staff & User Management
-- Adds isActive and displayRole to the User table ONLY.
-- No other tables are altered or dropped.
-- Both columns are backward-compatible:
--   isActive defaults to true  → all existing users remain active.
--   displayRole is nullable    → all existing users start with no display title.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive"    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayRole" TEXT;
