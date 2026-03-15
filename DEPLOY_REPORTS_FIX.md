# Deployment Instructions - Reports Fix

## Summary of Changes
- Fixed report generation error handling with correlation IDs
- Added detailed reports API endpoint (`/api/reports/detailed`)
- Updated Reports page with detailed report viewing
- Added BCBA filter support
- Improved error messages and logging

## Files Changed
1. `app/api/reports/route.ts` - Enhanced error handling
2. `app/api/reports/detailed/route.ts` - NEW: Detailed reports endpoint
3. `lib/reports/queryBuilder.ts` - NEW: Query builder utility
4. `components/reports/ReportsGenerator.tsx` - Complete rewrite with detailed view
5. `app/reports/page.tsx` - Added BCBA filter support

## Deployment Steps

### Option 1: Git-based Deployment (if server has git)

```powershell
# On your local machine, commit changes first:
git add .
git commit -m "Fix report generation and add detailed reports"
git push origin main

# Then run deployment script:
.\deploy-to-server.ps1
```

### Option 2: Manual Deployment

**Step 1: Build locally**
```powershell
cd "C:\dev\projects\A Plus center"
npm run build
```

**Step 2: Create deployment package**
```powershell
# Exclude unnecessary files
Compress-Archive -Path * -DestinationPath aplus-center-deploy.zip -Exclude node_modules,.next,.git,.env,*.log,*.md
```

**Step 3: Upload to server**
```powershell
scp -i $env:USERPROFILE\.ssh\id_ed25519_smartsteps aplus-center-deploy.zip root@66.94.105.43:/tmp/
```

**Step 4: On server - Extract and deploy**
```bash
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

# Build application
npm run build

# Restart PM2
pm2 restart aplus-center
pm2 save

# Check status
pm2 status
pm2 logs aplus-center --lines 50
```

### Option 3: Direct Server Deployment (if you have SSH access)

```powershell
# SSH into server and pull latest code
ssh -i $env:USERPROFILE\.ssh\id_ed25519_smartsteps root@66.94.105.43

# On server:
cd /var/www/aplus-center
git pull origin main  # If using git
# OR manually copy files if not using git

npm install --production
npx prisma generate
npm run build
pm2 restart aplus-center
```

## Verification Steps

After deployment, verify the fixes:

1. **Test Basic Report Generation:**
   - Navigate to `/reports`
   - Select "Timesheet Summary"
   - Choose date range
   - Click "Export Report"
   - Should download successfully (no "Failed to generate report" error)

2. **Test Detailed Report View:**
   - Navigate to `/reports`
   - Select "Timesheet Summary"
   - Choose date range
   - Click "View Detailed Report"
   - Should display summary and detailed rows table
   - Verify filters work (Provider, Client, BCBA, Insurance, Status, Service Type)

3. **Test Error Handling:**
   - Try invalid date range (start > end)
   - Should show clear error message with correlation ID

4. **Test Exports:**
   - Generate detailed report
   - Click export buttons (PDF, CSV, Excel)
   - Verify files download correctly

## Rollback (if needed)

If issues occur, rollback to previous version:

```bash
cd /var/www/aplus-center
# Restore previous build
mv .next.backup.* .next  # Use the most recent backup
pm2 restart aplus-center
```

## Notes

- The build warnings about `iconv-lite` and dynamic server usage are expected and won't affect functionality
- All API routes that use authentication will show dynamic server usage warnings during build - this is normal
- The detailed reports feature is only available for "Timesheet Summary" report type
- No database migrations required for this deployment
