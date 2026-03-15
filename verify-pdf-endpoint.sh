#!/bin/bash
echo "=== PHASE 4 VERIFICATION ==="
echo ""

# Get a timesheet ID from database
echo "Getting a timesheet ID from database..."
TIMESHEET_ID=$(psql -U postgres -d apluscenter -t -c "SELECT id FROM \"Timesheet\" WHERE \"deletedAt\" IS NULL LIMIT 1;" 2>/dev/null | tr -d ' ')

if [ -z "$TIMESHEET_ID" ]; then
  echo "ERROR: No timesheet found in database"
  exit 1
fi

echo "Found timesheet ID: $TIMESHEET_ID"
echo ""

# Test PDF endpoint
echo "Testing PDF endpoint..."
curl -i -s -o /tmp/test-timesheet-pdf.pdf \
  -w "\nHTTP_CODE:%{http_code}\nCONTENT_TYPE:%{content_type}\n" \
  "http://127.0.0.1:3000/api/timesheets/$TIMESHEET_ID/pdf" 2>&1 | head -15

echo ""
echo "Checking if file starts with %PDF:"
if [ -f /tmp/test-timesheet-pdf.pdf ]; then
  head -c 4 /tmp/test-timesheet-pdf.pdf
  echo ""
  echo "File size:"
  ls -lh /tmp/test-timesheet-pdf.pdf | awk '{print $5}'
else
  echo "File not created (likely 401/403 - auth required)"
fi
