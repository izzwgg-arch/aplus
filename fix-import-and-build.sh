#!/bin/bash
# Fix Import and Build

cd /var/www/aplus-center

echo "=== Fixing Import and Building ==="
echo ""

echo "1. Checking TimeFieldAMPM file..."
if [ -f components/timesheets/TimeFieldAMPM.tsx ]; then
    echo "✅ TimeFieldAMPM.tsx exists"
else
    echo "❌ TimeFieldAMPM.tsx MISSING"
    exit 1
fi

echo ""
echo "2. Fixing import in TimesheetForm.tsx..."
sed -i "s|from './TimeFieldAMPM'|from '@/components/timesheets/TimeFieldAMPM'|g" components/timesheets/TimesheetForm.tsx
echo "Import path fixed"

echo ""
echo "3. Removing old build..."
rm -rf .next

echo ""
echo "4. Building application..."
npm run build

if [ $? -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "5. Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    echo "✅ Application is running!"
else
    echo ""
    echo "❌ BUILD FAILED"
    exit 1
fi
