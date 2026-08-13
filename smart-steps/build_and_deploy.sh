#!/bin/bash
B=/var/www/aplus/aplus-center-scheduling/smart-steps
mkdir -p $B/src/app/api/sync $B/src/app/api/reports
cd $B
npx prisma generate
npm run build
pm2 restart smart-steps
echo BUILD_COMPLETE
