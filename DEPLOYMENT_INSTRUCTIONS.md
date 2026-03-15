# Deployment Instructions - Community Email Queue Fixes

## Pre-Deployment Checklist

- [x] Database schema updated with new fields
- [x] Migration SQL file created
- [x] Backend routes updated for recipient separation
- [x] Attachment upload endpoint created
- [x] UI updated with attachment button
- [x] Logging added for verification

## Deployment Steps

### 1. Commit and Push Changes

```bash
git add .
git commit -m "Fix Community Email Queue: separate recipients, add attachment support, ensure context separation"
git push origin main
```

### 2. On Server: Pull and Run Migration

```bash
cd /var/www/aplus-center
git pull origin main

# Run migration
npx prisma migrate deploy

# OR if using db push (dev only):
# npx prisma db push

# Regenerate Prisma client
npx prisma generate
```

### 3. Create Upload Directory

```bash
mkdir -p uploads/community-email-attachments
chmod 755 uploads/community-email-attachments
```

### 4. Build and Restart

```bash
npm run build
node create-prerender.js
pm2 restart aplus-center
```

### 5. Verify Migration

```bash
# Check that context enum exists
psql -d apluscenter -c "SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EmailQueueContext');"

# Check that new columns exist
psql -d apluscenter -c "\d \"EmailQueueItem\"" | grep -E "context|attachment"

# Check that existing items have context set
psql -d apluscenter -c "SELECT context, COUNT(*) FROM \"EmailQueueItem\" GROUP BY context;"
```

## Post-Deployment Verification

### Test 1: Main Email Queue
1. Approve a timesheet
2. Go to main Email Queue
3. Send selected
4. Check logs: Should show `[EMAIL_MAIN]` and recipients = `info@productivebilling.com, jacobw@apluscenterinc.org`
5. Verify email arrives at those addresses

### Test 2: Community Email Queue - Immediate Send
1. Approve a community invoice
2. Go to Community Email Queue
3. Enter recipient: `test@example.com` (use a real inbox you control)
4. Click "Send Selected"
5. Check logs: Should show `[EMAIL_COMMUNITY]` and recipients = `test@example.com`
6. Verify email arrives at `test@example.com` (NOT the two fixed addresses)

### Test 3: Community Email Queue - Scheduled Send
1. Approve a community invoice
2. Go to Community Email Queue
3. Enter recipient: `test@example.com`
4. Check "Schedule Send"
5. Select date/time (at least 1 minute in future)
6. Click "Schedule Email"
7. Check logs: Should show recipients stored in `toEmail`
8. Wait for scheduled time
9. Check logs: Should show `[EMAIL_COMMUNITY]` with stored recipients
10. Verify email arrives at `test@example.com`

### Test 4: Attachment Support
1. Go to Community Email Queue
2. Select items
3. Click "Attach PDF"
4. Upload a PDF file
5. Verify filename appears
6. Enter recipient and send
7. Verify email has TWO attachments (invoice PDF + uploaded PDF)

### Test 5: Missing Recipients
1. Go to Community Email Queue
2. Select items
3. Try to send without entering recipient
4. Should show error: "Recipient email address(es) are required"
5. Should NOT send to default recipients

## Log Monitoring

Monitor logs for correct behavior:

```bash
pm2 logs aplus-center --lines 200 | grep -E "EMAIL_MAIN|EMAIL_COMMUNITY|recipients|context"
```

Expected patterns:
- `[EMAIL_MAIN]` → recipients should be the two fixed emails
- `[EMAIL_COMMUNITY]` → recipients should match user input
- `context: 'MAIN'` or `context: 'COMMUNITY'` in logs

## Rollback Plan

If issues occur:

1. Revert code:
```bash
git revert HEAD
git push origin main
cd /var/www/aplus-center
git pull origin main
npm run build
pm2 restart aplus-center
```

2. Database rollback (if needed):
```sql
-- Remove new columns (only if migration caused issues)
ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "context";
ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "attachmentKey";
ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "attachmentUrl";
ALTER TABLE "EmailQueueItem" DROP COLUMN IF EXISTS "attachmentFilename";
DROP TYPE IF EXISTS "EmailQueueContext";
```

## Files Changed Summary

**Modified:**
- `prisma/schema.prisma`
- `app/api/community/email-queue/send-batch/route.ts`
- `app/api/community/invoices/[id]/approve/route.ts`
- `app/api/email-queue/send-batch/route.ts`
- `app/api/email-queue/send-selected/route.ts`
- `app/api/timesheets/[id]/approve/route.ts`
- `lib/jobs/scheduledEmailSender.ts`
- `app/community/email-queue/page.tsx`

**Created:**
- `app/api/community/email-queue/attachment-upload/route.ts`
- `app/api/community/email-queue/attachment/[key]/route.ts`
- `prisma/migrations/add_email_queue_context_and_attachments/migration.sql`
- `COMMUNITY_EMAIL_QUEUE_FIXES_SUMMARY.md`
