-- Permission System (Phase 1) — additive only.
-- Adds AppRole / AppPermission / AppRolePermission tables and a nullable
-- User.appRoleId FK. Named "AppRole"/"AppPermission" (not "Role"/"Permission")
-- to avoid colliding with the existing `Role` enum (RBT/BCBA/ADMIN), which is
-- NOT touched, dropped, or renamed by this migration.
-- Safe to roll forward on a live database with zero downtime; safe to leave
-- these tables unused if the deploying code is rolled back.

CREATE TABLE "AppRole" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "isSystem"    BOOLEAN NOT NULL DEFAULT false,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppRole_key_key" ON "AppRole"("key");
CREATE INDEX "AppRole_isActive_idx" ON "AppRole"("isActive");

CREATE TABLE "AppPermission" (
    "id"          TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "AppPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppPermission_key_key" ON "AppPermission"("key");
CREATE INDEX "AppPermission_category_idx" ON "AppPermission"("category");

CREATE TABLE "AppRolePermission" (
    "id"           TEXT NOT NULL,
    "roleId"       TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "AppRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppRolePermission_roleId_permissionId_key" ON "AppRolePermission"("roleId", "permissionId");
CREATE INDEX "AppRolePermission_roleId_idx" ON "AppRolePermission"("roleId");

ALTER TABLE "AppRolePermission" ADD CONSTRAINT "AppRolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppRolePermission" ADD CONSTRAINT "AppRolePermission_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "AppPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appRoleId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_appRoleId_fkey"
    FOREIGN KEY ("appRoleId") REFERENCES "AppRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
