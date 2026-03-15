#!/bin/bash
# Deploy all code changes to server

set -e

SERVER="root@66.94.105.43"
APP_DIR="/var/www/aplus-center"

echo "🚀 Deploying Smart Steps code changes to server..."

# Files to update (key files that changed)
FILES=(
  "app/layout.tsx"
  "app/login/page.tsx"
  "app/dashboard/page.tsx"
  "components/DashboardNav.tsx"
  "components/dashboard/DashboardStats.tsx"
  "components/roles/RoleForm.tsx"
  "lib/email.ts"
  "lib/permissions.ts"
  "app/api/roles/route.ts"
  "app/api/roles/[id]/route.ts"
  "app/api/roles/[id]/dashboard-visibility/route.ts"
  "app/providers/page.tsx"
  "app/clients/page.tsx"
  "app/timesheets/page.tsx"
  "app/invoices/page.tsx"
  "app/reports/page.tsx"
  "app/analytics/page.tsx"
  "app/bcbas/page.tsx"
  "app/insurance/page.tsx"
  "prisma/schema.prisma"
)

# Create temp directory for files
TEMP_DIR=$(mktemp -d)
echo "📦 Preparing files in $TEMP_DIR"

# Copy files
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    dir=$(dirname "$file")
    mkdir -p "$TEMP_DIR/$dir"
    cp "$file" "$TEMP_DIR/$file"
    echo "  ✅ $file"
  else
    echo "  ⚠️  $file not found"
  fi
done

# Create archive
cd "$TEMP_DIR"
tar -czf /tmp/smart-steps-updates.tar.gz .

# Upload to server
echo "📤 Uploading to server..."
scp /tmp/smart-steps-updates.tar.gz $SERVER:/tmp/

# Extract and rebuild on server
echo "🔧 Extracting and rebuilding on server..."
ssh $SERVER << 'ENDSSH'
set -e
cd /var/www/aplus-center

# Backup current build
if [ -d ".next" ]; then
  mv .next .next.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new files
tar -xzf /tmp/smart-steps-updates.tar.gz
rm /tmp/smart-steps-updates.tar.gz

# Generate Prisma Client
npx prisma generate

# Rebuild application
npm run build

# Recreate prerender manifest if needed
if [ ! -f ".next/prerender-manifest.json" ]; then
  node create-prerender.js || echo "⚠️  Could not create prerender manifest"
fi

# Restart PM2
pm2 restart aplus-center || pm2 start deploy/pm2.config.js

echo "✅ Deployment complete!"
pm2 status
ENDSSH

# Cleanup
rm -rf "$TEMP_DIR"
rm -f /tmp/smart-steps-updates.tar.gz

echo "✅ Code deployment complete!"
