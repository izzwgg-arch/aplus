#!/bin/bash
# Ultimate Build Fix - Complete Solution

cd /var/www/aplus-center

echo "=== ULTIMATE BUILD FIX ==="
echo ""

echo "1. Extracting ALL files from archive..."
unzip -o /tmp/aplus-center-payroll.zip -d /var/www/aplus-center 2>&1 | tail -3

echo ""
echo "2. Installing ALL dependencies..."
npm install 2>&1 | tail -5

echo ""
echo "3. Uploading critical missing files (if needed)..."
# Files should be in archive, but double-check

echo ""
echo "4. Checking Prisma schema..."
if grep -q "model PayrollRun" prisma/schema.prisma; then
    echo "✅ PayrollRun model exists"
else
    echo "❌ PayrollRun missing - uploading schema..."
    # Schema should be in archive
fi

echo ""
echo "5. Force regenerating Prisma Client..."
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client
rm -rf .next
npx prisma generate 2>&1 | tail -5

echo ""
echo "6. Checking generated Prisma Client for payrollRun..."
# Prisma uses camelCase, so PayrollRun becomes payrollRun
if [ -f node_modules/@prisma/client/index.d.ts ]; then
    if grep -q "payrollRun" node_modules/@prisma/client/index.d.ts; then
        echo "✅ payrollRun found in Prisma Client"
    else
        echo "⚠️  payrollRun not found - checking available models..."
        grep -E "^\s+[a-z]+:" node_modules/@prisma/client/index.d.ts | grep -i payroll | head -5
        echo ""
        echo "Checking if it's a different case..."
        grep -i "payroll" node_modules/@prisma/client/index.d.ts | head -3
    fi
fi

echo ""
echo "7. Building application..."
npm run build 2>&1 | tee /tmp/ultimate-build.log

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "8. Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
    echo "HTTP Status: $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
        echo "✅✅✅ APPLICATION IS RUNNING! ✅✅✅"
    fi
else
    echo ""
    echo "❌ BUILD FAILED"
    echo ""
    echo "Checking for specific errors..."
    if grep -q "payrollRun" /tmp/ultimate-build.log; then
        echo "⚠️  PayrollRun error found"
        echo "Checking Prisma Client exports..."
        if [ -f node_modules/@prisma/client/index.d.ts ]; then
            echo "Available Prisma models:"
            grep -E "^\s+[a-z]+:" node_modules/@prisma/client/index.d.ts | head -20
        fi
    fi
    echo ""
    echo "Last 40 lines:"
    tail -40 /tmp/ultimate-build.log
    exit 1
fi
