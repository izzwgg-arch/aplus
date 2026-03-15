#!/bin/bash
# Smoke test script for timesheet PDF generation
# Usage: ./scripts/test-timesheet-pdf.sh <TIMESHEET_ID> [SESSION_TOKEN]

TIMESHEET_ID=$1
SESSION_TOKEN=$2

if [ -z "$TIMESHEET_ID" ]; then
  echo "Usage: $0 <TIMESHEET_ID> [SESSION_TOKEN]"
  echo "Example: $0 cmk62vvhp0001ag6xqg6sho8m"
  exit 1
fi

OUTPUT_FILE="/tmp/test-timesheet.pdf"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

echo "=== Testing Timesheet PDF Generation ==="
echo "Timesheet ID: $TIMESHEET_ID"
echo "Output: $OUTPUT_FILE"
echo ""

# Try BCBA endpoint first (works for both)
if [ -n "$SESSION_TOKEN" ]; then
  echo "Testing with authentication..."
  HTTP_CODE=$(curl -s -o "$OUTPUT_FILE" -w "%{http_code}" \
    -H "Cookie: next-auth.session-token=$SESSION_TOKEN" \
    "$BASE_URL/api/bcba-timesheets/$TIMESHEET_ID/pdf")
else
  echo "Testing without authentication (will likely fail)..."
  HTTP_CODE=$(curl -s -o "$OUTPUT_FILE" -w "%{http_code}" \
    "$BASE_URL/api/bcba-timesheets/$TIMESHEET_ID/pdf")
fi

echo ""
echo "HTTP Status: $HTTP_CODE"

if [ -f "$OUTPUT_FILE" ]; then
  FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null || echo "unknown")
  echo "File size: $FILE_SIZE bytes"
  
  if [ "$HTTP_CODE" = "200" ]; then
    # Check if it's a PDF
    PDF_HEADER=$(head -c 4 "$OUTPUT_FILE" 2>/dev/null)
    if [ "$PDF_HEADER" = "%PDF" ]; then
      echo "✓ Valid PDF file"
      if [ "$FILE_SIZE" -gt 20000 ] 2>/dev/null; then
        echo "✓ PDF size OK (>20KB)"
        echo ""
        echo "Success! PDF saved to $OUTPUT_FILE"
        exit 0
      else
        echo "✗ PDF too small (<20KB)"
        exit 1
      fi
    else
      echo "✗ Not a valid PDF (header: $PDF_HEADER)"
      echo "First 200 bytes:"
      head -c 200 "$OUTPUT_FILE" | cat -A
      exit 1
    fi
  else
    echo "✗ Request failed (HTTP $HTTP_CODE)"
    echo "Response:"
    cat "$OUTPUT_FILE"
    exit 1
  fi
else
  echo "✗ Output file not created"
  exit 1
fi
