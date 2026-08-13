#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_log.txt
exec > $LOG 2>&1
echo "=== Extracting bundle ==="
cd $B
tar -xzf /tmp/deploy_bundle.tar.gz --overwrite
echo "=== Prisma migrate ==="
npx prisma migrate dev --name add_behavior_plan_interval --skip-seed
echo "=== Prisma generate ==="
npx prisma generate
echo "=== npm build ==="
npm run build
echo "=== pm2 restart ==="
pm2 restart smart-steps
echo "=== DONE ==="
