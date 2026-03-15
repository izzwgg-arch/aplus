#!/bin/bash
# Complete Migration Deployment Script
# This script handles the entire migration process

set -e

SERVER="root@66.94.105.43"
APP_DIR="/var/www/aplus-center"

echo "🚀 Starting Smart Steps Migration Deployment..."
echo ""

# Step 1: Generate Prisma Client locally (to verify schema)
echo "📦 Step 1: Generating Prisma Client locally..."
npx prisma generate

# Step 2: Create migration file
echo "📝 Step 2: Creating migration files..."
npx prisma migrate dev --create-only --name add_role_dashboard_visibility || echo "Migration files already exist or using db push method"

# Step 3: Instructions for server execution
echo ""
echo "✅ Local preparation complete!"
echo ""
echo "📋 Next: Run these commands on the server:"
echo ""
echo "SSH into server:"
echo "  ssh $SERVER"
echo ""
echo "Then run:"
echo "  cd $APP_DIR"
echo "  npx prisma generate"
echo "  npx prisma migrate deploy --name add_role_dashboard_visibility || npx prisma db push"
echo "  pm2 restart aplus-center"
echo "  pm2 logs aplus-center --lines 20"
echo ""
echo "Or use the automated script:"
echo "  bash <(curl -s https://raw.githubusercontent.com/your-repo/deploy-migration-server.sh)"
echo ""
