# Payroll Module - Quick Deploy Script (PowerShell)
# Run this script to upload and deploy the payroll module

$SERVER = "root@66.94.105.43"
$APP_DIR = "/var/www/aplus-center"

Write-Host "=== Payroll Module Deployment ===" -ForegroundColor Green
Write-Host ""

# Step 1: Upload archive
Write-Host "📤 Uploading deployment archive..." -ForegroundColor Yellow
scp aplus-center-payroll.zip ${SERVER}:/tmp/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload archive. Please check SSH connection." -ForegroundColor Red
    exit 1
}

# Step 2: Upload deploy script
Write-Host "📤 Uploading deployment script..." -ForegroundColor Yellow
scp deploy-payroll-server.sh ${SERVER}:/tmp/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload script. Please check SSH connection." -ForegroundColor Red
    exit 1
}

# Step 3: Execute deployment on server
Write-Host "🚀 Executing deployment on server..." -ForegroundColor Yellow
Write-Host ""
ssh ${SERVER} "bash /tmp/deploy-payroll-server.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Next steps:" -ForegroundColor Yellow
    Write-Host "1. Verify deployment: ssh ${SERVER} 'cd ${APP_DIR} && pm2 status'" -ForegroundColor White
    Write-Host "2. Check logs: ssh ${SERVER} 'cd ${APP_DIR} && pm2 logs aplus-center --lines 30'" -ForegroundColor White
    Write-Host "3. Install Playwright (for PDF): ssh ${SERVER} 'cd ${APP_DIR} && npx playwright install --with-deps chromium'" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed. Please check the errors above." -ForegroundColor Red
    Write-Host "You can also SSH and run the script manually:" -ForegroundColor Yellow
    Write-Host "  ssh ${SERVER}" -ForegroundColor White
    Write-Host "  bash /tmp/deploy-payroll-server.sh" -ForegroundColor White
}
