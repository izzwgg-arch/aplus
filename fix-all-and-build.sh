#!/bin/bash
# Fix All Issues and Build

set -e

cd /var/www/aplus-center

echo "=== FIXING ALL ISSUES AND BUILDING ==="
echo ""

echo "Step 1: Extracting ALL files..."
unzip -o /tmp/aplus-center-payroll.zip -d /var/www/aplus-center 2>&1 | tail -5

echo ""
echo "Step 2: Installing ALL dependencies..."
npm install 2>&1 | tail -10

echo ""
echo "Step 3: Installing missing packages..."
npm install iconv-lite 2>&1 | tail -3

echo ""
echo "Step 4: Checking critical files..."
if [ -f components/DashboardNav.tsx ]; then
    echo "✅ DashboardNav.tsx"
else
    echo "❌ DashboardNav.tsx MISSING"
fi

if [ -f lib/utils.ts ]; then
    echo "✅ lib/utils.ts"
else
    echo "❌ lib/utils.ts MISSING"
fi

if [ -f components/TimeFieldAMPM.tsx ]; then
    echo "✅ TimeFieldAMPM.tsx"
else
    echo "❌ TimeFieldAMPM.tsx MISSING"
fi

echo ""
echo "Step 5: Removing old build..."
rm -rf .next

echo ""
echo "Step 6: Building application..."
npm run build

if [ $? -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "Step 7: Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    echo "✅ Application should be running!"
else
    echo ""
    echo "❌ BUILD FAILED"
    exit 1
fi
