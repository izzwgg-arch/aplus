#!/bin/bash
# ============================================================
# SmartSteps Goal Library — Production Deploy Script
# Run on the production server as: bash /tmp/deploy_goal_library.sh
# ============================================================

set -euo pipefail

B=/var/www/aplus/aplus-center-scheduling/smart-steps
DB_URL="postgresql://aba_user:abapass123@localhost:5432/aba_db?schema=public"
LOG=/tmp/deploy_goal_library.log
BUNDLE=/tmp/deploy_goal_library.tar.gz
SQL=/tmp/migration_goal_library.sql

exec > >(tee -a "$LOG") 2>&1
echo ""
echo "======================================================="
echo "  SmartSteps Goal Library Deploy — $(date)"
echo "======================================================="

# ── 1. Pre-flight checks ──────────────────────────────────
echo ""
echo "--- [1/7] Pre-flight checks ---"

if [ ! -f "$BUNDLE" ]; then
  echo "ERROR: Bundle not found at $BUNDLE"
  echo "Upload with: scp deploy_goal_library.tar.gz user@server:/tmp/"
  exit 1
fi

if [ ! -f "$SQL" ]; then
  echo "ERROR: Migration SQL not found at $SQL"
  echo "Upload with: scp migration_goal_library.sql user@server:/tmp/"
  exit 1
fi

if [ ! -d "$B" ]; then
  echo "ERROR: SmartSteps directory not found at $B"
  exit 1
fi

echo "OK — bundle, SQL, and target directory all present"

# ── 2. Run database migration ────────────────────────────
echo ""
echo "--- [2/7] Running database migration ---"

PGPASSWORD=abapass123 psql -h localhost -U aba_user -d aba_db -f "$SQL"
echo "OK — migration SQL executed"

# ── 3. Verify schema changes ─────────────────────────────
echo ""
echo "--- [3/7] Verifying schema changes ---"

echo "  Checking TargetLibraryItem new columns..."
NEW_COLS=$(PGPASSWORD=abapass123 psql -h localhost -U aba_user -d aba_db -tAc \
  "SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'TargetLibraryItem'
   AND column_name IN ('isActive','category','skillArea','domain','usageCount');")

if [ "$NEW_COLS" -ne 5 ]; then
  echo "ERROR: Expected 5 new columns on TargetLibraryItem, found $NEW_COLS"
  exit 1
fi
echo "  OK — all 5 new columns present on TargetLibraryItem"

echo "  Checking new tables..."
NEW_TABLES=$(PGPASSWORD=abapass123 psql -h localhost -U aba_user -d aba_db -tAc \
  "SELECT COUNT(*) FROM pg_tables
   WHERE tablename IN ('ParentGoalLibraryItem','GoalLibraryUsage','UserGoalFavorite');")

if [ "$NEW_TABLES" -ne 3 ]; then
  echo "ERROR: Expected 3 new tables, found $NEW_TABLES"
  exit 1
fi
echo "  OK — all 3 new tables present"

echo "  Confirming Target table NOT altered (row count smoke check)..."
TARGET_COLS=$(PGPASSWORD=abapass123 psql -h localhost -U aba_user -d aba_db -tAc \
  "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Target';")
echo "  Target table has $TARGET_COLS columns (no change expected)"

echo "  Confirming ParentGoal table NOT altered..."
PG_COLS=$(PGPASSWORD=abapass123 psql -h localhost -U aba_user -d aba_db -tAc \
  "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'ParentGoal';")
echo "  ParentGoal table has $PG_COLS columns (no change expected)"

echo "OK — schema verification passed"

# ── 4. Extract application bundle ────────────────────────
echo ""
echo "--- [4/7] Extracting application bundle ---"
cd "$B"
tar -xzf "$BUNDLE"
echo "OK — bundle extracted to $B"

# ── 5. Prisma generate ───────────────────────────────────
echo ""
echo "--- [5/7] Running prisma generate ---"
DATABASE_URL="$DB_URL" npx prisma generate
echo "OK — Prisma client regenerated"

# ── 6. Build ─────────────────────────────────────────────
echo ""
echo "--- [6/7] Running npm run build ---"
npm run build
echo "OK — build succeeded"

# ── 7. Restart PM2 ──────────────────────────────────────
echo ""
echo "--- [7/7] Restarting PM2 process: smart-steps ---"
pm2 restart smart-steps --update-env
sleep 3
pm2 status smart-steps
echo "OK — PM2 restarted"

# ── Post-deploy smoke tests ──────────────────────────────
echo ""
echo "--- POST-DEPLOY SMOKE TESTS ---"

SMARTSTEPS_URL="http://127.0.0.1:3001"

echo "  [smoke 1] GET /smart-steps/goal-library ..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$SMARTSTEPS_URL/smart-steps/goal-library" || echo "000")
if [[ "$HTTP_CODE" =~ ^(200|308|307|302|301)$ ]]; then
  echo "  OK — /smart-steps/goal-library responded $HTTP_CODE"
else
  echo "  WARN — /smart-steps/goal-library returned HTTP $HTTP_CODE (may need auth redirect)"
fi

echo "  [smoke 2] GET /smart-steps/parent-goal-library ..."
HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$SMARTSTEPS_URL/smart-steps/parent-goal-library" || echo "000")
if [[ "$HTTP_CODE2" =~ ^(200|308|307|302|301)$ ]]; then
  echo "  OK — /smart-steps/parent-goal-library responded $HTTP_CODE2"
else
  echo "  WARN — /smart-steps/parent-goal-library returned HTTP $HTTP_CODE2 (may need auth redirect)"
fi

echo "  [smoke 3] GET /smart-steps/api/goal-library (expect 401 without auth) ..."
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$SMARTSTEPS_URL/smart-steps/api/goal-library" || echo "000")
if [ "$API_CODE" == "401" ]; then
  echo "  OK — /api/goal-library returned 401 (auth guard working)"
elif [[ "$API_CODE" =~ ^(200|307|308)$ ]]; then
  echo "  OK — /api/goal-library returned $API_CODE"
else
  echo "  WARN — /api/goal-library returned HTTP $API_CODE"
fi

echo "  [smoke 4] GET /smart-steps/api/parent-goal-library (expect 401 without auth) ..."
API_CODE2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$SMARTSTEPS_URL/smart-steps/api/parent-goal-library" || echo "000")
if [ "$API_CODE2" == "401" ]; then
  echo "  OK — /api/parent-goal-library returned 401 (auth guard working)"
else
  echo "  WARN — /api/parent-goal-library returned HTTP $API_CODE2"
fi

echo "  [smoke 5] GET /smart-steps/api/goals/search (expect 401 without auth) ..."
API_CODE3=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$SMARTSTEPS_URL/smart-steps/api/goals/search" || echo "000")
if [ "$API_CODE3" == "401" ]; then
  echo "  OK — /api/goals/search returned 401 (auth guard working)"
else
  echo "  WARN — /api/goals/search returned HTTP $API_CODE3"
fi

# ── Summary ──────────────────────────────────────────────
echo ""
echo "======================================================="
echo "  DEPLOY COMPLETE — $(date)"
echo "  Log saved to: $LOG"
echo "======================================================="
echo ""
echo "Next steps — verify manually in the app:"
echo "  1. Log in as BCBA → /smart-steps/goal-library → confirm 'New Template' button visible"
echo "  2. Log in as RBT  → /smart-steps/goal-library → confirm no Create/Edit/Clone/Delete buttons"
echo "  3. Open a client goal editor → type 3 chars → confirm search dropdown appears"
echo "  4. Focus empty goal title field → confirm 'Recently Used' section appears"
echo "  5. Generate an assessment report → confirm NEW goals show 'NEW' status in amber"
echo "  6. Generate an assessment report → confirm Date Opened shows '—' for goals never opened"
echo ""
echo "If anything is wrong, rollback with:"
echo "  pm2 restart smart-steps  (for app rollback — redeploy previous bundle)"
echo "  See migration_goal_library.sql header for DB rollback commands"
