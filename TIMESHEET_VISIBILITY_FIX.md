# Timesheet Visibility Fix - January 2025

## Issue
After deploying archive controls feature, all timesheets disappeared from:
- Regular Timesheets (active list)
- BCBA Timesheets (active list)  
- Regular Timesheet Archive
- BCBA Timesheet Archive

## Root Cause
The code was filtering by `archived` field which doesn't exist in the database yet (migration not run). This caused Prisma queries to fail silently or return no results.

## Solution
Removed `archived` field filtering from queries until migration is applied. Restored original behavior using `invoiceEntries` relation only.

## Current Behavior (RESTORED)
- **Active Lists**: Show all non-invoiced timesheets (no invoice entries)
- **Archive Pages**: Show all invoiced timesheets (has invoice entries)
- **No archived field filtering**: All timesheets remain visible based on invoice status only

## Files Changed
- `app/api/timesheets/route.ts` - Removed `where.archived` filters

## Status
✅ **FIXED** - All timesheets are now visible and will remain visible.

## Future Note
After running the database migration for `archived` field, the manual archive controls can be re-enabled. Until then, timesheets are organized by invoice status only (as before).
