#!/usr/bin/env bash
set -euo pipefail

cd /opt/aba
if [ -d .git ]; then
  git pull origin main
fi
npm install
npm run prisma:generate
npm run prisma:deploy
npm run build
# Production PM2 runs as user `aba` (systemd pm2-aba.service); avoid duplicate root PM2 on port 4000.
sudo -u aba bash -lc 'export PM2_HOME=/home/aba/.pm2; cd /opt/aba && pm2 startOrReload ecosystem.config.js --update-env && pm2 save'
