-- Additive migration: User phone/credentials + OrganizationSettings
-- No existing tables or columns are modified or dropped.

-- 1. Add nullable phone and credentials columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "credentials" TEXT;

-- 2. Create OrganizationSettings singleton table
CREATE TABLE IF NOT EXISTS "OrganizationSettings" (
  "id"             TEXT         NOT NULL DEFAULT 'singleton',
  "orgName"        TEXT         NOT NULL DEFAULT 'A+ Center',
  "orgAddress"     TEXT,
  "orgPhone"       TEXT,
  "orgEmail"       TEXT,
  "logoUrl"        TEXT,
  "letterheadHtml" TEXT,
  "footerHtml"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- 3. Seed default singleton row (idempotent)
INSERT INTO "OrganizationSettings" ("id", "orgName")
VALUES ('singleton', 'A+ Center')
ON CONFLICT ("id") DO NOTHING;
