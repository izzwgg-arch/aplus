#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_v7.log
exec > $LOG 2>&1
echo "=== Start $(date) ==="

cd $B
echo "=== Extract ==="
tar -xzf /tmp/deploy_bundle_v7.tar.gz

echo "=== Prisma generate ==="
DATABASE_URL="postgresql://aba_user:abapass123@localhost:5432/aba_db?schema=public" npx prisma generate 2>&1

echo "=== Build ==="
npm run build 2>&1

echo "=== PM2 restart ==="
pm2 restart smart-steps --update-env

echo "=== DONE $(date) ==="