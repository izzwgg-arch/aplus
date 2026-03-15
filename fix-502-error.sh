#!/bin/bash
# Fix 502 Bad Gateway Error

cd /var/www/aplus-center

echo "=== Fixing 502 Error ==="
echo ""

echo "1. Stopping PM2..."
pm2 stop aplus-center

echo ""
echo "2. Re-extracting all files..."
unzip -o /tmp/aplus-center-payroll.zip -d /var/www/aplus-center >/dev/null 2>&1

echo ""
echo "3. Installing dependencies..."
npm install --production 2>&1 | tail -3

echo ""
echo "4. Generating Prisma Client..."
npx prisma generate 2>&1 | tail -2

echo ""
echo "5. Removing old build..."
rm -rf .next

echo ""
echo "6. Building application..."
npm run build 2>&1 | tail -30

echo ""
echo "7. Starting PM2..."
pm2 start aplus-center || pm2 restart aplus-center

echo ""
echo "8. Waiting for startup..."
sleep 5

echo ""
echo "9. Checking status..."
pm2 status

echo ""
echo "10. Recent logs:"
pm2 logs aplus-center --lines 10 --nostream

echo ""
echo "✅ Fix complete!"
