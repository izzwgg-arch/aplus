#!/bin/bash
# Final Prisma Regenerate and Build

cd /var/www/aplus-center

echo "=== Regenerating Prisma and Building ==="
echo ""

echo "1. Regenerating Prisma Client..."
npx prisma generate 2>&1 | tail -10

echo ""
echo "2. Building application..."
rm -rf .next
npm run build 2>&1 | tee /tmp/final-prisma-build.log

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "3. Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    echo "✅ Application is running!"
else
    echo ""
    echo "❌ BUILD FAILED"
    echo "Last 30 lines:"
    tail -30 /tmp/final-prisma-build.log
    exit 1
fi
