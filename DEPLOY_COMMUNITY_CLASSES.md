# Community Classes Module - Deployment Guide

## Pre-Deployment Checklist

- [x] All code changes committed
- [x] Build completes successfully
- [x] TypeScript errors resolved
- [x] Prisma schema updated

## Deployment Steps

### 1. On Server - Navigate to Project Directory
```bash
cd /path/to/a-plus-center
# or wherever your project is located
```

### 2. Pull Latest Code (if using Git)
```bash
git pull origin main
# or your branch name
```

### 3. Install Dependencies (if package.json changed)
```bash
npm install
```

### 4. Run Database Migration
**IMPORTANT:** This creates the new tables for Community Classes module.

```bash
npx prisma migrate deploy
```

This will:
- Create `CommunityClient` table
- Create `CommunityClass` table  
- Create `CommunityInvoice` table
- Extend `EmailQueueItem` to support `COMMUNITY_INVOICE` type

### 5. Regenerate Prisma Client
```bash
npx prisma generate
```

### 6. Seed Permissions (if not already done)
```bash
npm run seed-permissions
```

This adds all community module permissions:
- `community.view`
- `community.clients.*`
- `community.classes.*`
- `community.invoices.*`
- `community.invoices.approve`
- `community.invoices.reject`
- `community.invoices.emailqueue.*`

### 7. Build Application
```bash
npm run build
```

### 8. Restart PM2
```bash
pm2 restart a-plus-center
# or: pm2 restart all
# Check your PM2 app name with: pm2 list
```

### 9. Verify Deployment
1. Check PM2 logs: `pm2 logs a-plus-center`
2. Visit the application in browser
3. Check main dashboard for "Community Classes" tile
4. Navigate to `/community` to see the community dashboard
5. Test creating a client, class, and invoice

## Post-Deployment Testing

### Test Community Clients
- [ ] Navigate to `/community/clients`
- [ ] Create a new client
- [ ] Edit an existing client
- [ ] Delete a client (soft delete)

### Test Community Classes
- [ ] Navigate to `/community/classes`
- [ ] Create a new class with rate per unit
- [ ] Edit an existing class
- [ ] Deactivate a class

### Test Community Invoices
- [ ] Navigate to `/community/invoices`
- [ ] Create a new invoice (DRAFT status)
- [ ] Approve an invoice (should move to QUEUED)
- [ ] Reject an invoice
- [ ] View invoice print preview
- [ ] Check email queue at `/community/email-queue`

### Test Email Queue
- [ ] Navigate to `/community/email-queue`
- [ ] Verify queued invoices appear
- [ ] Send batch email (if queued items exist)
- [ ] Verify invoices move to EMAILED status after sending

### Test Permissions
- [ ] Create a test role with community permissions
- [ ] Assign role to a test user
- [ ] Verify user can access community module
- [ ] Test approve/reject permissions

## Rollback Plan

If issues occur:

1. **Database Rollback:**
   ```bash
   # Check migration history
   npx prisma migrate status
   
   # Rollback last migration (if needed)
   # Note: This may require manual intervention
   ```

2. **Code Rollback:**
   ```bash
   git checkout <previous-commit>
   npm install
   npm run build
   pm2 restart a-plus-center
   ```

## Troubleshooting

### Migration Fails
- Check DATABASE_URL is set correctly
- Verify database connection
- Check for existing tables (may need to drop if re-running)

### Build Fails
- Check Node.js version (should be compatible)
- Clear `.next` folder: `rm -rf .next`
- Rebuild: `npm run build`

### PM2 Restart Fails
- Check PM2 logs: `pm2 logs a-plus-center --lines 100`
- Verify environment variables are set
- Check if port 3000 is available

### Permissions Not Showing
- Run seed script: `npm run seed-permissions`
- Check database for Permission records
- Verify role has community permissions assigned

## Database Schema Changes

### New Tables
- `CommunityClient` - Stores community client information
- `CommunityClass` - Stores community classes with rates
- `CommunityInvoice` - Stores community invoices with approval workflow

### Modified Tables
- `EmailQueueItem` - Extended `entityType` enum to include `COMMUNITY_INVOICE`

### New Enums
- `CommunityInvoiceStatus`: DRAFT, APPROVED, REJECTED, QUEUED, EMAILED, FAILED

## Environment Variables

No new environment variables required. Uses existing:
- `DATABASE_URL` - Database connection
- `SMTP_*` - Email configuration (reused from timesheet email)
- `EMAIL_APPROVAL_RECIPIENTS` - Email recipients (reused)

## Notes

- All community data is separate from main ABA clients/timesheets
- Email queue reuses existing SMTP configuration
- Permissions are automatically available in Role Editor UI
- Community Classes tile appears on main dashboard for users with `community.view` permission
