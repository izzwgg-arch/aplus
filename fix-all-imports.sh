#!/bin/bash
# Fix All Import Issues

cd /var/www/aplus-center

echo "=== Fixing All Import Issues ==="
echo ""

echo "1. Fixing playwrightTimesheetPDF.ts..."
if [ -f playwrightTimesheetPDF.ts ]; then
    sed -i "s|from './playwrightPDF'|from '@/lib/pdf/playwrightPDF'|g" playwrightTimesheetPDF.ts
    echo "✅ Fixed"
fi

echo ""
echo "2. Building..."
npm run build 2>&1 | tee /tmp/fix-imports-build.log

if [ $? -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "3. Starting PM2..."
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
    echo "Checking for more errors..."
    grep -i "error\|cannot find" /tmp/fix-imports-build.log | head -10
    tail -30 /tmp/fix-imports-build.log
    exit 1
fi
