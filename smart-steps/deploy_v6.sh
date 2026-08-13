#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_v6.log
exec > $LOG 2>&1
echo "=== Start $(date) ==="

echo "=== Extract ==="
cd $B
tar -xzf /tmp/deploy_bundle_v6.tar.gz

echo "=== Check DATABASE_URL ==="
if [ -f .env.local ]; then
  grep DATABASE_URL .env.local | head -1
else
  echo "No .env.local"
fi

echo "=== Prisma db push ==="
npx prisma db push --accept-data-loss 2>&1

echo "=== Prisma generate ==="
npx prisma generate 2>&1

echo "=== Build ==="
npm run build 2>&1

echo "=== PM2 restart ==="
pm2 restart smart-steps

echo "=== DONE $(date) ==="