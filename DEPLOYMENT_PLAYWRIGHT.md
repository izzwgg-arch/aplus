# Playwright PDF Generation - Deployment Guide

This guide covers deploying the Playwright-based PDF generation system for timesheets.

## Overview

PDF generation for timesheets (both regular and BCBA) has been migrated from PDFKit to Playwright (Chromium). This provides reliable HTML→PDF conversion that matches the on-screen layout exactly.

## System Dependencies (Ubuntu)

Playwright requires Chromium and system libraries. Install dependencies:

```bash
# Install Playwright system dependencies
npx playwright install --with-deps chromium

# OR manually install dependencies (if npx fails):
sudo apt-get update
sudo apt-get install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libcairo-gobject2 \
  libgtk-3-0 \
  libgdk-pixbuf2.0-0
```

## Deployment Steps

1. **Install npm dependencies:**
   ```bash
   cd /var/www/aplus-center
   npm install
   ```

2. **Install Playwright Chromium:**
   ```bash
   npx playwright install --with-deps chromium
   ```

3. **Build the application:**
   ```bash
   npm run build
   ```

4. **Restart PM2:**
   ```bash
   pm2 restart aplus-center --update-env
   ```

5. **Verify Playwright is working:**
   ```bash
   # Check PM2 logs for any Playwright errors
   pm2 logs aplus-center --lines 50
   ```

## Verification Checklist

1. **Test Regular Timesheet PDF:**
   - Navigate to `/timesheets`
   - Click "Print" on a timesheet with entries
   - PDF should open in new tab and display correctly
   - Check network tab: status 200, size > 20KB
   - Check server logs: `[PLAYWRIGHT_PDF]` and `[TIMESHEET_PDF_PLAYWRIGHT]` entries

2. **Test BCBA Timesheet PDF:**
   - Navigate to `/bcba-timesheets`
   - Click "Print" on a BCBA timesheet with entries
   - PDF should open and display correctly
   - Check server logs for successful generation

3. **Test Email Queue:**
   - Queue a timesheet for email
   - Click "Send All Queued" or "Send Selected"
   - Email should send successfully with PDF attachment
   - Check server logs: no "Failed to generate PDF" errors

4. **Test Error Handling:**
   - Try printing a timesheet with no entries
   - Should return 400 JSON with `NO_ROWS_TO_PRINT` error
   - Unauthorized access should return 401 JSON (not redirect)

## Smoke Test Script

Use the provided script to test PDF generation:

```bash
# Make script executable
chmod +x scripts/test-timesheet-pdf.sh

# Test with a timesheet ID (replace with actual ID)
./scripts/test-timesheet-pdf.sh <TIMESHEET_ID> [SESSION_TOKEN]

# Example:
./scripts/test-timesheet-pdf.sh cmk62vvhp0001ag6xqg6sho8m
```

The script will:
- Fetch the PDF from the API
- Save to `/tmp/test-timesheet.pdf`
- Verify file size > 20KB
- Verify PDF header is correct
- Print success/failure status

## Logging

PDF generation logs include:
- `[PLAYWRIGHT_PDF]` - Browser launch and PDF generation
- `[TIMESHEET_PDF_PLAYWRIGHT]` - Timesheet-specific PDF generation
- `[TIMESHEET_PDF_ROUTE]` - API route handling (regular timesheets)
- `[BCBA_TIMESHEET_PDF_ROUTE]` - API route handling (BCBA timesheets)

Each log entry includes:
- Correlation ID for tracking
- Route type (regular/bcba)
- Timesheet ID
- User ID and role
- Entries count
- Generated PDF bytes length
- Response status

## Troubleshooting

**Issue: Playwright fails to launch Chromium**
- Solution: Install system dependencies (see above)
- Check: `npx playwright install-deps chromium`

**Issue: PDF is too small (< 20KB)**
- Check: Timesheet has entries
- Check: HTML template is generating correctly
- Check: Server logs for errors

**Issue: PDF generation is slow**
- First PDF takes longer (browser startup)
- Subsequent PDFs reuse browser instance (faster)
- If consistently slow, check server resources

**Issue: Email Queue fails with "Failed to generate PDF"**
- Check: Playwright is installed correctly
- Check: System dependencies are installed
- Check: PM2 logs for detailed error messages

## Files Changed

- `package.json` - Added `playwright` dependency
- `lib/pdf/timesheetHtmlTemplate.ts` - HTML template for PDFs
- `lib/pdf/playwrightPDF.ts` - Playwright PDF renderer with browser singleton
- `lib/pdf/playwrightTimesheetPDF.ts` - Timesheet PDF generator using Playwright
- `app/api/timesheets/[id]/pdf/route.ts` - Updated to use Playwright
- `app/api/bcba-timesheets/[id]/pdf/route.ts` - Updated to use Playwright
- `app/api/email-queue/send-batch/route.ts` - Updated to use Playwright
- `app/api/email-queue/send-selected/route.ts` - Updated to use Playwright
- `scripts/test-timesheet-pdf.sh` - Smoke test script

## Notes

- Browser instance is reused (singleton) for performance
- Browser closes gracefully on process exit (SIGTERM/SIGINT)
- PDF validation: Must be > 20KB and start with `%PDF`
- HTML template matches `TimesheetPrintPreview` modal layout exactly
- All PDFs use Letter size with 0.5in margins
