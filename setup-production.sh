#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/aba}"

cd "$APP_DIR"

echo "Installing dependencies..."
npm install

echo "Preparing env files (if missing)..."
if [ ! -f server/.env ]; then
  cp .env.example server/.env
  echo "Created server/.env from .env.example (update values before production use)."
fi
if [ ! -f client/.env ]; then
  cp client/.env.example client/.env
fi

echo "Generating Prisma client and running migrations..."
npm run prisma:generate
npm run prisma:deploy

echo "Building frontend..."
npm run build

echo "Seeding default admin (safe if already exists)..."
npm run seed -w server || true

echo "Starting PM2 app..."
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "Done. API/UI served on Node port 4000 behind your reverse proxy."
