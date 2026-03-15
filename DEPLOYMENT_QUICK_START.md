# Quick Start - Production Deployment

## 🚀 Fast Deployment (5 Minutes)

### Step 1: Run Deployment Script
```powershell
# Windows PowerShell
.\deploy-production.ps1
```

Or manually:

### Step 2: Manual Deployment Commands
```bash
# 1. Format and generate Prisma
npx prisma format
npx prisma generate

# 2. Run database migration
npx prisma db push

# 3. Build application
npm run build

# 4. Start application
npm start
```

### Step 3: Verify Deployment
1. **Check Logs** - Look for:
   ```
   [CRON] Initializing cron jobs...
   [CRON] Invoice generation job scheduled: 0 7 * * 2 (America/New_York)
   ```

2. **Test Manual Generation**:
   - Log in as ADMIN
   - Go to Invoices page
   - Click "Generate Invoices"
   - Verify invoice is created

3. **Verify Invoice Detail**:
   - Open created invoice
   - Check line items show correctly
   - Verify DR/SV times with AM/PM
   - Test print functionality

## ✅ Success Indicators

- ✅ Application starts without errors
- ✅ Cron job initializes in logs
- ✅ Manual invoice generation works
- ✅ Invoice detail view displays correctly
- ✅ No database errors

## 🎯 Next Automatic Run

**Schedule**: Every Tuesday at 7:00 AM ET

**First Run**: Next Tuesday at 7:00 AM ET

**What to Monitor**:
- Application logs for invoice generation
- Verify invoices are created
- Check timesheets are locked
- Verify no duplicate invoices

## 📚 Full Documentation

- `PRODUCTION_DEPLOYMENT.md` - Complete deployment guide
- `AUTOMATIC_INVOICE_GENERATION_COMPLETE.md` - Feature details

---

**Ready to Deploy**: ✅ Yes
**Estimated Time**: 5-10 minutes
**Risk Level**: Low (idempotent, safe to run multiple times)
