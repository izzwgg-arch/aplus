#!/bin/bash
# Deploy: ABA Data Linkage Fix
# Run from: /var/www/aplus/aplus-center-scheduling/smart-steps
# (or adjust REMOTE below)

SERVER="root@91.229.245.143"
REMOTE="/var/www/aplus/aplus-center-scheduling/smart-steps"
LOCAL=$(dirname "$0")

echo "=== Deploying ABA Data Linkage Fix ==="

# Trials API - validation + better errors
scp "$LOCAL/src/app/api/trials/route.ts" \
    "$SERVER:$REMOTE/src/app/api/trials/route.ts"

# DataEntryTab - server target sync + re-resolve targetIds + session retry
scp "$LOCAL/src/app/(main)/clients/[clientId]/_components/DataEntryTab.tsx" \
    "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/_components/DataEntryTab.tsx"

# ProgramsTab - server target sync on Goals tab mount
scp "$LOCAL/src/app/(main)/clients/[clientId]/_components/ProgramsTab.tsx" \
    "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/_components/ProgramsTab.tsx"

# TargetDetailPanel - "not synced" warning banner
scp "$LOCAL/src/app/(main)/clients/[clientId]/_components/TargetDetailPanel.tsx" \
    "$SERVER:$REMOTE/src/app/(main)/clients/[clientId]/_components/TargetDetailPanel.tsx"

echo "=== Building on server ==="
ssh "$SERVER" "cd $REMOTE && npm run build && pm2 restart smart-steps && echo BUILD_DONE"
