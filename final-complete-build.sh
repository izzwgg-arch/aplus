#!/bin/bash
# Final Complete Build

cd /var/www/aplus-center

echo "=== FINAL COMPLETE BUILD ==="
echo ""

echo "1. Installing tailwindcss..."
npm install tailwindcss postcss autoprefixer 2>&1 | tail -3

echo ""
echo "2. Verifying Prisma Client has payrollRun..."
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log('payrollRun exists:', 'payrollRun' in p ? 'YES' : 'NO');" 2>&1

echo ""
echo "3. Building application..."
rm -rf .next
npm run build 2>&1 | tee /tmp/final-complete-build.log

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "4. Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "000")
    echo "HTTP Status: $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
        echo ""
        echo "✅✅✅ APPLICATION IS RUNNING! ✅✅✅"
    fi
else
    echo ""
    echo "❌ BUILD FAILED"
    echo "Last 40 lines:"
    tail -40 /tmp/final-complete-build.log
    exit 1
fi
