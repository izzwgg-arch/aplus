#!/bin/bash
# Smart Steps ABA Tracker — Production Deploy Script
# Run this from the project root: bash aplus-center-scheduling/smart-steps/deploy.sh

SERVER="root@91.229.245.143"
REMOTE="/var/www/aplus/aplus-center-scheduling/smart-steps"

echo "=== Copying updated source files to server ==="

# Core library files
scp src/lib/masteryEngine.ts "$SERVER:$REMOTE/src/lib/"
scp src/lib/behaviorInsights.ts "$SERVER:$REMOTE/src/lib/"
scp src/lib/auditLogger.ts "$SERVER:$REMOTE/src/lib/"
scp src/lib/dexie.ts "$SERVER:$REMOTE/src/lib/"

# API routes
scp src/app/api/programs/route.ts "$SERVER:$REMOTE/src/app/api/programs/"
scp src/app/api/behaviors/route.ts "$SERVER:$REMOTE/src/app/api/behaviors/"
scp src/app/api/behavior-plan/route.ts "$SERVER:$REMOTE/src/app/api/behavior-plan/"
scp src/app/api/insights/route.ts "$SERVER:$REMOTE/src/app/api/insights/"
scp src/app/api/sync/route.ts "$SERVER:$REMOTE/src/app/api/sync/"
scp src/app/api/reports/route.ts "$SERVER:$REMOTE/src/app/api/reports/"

echo "=== Creating directories for new routes ==="
ssh "$SERVER" "mkdir -p $REMOTE/src/app/api/programs/\[programId\]/targets $REMOTE/src/app/api/targets/\[targetId\] $REMOTE/src/app/api/behavior-plan $REMOTE/src/app/api/behaviors $REMOTE/src/app/api/insights $REMOTE/src/app/parent/\[clientId\]"
ssh "$SERVER" "mkdir -p $REMOTE/src/app/\(main\)/clients/\[clientId\]/programs/new $REMOTE/src/app/\(main\)/clients/\[clientId\]/programs/\[programId\] $REMOTE/src/app/\(main\)/clients/\[clientId\]/behavior-plan"

scp src/app/api/programs/\[programId\]/route.ts "$SERVER:$REMOTE/src/app/api/programs/\[programId\]/"
scp "src/app/api/programs/[programId]/targets/route.ts" "$SERVER:$REMOTE/src/app/api/programs/[programId]/targets/"
scp "src/app/api/targets/[targetId]/route.ts" "$SERVER:$REMOTE/src/app/api/targets/[targetId]/"

# UI pages
scp src/app/\(main\)/layout.tsx "$SERVER:$REMOTE/src/app/(main)/"
scp src/app/\(main\)/clients/page.tsx "$SERVER:$REMOTE/src/app/(main)/clients/"
scp "src/app/(main)/clients/[clientId]/page.tsx" "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/"
scp "src/app/(main)/clients/[clientId]/session/new/page.tsx" "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/session/new/"
scp "src/app/(main)/clients/[clientId]/programs/page.tsx" "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/programs/"
scp "src/app/(main)/clients/[clientId]/programs/new/page.tsx" "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/programs/new/"
scp "src/app/(main)/clients/[clientId]/programs/[programId]/page.tsx" "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/programs/[programId]/"
scp "src/app/(main)/clients/[clientId]/behavior-plan/page.tsx" "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/behavior-plan/"
scp src/app/\(main\)/reports/page.tsx "$SERVER:$REMOTE/src/app/(main)/reports/"
scp src/app/parent/layout.tsx "$SERVER:$REMOTE/src/app/parent/"
scp "src/app/parent/[clientId]/page.tsx" "$SERVER:$REMOTE/src/app/parent/[clientId]/"

# Config files
scp src/app/globals.css "$SERVER:$REMOTE/src/app/"
scp tsconfig.json "$SERVER:$REMOTE/"
scp prisma/schema.prisma "$SERVER:$REMOTE/prisma/"

echo "=== Running prisma migrate + generate + build on server ==="
ssh "$SERVER" "cd $REMOTE && npx prisma migrate deploy 2>&1 | tail -5 && npx prisma generate && npm run build && pm2 restart smart-steps && echo DONE"
