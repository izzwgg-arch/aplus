-- Migration: Add Timesheet Visibility Permissions
-- Run this SQL directly on the database if Prisma migrate fails

-- 1. Create RoleTimesheetVisibility table
CREATE TABLE IF NOT EXISTS "RoleTimesheetVisibility" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleTimesheetVisibility_pkey" PRIMARY KEY ("id")
);

-- 2. Add foreign key constraints
ALTER TABLE "RoleTimesheetVisibility" ADD CONSTRAINT "RoleTimesheetVisibility_roleId_fkey" 
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleTimesheetVisibility" ADD CONSTRAINT "RoleTimesheetVisibility_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "RoleTimesheetVisibility_roleId_userId_key" 
    ON "RoleTimesheetVisibility"("roleId", "userId");

-- 4. Insert new permissions (if they don't exist)
INSERT INTO "Permission" ("id", "name", "description", "category", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text,
    'timesheets.viewAll',
    'View all timesheets',
    'timesheets',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "Permission" WHERE "name" = 'timesheets.viewAll'
);

INSERT INTO "Permission" ("id", "name", "description", "category", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text,
    'timesheets.viewSelectedUsers',
    'View selected users'' timesheets',
    'timesheets',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "Permission" WHERE "name" = 'timesheets.viewSelectedUsers'
);

-- Verify the migration
SELECT 'Migration completed successfully!' as status;
SELECT COUNT(*) as role_timesheet_visibility_count FROM "RoleTimesheetVisibility";
SELECT COUNT(*) as new_permissions_count FROM "Permission" WHERE "name" IN ('timesheets.viewAll', 'timesheets.viewSelectedUsers');
