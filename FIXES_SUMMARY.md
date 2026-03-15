# User Login Activity Tracking - Implementation Summary

## ✅ Status: COMPLETE

## Overview
Implemented a comprehensive user login activity tracking system that records every successful login and displays it in the Admin dashboard "Recent Activity" section with an unread badge count.

## Changes Made

### 1. Database Schema (`prisma/schema.prisma`)

**Added:**
- `Activity` model for tracking user activities (login events)
  - Fields: `id`, `actionType`, `actorUserId`, `actorEmail`, `actorRole`, `ipAddress`, `userAgent`, `metadata`, `createdAt`
  - Indexes: `createdAt DESC`, `actionType`, `actorUserId`
  - Relation: `actor` → `User` model

- `lastSeenActivityAt` field to `User` model
  - Type: `DateTime?`
  - Purpose: Tracks when admin last viewed activities (for badge count)

- `LOGIN` action to `AuditAction` enum
  - Added for consistency with audit logs

**Updated:**
- `User` model: Added `activities` relation to `Activity` model
- `AuditLog` model: Added indexes for performance (`createdAt`, `action`, `userId`)

### 2. Activity Logging Utility (`lib/activity.ts`)

**Created:**
- `createLoginActivity()` function
  - Logs login activities to the `Activity` table
  - Prevents duplicate spam: Checks for recent login activity within 10 seconds for the same user
  - Captures: `actorUserId`, `actorEmail`, `actorRole`, `ipAddress`, `userAgent`, `metadata`
  - Non-blocking: Errors don't fail the login process

### 3. Login Activity Recording (`app/api/auth/log-activity/route.ts`)

**Created:**
- POST `/api/auth/log-activity`
  - Called after successful authentication
  - Extracts IP address from request headers (`x-forwarded-for`, `x-real-ip`, or `request.ip`)
  - Extracts user agent from request headers
  - Creates login activity record via `createLoginActivity()`
  - Requires authenticated session

**Updated:**
- `app/login/page.tsx`
  - Calls `/api/auth/log-activity` after successful login (non-blocking)
  - Does not interfere with login flow if activity logging fails

### 4. Admin Activity API Endpoints

**Created:**
- `app/api/admin/activity/route.ts`
  - GET `/api/admin/activity?limit=20`
  - Fetches recent activities ordered by newest first
  - Only accessible by ADMIN or SUPER_ADMIN
  - Returns formatted activity list

- `app/api/admin/activity/unread-count/route.ts`
  - GET `/api/admin/activity/unread-count`
  - Returns count of activities created after admin's `lastSeenActivityAt`
  - If `lastSeenActivityAt` is null, counts all activities
  - Only accessible by ADMIN or SUPER_ADMIN

- `app/api/admin/activity/mark-seen/route.ts`
  - POST `/api/admin/activity/mark-seen`
  - Updates admin's `lastSeenActivityAt` to current timestamp
  - Only accessible by ADMIN or SUPER_ADMIN

### 5. Dashboard Integration

**Updated:**
- `app/api/dashboard/stats/route.ts`
  - Fetches both audit logs AND login activities for admins
  - Combines and sorts by `createdAt DESC`
  - Calculates `unreadActivityCount` for admins
  - Returns `unreadActivityCount` in response

- `components/dashboard/DashboardStats.tsx`
  - Added `unreadActivityCount` to interface
  - Displays red badge with count next to "Recent Activity" heading
  - Automatically marks activities as seen when dashboard loads (if unread count > 0)
  - Marks activities as seen when clicking "View all" link
  - Shows LOGIN activities with proper formatting ("LOGIN User" instead of "LOGIN User")
  - Added `LOGIN` color to `getActionColor()` function (cyan-600)

### 6. Permissions & Security

- All admin activity endpoints require ADMIN or SUPER_ADMIN role
- Non-admin users cannot access activity endpoints
- Activity logging only occurs on successful login (not page refresh, token refresh, or session revalidation)
- Duplicate prevention: No duplicate login records within 10 seconds for the same user

## Files Created

1. `lib/activity.ts` - Activity logging utility
2. `app/api/auth/log-activity/route.ts` - Login activity recording endpoint
3. `app/api/admin/activity/route.ts` - Fetch activities endpoint
4. `app/api/admin/activity/unread-count/route.ts` - Unread count endpoint
5. `app/api/admin/activity/mark-seen/route.ts` - Mark as seen endpoint

## Files Modified

1. `prisma/schema.prisma` - Added Activity model, lastSeenActivityAt field, indexes
2. `app/login/page.tsx` - Added activity logging call after successful login
3. `app/api/dashboard/stats/route.ts` - Added login activities and unread count
4. `components/dashboard/DashboardStats.tsx` - Added badge display and auto-mark-as-seen

## Testing Instructions

### 1. Database Migration
```bash
# Generate Prisma client
npm run db:generate

# Create and apply migration
npx prisma migrate dev --name add_activity_model_and_login_tracking

# Or push schema directly (for development)
npx prisma db push
```

### 2. Test Login Activity Creation

1. **Create a new non-admin user:**
   - Go to `/users/new`
   - Create a user with role "USER"
   - Note the email

2. **Log in as that user:**
   - Go to `/login`
   - Enter the new user's credentials
   - Login should succeed

3. **Verify activity record:**
   - Log in as ADMIN
   - Go to dashboard
   - Check "Recent Activity" section
   - Should see "LOGIN User" entry with the new user's email
   - Badge count should increment

### 3. Test Duplicate Prevention

1. **Rapid login test:**
   - Log out
   - Log in as a user
   - Immediately log out and log in again (within 10 seconds)
   - Check database: Should only have ONE login activity record (not two)

### 4. Test Badge Count

1. **Initial state:**
   - Log in as ADMIN
   - Dashboard should show badge with count of all login activities (if `lastSeenActivityAt` is null)

2. **After viewing:**
   - Badge should disappear or count should decrease
   - Refresh page: Badge should not reappear (activities marked as seen)

3. **New login:**
   - Log in as a different user
   - Log in as ADMIN again
   - Badge should show count = 1 (new login since last seen)

### 5. Test Page Refresh (No Duplicate)

1. **Login and refresh:**
   - Log in as a user
   - Refresh the dashboard page multiple times
   - Check database: Should still have only ONE login activity record

### 6. Test Logout/Login (New Record)

1. **Logout and login:**
   - Log out
   - Wait 10+ seconds
   - Log in again
   - Check database: Should have a NEW login activity record

### 7. Test Non-Admin Access

1. **Non-admin user:**
   - Log in as a USER role
   - Dashboard should NOT show login activities from other users
   - Should NOT have access to `/api/admin/activity` endpoints

## Database Queries for Verification

```sql
-- Check all login activities
SELECT * FROM "Activity" WHERE "actionType" = 'LOGIN' ORDER BY "createdAt" DESC;

-- Check admin's last seen timestamp
SELECT id, email, "lastSeenActivityAt" FROM "User" WHERE role = 'ADMIN';

-- Count unread activities (example for a specific admin)
SELECT COUNT(*) FROM "Activity" 
WHERE "createdAt" > (SELECT "lastSeenActivityAt" FROM "User" WHERE id = 'admin-user-id');
```

## Notes

- Login activities are recorded server-side after successful authentication
- Activity logging is non-blocking (errors don't prevent login)
- Duplicate prevention window: 10 seconds
- Badge count updates automatically when dashboard loads
- Activities are marked as seen when:
  - Dashboard loads (if unread count > 0)
  - Admin clicks "View all" link
- Only ADMIN and SUPER_ADMIN roles can see all login activities
- Non-admin users only see their own audit logs (not login activities)

## Next Steps

1. Run database migration: `npx prisma migrate dev --name add_activity_model_and_login_tracking`
2. Test login activity creation
3. Verify badge count functionality
4. Test duplicate prevention
5. Deploy to production
