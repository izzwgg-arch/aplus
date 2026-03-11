# Deploy Smart Steps ABA Tracker to production server
# Uses SSH key and git pull on server (same as deploy-to-server.ps1)

$ErrorActionPreference = "Stop"
$SERVER = "root@66.94.105.43"
$APP_DIR = "/var/www/aplus-center"
$SMART_STEPS_DIR = "$APP_DIR/aplus-center-scheduling/smart-steps"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519_smartsteps"

if (-not (Test-Path $SSH_KEY)) {
    Write-Host "SSH key not found at $SSH_KEY" -ForegroundColor Red
    Write-Host "Create the key or set SSH_KEY path." -ForegroundColor Yellow
    exit 1
}

Write-Host "Deploying Smart Steps ABA Tracker to server..." -ForegroundColor Green

Write-Host "Step 1: Pull latest changes on server..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $SERVER "cd $APP_DIR && git pull origin main"
if ($LASTEXITCODE -ne 0) { Write-Host "Git pull failed" -ForegroundColor Red; exit 1 }

Write-Host "Step 2: Install dependencies (smart-steps)..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "cd $SMART_STEPS_DIR && npm ci"
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm ci failed, trying npm install..." -ForegroundColor Yellow
    ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "cd $SMART_STEPS_DIR && npm install"
}
if ($LASTEXITCODE -ne 0) { Write-Host "Install failed" -ForegroundColor Red; exit 1 }

Write-Host "Step 3: Build Smart Steps..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "cd $SMART_STEPS_DIR && npm run build"
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

Write-Host "Step 4: Ensure .env.local on server..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "test -f $SMART_STEPS_DIR/.env.local || echo 'AUTH_SECRET=smart-steps-prod-change-this-secret
AUTH_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3001' > $SMART_STEPS_DIR/.env.local"

Write-Host "Step 5: Start or restart Smart Steps (PM2)..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER @"
cd $SMART_STEPS_DIR
if pm2 describe smart-steps 2>/dev/null; then
  pm2 restart smart-steps --update-env
else
  pm2 start npm --name smart-steps --cwd $SMART_STEPS_DIR -- run start
fi
pm2 save
"@
if ($LASTEXITCODE -ne 0) { Write-Host "PM2 start/restart failed" -ForegroundColor Red; exit 1 }

Write-Host "Step 6: PM2 status..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "pm2 status"

Write-Host ""
Write-Host "Smart Steps deploy done. App runs on port 3001." -ForegroundColor Green
Write-Host "Configure Nginx to proxy /smart-steps to http://127.0.0.1:3001" -ForegroundColor Yellow
Write-Host ""
