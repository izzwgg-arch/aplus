# Community Classes Email Queue Fixes - Implementation Summary

## Overview
Fixed Community Classes Email Queue to behave independently from the MAIN (Smart Steps) Email Queue, with proper recipient handling, attachment support, and scheduling.

## Changes Made

### 1. Database Schema Changes (Prisma)

**File: `prisma/schema.prisma`**

- Added `EmailQueueContext` enum: `MAIN | COMMUNITY`
- Added to `EmailQueueItem` model:
  - `context EmailQueueContext?` - Distinguishes queue type
  - `attachmentKey String?` - Storage key for additional PDF
  - `attachmentUrl String?` - URL to access attachment
  - `attachmentFilename String?` - Original filename
- Added to `Role` model (granular permissions):
  - `communityEmailQueueView Boolean @default(false)`
  - `communityEmailQueueSendNow Boolean @default(false)`
  - `communityEmailQueueSchedule Boolean @default(false)`
  - `communityEmailQueueDelete Boolean @default(false)`
  - `communityEmailQueueAttachPdf Boolean @default(false)`

**Migration: `prisma/migrations/add_email_queue_context_and_attachments/migration.sql`**
- Creates `EmailQueueContext` enum
- Adds context and attachment fields to `EmailQueueItem`
- Adds community email queue permissions to `Role`
- Sets context for existing items (COMMUNITY_INVOICE → COMMUNITY, REGULAR/BCBA → MAIN)

### 2. Backend Changes

#### A. Community Email Queue Send/Schedule Route
**File: `app/api/community/email-queue/send-batch/route.ts`**

- **Recipient Handling:**
  - Requires `recipients` array from request (no fallback)
  - Validates recipients are provided (400 error if missing)
  - Normalizes recipients (trim, lowercase, comma/semicolon split)
  - Stores recipients in `toEmail` field for both immediate and scheduled sends
  - Sets `context: 'COMMUNITY'` on all queue items

- **Attachment Support:**
  - Accepts `attachmentKey` and `attachmentFilename` from request
  - Stores attachment metadata on queue items
  - Loads attachment file before sending email
  - Includes attachment in email alongside invoice PDFs

- **Scheduling:**
  - Handles `scheduledSendAt` datetime string
  - Converts datetime-local input to UTC (America/New_York timezone)
  - Stores scheduled time and recipients on queue items
  - Keeps status as QUEUED for scheduled items

- **Logging:**
  - `[EMAIL_COMMUNITY]` prefix for all community email operations
  - Logs recipients, context, attachment status

#### B. Scheduled Email Sender
**File: `lib/jobs/scheduledEmailSender.ts`**

- **Recipient Handling:**
  - Reads recipients from stored `toEmail` field (REQUIRED, NO fallback)
  - Fails with `MISSING_RECIPIENTS` error if `toEmail` is empty
  - No fallback to default recipients for COMMUNITY items

- **Attachment Support:**
  - Loads additional PDF attachment if `attachmentKey` is present
  - Includes attachment in scheduled email sends

- **Logging:**
  - `[EMAIL_COMMUNITY]` prefix
  - Logs recipients from stored `toEmail`

#### C. Main Email Queue Routes
**Files: `app/api/email-queue/send-batch/route.ts`, `app/api/email-queue/send-selected/route.ts`**

- **Recipient Handling:**
  - Hardcoded recipients: `['info@productivebilling.com', 'jacobw@apluscenterinc.org']`
  - Ignores any recipients from client
  - Sets `context: 'MAIN'` on queue items

- **Logging:**
  - `[EMAIL_MAIN]` prefix
  - Logs fixed recipients

#### D. Queue Item Creation
**Files:**
- `app/api/timesheets/[id]/approve/route.ts` - Sets `context: 'MAIN'` when creating queue items
- `app/api/community/invoices/[id]/approve/route.ts` - Sets `context: 'COMMUNITY'` when creating queue items

#### E. Attachment Upload Endpoint
**File: `app/api/community/email-queue/attachment-upload/route.ts`**

- Accepts PDF file uploads (max 10MB)
- Validates PDF header (`%PDF`)
- Stores file in `uploads/community-email-attachments/`
- Returns `attachmentKey`, `attachmentUrl`, `attachmentFilename`
- Permission: Community Classes Email Queue access

**File: `app/api/community/email-queue/attachment/[key]/route.ts`**

- Serves uploaded attachments for download/verification
- Sanitizes filename to prevent directory traversal

### 3. Frontend Changes

#### Community Email Queue UI
**File: `app/community/email-queue/page.tsx`**

- **Attachment Upload:**
  - Added "Attach PDF" button next to "Send Selected"
  - File input accepts only `.pdf` files
  - Shows selected filename with remove button
  - Uploads file before sending
  - Includes attachment in send request

- **Recipient Field:**
  - Already present and validated
  - Required for all sends
  - Supports comma/semicolon separated emails

- **Scheduling:**
  - Already implemented with checkbox and datetime-local input
  - Validates future date/time

- **State Management:**
  - `attachmentFile`, `attachmentKey`, `attachmentFilename` state
  - `uploadingAttachment` state for loading indicator
  - Clears attachment after successful send

### 4. Permissions

**File: `prisma/schema.prisma`**

- Added granular permissions to `Role` model:
  - `communityEmailQueueView`
  - `communityEmailQueueSendNow`
  - `communityEmailQueueSchedule`
  - `communityEmailQueueDelete`
  - `communityEmailQueueAttachPdf`

**Note:** Permission checks in UI and API routes should be updated to use these granular permissions (currently using `canAccessCommunitySection` which is sufficient for MVP).

## Key Behaviors

### MAIN Email Queue (Smart Steps)
- **Recipients:** ALWAYS `info@productivebilling.com`, `jacobw@apluscenterinc.org`
- **Context:** `MAIN`
- **No user input for recipients**
- **No attachment support**

### COMMUNITY Email Queue
- **Recipients:** User-entered in UI (REQUIRED, no fallback)
- **Context:** `COMMUNITY`
- **Attachment support:** Yes (optional additional PDF)
- **Scheduling:** Yes (with user-entered recipients)
- **Validation:** Fails with 400 if recipients missing

## Verification Steps

1. **Main Email Queue:**
   - Approve a timesheet → appears in main Email Queue
   - Send now → verify logs show `[EMAIL_MAIN]` and recipients are ONLY the two fixed emails
   - Verify email arrives at fixed recipients

2. **Community Email Queue:**
   - Approve a community invoice → appears in Community Email Queue
   - Enter recipient: `test@example.com`
   - Schedule for +2 minutes → verify logs show `[EMAIL_COMMUNITY]` and recipients match entered email
   - Verify email arrives at entered recipient (NOT fixed emails)

3. **Attachment:**
   - Upload a PDF in Community Email Queue
   - Send invoice → verify email has TWO attachments (invoice PDF + uploaded PDF)

4. **Missing Recipients:**
   - Try to send/schedule without recipient → should fail with 400 error
   - UI should show "Recipient required" toast

## Files Changed

1. `prisma/schema.prisma` - Added enum, fields, permissions
2. `prisma/migrations/add_email_queue_context_and_attachments/migration.sql` - Migration SQL
3. `app/api/community/email-queue/send-batch/route.ts` - Recipient handling, attachment support, context
4. `app/api/community/email-queue/attachment-upload/route.ts` - NEW - File upload endpoint
5. `app/api/community/email-queue/attachment/[key]/route.ts` - NEW - File download endpoint
6. `lib/jobs/scheduledEmailSender.ts` - Attachment support, recipient logging
7. `app/api/email-queue/send-batch/route.ts` - Set context=MAIN
8. `app/api/email-queue/send-selected/route.ts` - Set context=MAIN
9. `app/api/timesheets/[id]/approve/route.ts` - Set context=MAIN when creating queue items
10. `app/api/community/invoices/[id]/approve/route.ts` - Set context=COMMUNITY when creating queue items
11. `app/community/email-queue/page.tsx` - Attachment upload UI, handlers

## Next Steps

1. Run migration: `npx prisma migrate deploy` (or `prisma db push` for dev)
2. Regenerate Prisma client: `npx prisma generate`
3. Rebuild: `npm run build`
4. Restart PM2: `pm2 restart aplus-center`
5. Test verification steps above

## Logging Examples

**Main Email Queue:**
```
[EMAIL_MAIN] Sending batch email {
  messageId: 'batch-...',
  recipients: 'info@productivebilling.com, jacobw@apluscenterinc.org',
  source: 'MAIN',
  batchId: '...',
  lockedItemsCount: 5
}
```

**Community Email Queue:**
```
[EMAIL_COMMUNITY] Sending batch email {
  queueItemIds: [...],
  recipients: 'test@example.com',
  source: 'COMMUNITY',
  context: 'COMMUNITY',
  batchId: '...',
  lockedItemsCount: 2,
  hasAttachment: true
}
```

**Scheduled Email:**
```
[EMAIL_COMMUNITY] Processing scheduled email {
  queueItemIds: [...],
  recipients: 'test@example.com',
  source: 'COMMUNITY',
  context: 'COMMUNITY',
  fromStoredToEmail: 'test@example.com',
  batchId: '...'
}
```
