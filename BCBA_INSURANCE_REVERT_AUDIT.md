# BCBA Insurance Revert Audit - Files to Change

## PHASE 1 - AUDIT COMPLETE

### BCBA Insurance Module Files (TO BE REMOVED):
1. `app/bcba-insurance/page.tsx` - List page
2. `app/bcba-insurance/new/page.tsx` - Create page
3. `app/bcba-insurance/[id]/edit/page.tsx` - Edit page
4. `app/api/bcba-insurance/route.ts` - CRUD API
5. `app/api/bcba-insurance/[id]/route.ts` - Single record API
6. `components/bcba-insurance/BcbaInsuranceList.tsx` - List component
7. `components/bcba-insurance/BcbaInsuranceForm.tsx` - Form component

### Navigation References (TO BE REMOVED):
- `app/dashboard/page.tsx` - BCBA Insurance card (line ~168)

### Permission References (TO BE REMOVED/DEPRECATED):
- `lib/permissions.ts` - `bcbaInsurance.view`, `bcbaInsurance.manage` checks
- `app/dashboard/page.tsx` - `dashboard.bcbaInsurance` permission key

### Database References:
- `prisma/schema.prisma` - `BcbaInsurance` model (keep table, remove from schema)
- `Timesheet.bcbaInsuranceId` field (migrate to `insuranceId` for BCBA timesheets)
- `Timesheet.bcbaInsurance` relation

### Code References (TO BE UPDATED):
1. `app/bcba-timesheets/new/page.tsx` - Remove BCBA Insurance fetch, use regular Insurance
2. `app/bcba-timesheets/[id]/edit/page.tsx` - Remove BCBA Insurance fetch, use regular Insurance
3. `components/timesheets/BCBATimesheetForm.tsx` - Change BCBA Insurance dropdown to regular Insurance
4. `app/api/timesheets/route.ts` - Remove `bcbaInsuranceId` handling, use `insuranceId` for BCBA
5. `app/api/timesheets/[id]/route.ts` - Remove `bcbaInsuranceId` handling
6. `app/api/bcba-timesheets/batch/generate-invoice/route.ts` - Use `insurance.bcbaRatePerUnit` instead of `bcbaInsurance.ratePerUnit`

### Invoice Calculation Locations:
1. `app/api/bcba-timesheets/batch/generate-invoice/route.ts` - BCBA invoice generation
2. `lib/jobs/invoiceGeneration.ts` - Regular invoice generation (may need BCBA support)

## Implementation Plan:
1. Update Insurance model with new fields
2. Create migration + data backfill
3. Update Insurance UI form
4. Update invoice calculations
5. Update BCBA timesheet forms to use regular Insurance
6. Remove BCBA Insurance module files
7. Update navigation/permissions
8. Handle bcbaInsuranceId migration
