#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_v3.log
exec > $LOG 2>&1
echo "=== Cleanup old conflicting routes ==="
rm -rf "$B/src/app/api/clients/\[id\]" 2>/dev/null
rm -rf "$B/src/app/api/sync" 2>/dev/null
echo "=== Build ==="
cd $B
npm run build
echo "=== PM2 restart ==="
pm2 restart smart-steps
echo "=== DONE ==="