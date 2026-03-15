#!/bin/bash
# Migration script to run on server: 66.94.105.43
# Run: ssh root@66.94.105.43 'bash -s' < run-migration-on-server.sh
# Or copy this file to server and run: bash run-migration-on-server.sh

set -e

echo "🔄 Running database migration on server..."

# Navigate to app directory
cd /var/www/aplus-center

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env file with DATABASE_URL before running migration."
    exit 1
fi

# Generate Prisma Client (in case schema changed)
echo "📦 Generating Prisma Client..."
npx prisma generate

# Run migration
echo "🚀 Running migration: add_role_dashboard_visibility..."
npx prisma migrate deploy --name add_role_dashboard_visibility || npx prisma db push

# Verify migration
echo "✅ Migration complete!"
echo "📊 Verifying schema..."
npx prisma db pull --print

echo ""
echo "✅ Database migration completed successfully!"
echo "🔄 Next: Restart the application with: pm2 restart aplus-center"
