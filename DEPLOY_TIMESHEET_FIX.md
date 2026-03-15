# Deploy Timesheet Time Input Fix

## ✅ Build Status
- Build completed successfully
- Deployment package created: `aplus-center-deploy.zip`
- Timesheet changes are ready for deployment

## 🚀 Deployment Steps

### 1. Upload to Server

**From your local machine (PowerShell):**
```powershell
cd "c:\dev\projects\A Plus center"
scp aplus-center-deploy.zip root@66.94.105.43:/tmp/
```

### 2. Deploy on Server

**SSH into server:**
```bash
ssh root@66.94.105.43
```

**Run deployment commands:**
```bash
cd /var/www/aplus-center

# Backup current version (optional but recommended)
cp -r .next .next.backup

# Extract new files
unzip -o /tmp/aplus-center-deploy.zip

# Install dependencies (if package.json changed)
npm install --production --legacy-peer-deps

# Generate Prisma Client (important!)
npx prisma generate

# Build the application
npm run build

# Restart the application
pm2 restart aplus-center

# Check status
pm2 status
pm2 logs aplus-center --lines 20
```

### 3. Verify Deployment

**Check application is running:**
```bash
curl http://localhost:3000
pm2 status
```

**Test timesheet functionality:**
1. Navigate to `/timesheets/new` in browser
2. Verify new time input component appears (dropdowns for hour/minute/AM-PM)
3. Test setting default times
4. Test "Apply Default Times to Dates" button
5. Test manual override and "Reset" button
6. Check debug panel (dev mode) shows no NaN values

## 📋 What's Being Deployed

### New Files
- `lib/timeParts.ts` - Time conversion utilities
- `components/timesheets/TimePartsInput.tsx` - New time input component
- `lib/__tests__/timeParts.test.ts` - Unit tests

### Modified Files
- `components/timesheets/TimesheetForm.tsx` - Complete refactor with new component
- `components/timesheets/TimeInput.tsx` - Marked as deprecated

### Key Changes
- ✅ Replaced time input with dropdown-based component
- ✅ Added "Apply Default Times to Dates" button
- ✅ Added "Reset row to default" functionality
- ✅ Eliminated race conditions
- ✅ No more NaN values
- ✅ Better state management

## 🔍 Post-Deployment Verification

### Functional Tests
- [ ] Create new timesheet
- [ ] Set default times (Weekdays, Sunday, Friday)
- [ ] Generate date rows
- [ ] Verify times populate correctly
- [ ] Change default times and click "Apply Defaults"
- [ ] Manually edit a row
- [ ] Click "Reset" on edited row
- [ ] Save timesheet
- [ ] Edit saved timesheet and verify data persists

### Technical Checks
- [ ] No console errors
- [ ] No NaN values in debug panel
- [ ] PM2 shows app running
- [ ] Application responds correctly

## 🐛 Troubleshooting

### If build fails on server:
```bash
# Check Node version
node --version  # Should be 18+

# Clear cache and rebuild
rm -rf .next node_modules
npm install --production --legacy-peer-deps
npx prisma generate
npm run build
```

### If Prisma errors:
```bash
# Regenerate Prisma client
npx prisma generate

# If schema changed, push to database
npx prisma db push
```

### If app won't start:
```bash
# Check logs
pm2 logs aplus-center --lines 50

# Check environment variables
cat .env | grep DATABASE_URL

# Restart PM2
pm2 restart aplus-center
pm2 save
```

## 📝 Rollback Plan

If issues occur, you can rollback:

```bash
cd /var/www/aplus-center

# Restore backup
rm -rf .next
mv .next.backup .next

# Restart
pm2 restart aplus-center
```

## ✅ Success Criteria

- [ ] Application builds successfully
- [ ] Application starts without errors
- [ ] Timesheet form loads correctly
- [ ] New time input component works
- [ ] No NaN values appear
- [ ] Default times apply correctly
- [ ] Manual overrides are preserved

---

**Deployment Date**: $(Get-Date -Format "yyyy-MM-dd HH:mm")
**Changes**: Timesheet Time Input Replacement
**Status**: Ready for Deployment
