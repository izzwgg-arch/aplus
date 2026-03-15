# Payroll Module - Deployment Script with SSH Key
# Uses the same SSH key pattern as other deployment scripts

$SERVER = "root@66.94.105.43"
$APP_DIR = "/var/www/aplus-center"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519_smartsteps"

Write-Host "=== Payroll Module Deployment ===" -ForegroundColor Green
Write-Host ""

# Step 1: Upload archive
Write-Host "📤 Uploading deployment archive..." -ForegroundColor Yellow
scp -i $SSH_KEY -o IdentitiesOnly=yes aplus-center-payroll.zip ${SERVER}:/tmp/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload archive." -ForegroundColor Red
    exit 1
}

# Step 2: Upload deploy script
Write-Host "📤 Uploading deployment script..." -ForegroundColor Yellow
scp -i $SSH_KEY -o IdentitiesOnly=yes deploy-payroll-server.sh ${SERVER}:/tmp/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload script." -ForegroundColor Red
    exit 1
}

# Step 3: Execute deployment on server
Write-Host "🚀 Executing deployment on server..." -ForegroundColor Yellow
Write-Host ""

$deployCommands = @"
cd $APP_DIR
echo '📦 Extracting files...'
unzip -o /tmp/aplus-center-payroll.zip -d $APP_DIR 2>/dev/null || tar -xzf /tmp/aplus-center-payroll.zip -C $APP_DIR
cd $APP_DIR
rm -f /tmp/aplus-center-payroll.zip

echo '📥 Installing dependencies...'
npm install --production

echo '🔨 Generating Prisma Client...'
npx prisma generate

echo '🔄 Applying database schema...'
npx prisma db push

echo '🏗️  Building application...'
npm run build

echo '🔄 Restarting application...'
pm2 restart aplus-center || pm2 start npm --name aplus-center -- start

echo '✅ Deployment complete!'
echo ''
echo '📊 Status:'
pm2 status

echo ''
echo '📝 Recent logs:'
pm2 logs aplus-center --lines 20 --nostream
"@

ssh -i $SSH_KEY -o IdentitiesOnly=yes $SERVER $deployCommands

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Don't forget to install Playwright for PDF generation:" -ForegroundColor Yellow
    Write-Host "   ssh -i $SSH_KEY root@66.94.105.43 'cd $APP_DIR && npx playwright install --with-deps chromium'" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "⚠️  Deployment completed with warnings. Check output above." -ForegroundColor Yellow
}
