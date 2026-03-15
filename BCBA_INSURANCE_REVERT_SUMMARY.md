# BCBA Insurance Revert - Implementation Summary

## What Changed

### Phase 1: Audit ✅
- Identified all BCBA Insurance references (pages, routes, components, nav, permissions, API, Prisma)

### Phase 2: Insurance Model Update ✅
- **File**: `prisma/schema.prisma`
  - Added `regularRatePerUnit`, `regularUnitMinutes`, `bcbaRatePerUnit`, `bcbaUnitMinutes` to Insurance model
  - Kept `ratePerUnit` for backward compatibility
- **Migration**: `prisma/migrations/add_insurance_regular_bcba_fields/migration.sql`
  - Adds new columns
  - Backfills data: regularRatePerUnit = ratePerUnit, regularUnitMinutes = 15
  - Sets BCBA rates to match regular rates (fallback)

### Phase 3: Insurance UI Update ✅
- **File**: `components/insurance/InsuranceForm.tsx`
  - Added "Regular Timesheets" section with regularRatePerUnit and regularUnitMinutes fields
  - Added "BCBA Timesheets" section with bcbaRatePerUnit and bcbaUnitMinutes fields
  - Added "Use same as regular" checkbox for BCBA fields
- **Files**: `app/api/insurance/route.ts`, `app/api/insurance/[id]/route.ts`
  - Updated POST/PUT to handle new fields
  - Backward compatible with legacy ratePerUnit
- **File**: `app/insurance/[id]/edit/page.tsx`
  - Updated to pass new fields to form

### Phase 4: Invoice Calculations ✅
- **File**: `app/api/bcba-timesheets/batch/generate-invoice/route.ts`
  - Changed from `bcbaInsurance.ratePerUnit` to `insurance.bcbaRatePerUnit`
  - Changed from `bcbaInsurance.unitMinutes` to `insurance.bcbaUnitMinutes`
  - Updated to use `insuranceId` instead of `bcbaInsuranceId`
  - Includes fallbacks: bcbaRatePerUnit → regularRatePerUnit → ratePerUnit
- **File**: `app/api/timesheets/batch/generate-invoice/route.ts`
  - Updated to use `insurance.regularRatePerUnit` and `insurance.regularUnitMinutes`
  - Fallback to legacy `ratePerUnit` if new fields not set

### Phase 5: BCBA Insurance Module Removal ✅
- **Removed Files**:
  - `app/bcba-insurance/page.tsx`
  - `app/bcba-insurance/new/page.tsx`
  - `app/bcba-insurance/[id]/edit/page.tsx`
  - `app/api/bcba-insurance/route.ts`
  - `app/api/bcba-insurance/[id]/route.ts`
  - `components/bcba-insurance/BcbaInsuranceList.tsx`
  - `components/bcba-insurance/BcbaInsuranceForm.tsx`
- **Updated Files**:
  - `app/dashboard/page.tsx` - Removed BCBA Insurance card
  - `lib/permissions.ts` - Removed BCBA Insurance route check
  - `components/timesheets/BCBATimesheetForm.tsx` - Changed to use regular Insurance dropdown
  - `app/bcba-timesheets/new/page.tsx` - Fetch regular Insurance instead of BCBA Insurance
  - `app/bcba-timesheets/[id]/edit/page.tsx` - Fetch regular Insurance instead of BCBA Insurance
  - `app/api/timesheets/route.ts` - Removed bcbaInsuranceId handling, use insuranceId for BCBA
  - `app/api/timesheets/[id]/route.ts` - Removed bcbaInsuranceId handling

### Phase 6: Permissions ✅
- Existing Insurance permissions work for both regular and BCBA timesheets
- No new permission keys needed
- BCBA Insurance permissions removed from route checks

## Migration Notes

1. **Database Migration Required**:
   ```bash
   npx prisma migrate deploy
   # Or apply manually: prisma/migrations/add_insurance_regular_bcba_fields/migration.sql
   ```

2. **Data Migration** (if needed):
   - Existing BCBA timesheets with `bcbaInsuranceId` should be migrated to use `insuranceId`
   - This can be done via a separate migration script if needed
   - For now, code handles fallback: `insuranceId || bcbaInsuranceId`

3. **BcbaInsurance Table**:
   - Table is NOT dropped (safety)
   - Can be dropped later after confirming no data loss
   - Prisma schema still has BcbaInsurance model (can be removed later)

## How It Works Now

1. **Insurance Creation/Edit**:
   - Admin creates/edits Insurance with both Regular and BCBA rates/units
   - BCBA fields can use "same as regular" or be customized

2. **Regular Timesheet Invoice**:
   - Uses `insurance.regularRatePerUnit` and `insurance.regularUnitMinutes`
   - Falls back to legacy `ratePerUnit` if new fields not set

3. **BCBA Timesheet Invoice**:
   - Uses `insurance.bcbaRatePerUnit` and `insurance.bcbaUnitMinutes`
   - Falls back to `regularRatePerUnit` → `ratePerUnit` if BCBA fields not set

4. **BCBA Timesheet Creation**:
   - User selects from regular Insurance dropdown
   - Form shows BCBA rate in dropdown: "Insurance Name (BCBA: $X.XX per Y min)"
   - Stores `insuranceId` (not `bcbaInsuranceId`)

## Testing Checklist

- [ ] Create Insurance with Regular and BCBA rates
- [ ] Edit Insurance - update both rate types
- [ ] Create Regular Timesheet - verify invoice uses regularRatePerUnit
- [ ] Create BCBA Timesheet - verify insurance dropdown shows BCBA rates
- [ ] Generate BCBA Invoice - verify uses bcbaRatePerUnit
- [ ] Generate Regular Invoice - verify uses regularRatePerUnit
- [ ] Verify no 404 errors for removed BCBA Insurance pages
- [ ] Verify navigation no longer shows BCBA Insurance card
