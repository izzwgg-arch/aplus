#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_v2.log
exec > $LOG 2>&1
echo "=== Extract ==="
cd $B
tar -xzf /tmp/deploy_bundle_v2.tar.gz
echo "=== Prisma db push ==="
npx prisma db push --accept-data-loss
echo "=== Prisma generate ==="
npx prisma generate
echo "=== npm install ==="
npm install --legacy-peer-deps 2>&1 | tail -5
echo "=== Build ==="
npm run build
echo "=== PM2 restart ==="
pm2 restart smart-steps || pm2 start npm --name smart-steps -- run start
echo "=== DONE ==="