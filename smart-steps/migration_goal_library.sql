-- ============================================================
-- SmartSteps Goal Library System — Production Migration
-- Date: 2026-06-30
--
-- ALL changes are ADDITIVE.
-- No existing rows are modified.
-- No columns are dropped.
-- No existing tables altered destructively.
-- Safe to run with zero downtime.
--
-- Rollback:
--   DROP TABLE IF EXISTS "UserGoalFavorite";
--   DROP TABLE IF EXISTS "GoalLibraryUsage";
--   DROP TABLE IF EXISTS "ParentGoalLibraryItem";
--   ALTER TABLE "TargetLibraryItem"
--     DROP COLUMN IF EXISTS "isActive",
--     DROP COLUMN IF EXISTS "category",
--     DROP COLUMN IF EXISTS "skillArea",
--     DROP COLUMN IF EXISTS "domain",
--     DROP COLUMN IF EXISTS "usageCount";
-- ============================================================

-- ── 1. Extend TargetLibraryItem ──────────────────────────────────────────────
ALTER TABLE "TargetLibraryItem"
  ADD COLUMN IF NOT EXISTS "isActive"   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "category"   TEXT,
  ADD COLUMN IF NOT EXISTS "skillArea"  TEXT,
  ADD COLUMN IF NOT EXISTS "domain"     TEXT,
  ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "TargetLibraryItem_isActive_idx"
  ON "TargetLibraryItem"("isActive");
CREATE INDEX IF NOT EXISTS "TargetLibraryItem_category_idx"
  ON "TargetLibraryItem"("category");
CREATE INDEX IF NOT EXISTS "TargetLibraryItem_skillArea_idx"
  ON "TargetLibraryItem"("skillArea");
CREATE INDEX IF NOT EXISTS "TargetLibraryItem_usageCount_idx"
  ON "TargetLibraryItem"("usageCount" DESC);

-- ── 2. ParentGoalLibraryItem — global reusable parent goal templates ─────────
CREATE TABLE IF NOT EXISTS "ParentGoalLibraryItem" (
  "id"          TEXT         NOT NULL,
  "title"       TEXT         NOT NULL,
  "description" TEXT,
  "domain"      TEXT,
  "category"    TEXT,
  "skillArea"   TEXT,
  "notes"       TEXT,
  "isActive"    BOOLEAN      NOT NULL DEFAULT TRUE,
  "usageCount"  INTEGER      NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentGoalLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ParentGoalLibraryItem_isActive_idx"
  ON "ParentGoalLibraryItem"("isActive");
CREATE INDEX IF NOT EXISTS "ParentGoalLibraryItem_domain_idx"
  ON "ParentGoalLibraryItem"("domain");
CREATE INDEX IF NOT EXISTS "ParentGoalLibraryItem_category_idx"
  ON "ParentGoalLibraryItem"("category");
CREATE INDEX IF NOT EXISTS "ParentGoalLibraryItem_usageCount_idx"
  ON "ParentGoalLibraryItem"("usageCount" DESC);

-- ── 3. GoalLibraryUsage — per-user recently-used + usage count audit ──────────
CREATE TABLE IF NOT EXISTS "GoalLibraryUsage" (
  "id"           TEXT         NOT NULL,
  "userId"       TEXT         NOT NULL,
  "itemType"     TEXT         NOT NULL,
  "goalItemId"   TEXT,
  "parentItemId" TEXT,
  "usedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalLibraryUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GoalLibraryUsage_goalItemId_fkey"
    FOREIGN KEY ("goalItemId")   REFERENCES "TargetLibraryItem"("id")     ON DELETE CASCADE,
  CONSTRAINT "GoalLibraryUsage_parentItemId_fkey"
    FOREIGN KEY ("parentItemId") REFERENCES "ParentGoalLibraryItem"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GoalLibraryUsage_userId_itemType_usedAt_idx"
  ON "GoalLibraryUsage"("userId", "itemType", "usedAt" DESC);
CREATE INDEX IF NOT EXISTS "GoalLibraryUsage_goalItemId_idx"
  ON "GoalLibraryUsage"("goalItemId");
CREATE INDEX IF NOT EXISTS "GoalLibraryUsage_parentItemId_idx"
  ON "GoalLibraryUsage"("parentItemId");

-- ── 4. UserGoalFavorite — per-user favorites (never global) ──────────────────
CREATE TABLE IF NOT EXISTS "UserGoalFavorite" (
  "id"           TEXT         NOT NULL,
  "userId"       TEXT         NOT NULL,
  "itemType"     TEXT         NOT NULL,
  "goalItemId"   TEXT,
  "parentItemId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserGoalFavorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserGoalFavorite_user_goal_unique"
    UNIQUE ("userId", "goalItemId"),
  CONSTRAINT "UserGoalFavorite_user_parent_unique"
    UNIQUE ("userId", "parentItemId"),
  CONSTRAINT "UserGoalFavorite_goalItemId_fkey"
    FOREIGN KEY ("goalItemId")   REFERENCES "TargetLibraryItem"("id")     ON DELETE CASCADE,
  CONSTRAINT "UserGoalFavorite_parentItemId_fkey"
    FOREIGN KEY ("parentItemId") REFERENCES "ParentGoalLibraryItem"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "UserGoalFavorite_userId_itemType_idx"
  ON "UserGoalFavorite"("userId", "itemType");

-- ── 5. Verify (SELECT results should show new columns + tables) ───────────────
-- Run manually after migration to confirm:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'TargetLibraryItem'
--   AND column_name IN ('isActive','category','skillArea','domain','usageCount');
--
-- SELECT tablename FROM pg_tables
--   WHERE tablename IN ('ParentGoalLibraryItem','GoalLibraryUsage','UserGoalFavorite');
