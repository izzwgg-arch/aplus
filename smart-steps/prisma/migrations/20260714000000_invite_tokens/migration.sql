-- SmartSteps: Email invite / password-reset tokens.
-- Adds one-time tokens (only the hash is stored) plus an `invitedAt` marker so
-- Admins can invite staff by email and let them set their own password.
-- Additive and idempotent — safe to re-run.

-- TokenPurpose enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TokenPurpose') THEN
    CREATE TYPE "TokenPurpose" AS ENUM ('INVITE', 'RESET');
  END IF;
END
$$;

-- Marker for accounts created via email invite (cleared once accepted)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3);

-- One-time invite / reset tokens
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id"        TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "purpose"   "TokenPurpose" NOT NULL DEFAULT 'INVITE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PasswordResetToken_userId_fkey'
  ) THEN
    ALTER TABLE "PasswordResetToken"
      ADD CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
