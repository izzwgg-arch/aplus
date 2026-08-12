-- SmartSteps: Standalone (non-SSO) login support.
-- Adds an optional password hash so an Admin can create SmartSteps-only
-- accounts that log in directly, without requiring a matching A+ Center
-- SSO account. Nullable and additive — existing SSO-linked users are
-- unaffected and keep working exactly as before.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
