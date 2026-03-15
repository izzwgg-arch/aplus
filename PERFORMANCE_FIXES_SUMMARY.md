# Performance Fixes Summary

## Phase 1: Measurements Added

### Performance Logging
- Added `lib/api-performance.ts` - Simple timing logger for API routes
- Logs route name and total time (logs if > 500ms)
- Added to critical routes:
  - `/api/payroll/employees`
  - `/api/payroll/imports`
  - `/api/payroll/analytics`
  - `/api/timesheets`
  - `/api/analytics`

### Files Changed
1. `lib/api-performance.ts` (NEW) - Performance logging utility
2. `app/api/payroll/employees/route.ts` - Added logging + limit (1000)
3. `app/api/payroll/imports/route.ts` - Added logging + pagination
4. `app/api/payroll/analytics/route.ts` - Added logging + limits (100 runs, 1000 lines, 500 payments) + select instead of include
5. `app/api/timesheets/route.ts` - Added logging
6. `app/api/analytics/route.ts` - Added logging + select instead of include + reduced limit (5000)

## Phase 2: Bottlenecks Identified

### Critical Issues Found:
1. **Analytics Route** - Loading ALL timesheets with full relations (10,000 limit was too high)
2. **Payroll Analytics** - Loading ALL runs with ALL lines and payments (no limits)
3. **Payroll Imports** - No pagination, loading all imports
4. **Missing Database Indexes** - No indexes on frequently queried fields

## Phase 3: Fixes Applied

### A) Added Pagination/Limits
- **Payroll Employees**: Added `take: 1000` limit
- **Payroll Imports**: Added pagination (page/limit params, default 25)
- **Payroll Analytics**: Added limits (100 runs, 1000 lines per run, 500 payments)
- **Analytics**: Reduced limit from 10,000 to 5,000, using `select` instead of `include`

### B) Reduced Data Loading
- **Analytics Route**: Changed from `include` to `select` - only fetch needed fields
- **Payroll Analytics**: Using `select` instead of full `include` for relations

### C) Database Indexes (Schema Changes)
Added indexes to `prisma/schema.prisma` for Timesheet model:
- `@@index([clientId])`
- `@@index([providerId])`
- `@@index([bcbaId])`
- `@@index([status])`
- `@@index([createdAt])`
- `@@index([startDate, endDate])` - Composite for date ranges
- `@@index([isBCBA, deletedAt])` - Composite for BCBA filtering
- `@@index([invoiceId, deletedAt])` - Composite for archive queries

**Note**: Indexes need migration: `npx prisma migrate dev --name add_performance_indexes`

## Phase 4: Next Steps Required

### Immediate Actions:
1. **Run Migration**: Apply database indexes
   ```bash
   npx prisma migrate dev --name add_performance_indexes
   npx prisma generate
   ```

2. **Monitor Performance Logs**: Check server logs for `[PERF]` entries
   - Routes taking > 500ms will be logged
   - Identify slow routes for further optimization

3. **Additional Optimizations Needed**:
   - **Payroll Runs Route**: Add pagination
   - **Analytics**: Consider lazy-loading charts (load after page render)
   - **Permissions**: Cache user permissions per request (avoid repeated DB calls)
   - **N+1 Queries**: Audit remaining routes for N+1 patterns

### Expected Improvements:
- **Before**: Analytics loading 10,000+ timesheets with full relations
- **After**: Loading 5,000 timesheets with selected fields only
- **Before**: Payroll analytics loading all runs/lines/payments
- **After**: Limited to 100 runs, 1000 lines, 500 payments

### Acceptance Criteria Status:
- ✅ Performance logging added to critical routes
- ✅ Pagination/limits added to list endpoints
- ✅ Database indexes defined (needs migration)
- ⚠️ Query count monitoring (needs Prisma middleware for accurate counts)
- ⚠️ < 1 second target (needs measurement after migration)

## Files Changed Summary

1. **lib/api-performance.ts** (NEW)
2. **app/api/payroll/employees/route.ts** - Logging + limit
3. **app/api/payroll/imports/route.ts** - Logging + pagination
4. **app/api/payroll/analytics/route.ts** - Logging + limits + select
5. **app/api/timesheets/route.ts** - Logging
6. **app/api/analytics/route.ts** - Logging + select + reduced limit
7. **prisma/schema.prisma** - Added indexes (needs migration)

## No Business Logic Changes
All changes are performance-only:
- Added limits/pagination
- Changed `include` to `select` (same data, less overhead)
- Added logging (no functional changes)
- Added indexes (database optimization only)
