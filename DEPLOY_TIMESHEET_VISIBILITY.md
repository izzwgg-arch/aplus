# Deployment Instructions - Timesheet Visibility Permissions

## Summary of Changes
- Added new permissions: `timesheets.viewAll` and `timesheets.viewSelectedUsers`
- Added `RoleTimesheetVisibility` model to store user allowlist per role
- Updated all timesheet API endpoints to enforce visibility scope
- Added UI for managing timesheet visibility permissions in Role edit page
- Added user filter to Timesheets list page when user has appropriate permissions

## Critical Deployment Steps

### 1. Database Migration (REQUIRED)
This deployment requires a database migration to add the new `RoleTimesheetVisibility` table.

**On Server:**
```bash
cd /var/www/aplus-center
npx prisma migrate deploy
# OR if using db push:
npx prisma db push
npx prisma generate
```

### 2. Seed New Permissions (REQUIRED)
The new permissions must be seeded into the database.

**On Server:**
```bash
cd /var/www/aplus-center
npx tsx scripts/seed-permissions.ts
```

This will add:
- `timesheets.viewAll` - View all timesheets
- `timesheets.viewSelectedUsers` - View selected users' timesheets

### 3. Deploy Code Changes

**Option A: Git-based (if server has git)**
```powershell
# On local machine
git add .
git commit -m "Add timesheet visibility permissions feature"
git push origin main

# Then on server or use deploy script
cd /var/www/aplus-center
git pull origin main
npm install --production
npx prisma generate
npm run build
pm2 restart aplus-center
```

**Option B: Manual Deployment**
```powershell
# On local machine - build first
cd "C:\dev\projects\A Plus center"
npm run build

# Create deployment package (exclude node_modules, .next, .git)
Compress-Archive -Path * -DestinationPath aplus-center-deploy.zip -Exclude node_modules,.next,.git,.env,*.log,*.md

# Upload to server
scp -i $env:USERPROFILE\.ssh\id_ed25519_smartsteps aplus-center-deploy.zip root@66.94.105.43:/tmp/

# On server
cd /var/www/aplus-center
# Backup current build
mv .next .next.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Extract new files
unzip -o /tmp/aplus-center-deploy.zip
rm /tmp/aplus-center-deploy.zip

# Install dependencies
npm install --production

# Generate Prisma client
npx prisma generate

# Run migration
npx prisma migrate deploy

# Seed permissions
npx tsx scripts/seed-permissions.ts

# Build application
npm run build

# Restart PM2
pm2 restart aplus-center
pm2 save
```

## Verification Steps

After deployment, verify the feature:

1. **Check Permissions Exist:**
   - Navigate to `/roles` (as admin)
   - Click "Create New Role" or edit existing role
   - Scroll to "Timesheets" permission group
   - Should see "Timesheet Visibility" section with:
     - "View all timesheets" checkbox
     - "View selected users' timesheets" checkbox

2. **Test View Selected Users:**
   - Create/edit a role
   - Enable "View selected users' timesheets"
   - Select 2-3 users in the allowlist
   - Save role
   - Assign role to a test user
   - As test user, go to `/timesheets`
   - Should see a "User" filter dropdown
   - Should only see timesheets from own user + selected users

3. **Test View All:**
   - Edit a role
   - Enable "View all timesheets"
   - Assign to test user
   - As test user, should see ALL timesheets from all users

4. **Test Default Behavior:**
   - User with no new permissions should only see their own timesheets (existing behavior)

5. **Test Reports:**
   - Generate reports as user with viewSelectedUsers
   - Should only include timesheets from allowed users

## Rollback (if needed)

If issues occur:

```bash
cd /var/www/aplus-center
# Restore previous build
mv .next.backup.* .next  # Use the most recent backup
pm2 restart aplus-center
```

**Note:** Database migration changes cannot be easily rolled back. If rollback is needed, you may need to manually drop the `RoleTimesheetVisibility` table.

## Files Changed

1. `prisma/schema.prisma` - Added RoleTimesheetVisibility model
2. `scripts/seed-permissions.ts` - Added new permissions
3. `lib/permissions.ts` - Added getTimesheetVisibilityScope() function
4. `app/api/timesheets/route.ts` - Added visibility scope filtering
5. `app/api/timesheets/[id]/route.ts` - Added visibility scope checking
6. `app/api/reports/route.ts` - Added visibility scope filtering
7. `app/api/reports/detailed/route.ts` - Added visibility scope filtering
8. `app/api/dashboard/stats/route.ts` - Added visibility scope filtering
9. `app/api/analytics/route.ts` - Added visibility scope filtering
10. `app/api/roles/route.ts` - Added timesheetVisibility handling
11. `app/api/roles/[id]/route.ts` - Added timesheetVisibility handling
12. `app/roles/[id]/edit/page.tsx` - Include timesheetVisibility in fetch
13. `components/roles/RoleForm.tsx` - Added UI for new permissions
14. `components/timesheets/TimesheetsList.tsx` - Added user filter

## Important Notes

- **Backwards Compatible:** Existing roles will behave exactly the same unless new permissions are explicitly enabled
- **No Data Loss:** This feature does not modify or delete any existing data
- **Migration Required:** Database migration MUST be run before deploying code
- **Permissions Seeding:** New permissions MUST be seeded after migration
