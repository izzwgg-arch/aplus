#!/bin/bash
echo "=== TESTING PDF ROUTE ==="
echo ""

# Get a timesheet ID with entries
echo "Finding timesheet with entries..."
TIMESHEET_ID=$(psql -U postgres -d apluscenter -t -c "SELECT t.id FROM \"Timesheet\" t WHERE t.\"deletedAt\" IS NULL AND (SELECT COUNT(*) FROM \"TimesheetEntry\" e WHERE e.\"timesheetId\" = t.id) > 0 LIMIT 1;" 2>/dev/null | tr -d ' ')

if [ -z "$TIMESHEET_ID" ]; then
  echo "ERROR: No timesheet with entries found"
  exit 1
fi

echo "Found timesheet ID: $TIMESHEET_ID"
echo ""

# Check entry count
ENTRY_COUNT=$(psql -U postgres -d apluscenter -t -c "SELECT COUNT(*) FROM \"TimesheetEntry\" WHERE \"timesheetId\" = '$TIMESHEET_ID';" 2>/dev/null | tr -d ' ')
echo "Entry count: $ENTRY_COUNT"
echo ""

# Test PDF route (will fail auth but we can check response)
echo "Testing PDF route..."
curl -s -o /tmp/test-pdf.pdf -w "\nHTTP_CODE:%{http_code}\nCONTENT_TYPE:%{content_type}\n" "http://127.0.0.1:3000/api/timesheets/$TIMESHEET_ID/pdf" 2>&1 | tail -5

echo ""
if [ -f /tmp/test-pdf.pdf ]; then
  FILE_SIZE=$(ls -lh /tmp/test-pdf.pdf | awk '{print $5}')
  BYTE_SIZE=$(stat -c%s /tmp/test-pdf.pdf 2>/dev/null || stat -f%z /tmp/test-pdf.pdf 2>/dev/null)
  echo "File size: $FILE_SIZE ($BYTE_SIZE bytes)"
  echo "First 4 bytes: $(head -c 4 /tmp/test-pdf.pdf)"
  echo ""
  if [ "$BYTE_SIZE" -lt 15000 ]; then
    echo "⚠️  WARNING: PDF is too small (<15KB)"
    echo "First 200 bytes (hex):"
    head -c 200 /tmp/test-pdf.pdf | xxd -l 200 | head -10
  else
    echo "✅ PDF size looks good (>15KB)"
  fi
else
  echo "File not created (likely auth error)"
fi
