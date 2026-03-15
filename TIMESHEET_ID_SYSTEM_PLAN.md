# Timesheet ID System Implementation Plan

## Overview
Implement a comprehensive ID system for timesheets (T-1001, BT-1002) and ensure proper linking to invoices (INV-500) with full search and UI support.

## Current State
- ✅ `Timesheet` model already has `invoiceId` field (line 284)
- ✅ `Invoice` model already has relation to `Timesheets` (line 373)
- ✅ Invoice generation already links timesheets via `invoiceId`
- ❌ No `timesheetNumber` field exists
- ❌ No search functionality for timesheet IDs
- ❌ UI doesn't show timesheet IDs or invoice links

## Implementation Steps

### 1. Database Schema Changes
**File:** `prisma/schema.prisma`

Add to `Timesheet` model:
```prisma
timesheetNumber String? @unique // T-1001 for regular, BT-1002 for BCBA
```

**Migration Strategy:**
- Add field as nullable initially
- Create migration script to assign IDs to all existing timesheets
- Make field required after backfill

### 2. Utility Functions
**File:** `lib/timesheet-ids.ts` (new)

Create functions:
- `generateTimesheetNumber(isBCBA: boolean): string` - Generate next ID in sequence
- `getNextTimesheetSequence(isBCBA: boolean): Promise<number>` - Get next sequence number
- `formatTimesheetNumber(sequence: number, isBCBA: boolean): string` - Format as T-1001 or BT-1002

### 3. Migration Script
**File:** `scripts/assign-timesheet-ids.js` (new)

- Query all existing timesheets (not deleted)
- Separate regular (isBCBA=false) and BCBA (isBCBA=true) timesheets
- Assign sequential IDs starting from 1001 for each type
- Update all timesheets with their new IDs
- Ensure uniqueness

### 4. Update Timesheet Creation
**Files to modify:**
- `app/api/timesheets/route.ts` (POST)
- `app/api/timesheets/bcba/route.ts` (POST)

- Generate `timesheetNumber` when creating new timesheets
- Use the utility function to get next sequence

### 5. Update Invoice Generation
**Files to modify:**
- `app/api/invoices/route.ts`
- `app/api/timesheets/generate-invoice/route.ts`
- `app/api/timesheets/batch/generate-invoice/route.ts`
- `lib/jobs/invoiceGeneration.ts`

- Ensure `invoiceId` is set on all timesheets when invoice is created
- Verify timesheets are properly linked

### 6. Search Functionality
**File:** `app/api/search/route.ts` (new) or update existing search

- Search by timesheet number (T-1001, BT-1002)
- Return:
  - The timesheet itself
  - The invoice that contains it (if invoiced)

### 7. Invoice View UI
**File:** `components/invoices/InvoiceDetail.tsx`

- Display all linked timesheet IDs as tags/badges
- Show format: "T-1001, T-1002, BT-1003"
- Link to timesheet view if clicked

### 8. Timesheet View UI
**Files to modify:**
- `components/timesheets/TimesheetDetail.tsx`
- `components/timesheets/BCBATimesheetDetail.tsx`

- Display `timesheetNumber` prominently
- Show invoice number if `invoiceId` exists, else "Unbilled"
- Link to invoice if invoiced

### 9. Invoice Calculation Verification
**Files to verify:**
- `lib/billing.ts`
- Invoice generation routes

- Ensure invoice totals sum all linked timesheets
- BCBA logic only applies to BT timesheets
- Regular timesheets use regular rates

## Safety Measures

1. **No Data Loss:**
   - All changes are additive (new fields, no deletions)
   - Migration script is idempotent (can run multiple times safely)

2. **Backward Compatibility:**
   - `timesheetNumber` is nullable initially
   - Existing code continues to work
   - Gradual rollout possible

3. **Testing:**
   - Test migration on development database first
   - Verify all existing timesheets get IDs
   - Verify invoice linking still works
   - Test search functionality
   - Test UI updates

## Rollout Order

1. Add schema field (nullable)
2. Create migration script
3. Run migration on dev/staging
4. Update timesheet creation to generate IDs
5. Update invoice generation (verify linking)
6. Add search functionality
7. Update UI components
8. Test thoroughly
9. Deploy to production
10. Run migration on production
11. Make field required (optional, future step)
