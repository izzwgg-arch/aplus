#!/bin/bash
# Deployment script for Community Email Queue fixes
# Run this on the server: bash DEPLOY_NOW.sh

set -e

echo "=== Deploying Community Email Queue Fixes ==="

cd /var/www/aplus-center

echo "1. Pulling latest changes..."
git pull origin main

echo "2. Running database migration..."
npx prisma migrate deploy

echo "3. Regenerating Prisma client..."
npx prisma generate

echo "4. Creating upload directory..."
mkdir -p uploads/community-email-attachments
chmod 755 uploads/community-email-attachments

echo "5. Building application..."
npm run build

echo "6. Creating prerender manifest..."
node create-prerender.js

echo "7. Restarting PM2..."
pm2 restart aplus-center

echo "=== Deployment Complete ==="
echo ""
echo "Verification steps:"
echo "1. Check logs: pm2 logs aplus-center --lines 50"
echo "2. Test MAIN queue sends to fixed recipients"
echo "3. Test COMMUNITY queue sends to user-entered recipients"
echo "4. Test attachment upload and inclusion"
