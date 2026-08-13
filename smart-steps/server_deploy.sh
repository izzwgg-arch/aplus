#!/bin/bash
BASE=/var/www/aplus/aplus-center-scheduling/smart-steps

echo "[1/4] Moving files to correct locations..."
# behavior-plan route
[ -f "$BASE/src/app/api/behavior-plan.ts" ] && mv "$BASE/src/app/api/behavior-plan.ts" "$BASE/src/app/api/behavior-plan/route.ts"
[ -f "$BASE/src/app/api/behaviors.ts" ] && mv "$BASE/src/app/api/behaviors.ts" "$BASE/src/app/api/behaviors/route.ts"
[ -f "$BASE/src/app/api/insights.ts" ] && mv "$BASE/src/app/api/insights.ts" "$BASE/src/app/api/insights/route.ts"
# sync and reports were already in correct dirs from before - just need updated copies
# List what we have
ls "$BASE/src/app/api/behavior-plan/"
ls "$BASE/src/app/api/behaviors/"
ls "$BASE/src/app/api/insights/"

echo "[2/4] Checking prisma..."
cd "$BASE"
cat prisma/schema.prisma | grep -E "^model " | sort

echo "[3/4] Running prisma generate..."
npx prisma generate 2>&1 | tail -5

echo "[4/4] Running build..."
npm run build 2>&1 | tail -20

echo "DEPLOY_DONE"
