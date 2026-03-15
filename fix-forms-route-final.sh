#!/bin/bash
# Fix forms/route.ts - Final

cd /var/www/aplus-center

echo "=== Fixing forms/route.ts - Final ==="
echo ""

if [ -f forms/route.ts ]; then
    echo "Fixing year field (year is already a number)..."
    sed -i 's/year: year ? parseInt(year) : undefined,/year: year,/' forms/route.ts
    echo "✅ Fixed"
else
    echo "❌ forms/route.ts not found"
    exit 1
fi

echo ""
echo "Building..."
npm run build 2>&1 | tee /tmp/final-build.log

if [ $? -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "Starting PM2..."
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
    tail -30 /tmp/final-build.log
    exit 1
fi
