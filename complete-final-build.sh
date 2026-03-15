#!/bin/bash
# Complete Final Build

cd /var/www/aplus-center

echo "=== COMPLETE FINAL BUILD ==="
echo ""

echo "1. Extracting all files..."
unzip -o /tmp/aplus-center-payroll.zip -d /var/www/aplus-center 2>&1 | tail -3

echo ""
echo "2. Installing ALL dependencies..."
npm install 2>&1 | tail -5

echo ""
echo "3. Regenerating Prisma..."
rm -rf node_modules/.prisma node_modules/@prisma/client
npx prisma generate 2>&1 | tail -5

echo ""
echo "4. Building application..."
rm -rf .next
npm run build 2>&1 | tee /tmp/complete-final-build.log

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
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
    echo "Last 30 lines:"
    tail -30 /tmp/complete-final-build.log
    exit 1
fi
