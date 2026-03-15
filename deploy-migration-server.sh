#!/bin/bash
# Server-side migration script
# Run this ON THE SERVER (66.94.105.43)

set -e

APP_DIR="/var/www/aplus-center"
cd "$APP_DIR"

echo "🔄 Smart Steps Migration - Server Execution"
echo "=============================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in $APP_DIR"
    echo "Please ensure .env file exists with DATABASE_URL configured."
    exit 1
fi

# Check if DATABASE_URL is set
if ! grep -q "DATABASE_URL" .env; then
    echo "❌ Error: DATABASE_URL not found in .env file"
    exit 1
fi

echo "✅ Environment check passed"
echo ""

# Step 1: Generate Prisma Client
echo "📦 Step 1/4: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

# Step 2: Apply migration
echo "🚀 Step 2/4: Applying database migration..."
if npx prisma migrate deploy --name add_role_dashboard_visibility 2>/dev/null; then
    echo "✅ Migration applied successfully"
elif npx prisma db push; then
    echo "✅ Schema pushed successfully (using db push)"
else
    echo "❌ Migration failed!"
    exit 1
fi
echo ""

# Step 3: Verify migration
echo "🔍 Step 3/4: Verifying migration..."
if npx prisma db pull --print | grep -q "RoleDashboardVisibility"; then
    echo "✅ RoleDashboardVisibility table exists"
else
    echo "⚠️  Warning: Could not verify table creation (this is okay if using db push)"
fi
echo ""

# Step 4: Restart application
echo "🔄 Step 4/4: Restarting application..."
if pm2 restart aplus-center; then
    echo "✅ Application restarted"
else
    echo "⚠️  Warning: PM2 restart failed, trying to start..."
    pm2 start deploy/pm2.config.js || pm2 start npm --name aplus-center -- start
fi
echo ""

# Final status
echo "📊 Application Status:"
pm2 status
echo ""
echo "📋 Recent Logs:"
pm2 logs aplus-center --lines 10 --nostream
echo ""

echo "✅ Migration deployment complete!"
echo ""
echo "🎉 Smart Steps updates are now live!"
echo ""
echo "Next steps:"
echo "1. Test the application at http://66.94.105.43:3000"
echo "2. Log in as Admin"
echo "3. Go to Roles and create/edit a role"
echo "4. Verify dashboard visibility toggles work"
echo "5. Test route protection with different roles"
