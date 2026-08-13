#!/bin/bash
LOG=/tmp/migrate.log
exec > $LOG 2>&1
echo "Checking env..."
cat /var/www/aplus/aplus-center-scheduling/smart-steps/.env.local | grep -v SECRET | grep -v APLUS
echo "Running db push..."
cd /var/www/aplus/aplus-center-scheduling/smart-steps
npx prisma db push --accept-data-loss 2>&1
echo "DONE"