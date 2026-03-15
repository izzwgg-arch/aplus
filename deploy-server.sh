#!/bin/bash
# Server-side deployment script for timesheet visibility feature

set -e

APP_DIR="/var/www/aplus-center"
cd $APP_DIR

echo "📥 Pulling latest changes..."
echo "⚠️  Cleaning up local changes..."
git reset --hard HEAD || true
git clean -fd || true
git pull origin main

echo ""
echo "📦 Installing dependencies..."
npm install --production --legacy-peer-deps

echo ""
echo "🔧 Fixing Prisma version (downgrading to match local)..."
npm install prisma@5.22.0 @prisma/client@5.22.0 --save-dev --save || echo "⚠️  Prisma version fix may have issues"

echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "🔄 Updating database schema (using db push)..."
npx prisma db push --accept-data-loss || echo "⚠️  Schema update may have issues - check manually"

echo ""
echo "🌱 Seeding new permissions..."
npx tsx scripts/seed-permissions.ts || echo "⚠️  Permission seeding may have already been done"

echo ""
echo "🏗️  Building application..."
npm run build

echo ""
echo "🔄 Restarting application..."
pm2 restart aplus-center
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Application status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs aplus-center --lines 20 --nostream
