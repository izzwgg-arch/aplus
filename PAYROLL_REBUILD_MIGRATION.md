# Payroll Management Rebuild - Migration Guide

## Phase 0 & 2 Complete ✅

**Completed:**
- ✅ All old payroll code deleted (pages, components, API routes, PDF generators)
- ✅ New Prisma models created in schema according to spec
- ✅ Schema formatted and validated (syntax correct)

**Status:** Schema is ready for migration. Migration must be run on server where DATABASE_URL is configured.

## Migration Steps (Run on Server)

### Step 1: Backup Database (IMPORTANT)

Before running migration, backup the database:

```bash
# On server
pg_dump -U aplususer -d apluscenter > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Verify Schema File

Ensure `prisma/schema.prisma` includes the new payroll models:
- `PayrollEmployee`
- `PayrollImport`
- `PayrollImportRow`
- `PayrollRun`
- `PayrollRunLine`
- `PayrollPayment`
- `PayrollReportArtifact`

### Step 3: Generate Prisma Client

```bash
cd /var/www/aplus-center
export DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"
npx prisma generate
```

### Step 4: Create Migration

```bash
# This will drop old payroll tables and create new ones
npx prisma migrate dev --name rebuild_payroll_from_scratch --create-only
```

**OR** if you want to push directly (for development):

```bash
npx prisma db push
```

### Step 5: Verify Migration

Check that new tables exist:

```bash
# Connect to database
psql -U aplususer -d apluscenter

# List tables
\dt *Payroll*

# Should see:
# - PayrollEmployee
# - PayrollImport
# - PayrollImportRow
# - PayrollRun
# - PayrollRunLine
# - PayrollPayment
# - PayrollReportArtifact
```

### Step 6: Verify Prisma Client Generated

```bash
npx prisma generate
```

## What This Migration Does

### Drops Old Payroll Tables (if they exist):
- `PayrollTimeLog`
- `PayrollImport` (old)
- `PayrollImportTemplate`
- `PayrollRun` (old)
- `PayrollRunLineItem`
- `PayrollAdjustment`
- `PayrollPayment` (old)
- `PayrollAllocationBucket`
- `PayrollAllocation`
- `PayrollReportArtifact` (old)
- `PayrollEmployee` (old)

### Creates New Payroll Tables:
1. **PayrollEmployee** - Employee directory with `fullName`, `defaultHourlyRate`, `scannerExternalId`
2. **PayrollImport** - Import management with `status` (DRAFT/FINALIZED), `mappingJson`
3. **PayrollImportRow** - Import row data with `workDate`, `inTime`, `outTime`, `minutesWorked`, `hoursWorked`
4. **PayrollRun** - Payroll runs with `status` (DRAFT/APPROVED/PAID_PARTIAL/PAID_FULL)
5. **PayrollRunLine** - Run lines with `hourlyRateUsed`, `totalMinutes`, `totalHours`, `grossPay`, `amountPaid`, `amountOwed`
6. **PayrollPayment** - Payments with `method` enum (CASH/CHECK/ZELLE/ACH/OTHER)
7. **PayrollReportArtifact** - Report artifacts with `type` enum (EMPLOYEE_MONTHLY/RUN_SUMMARY)

### Creates New Enums:
- `PayrollImportStatus` (DRAFT, FINALIZED)
- `PayrollRunStatus` (DRAFT, APPROVED, PAID_PARTIAL, PAID_FULL)
- `PayrollPaymentMethod` (CASH, CHECK, ZELLE, ACH, OTHER)
- `PayrollReportType` (EMPLOYEE_MONTHLY, RUN_SUMMARY)

## Important Notes

⚠️ **This migration will DROP all old payroll tables and their data.**

If you have existing payroll data you want to preserve, you must:
1. Export the data before migration
2. Create a data migration script to transform old data to new schema
3. Import after migration

Since we're rebuilding from scratch, this is expected behavior.

## After Migration

Once migration is complete and verified:

1. ✅ Confirm all 7 new tables exist in database
2. ✅ Verify Prisma Client generated successfully
3. ✅ Test Prisma can connect and query tables

**Then proceed to Phase 1:** Routes, navigation, and dashboard tile
