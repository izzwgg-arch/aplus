#!/bin/bash

# Community Classes Module Deployment Script
# Run this on your production server

set -e  # Exit on error

echo "🚀 Starting Community Classes Module Deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Pull latest code (if using git)
echo -e "${YELLOW}Step 1: Pulling latest code...${NC}"
if [ -d ".git" ]; then
    git pull origin main || git pull origin master
    echo -e "${GREEN}✓ Code pulled${NC}"
else
    echo -e "${YELLOW}⚠ Not a git repository, skipping pull${NC}"
fi
echo ""

# Step 2: Install dependencies
echo -e "${YELLOW}Step 2: Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Run database migration
echo -e "${YELLOW}Step 3: Running database migration...${NC}"
echo "This will create CommunityClient, CommunityClass, and CommunityInvoice tables"
npx prisma migrate deploy
echo -e "${GREEN}✓ Migration completed${NC}"
echo ""

# Step 4: Regenerate Prisma client
echo -e "${YELLOW}Step 4: Regenerating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Prisma client regenerated${NC}"
echo ""

# Step 5: Seed permissions (optional - won't fail if already exists)
echo -e "${YELLOW}Step 5: Seeding permissions...${NC}"
if npm run seed-permissions 2>/dev/null; then
    echo -e "${GREEN}✓ Permissions seeded${NC}"
else
    echo -e "${YELLOW}⚠ Permission seeding skipped (may already exist)${NC}"
fi
echo ""

# Step 6: Build application
echo -e "${YELLOW}Step 6: Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 7: Restart PM2
echo -e "${YELLOW}Step 7: Restarting PM2...${NC}"
if pm2 list | grep -q "a-plus-center"; then
    pm2 restart a-plus-center
    echo -e "${GREEN}✓ PM2 restarted${NC}"
else
    echo -e "${YELLOW}⚠ PM2 app 'a-plus-center' not found. Please restart manually.${NC}"
    echo "Available PM2 apps:"
    pm2 list
fi
echo ""

# Step 8: Show status
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Check PM2 logs: pm2 logs a-plus-center"
echo "2. Visit the application in your browser"
echo "3. Check main dashboard for 'Community Classes' tile"
echo "4. Navigate to /community to test the module"
echo ""
echo "For detailed testing checklist, see DEPLOY_COMMUNITY_CLASSES.md"
