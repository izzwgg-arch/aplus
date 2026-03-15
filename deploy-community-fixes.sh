#!/bin/bash
# Deploy Community Classes Invoice & Client Fixes
# This script deploys the medicaidId field and email queue improvements

set -e

SERVER_USER="root"
SERVER_HOST="66.94.105.43"
SERVER_PATH="/var/www/aplus-center"
SSH_KEY="$HOME/.ssh/id_ed25519_smartsteps"

echo "🚀 Deploying Community Classes fixes..."

# Copy schema file
echo "📋 Copying Prisma schema..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes prisma/schema.prisma "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/prisma/schema.prisma"

# Copy API routes
echo "📁 Copying API routes..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes app/api/community/clients/route.ts "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/app/api/community/clients/route.ts"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes app/api/community/clients/\[id\]/route.ts "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/app/api/community/clients/[id]/route.ts"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes app/api/community/email-queue/route.ts "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/app/api/community/email-queue/route.ts"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes app/api/community/email-queue/send-batch/route.ts "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/app/api/community/email-queue/send-batch/route.ts"

# Copy new remove route
echo "📁 Copying new remove route..."
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER_USER@$SERVER_HOST" "mkdir -p $SERVER_PATH/app/api/community/email-queue/[id]/remove"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes app/api/community/email-queue/\[id\]/remove/route.ts "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/app/api/community/email-queue/[id]/remove/route.ts"

# Copy components
echo "📁 Copying components..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes components/community/CommunityClientForm.tsx "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/components/community/CommunityClientForm.tsx"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes components/community/CommunityInvoicePrintPreview.tsx "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/components/community/CommunityInvoicePrintPreview.tsx"

# Copy pages
echo "📁 Copying pages..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes app/community/email-queue/page.tsx "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/app/community/email-queue/page.tsx"

# Copy PDF generator
echo "📁 Copying PDF generator..."
scp -i "$SSH_KEY" -o IdentitiesOnly=yes lib/pdf/communityInvoicePDFGenerator.ts "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/lib/pdf/communityInvoicePDFGenerator.ts"

echo "✅ Files copied successfully!"
echo ""
echo "📝 Next steps on server:"
echo "1. Run database migration to add medicaidId column"
echo "2. Regenerate Prisma client: npx prisma generate"
echo "3. Rebuild application: npm run build"
echo "4. Restart PM2: pm2 restart aplus-center"
