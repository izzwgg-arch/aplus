# Manual Deployment Steps - Timesheet Visibility Permissions

## Issue
The server has Prisma 7.2.0 which has breaking changes. Use these manual steps instead.

## Step 1: Deploy Code (without migration)

```bash
ssh -i ~/.ssh/id_ed25519_smartsteps root@66.94.105.43
cd /var/www/aplus-center
git pull origin main
npm install --production --legacy-peer-deps
npm run build
pm2 restart aplus-center
```

## Step 2: Run Database Migration Manually

**Option A: Using SQL directly (Recommended)**

```bash
# On server, connect to database
psql -U postgres -d apluscenter

# Then run the SQL from migration_timesheet_visibility.sql
\i migration_timesheet_visibility.sql
# OR copy/paste the SQL content directly
```

**Option B: Using Prisma with older version**

```bash
# Temporarily downgrade Prisma to match local version
cd /var/www/aplus-center
npm install prisma@5.22.0 --save-dev
npx prisma migrate deploy
# Or use db push:
npx prisma db push
npx prisma generate
```

## Step 3: Seed Permissions

```bash
cd /var/www/aplus-center
npx tsx scripts/seed-permissions.ts
```

## Step 4: Restart Application

```bash
pm2 restart aplus-center
pm2 save
pm2 logs aplus-center --lines 50
```

## Verification

1. Check database:
```sql
SELECT * FROM "RoleTimesheetVisibility";
SELECT * FROM "Permission" WHERE "name" IN ('timesheets.viewAll', 'timesheets.viewSelectedUsers');
```

2. Check application:
- Navigate to http://66.94.105.43:3000/roles
- Edit a role
- Should see "Timesheet Visibility" section in Timesheets permissions

## Rollback (if needed)

```sql
-- Drop the table
DROP TABLE IF EXISTS "RoleTimesheetVisibility";

-- Remove permissions (optional)
DELETE FROM "Permission" WHERE "name" IN ('timesheets.viewAll', 'timesheets.viewSelectedUsers');
```
