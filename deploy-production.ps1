# Production Deployment Script
# Run this script to deploy the automatic invoice generation feature

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Production Deployment - Invoice Generation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Format Prisma schema
Write-Host "[1/6] Formatting Prisma schema..." -ForegroundColor Yellow
npx prisma format
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Prisma format failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Prisma schema formatted" -ForegroundColor Green
Write-Host ""

# Step 2: Generate Prisma Client
Write-Host "[2/6] Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Prisma generate failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Prisma Client generated" -ForegroundColor Green
Write-Host ""

# Step 3: Database Migration
Write-Host "[3/6] Running database migration..." -ForegroundColor Yellow
Write-Host "WARNING: This will modify your database schema!" -ForegroundColor Yellow
$confirm = Read-Host "Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

npx prisma db push
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Database migration failed!" -ForegroundColor Red
    Write-Host "Please check the error above and fix any issues." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Database migration completed" -ForegroundColor Green
Write-Host ""

# Step 4: Build Application
Write-Host "[4/6] Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Application built successfully" -ForegroundColor Green
Write-Host ""

# Step 5: Verify Key Files
Write-Host "[5/6] Verifying key files..." -ForegroundColor Yellow
$requiredFiles = @(
    "lib/billingPeriodUtils.ts",
    "lib/jobs/invoiceGeneration.ts",
    "lib/cron.ts",
    "app/api/cron/invoice-generation/route.ts",
    "app/api/invoices/generate/route.ts",
    "components/invoices/InvoiceDetail.tsx",
    "components/invoices/InvoicesList.tsx"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (MISSING!)" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host "ERROR: Some required files are missing!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ All required files present" -ForegroundColor Green
Write-Host ""

# Step 6: Deployment Summary
Write-Host "[6/6] Deployment Summary" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Prisma schema formatted" -ForegroundColor Green
Write-Host "✓ Prisma Client generated" -ForegroundColor Green
Write-Host "✓ Database migration completed" -ForegroundColor Green
Write-Host "✓ Application built" -ForegroundColor Green
Write-Host "✓ All files verified" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Start your application: npm start" -ForegroundColor White
Write-Host "2. Verify cron job initializes (check logs)" -ForegroundColor White
Write-Host "3. Test manual invoice generation (Admin UI)" -ForegroundColor White
Write-Host "4. Monitor first automatic run (Tuesday 7:00 AM ET)" -ForegroundColor White
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "- PRODUCTION_DEPLOYMENT.md - Full deployment guide" -ForegroundColor White
Write-Host "- AUTOMATIC_INVOICE_GENERATION_COMPLETE.md - Feature documentation" -ForegroundColor White
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
