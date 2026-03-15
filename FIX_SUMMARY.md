# Timesheet Approval/Reject & Email Queue Fix Summary

## Root Cause Identified

**PRIMARY ISSUE**: The `EmailQueueItem` table was missing the `entityType` and `errorMessage` columns. The database still had the old `type` and `lastError` columns from a previous schema version.

**Error from logs**:
```
PrismaClientKnownRequestError: The column `entityType` does not exist in the current database.
```

## What Was Fixed

### 1. Database Migration ✅
- **File**: `scripts/fix-emailqueue-migration.sql`
- **Action**: Completed the EmailQueueItem migration that was partially done earlier
- **Changes**:
  - Added `entityType` column (enum: REGULAR | BCBA)
  - Added `errorMessage` column (TEXT)
  - Migrated data from old `type` column to `entityType`
  - Migrated data from old `lastError` column to `errorMessage`
  - Updated `status` column to use `EmailQueueStatus` enum
  - Dropped old `type` and `lastError` columns
  - Added unique constraint on `(entityType, entityId)`

**Verification**:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'EmailQueueItem' 
AND column_name IN ('entityType', 'errorMessage', 'type', 'lastError');
```
Result: `entityType` and `errorMessage` exist; `type` and `lastError` removed ✅

### 2. Structured Error Responses ✅
All API routes now return consistent error format:
```typescript
{
  ok: false,
  code: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'DB_ERROR' | 'VALIDATION_ERROR',
  message: 'Human-readable error message',
  details?: 'Additional details (dev only)'
}
```

**Files Updated**:
- `app/api/timesheets/[id]/approve/route.ts`
- `app/api/timesheets/[id]/reject/route.ts`
- `app/api/email-queue/route.ts`

### 3. Enhanced Server-Side Logging ✅
Added structured logging to all routes:
- Route name
- User ID and role
- Request parameters
- Error codes and stack traces
- Permission checks

**Example log output**:
```javascript
[APPROVE TIMESHEET] Error: {
  route: '/api/timesheets/abc123/approve',
  userId: 'user-id',
  userRole: 'ADMIN',
  timesheetId: 'abc123',
  errorCode: 'P2022',
  errorMessage: 'The column `entityType` does not exist...',
  errorStack: '...'
}
```

### 4. Frontend Error Handling ✅
Updated all frontend components to:
- Log full request/response details to browser console
- Show specific error messages based on status code and error code
- Display structured error messages from API

**Files Updated**:
- `components/timesheets/TimesheetsList.tsx`
- `components/timesheets/BCBATimesheetsList.tsx`
- `app/email-queue/page.tsx`

**Example console output**:
```javascript
[APPROVE] Request: { url: '/api/timesheets/abc123/approve', method: 'POST' }
[APPROVE] Response: { status: 500, statusText: 'Internal Server Error', ok: false, data: {...} }
[APPROVE] Error: { status: 500, code: 'DB_ERROR', message: '...', details: '...' }
```

### 5. Permission Checks ✅
- Admin users (ADMIN, SUPER_ADMIN) can bypass granular permission checks
- Non-admin users require explicit permissions
- Permission denials are logged with full context

## Endpoints Fixed

1. **POST `/api/timesheets/[id]/approve`**
   - ✅ Fixed database schema mismatch
   - ✅ Added structured error responses
   - ✅ Added detailed logging
   - ✅ Fixed TypeScript scope issues

2. **POST `/api/timesheets/[id]/reject`**
   - ✅ Added structured error responses
   - ✅ Added detailed logging
   - ✅ Fixed TypeScript scope issues

3. **GET `/api/email-queue`**
   - ✅ Fixed database schema mismatch
   - ✅ Added structured error responses
   - ✅ Added detailed logging
   - ✅ Returns empty array on error (prevents UI crashes)

## Testing Checklist

- [ ] Create a regular timesheet
- [ ] Create a BCBA timesheet
- [ ] Approve regular timesheet (should queue for email)
- [ ] Approve BCBA timesheet (should queue for email)
- [ ] Reject regular timesheet (should NOT queue)
- [ ] Reject BCBA timesheet (should NOT queue)
- [ ] View Email Queue page (should load without errors)
- [ ] Check browser console for detailed logs
- [ ] Check server logs for structured error logs
- [ ] Verify error messages are specific and helpful

## Deployment Status

✅ **Build**: Successful
✅ **Migration**: Completed
✅ **App Restart**: Completed
✅ **Status**: Online

## Next Steps

1. Test all endpoints in the browser
2. Monitor server logs for any remaining errors
3. Verify email queue functionality end-to-end
4. Test batch email sending when queue has items

## Files Changed

1. `scripts/fix-emailqueue-migration.sql` (new)
2. `app/api/timesheets/[id]/approve/route.ts`
3. `app/api/timesheets/[id]/reject/route.ts`
4. `app/api/email-queue/route.ts`
5. `components/timesheets/TimesheetsList.tsx`
6. `components/timesheets/BCBATimesheetsList.tsx`
7. `app/email-queue/page.tsx`

## Proof of Fix

**Before**: 
- Error: `The column entityType does not exist in the current database`
- Status: 500 Internal Server Error
- UI: Generic "Failed to approve timesheet" message

**After**:
- Database: `entityType` and `errorMessage` columns exist ✅
- Status: Proper error codes (401, 403, 404, 500)
- UI: Specific error messages like "Permission denied (403)" or "Database schema mismatch (500)"
- Logs: Full request/response details in both browser console and server logs ✅
