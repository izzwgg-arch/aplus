# Deploy Smart Steps ABA Tracker to production server
# Server: 91.229.245.143 | Repo: https://github.com/izzwgg-arch/aplus.git

$ErrorActionPreference = "Stop"
$SERVER = "root@91.229.245.143"
$APP_DIR = "/var/www/aplus"
$SMART_STEPS_DIR = "$APP_DIR/aplus-center-scheduling/smart-steps"
$GIT_REPO = "https://github.com/izzwgg-arch/aplus.git"
$SSH_KEY = $env:SSH_KEY
if (-not $SSH_KEY) {
    $tryKeys = @(
        "C:\Users\lizzyw\.ssh\aplus_ed25519",
        "$env:USERPROFILE\.ssh\aplus_ed25519",
        "$env:USERPROFILE\.ssh\id_ed25519_smartsteps",
        "$env:USERPROFILE\.ssh\id_ed25519",
        "$env:USERPROFILE\.ssh\id_rsa"
    )
    foreach ($k in $tryKeys) {
        if (Test-Path $k) { $SSH_KEY = $k; break }
    }
}
if (-not $SSH_KEY -or -not (Test-Path $SSH_KEY)) {
    Write-Host "No SSH private key found. Tried: id_ed25519_smartsteps, id_ed25519, id_rsa" -ForegroundColor Red
    Write-Host "Set SSH_KEY env var or add a key to $env:USERPROFILE\.ssh\" -ForegroundColor Yellow
    exit 1
}

Write-Host "Deploying Smart Steps ABA Tracker to server..." -ForegroundColor Green

Write-Host "Step 1: Clone or pull repo on server..." -ForegroundColor Cyan
$cloneScript = 'if [ ! -d /var/www/aplus ]; then mkdir -p /var/www && git clone https://github.com/izzwgg-arch/aplus.git /var/www/aplus; else cd /var/www/aplus && git pull origin main; fi'
ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $SERVER $cloneScript
if ($LASTEXITCODE -ne 0) { Write-Host "Git clone/pull failed" -ForegroundColor Red; exit 1 }

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
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "test -f /var/www/aplus/aplus-center-scheduling/smart-steps/.env.local || (echo 'AUTH_SECRET=smart-steps-prod-change-this-secret'; echo 'AUTH_URL=http://localhost:3001'; echo 'NEXTAUTH_URL=http://localhost:3001'; echo 'APLUS_JWT_SECRET=set-same-as-main-app-JWT_SECRET') > /var/www/aplus/aplus-center-scheduling/smart-steps/.env.local"
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "grep -q APLUS_JWT_SECRET /var/www/aplus/aplus-center-scheduling/smart-steps/.env.local || echo 'APLUS_JWT_SECRET=set-same-as-main-app-JWT_SECRET' >> /var/www/aplus/aplus-center-scheduling/smart-steps/.env.local"

Write-Host "Step 5: Start or restart Smart Steps (PM2)..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "cd /var/www/aplus/aplus-center-scheduling/smart-steps && (pm2 describe smart-steps 2>/dev/null && pm2 restart smart-steps --update-env || pm2 start npm --name smart-steps -- run start) && pm2 save"
if ($LASTEXITCODE -ne 0) { Write-Host "PM2 start/restart failed" -ForegroundColor Red; exit 1 }

Write-Host "Step 6: PM2 status..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "pm2 status"

Write-Host ""
Write-Host "Smart Steps deploy done. App runs on port 3001." -ForegroundColor Green
Write-Host "On server: set APLUS_JWT_SECRET in $SMART_STEPS_DIR/.env.local to match main app JWT_SECRET (for SSO)." -ForegroundColor Yellow
Write-Host "Then: pm2 restart smart-steps" -ForegroundColor Gray
Write-Host "Nginx: see aplus-center-scheduling/smart-steps/deploy/nginx-smart-steps.conf" -ForegroundColor Gray
Write-Host ""
