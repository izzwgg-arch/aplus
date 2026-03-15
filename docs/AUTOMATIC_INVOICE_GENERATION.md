# Automatic Invoice Generation

This document describes the automatic invoice generation system that runs every Friday at 4:00 PM ET.

## Overview

The system automatically generates invoices for all approved timesheets that haven't been invoiced yet. Invoices are grouped by client, meaning each client gets one invoice per generation run that includes all their approved, unlocked timesheets.

## Components

### 1. Invoice Generation Job (`lib/jobs/invoiceGeneration.ts`)
- Finds all approved, unlocked timesheets
- Groups timesheets by client
- Generates one invoice per client
- Locks timesheets after invoicing
- Creates notifications for admin users

### 2. Cron Job System (`lib/cron.ts`)
- Schedules invoice generation every Friday at 4:00 PM ET
- Updates scheduled job records in the database
- Provides manual trigger function for testing

### 3. API Endpoint (`app/api/cron/invoice-generation/route.ts`)
- POST endpoint for manual triggering or external cron services
- GET endpoint for job status
- Can be secured with `CRON_SECRET` environment variable

### 4. Server Initialization (`lib/server-init.ts`)
- Initializes cron jobs on server startup
- Only runs in production or when `ENABLE_CRON_JOBS=true`

## How It Works

1. **Scheduled Execution**: Every Friday at 4:00 PM ET, the cron job runs automatically
2. **Timesheet Discovery**: Finds all timesheets with status `APPROVED` and `lockedAt = null`
3. **Client Grouping**: Groups timesheets by client
4. **Invoice Creation**: For each client:
   - Calculates date range covering all their timesheets
   - Checks for existing invoices to prevent duplicates
   - Generates invoice with all timesheet entries
   - Locks all included timesheets
5. **Notifications**: Creates notifications for all admin users

## Configuration

### Environment Variables

```bash
# Optional: Secret token for API endpoint authentication
CRON_SECRET=your-secret-token-here

# Enable cron jobs in development (optional)
ENABLE_CRON_JOBS=true
```

### Cron Schedule

The default schedule is: **Every Friday at 4:00 PM ET**

Cron expression: `0 16 * * 5`

To modify, edit `INVOICE_GENERATION_SCHEDULE` in `lib/cron.ts`.

## Manual Triggering

### Via API Endpoint

```bash
# With authentication (if CRON_SECRET is set)
curl -X POST https://your-domain.com/api/cron/invoice-generation \
  -H "Authorization: Bearer your-secret-token"

# Check job status
curl https://your-domain.com/api/cron/invoice-generation
```

### Via Code

```typescript
import { triggerInvoiceGeneration } from '@/lib/cron'

const result = await triggerInvoiceGeneration()
console.log(`Created ${result.invoicesCreated} invoices`)
```

## Database Records

The system maintains records in the `ScheduledJob` table:
- `jobType`: 'INVOICE_GENERATION'
- `schedule`: Cron expression
- `lastRun`: Timestamp of last execution
- `nextRun`: Calculated next run time
- `active`: Whether the job is active

## Notifications

When invoices are generated, notifications are created for all active admin users with:
- Title: "Automatic Invoice Generation"
- Message: "X invoice(s) were automatically generated for approved timesheets."

## Duplicate Prevention

The system prevents duplicate invoice generation by:
1. Only processing unlocked timesheets (`lockedAt = null`)
2. Checking for overlapping invoices for the same client and date range
3. Verifying timesheets aren't already included in existing invoices
4. Locking timesheets immediately after invoice creation

## Error Handling

- Individual client errors don't stop the entire job
- Errors are logged and returned in the result object
- Failed clients are skipped, successful ones continue
- Notifications are created only if at least one invoice was generated

## Testing

To test in development:

1. Set `ENABLE_CRON_JOBS=true` in `.env`
2. Or manually trigger via the API endpoint
3. Create some approved timesheets
4. Trigger the job
5. Verify invoices are created and timesheets are locked

## Production Deployment

1. Ensure `CRON_SECRET` is set for API endpoint security
2. Server must be running continuously (PM2 recommended)
3. Cron jobs initialize automatically on server startup
4. Monitor logs for job execution and errors

## External Cron Services

If you prefer to use an external cron service instead of node-cron:

1. Disable the internal cron job (comment out initialization)
2. Set up external cron to call: `POST /api/cron/invoice-generation`
3. Include `Authorization: Bearer ${CRON_SECRET}` header

Popular services:
- cron-job.org
- EasyCron
- Cronitor
- GitHub Actions (scheduled workflows)
