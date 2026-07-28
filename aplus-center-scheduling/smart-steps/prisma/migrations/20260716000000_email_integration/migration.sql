-- SmartSteps: separate outgoing email (SMTP) integration.
-- Adds SMTP/email-sender fields to the OrganizationSettings singleton so an
-- ADMIN can configure a dedicated SmartSteps Google Workspace sender account.
-- The Google App Password is stored encrypted at rest in "smtpPasswordEnc"
-- (AES-256-CBC via src/lib/crypto.ts) and is never returned via any API.
-- Additive, nullable/defaulted, and idempotent — safe to re-run and to roll back.

ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "emailEnabled"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "emailSenderName"  TEXT;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "emailFromAddress" TEXT;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "emailReplyTo"     TEXT;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "emailUser"        TEXT;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "smtpHost"         TEXT;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "smtpPort"         INTEGER DEFAULT 465;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "smtpSecure"       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationSettings" ADD COLUMN IF NOT EXISTS "smtpPasswordEnc"  TEXT;
