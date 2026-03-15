#!/bin/bash
# Complete Build Fix - Step by Step

set -e

cd /var/www/aplus-center

echo "=== COMPLETE BUILD FIX ==="
echo ""

echo "Step 1: Stopping PM2..."
pm2 stop aplus-center || true

echo ""
echo "Step 2: Removing old build..."
rm -rf .next

echo ""
echo "Step 3: Re-extracting all files..."
unzip -o /tmp/aplus-center-payroll.zip -d /var/www/aplus-center >/dev/null 2>&1

echo ""
echo "Step 4: Verifying critical files..."
if [ -f components/DashboardNav.tsx ]; then
    echo "✅ DashboardNav.tsx exists"
else
    echo "❌ DashboardNav.tsx MISSING - checking archive..."
    unzip -l /tmp/aplus-center-payroll.zip | grep DashboardNav || echo "Not in archive!"
fi

if [ -f lib/utils.ts ]; then
    echo "✅ utils.ts exists"
else
    echo "❌ utils.ts MISSING"
fi

if [ -f postcss.config.js ]; then
    echo "✅ postcss.config.js exists"
else
    echo "❌ postcss.config.js MISSING"
fi

echo ""
echo "Step 5: Installing ALL dependencies..."
npm install 2>&1 | tail -10

echo ""
echo "Step 6: Generating Prisma Client..."
npx prisma generate 2>&1 | tail -3

echo ""
echo "Step 7: Building application..."
npm run build 2>&1 | tee /tmp/build-final.log

BUILD_EXIT=$?

echo ""
if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "Step 8: Starting PM2..."
    pm2 start aplus-center
    
    echo ""
    echo "Step 9: Waiting for startup..."
    sleep 5
    
    echo ""
    echo "Step 10: Final status..."
    pm2 status
    
    echo ""
    echo "Step 11: Testing application..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
    echo "HTTP Status: $HTTP_CODE"
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
        echo ""
        echo "✅✅✅ APPLICATION IS RUNNING! ✅✅✅"
    else
        echo ""
        echo "⚠️  Application started but may need more time..."
    fi
else
    echo "❌❌❌ BUILD FAILED ❌❌❌"
    echo ""
    echo "Last 30 lines of build log:"
    tail -30 /tmp/build-final.log
    exit 1
fi
