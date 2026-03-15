#!/bin/bash
# Deployment script for BCBA Forms feature
# Run this on the server: bash deploy-bcba-forms.sh

set -e

echo "=== Deploying BCBA Forms Feature ==="

cd /var/www/aplus-center

echo "1. Pulling latest changes..."
git pull origin main || echo "Git pull skipped (not a git repo or no changes)"

echo "2. Running database migration..."
psql $DATABASE_URL -f prisma/migrations/add_bcba_forms.sql || {
    echo "Migration file not found, trying Prisma migrate..."
    npx prisma migrate deploy
}

echo "3. Seeding permissions..."
npx tsx scripts/seed-permissions.ts

echo "4. Regenerating Prisma client..."
npx prisma generate

echo "5. Building application..."
rm -rf .next
npm run build

echo "6. Restarting PM2..."
pm2 restart aplus-center

echo "=== Deployment Complete ==="
echo ""
echo "Verification steps:"
echo "1. Check logs: pm2 logs aplus-center --lines 50"
echo "2. Navigate to /bcbas and click 'Forms' button"
echo "3. Test creating a form entry"
echo "4. Verify permissions are set correctly"
