# Production Deployment Guide - Automatic Invoice Generation

## 🚀 Pre-Deployment Checklist

### 1. Database Migration
**REQUIRED**: Run database migration to ensure all schema changes are applied.

```bash
# Option 1: Using Prisma Migrate (Recommended for production)
npx prisma migrate deploy

# Option 2: Using Prisma DB Push (Development/Quick)
npx prisma db push

# Verify migration
npx prisma studio
```

**Required Schema Fields:**
- ✅ `TimesheetEntry.invoiced` (Boolean, default: false)
- ✅ `TimesheetEntry.overnight` (Boolean, default: false)
- ✅ `Timesheet.status` includes 'LOCKED'
- ✅ `Timesheet.lockedAt` (DateTime?)
- ✅ `Timesheet.timezone` (String, default: "America/New_York")
- ✅ `InvoiceEntry.rate` (Decimal) - Rate snapshot

### 2. Environment Variables
Verify these environment variables are set in production:

```bash
# Database
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://your-domain.com"

# Optional: For external cron triggers
CRON_SECRET="your-secret-key"  # If using external cron service
```

### 3. Verify Code Deployment
```bash
# Build the application
npm run build

# Verify no build errors
# Check that all files are deployed:
# - lib/billingPeriodUtils.ts
# - lib/jobs/invoiceGeneration.ts
# - lib/cron.ts
# - app/api/cron/invoice-generation/route.ts
# - app/api/invoices/generate/route.ts
# - components/invoices/InvoiceDetail.tsx
# - components/invoices/InvoicesList.tsx
```

## 📋 Deployment Steps

### Step 1: Backup Database
```bash
# PostgreSQL
pg_dump your_database > backup_$(date +%Y%m%d_%H%M%S).sql

# Or using Prisma
npx prisma db pull
```

### Step 2: Run Database Migration
```bash
# Production migration (no prompts)
npx prisma migrate deploy

# Verify migration success
npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name = 'TimesheetEntry' AND column_name = 'invoiced';"
```

### Step 3: Deploy Application
```bash
# Build for production
npm run build

# Start production server
npm start

# Or if using PM2
pm2 restart your-app-name

# Or if using Docker
docker-compose up -d --build
```

### Step 4: Verify Cron Job Initialization
Check application logs for:
```
[CRON] Initializing cron jobs...
[CRON] Invoice generation job scheduled: 0 7 * * 2 (America/New_York)
[CRON] Cron jobs initialized
```

### Step 5: Test Manual Invoice Generation
1. Log in as ADMIN user
2. Navigate to Invoices page
3. Click "Generate Invoices" button
4. Select "Current Billing Period"
5. Click "Generate"
6. Verify:
   - ✅ Invoice is created
   - ✅ Line items show correctly
   - ✅ Timesheets are locked
   - ✅ Entries marked as invoiced

## 🔍 Post-Deployment Verification

### 1. Verify Database Schema
```sql
-- Check TimesheetEntry has invoiced field
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'TimesheetEntry' 
AND column_name IN ('invoiced', 'overnight');

-- Check Timesheet has LOCKED status
SELECT unnest(enum_range(NULL::"TimesheetStatus")) AS status;

-- Should include: DRAFT, SUBMITTED, APPROVED, REJECTED, LOCKED
```

### 2. Verify Cron Job is Running
```bash
# Check application logs
tail -f logs/app.log | grep CRON

# Or check process
ps aux | grep node

# Verify cron job is scheduled
# Check logs for: "Invoice generation job scheduled: 0 7 * * 2"
```

### 3. Test Invoice Generation Endpoint
```bash
# Test manual generation endpoint (requires auth)
curl -X POST https://your-domain.com/api/invoices/generate \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..."

# Or test cron endpoint (if using external cron)
curl -X POST https://your-domain.com/api/cron/invoice-generation \
  -H "X-Cron-Secret: your-secret-key"
```

### 4. Verify Invoice Detail View
1. Create a test invoice (manual generation)
2. Open invoice detail page
3. Verify:
   - ✅ Line items show by date
   - ✅ DR and SV times show with AM/PM
   - ✅ Minutes and units are correct
   - ✅ Totals match
   - ✅ Provider and BCBA information displays
   - ✅ Print button works

## 🧪 Testing Checklist

### Before First Automatic Run
- [ ] Database migration completed successfully
- [ ] Application builds without errors
- [ ] Cron job initializes correctly
- [ ] Manual invoice generation works
- [ ] Invoice detail view displays correctly
- [ ] Print functionality works
- [ ] Timesheets lock after invoicing
- [ ] Entries marked as invoiced

### First Automatic Run (Tuesday 7:00 AM)
- [ ] Monitor application logs
- [ ] Verify invoices are created
- [ ] Check invoice content is correct
- [ ] Verify timesheets are locked
- [ ] Verify no duplicate invoices
- [ ] Check error logs for any issues

## 📊 Monitoring

### Key Metrics to Monitor
1. **Invoice Generation Success Rate**
   - Check logs for successful runs
   - Monitor error rates

2. **Invoice Count**
   - Expected: One invoice per client per week
   - Verify no duplicates

3. **Timesheet Locking**
   - Verify timesheets are locked after invoicing
   - Check `lockedAt` timestamp

4. **Entry Marking**
   - Verify `invoiced` flag is set correctly
   - Check no entries are double-billed

### Log Monitoring
```bash
# Watch for invoice generation logs
tail -f logs/app.log | grep "INVOICE GENERATION"

# Watch for cron job logs
tail -f logs/app.log | grep "CRON"

# Watch for errors
tail -f logs/app.log | grep "ERROR"
```

## 🚨 Troubleshooting

### Issue: Cron Job Not Running
**Symptoms**: No invoices generated on Tuesday
**Solutions**:
1. Check application is running: `ps aux | grep node`
2. Check logs for cron initialization
3. Verify timezone is correct (America/New_York)
4. Manually trigger: Use admin UI or API endpoint

### Issue: Duplicate Invoices
**Symptoms**: Multiple invoices for same client/period
**Solutions**:
1. Check idempotency logic in `generateInvoiceForClient`
2. Verify existing invoice check is working
3. Check for race conditions (shouldn't happen with transactions)

### Issue: Incorrect Totals
**Symptoms**: Invoice amounts don't match expected
**Solutions**:
1. Verify rounding policy: Round UP to 15 minutes
2. Check rate is from client's insurance
3. Verify units calculation: `Math.ceil(minutes / 15)`
4. Check for NaN values in logs

### Issue: Timesheets Not Locking
**Symptoms**: Timesheets still editable after invoicing
**Solutions**:
1. Check transaction completed successfully
2. Verify `status: 'LOCKED'` is set
3. Check `lockedAt` timestamp
4. Verify UI checks for LOCKED status

## 🔄 Rollback Plan

If issues occur, rollback steps:

1. **Stop Cron Job**
   ```bash
   # Restart application without cron
   # Or comment out cron initialization
   ```

2. **Revert Database** (if needed)
   ```bash
   # Restore from backup
   pg_restore -d your_database backup.sql
   ```

3. **Revert Code**
   ```bash
   git revert <commit-hash>
   npm run build
   npm start
   ```

## 📝 Post-Deployment Notes

### First Week Monitoring
- Monitor first automatic run closely
- Verify all invoices are created correctly
- Check for any edge cases
- Document any issues

### Weekly Verification
- Check invoices are generated every Tuesday
- Verify invoice content is correct
- Monitor for any errors
- Review invoice totals

## ✅ Success Criteria

Deployment is successful when:
- ✅ Database migration completed
- ✅ Application builds and runs
- ✅ Cron job initializes correctly
- ✅ Manual invoice generation works
- ✅ Invoice detail view displays correctly
- ✅ First automatic run completes successfully
- ✅ No errors in logs
- ✅ All timesheets lock correctly
- ✅ No duplicate invoices

## 📞 Support

If issues arise:
1. Check application logs
2. Review this deployment guide
3. Check `AUTOMATIC_INVOICE_GENERATION_COMPLETE.md` for details
4. Verify database schema matches requirements

---

**Ready for Production**: ✅ Yes
**Last Updated**: Deployment guide created
**Next Automatic Run**: Next Tuesday at 7:00 AM ET
