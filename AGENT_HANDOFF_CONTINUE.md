# Agent Handoff - Continue Dashboard Visibility Control Feature

## 🎯 Current Status: IN PROGRESS

**Date:** January 2025  
**Feature:** Dashboard Visibility Control for Roles  
**Status:** 🔄 Partially Implemented - Needs Completion

---

## 📋 What Was Just Completed

### 1. Enhanced User Management System ✅
- Added **Super Admin** role support
- Created **Custom Roles** system with granular permissions
- Added **48 default permissions** across all modules
- Created role management UI (`/roles` page)
- Enhanced user form with role selection and permissions
- Added Users card to Dashboard for admins

### 2. Started Dashboard Visibility Control 🔄
- **Added dashboard permissions** to seed script:
  - `dashboard.analytics`
  - `dashboard.providers`
  - `dashboard.clients`
  - `dashboard.timesheets`
  - `dashboard.invoices`
  - `dashboard.reports`
  - `dashboard.users`
  - `dashboard.bcbas`
  - `dashboard.insurance`

- **Created permissions utility** (`lib/permissions.ts`):
  - `getUserPermissions()` - Gets all permissions for a user
  - `canSeeDashboardSection()` - Checks if user can see a dashboard section
  - Handles SUPER_ADMIN, ADMIN, CUSTOM, and USER roles

- **Created permissions API** (`/api/user/permissions`):
  - Returns current user's permissions

- **Updated RoleForm component** (`components/roles/RoleForm.tsx`):
  - Added "Dashboard Visibility" section at the top
  - Shows checkboxes for each dashboard section
  - Visual indicators for enabled sections

---

## 🚧 What Needs to Be Completed

### 1. Finish Dashboard Visibility Control (CRITICAL)

**File:** `app/dashboard/page.tsx`

**Current Issue:**
- Dashboard still shows all cards to all users
- No permission checking for dashboard visibility
- Cards need to be filtered based on user's role permissions

**What to Do:**
1. Update `app/dashboard/page.tsx` to:
   - Fetch user permissions from `/api/user/permissions` (or use server-side check)
   - Filter `cards` array based on `dashboard.*` permissions
   - Filter `adminCards` array based on permissions AND role
   - Only show cards where user has `dashboard.{section}` permission with `canView: true`

2. Create a helper function or component that:
   - Checks `permissions['dashboard.analytics']?.canView` for Analytics card
   - Checks `permissions['dashboard.providers']?.canView` for Providers card
   - Checks `permissions['dashboard.clients']?.canView` for Clients card
   - Checks `permissions['dashboard.timesheets']?.canView` for Timesheets card
   - Checks `permissions['dashboard.invoices']?.canView` for Invoices card
   - Checks `permissions['dashboard.reports']?.canView` for Reports card
   - Checks `permissions['dashboard.users']?.canView` for Users card (admin only)
   - Checks `permissions['dashboard.bcbas']?.canView` for BCBAs card (admin only)
   - Checks `permissions['dashboard.insurance']?.canView` for Insurance card (admin only)

3. For SUPER_ADMIN and ADMIN roles:
   - Show all cards by default (unless explicitly restricted)
   - Can still use permissions if set

4. For CUSTOM roles:
   - Only show cards where `dashboard.{section}` permission has `canView: true`

5. For USER role:
   - Show default cards (timesheets, invoices typically)
   - Or respect permissions if custom permissions are assigned

**Implementation Options:**

**Option A: Server-Side (Recommended)**
```typescript
// In app/dashboard/page.tsx
import { canSeeDashboardSection } from '@/lib/permissions'

// Filter cards
const visibleCards = cards.filter(card => {
  const section = card.href.replace('/', '') // e.g., '/providers' -> 'providers'
  if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') {
    return true // Admins see all by default
  }
  return canSeeDashboardSection(session.user.id, section)
})
```

**Option B: Client-Side**
- Create a client component that fetches permissions
- Filter cards dynamically on the client

**Recommended:** Use Option A (server-side) for better performance and security.

---

## 📁 Files Modified/Created

### Created:
- ✅ `lib/permissions.ts` - Permission checking utilities
- ✅ `app/api/user/permissions/route.ts` - User permissions API
- ✅ `app/api/permissions/route.ts` - All permissions API
- ✅ `app/api/roles/route.ts` - Roles CRUD API
- ✅ `app/api/roles/[id]/route.ts` - Single role API
- ✅ `scripts/seed-permissions.ts` - Permissions seed script
- ✅ `components/roles/RoleForm.tsx` - Role creation/edit form
- ✅ `components/roles/RolesList.tsx` - Roles list component
- ✅ `app/roles/page.tsx` - Roles page
- ✅ `app/roles/new/page.tsx` - Create role page
- ✅ `app/roles/[id]/edit/page.tsx` - Edit role page

### Modified:
- ✅ `prisma/schema.prisma` - Added Role, Permission, RolePermission models
- ✅ `app/dashboard/page.tsx` - Added Users to admin cards
- ✅ `components/users/UsersList.tsx` - Enhanced with roles section
- ✅ `components/users/UserFormEnhanced.tsx` - Added custom role support
- ✅ `lib/auth.ts` - Updated for new role types
- ✅ `types/next-auth.d.ts` - Updated TypeScript types
- ✅ `scripts/seed-permissions.ts` - Added dashboard permissions

### Needs Update:
- 🔄 `app/dashboard/page.tsx` - **MUST UPDATE** to filter cards by permissions

---

## 🔧 Technical Details

### Permission Structure

Permissions are stored with:
- `name`: e.g., `dashboard.analytics`, `providers.view`
- `category`: Groups permissions (dashboard, providers, clients, etc.)
- `canView`, `canCreate`, `canUpdate`, `canDelete`, `canApprove`, `canExport`: Boolean flags

### Role Types

1. **SUPER_ADMIN**: Full access to everything (bypasses permissions)
2. **ADMIN**: Administrative access (can be restricted)
3. **CUSTOM**: Uses assigned permissions from Role model
4. **USER**: Basic user permissions

### Dashboard Permission Naming

Dashboard permissions follow pattern: `dashboard.{section}` where section matches the href:
- `/analytics` → `dashboard.analytics`
- `/providers` → `dashboard.providers`
- `/clients` → `dashboard.clients`
- `/timesheets` → `dashboard.timesheets`
- `/invoices` → `dashboard.invoices`
- `/reports` → `dashboard.reports`
- `/users` → `dashboard.users`
- `/bcbas` → `dashboard.bcbas`
- `/insurance` → `dashboard.insurance`

---

## 🎯 Next Steps (In Order)

### Step 1: Seed Dashboard Permissions
```bash
# Upload and run seed script
scp scripts/seed-permissions.ts root@66.94.105.43:/var/www/aplus-center/scripts/
ssh root@66.94.105.43 "cd /var/www/aplus-center && npx tsx scripts/seed-permissions.ts"
```

### Step 2: Update Dashboard Page
**File:** `app/dashboard/page.tsx`

Add permission checking logic to filter cards:

```typescript
import { canSeeDashboardSection } from '@/lib/permissions'

// After session check, add:
const userPermissions = await getUserPermissions(session.user.id)

// Filter cards based on permissions
const visibleCards = cards.filter(card => {
  const section = card.href.replace('/', '')
  
  // SUPER_ADMIN and ADMIN see all by default
  if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') {
    return true
  }
  
  // CUSTOM and USER roles check permissions
  const permission = userPermissions[`dashboard.${section}`]
  return permission?.canView === true
})

const visibleAdminCards = adminCards.filter(card => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return false
  }
  
  const section = card.href.replace('/', '')
  const permission = userPermissions[`dashboard.${section}`]
  
  // Admins see all admin cards unless explicitly restricted
  return permission === undefined || permission.canView === true
})

// Then use visibleCards and visibleAdminCards in the render
```

### Step 3: Test the Feature
1. Create a custom role
2. Assign only specific dashboard permissions (e.g., only `dashboard.timesheets`, `dashboard.invoices`)
3. Create a user with that custom role
4. Log in as that user
5. Verify only the allowed cards appear on dashboard

### Step 4: Deploy
```bash
# Build and deploy
npm run build
scp -r app components lib scripts root@66.94.105.43:/var/www/aplus-center/
ssh root@66.94.105.43 "cd /var/www/aplus-center && npm run build && pm2 restart aplus-center"
```

---

## 📚 Key Code References

### Permission Checking Function
```typescript
// lib/permissions.ts
export async function getUserPermissions(userId: string): Promise<UserPermissions>
export async function canSeeDashboardSection(userId: string, section: string): Promise<boolean>
```

### Dashboard Cards Structure
```typescript
// app/dashboard/page.tsx
const cards = [
  { title: 'Analytics', href: '/analytics', ... },
  { title: 'Providers', href: '/providers', ... },
  // etc.
]

const adminCards = [
  { title: 'Users', href: '/users', ... },
  // etc.
]
```

### Role Form Dashboard Section
```typescript
// components/roles/RoleForm.tsx
// Dashboard Visibility section uses permissions like:
// dashboard.analytics, dashboard.providers, etc.
// Each has canView checkbox that controls visibility
```

---

## ⚠️ Important Notes

1. **SUPER_ADMIN and ADMIN**: Should see all cards by default unless you want to restrict them
2. **CUSTOM Roles**: Only show cards where `dashboard.{section}.canView` is true
3. **USER Role**: Default basic access, but can be customized via permissions
4. **Permission Naming**: Must match between dashboard cards and permissions (`dashboard.{section}`)
5. **Server-Side**: Always check permissions server-side for security

---

## 🐛 Known Issues / Things to Watch

1. **prerender-manifest.json**: Sometimes gets deleted during builds. If app crashes, recreate it:
   ```bash
   ssh root@66.94.105.43 "cd /var/www/aplus-center && node /tmp/create-prerender.js"
   ```

2. **Build Warnings**: Dynamic route warnings are expected and normal for this app

3. **PM2 Restart**: App may need restart after permission/role changes:
   ```bash
   ssh root@66.94.105.43 "cd /var/www/aplus-center && pm2 restart aplus-center"
   ```

---

## ✅ Checklist for Completion

- [ ] Seed dashboard permissions (run seed script)
- [ ] Update `app/dashboard/page.tsx` to filter cards by permissions
- [ ] Test with SUPER_ADMIN user (should see all)
- [ ] Test with ADMIN user (should see all)
- [ ] Test with CUSTOM role user (should see only allowed cards)
- [ ] Test with USER role user (should see default cards)
- [ ] Verify role form saves dashboard visibility correctly
- [ ] Build and deploy to server
- [ ] Test on production server

---

## 🎉 Summary

**Current State:**
- ✅ Permission system fully implemented
- ✅ Role management system complete
- ✅ Dashboard visibility UI added to role form
- 🔄 Dashboard page needs to respect permissions (TODO)

**Next Agent Should:**
1. Complete the dashboard filtering logic in `app/dashboard/page.tsx`
2. Test with different user roles
3. Deploy the changes

**The foundation is solid - just needs the final piece to connect permissions to dashboard visibility!**

---

**Last Updated:** January 2025  
**Status:** Feature 90% complete - Dashboard filtering pending