# Community Classes Fixes - Deployment Guide

## Issues Fixed

### 1. Approve/Reject Buttons Not Showing
**Root Cause**: 
- `/api/user/permissions` was returning permissions as array without `canApprove` field
- Backend routes were checking general access instead of specific permissions

**Fixes Applied**:
1. ✅ Fixed `app/api/user/permissions/route.ts` - Now returns object format with `canApprove` field
2. ✅ Fixed `app/api/community/invoices/[id]/approve/route.ts` - Now checks `community.invoices.approve` permission
3. ✅ Fixed `app/api/community/invoices/[id]/reject/route.ts` - Now checks `community.invoices.reject` permission
4. ✅ Added debug logging to `components/community/CommunityInvoicesList.tsx`

### 2. Email Queue 404 Error
**Status**: Page exists at `app/community/email-queue/page.tsx` and is properly structured
**Note**: 404 might be due to Next.js routing cache - needs rebuild

## Files Changed

1. `app/api/user/permissions/route.ts` - Fixed to return object with canApprove
2. `app/api/community/invoices/[id]/approve/route.ts` - Added specific permission check
3. `app/api/community/invoices/[id]/reject/route.ts` - Added specific permission check
4. `components/community/CommunityInvoicesList.tsx` - Added debug logging

## Deployment Steps

### 1. Upload Changed Files to Server
```bash
# Upload the fixed files
scp app/api/user/permissions/route.ts root@server:/var/www/aplus-center/app/api/user/permissions/
scp app/api/community/invoices/[id]/approve/route.ts root@server:/var/www/aplus-center/app/api/community/invoices/[id]/approve/
scp app/api/community/invoices/[id]/reject/route.ts root@server:/var/www/aplus-center/app/api/community/invoices/[id]/reject/
scp components/community/CommunityInvoicesList.tsx root@server:/var/www/aplus-center/components/community/
```

### 2. Rebuild Next.js App
```bash
cd /var/www/aplus-center
npm run build
pm2 restart aplus-center
```

### 3. Verify Permissions Are Assigned
**CRITICAL**: Esti's role must have these permissions assigned:
- `community.invoices.approve` with **Approve** checkbox checked
- `community.invoices.reject` with **Approve** checkbox checked (reject uses canApprove)

To verify:
1. Go to Roles management
2. Find Esti's role
3. Check that `community.invoices.approve` and `community.invoices.reject` are assigned
4. Ensure the **Approve** checkbox is checked for both

### 4. Clear Browser Cache
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear browser cache completely

## Testing Checklist

After deployment:
1. ✅ Log in as Esti (or user with custom role)
2. ✅ Navigate to Community Classes → Invoices
3. ✅ Open browser console (F12)
4. ✅ Check for debug logs showing permissions
5. ✅ Verify Approve/Reject buttons appear for DRAFT invoices
6. ✅ Navigate to Community Classes → Email Queue
7. ✅ Verify page loads without 404

## Debug Information

The console logs will show:
- `[CommunityInvoices] Permissions data:` - Full permissions object
- `[CommunityInvoices] Approve permission:` - Specific approve permission
- `[CommunityInvoices] canApprove: true/false` - Whether buttons should show

If buttons still don't show, check:
1. Are permissions assigned to the role?
2. Is `canApprove: true` in the permission object?
3. Is the invoice status `DRAFT`?
4. Is the user an admin? (admins should see buttons regardless)

## Expected Behavior

**Before Fix**:
- Buttons don't show even with permissions assigned
- Email Queue shows 404

**After Fix**:
- Buttons show for users with `community.invoices.approve`/`reject` permissions
- Email Queue loads correctly
- Backend properly validates permissions
