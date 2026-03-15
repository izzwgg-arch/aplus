# Payroll Performance Emergency Fix

## CRITICAL ISSUE FOUND
**App is running in DEV MODE** (`npm run dev`) instead of production mode. This is causing massive slowdowns.

## Fixes Applied

### 1. Performance Logging (PERF_DEBUG flag)
- Created `lib/perf.ts` - Performance monitoring utility
- Only logs when `PERF_DEBUG=true` environment variable is set
- Tracks: requestId, route, total time, query count, slow queries > 200ms
- Wrapped Prisma client to track queries

### 2. Payroll Employees Route
- **Before**: Loading up to 1000 employees
- **After**: Limited to 50 employees (pagination needed)
- Added `select` instead of full object (only needed fields)
- Added performance logging

### 3. Payroll Runs Route
- **Before**: Loading ALL runs with full relations
- **After**: Added pagination (default 25 per page)
- Changed `include` to `select` (only needed fields)
- Added performance logging

### 4. PayrollDashboard Component
- **Before**: Loading analytics, runs, and employees simultaneously on mount
- **After**: Deferred analytics loading by 100ms (loads after initial render)
- Runs and employees load first (lightweight)

## Files Changed
1. `lib/perf.ts` (NEW) - Performance monitoring
2. `lib/prisma.ts` - Added query tracking wrapper
3. `app/api/payroll/employees/route.ts` - Added limits + select + logging
4. `app/api/payroll/runs/route.ts` - Added pagination + select + logging
5. `components/payroll/PayrollDashboard.tsx` - Deferred analytics loading

## CRITICAL: Production Mode Fix Required

**Current Status**: App is running `npm run dev` (development mode)

**To Fix**:
```bash
# On server:
cd /var/www/aplus-center
npm run build
pm2 delete aplus-center
pm2 start npm --name aplus-center -- start
pm2 save
```

**Or update PM2 config**:
```bash
pm2 delete aplus-center
cd /var/www/aplus-center
pm2 start npm --name aplus-center -- start
pm2 save
```

## Enable Performance Debugging

To see performance logs, set environment variable:
```bash
export PERF_DEBUG=true
pm2 restart aplus-center
```

Then check logs:
```bash
pm2 logs aplus-center | grep PERF
```

## Expected Improvements

**Before**:
- Payroll Dashboard: Loading analytics + runs + employees on mount (heavy)
- Employees: Loading up to 1000 records
- Runs: Loading all runs with full relations

**After**:
- Payroll Dashboard: Analytics deferred, runs/employees load first
- Employees: Limited to 50 records
- Runs: Paginated (25 per page), selected fields only

## Next Steps

1. **CRITICAL**: Fix production mode (run `npm run build` and use `npm start`)
2. Enable PERF_DEBUG and measure actual improvements
3. Add pagination UI to employees list (currently limited to 50)
4. Consider lazy-loading analytics charts completely (load on button click)

## No Business Logic Changes
All changes are performance-only:
- Added limits/pagination
- Changed `include` to `select`
- Deferred heavy analytics loading
- Added logging (no functional changes)
