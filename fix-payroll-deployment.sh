#!/bin/bash
# Fix Payroll Deployment

cd /var/www/aplus-center

echo "=== Fixing Payroll Deployment ==="
echo ""

echo "1. Extracting archive..."
unzip -o /tmp/aplus-center-payroll.zip -d /var/www/aplus-center

echo ""
echo "2. Applying database schema..."
npx prisma db push --accept-data-loss

echo ""
echo "3. Generating Prisma Client..."
npx prisma generate

echo ""
echo "4. Removing old build..."
rm -rf .next

echo ""
echo "5. Building application..."
npm run build

echo ""
echo "6. Restarting PM2..."
pm2 restart aplus-center

echo ""
echo "✅ Deployment fixed!"
