#!/bin/bash
# Fix Root TimesheetForm.tsx

cd /var/www/aplus-center

echo "=== Fixing Root TimesheetForm.tsx ==="
echo ""

if [ -f TimesheetForm.tsx ]; then
    echo "Found root TimesheetForm.tsx"
    echo "Fixing import..."
    sed -i "s|from './TimeFieldAMPM'|from '@/components/timesheets/TimeFieldAMPM'|g" TimesheetForm.tsx
    echo "✅ Fixed"
    echo ""
    echo "Verifying:"
    grep "TimeFieldAMPM" TimesheetForm.tsx | head -1
else
    echo "No root TimesheetForm.tsx found"
fi

echo ""
echo "Building..."
rm -rf .next
npm run build 2>&1 | tail -50

if [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESS! ✅✅✅"
    pm2 start aplus-center
    sleep 5
    pm2 status
else
    echo ""
    echo "❌ Build failed"
    exit 1
fi
