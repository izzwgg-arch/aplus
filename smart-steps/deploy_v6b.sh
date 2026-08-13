#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
LOG=/tmp/deploy_v6b.log
exec > $LOG 2>&1
echo "=== Patch deploy $(date) ==="
cd $B
tar -xzf /tmp/deploy_bundle_v6b.tar.gz
echo "=== Build ==="
npm run build 2>&1
echo "=== Restart ==="
pm2 restart smart-steps
echo "=== DONE $(date) ==="