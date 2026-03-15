#!/bin/bash
# Fix permissions.ts import

cd /var/www/aplus-center

echo "=== Fixing permissions.ts ==="
echo ""

if [ -f permissions.ts ]; then
    echo "Fixing import path..."
    sed -i "s|from './prisma'|from '@/lib/prisma'|g" permissions.ts
    echo "✅ Fixed"
else
    echo "❌ permissions.ts not found"
    exit 1
fi

echo ""
echo "Building..."
npm run build 2>&1 | tail -30

if [ $? -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    pm2 start aplus-center
    sleep 5
    pm2 status
else
    echo ""
    echo "❌ BUILD FAILED"
    exit 1
fi
