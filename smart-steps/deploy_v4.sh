#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_v4.log
exec > $LOG 2>&1
echo "=== Extract v3 bundle ==="
cd $B
tar -xzf /tmp/deploy_bundle_v3.tar.gz
echo "=== Prisma generate ==="
npx prisma generate
echo "=== Build ==="
npm run build
echo "=== PM2 restart ==="
pm2 restart smart-steps
echo "=== DONE ==="