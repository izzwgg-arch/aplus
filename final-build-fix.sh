#!/bin/bash
# Final Build Fix

cd /var/www/aplus-center

echo "=== FINAL BUILD FIX ==="
echo ""

echo "1. Clearing all caches..."
rm -rf .next
rm -rf node_modules/.cache
rm -f tsconfig.tsbuildinfo

echo ""
echo "2. Verifying TimeFieldAMPM file..."
if [ -f components/timesheets/TimeFieldAMPM.tsx ]; then
    echo "✅ TimeFieldAMPM.tsx exists"
else
    echo "❌ MISSING - uploading..."
    exit 1
fi

echo ""
echo "3. Checking and fixing import..."
IMPORT_LINE=$(grep "TimeFieldAMPM" components/timesheets/TimesheetForm.tsx | head -1)
echo "Current: $IMPORT_LINE"

if echo "$IMPORT_LINE" | grep -q "./TimeFieldAMPM"; then
    echo "Fixing import path..."
    sed -i "s|from './TimeFieldAMPM'|from '@/components/timesheets/TimeFieldAMPM'|g" components/timesheets/TimesheetForm.tsx
    echo "✅ Import fixed"
else
    echo "✅ Import already correct"
fi

echo ""
echo "4. Verifying fixed import..."
grep "TimeFieldAMPM" components/timesheets/TimesheetForm.tsx | head -1

echo ""
echo "5. Building application..."
npm run build 2>&1 | tee /tmp/final-build.log

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "6. Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    echo "✅ Application is running!"
else
    echo ""
    echo "❌ BUILD FAILED"
    echo "Last 30 lines:"
    tail -30 /tmp/final-build.log
    exit 1
fi
