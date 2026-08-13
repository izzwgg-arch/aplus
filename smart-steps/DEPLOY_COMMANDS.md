# Smart Steps ABA Tracker — Deploy Commands

Run these commands from your local machine after connecting to the server.

## From your local machine — copy all new files

```bash
SERVER=root@91.229.245.143
REMOTE=/var/www/aplus/aplus-center-scheduling/smart-steps
LOCAL="aplus-center-scheduling/smart-steps"

# Create new directories on server
ssh $SERVER "mkdir -p $REMOTE/src/app/api/programs/\[programId\]/targets \
  $REMOTE/src/app/api/targets/\[targetId\] \
  $REMOTE/src/app/api/behavior-plan \
  $REMOTE/src/app/api/behaviors \
  $REMOTE/src/app/api/insights \
  '$REMOTE/src/app/(main)/clients/[clientId]/programs/new' \
  '$REMOTE/src/app/(main)/clients/[clientId]/programs/[programId]' \
  '$REMOTE/src/app/(main)/clients/[clientId]/behavior-plan' \
  '$REMOTE/src/app/parent/[clientId]'"

# Copy source files
rsync -avz --exclude=node_modules --exclude=.next \
  "$LOCAL/src/" "$SERVER:$REMOTE/src/"

rsync -avz "$LOCAL/prisma/schema.prisma" "$SERVER:$REMOTE/prisma/"
rsync -avz "$LOCAL/tsconfig.json" "$SERVER:$REMOTE/"
```

## On the server — migrate + build + restart

```bash
cd /var/www/aplus/aplus-center-scheduling/smart-steps

# Run Prisma migration (adds BehaviorPlan + IntervalRecording tables)
npx prisma migrate dev --name add_behavior_plan_interval

# Regenerate Prisma client
npx prisma generate

# Build Next.js
npm run build

# Restart PM2
pm2 restart smart-steps
pm2 logs smart-steps --lines 20
```

## Verify routes work

```bash
# Check the app is up
curl -s https://app.apluscenterinc.org/smart-steps | grep -c "Smart Steps"

# Test parent portal (no auth required)
curl -o /dev/null -w "%{http_code}" https://app.apluscenterinc.org/smart-steps/parent/test123
```
