#!/bin/bash

# Deploy Payroll Module to Server
# Run this script on the server after uploading aplus-center-payroll.zip

set -e

APP_DIR="/var/www/aplus-center"
ZIP_FILE="/tmp/aplus-center-payroll.zip"

echo "🚀 Deploying Payroll Module..."

# Check if zip file exists
if [ ! -f "$ZIP_FILE" ]; then
  echo "❌ Error: $ZIP_FILE not found!"
  echo "Please upload the zip file first:"
  echo "  scp aplus-center-payroll.zip root@66.94.105.43:/tmp/"
  exit 1
fi

cd "$APP_DIR"

# Backup current .next if exists
if [ -d ".next" ]; then
  echo "📦 Backing up current build..."
  mv .next .next.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new version
echo "📦 Extracting new version..."
unzip -o "$ZIP_FILE" -d "$APP_DIR" 2>/dev/null || {
  echo "❌ Error extracting zip file"
  exit 1
}

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Generate Prisma Client
echo "🔨 Generating Prisma Client..."
npx prisma generate

# Apply database schema
echo "🔄 Applying database schema..."
npx prisma db push

# Build application
echo "🏗️  Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart aplus-center || pm2 start npm --name aplus-center -- start

# Check status
echo "✅ Deployment complete!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📝 Recent logs:"
pm2 logs aplus-center --lines 20 --nostream

echo ""
echo "✅ Payroll Module deployed successfully!"
echo "💡 Don't forget to install Playwright for PDF generation:"
echo "   npx playwright install --with-deps chromium"
