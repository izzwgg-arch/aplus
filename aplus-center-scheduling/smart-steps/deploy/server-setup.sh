#!/bin/bash
# Run once on server (91.229.245.143) if Node/PM2 not set up
set -e
export DEBIAN_FRONTEND=noninteractive

if ! command -v node &>/dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
  pm2 startup systemd -u root --hp /root || true
fi

echo "Node: $(node -v) | npm: $(npm -v) | PM2: $(pm2 -v 2>/dev/null || echo 'ok')"
