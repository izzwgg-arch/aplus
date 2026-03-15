# Deployment Script for A Plus Center
# Deploys the application to the production server

Write-Host "Starting deployment to production server..." -ForegroundColor Green

# Configuration
$SERVER = "root@66.94.105.43"
$APP_DIR = "/var/www/aplus-center"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519_smartsteps"

Write-Host "Step 1: Pulling latest changes on server..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER @"
cd $APP_DIR
git pull origin main
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to pull latest changes" -ForegroundColor Red
    exit 1
}

Write-Host "Step 2: Installing dependencies..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER @"
cd $APP_DIR
npm install --production
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "Step 3: Building application..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER @"
cd $APP_DIR
npm run build
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "Step 4: Running database migrations..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER @"
cd $APP_DIR
npx prisma migrate deploy
npx prisma generate
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Database migration warning (may be expected)" -ForegroundColor Yellow
}

Write-Host "Step 5: Restarting application..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER @"
cd $APP_DIR
pm2 restart aplus-center
pm2 save
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to restart application" -ForegroundColor Red
    exit 1
}

Write-Host "Step 6: Checking application status..." -ForegroundColor Cyan
ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER "pm2 status"

Write-Host ""
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Check logs with: pm2 logs aplus-center --lines 50" -ForegroundColor Gray
Write-Host "  2. Test the application at your production URL" -ForegroundColor Gray
Write-Host "  3. Verify timesheet functionality" -ForegroundColor Gray
Write-Host ""
