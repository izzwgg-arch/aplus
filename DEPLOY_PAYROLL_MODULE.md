# Payroll Management Module - Deployment Guide

## 🚀 Deployment Steps

The Payroll Management module has been completely rebuilt and is ready for deployment.

### What's Being Deployed

- ✅ New Prisma models: PayrollEmployee, PayrollImport, PayrollImportRow, PayrollRun, PayrollRunLine, PayrollPayment, PayrollReportArtifact
- ✅ New routes: `/payroll`, `/payroll/employees`, `/payroll/imports`, `/payroll/runs`, `/payroll/reports`
- ✅ New API routes for import, employees, runs, payments, analytics, and PDF generation
- ✅ Dashboard Analytics with KPIs, charts, and waterfall visualizations
- ✅ Modern HTML→PDF reports using Playwright
- ✅ Permissions: PAYROLL_VIEW, PAYROLL_MANAGE_EMPLOYEES, PAYROLL_IMPORT_EDIT, PAYROLL_RUN_CREATE, PAYROLL_PAYMENTS_EDIT, PAYROLL_ANALYTICS_VIEW, PAYROLL_REPORTS_EXPORT

### Step 1: Upload Code to Server

**On your local machine (PowerShell):**

```powershell
cd "c:\dev\projects\A Plus center"

# Create deployment archive (excludes node_modules, .next, .git, .env)
Compress-Archive -Path * -DestinationPath aplus-center-payroll.zip -Exclude node_modules,.next,.git,.env,*.log,tsconfig.tsbuildinfo

# Upload to server
scp aplus-center-payroll.zip root@66.94.105.43:/tmp/
```

**Or using tar (if available):**

```powershell
tar -czf aplus-center-payroll.tar.gz --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='.env' --exclude='*.log' .
scp aplus-center-payroll.tar.gz root@66.94.105.43:/tmp/
```

### Step 2: On Server - Extract and Setup

**SSH into server:**

```bash
ssh root@66.94.105.43
```

**Run these commands:**

```bash
cd /var/www/aplus-center

# Backup current version (optional but recommended)
if [ -d ".next" ]; then
  mv .next .next.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new version
cd /tmp
unzip -o aplus-center-payroll.zip -d /var/www/aplus-center/ 2>/dev/null || tar -xzf aplus-center-payroll.tar.gz -C /var/www/aplus-center/
cd /var/www/aplus-center
rm -f /tmp/aplus-center-payroll.zip /tmp/aplus-center-payroll.tar.gz

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Generate Prisma Client
echo "🔨 Generating Prisma Client..."
npx prisma generate

# Apply database schema changes
echo "🔄 Applying database schema..."
npx prisma db push

# Build application
echo "🏗️  Building application..."
npm run build

# Restart PM2
echo "🔄 Restarting application..."
pm2 restart aplus-center

# Check status
echo "✅ Checking status..."
pm2 status
pm2 logs aplus-center --lines 30
```

### Step 3: Verify Deployment

**Check application is running:**

```bash
# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs aplus-center --lines 50

# Test API endpoint
curl http://localhost:3000/api/payroll/employees

# Verify database tables exist
sudo -u postgres psql -d apluscenter -c "\dt Payroll*"
```

**Expected output should show these tables:**
- PayrollEmployee
- PayrollImport
- PayrollImportRow
- PayrollRun
- PayrollRunLine
- PayrollPayment
- PayrollReportArtifact

### Step 4: Verify Permissions (Optional)

The payroll permissions should already be seeded. To verify:

```bash
sudo -u postgres psql -d apluscenter -c "SELECT name FROM \"Permission\" WHERE name LIKE 'PAYROLL%' ORDER BY name;"
```

Expected permissions:
- PAYROLL_VIEW
- PAYROLL_MANAGE_EMPLOYEES
- PAYROLL_IMPORT_EDIT
- PAYROLL_RUN_CREATE
- PAYROLL_PAYMENTS_EDIT
- PAYROLL_ANALYTICS_VIEW
- PAYROLL_REPORTS_EXPORT
- dashboard.payroll

### Step 5: Access Payroll Module

1. **Login to application** at your domain or `http://66.94.105.43:3000`
2. **Navigate to Dashboard** - you should see "Payroll Management" tile
3. **Configure Permissions** (if needed):
   - Go to Roles → Edit Role
   - Enable Payroll Management permissions for desired roles
   - Ensure "Payroll Management" is enabled in Quick Access section

### Troubleshooting

#### If build fails:

```bash
cd /var/www/aplus-center
npm run build
# Check for specific errors
```

#### If database migration fails:

```bash
# Check database connection
sudo -u postgres psql -d apluscenter -c "SELECT 1;"

# Try applying schema manually
npx prisma db push --force-reset  # WARNING: Only if you want to reset payroll tables
# OR
npx prisma migrate deploy
```

#### If PM2 won't restart:

```bash
pm2 delete aplus-center
pm2 start npm --name aplus-center -- start
pm2 save
```

#### If Playwright PDF generation fails:

```bash
# Install Playwright browsers on server
cd /var/www/aplus-center
npx playwright install --with-deps chromium
```

### Quick One-Line Deployment (Alternative)

If you prefer a single command:

```bash
ssh root@66.94.105.43 "cd /var/www/aplus-center && npm install --production && npx prisma generate && npx prisma db push && npm run build && pm2 restart aplus-center && pm2 logs aplus-center --lines 10"
```

## ✅ Deployment Checklist

- [ ] Code uploaded to server
- [ ] Dependencies installed (`npm install --production`)
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] Database schema applied (`npx prisma db push`)
- [ ] Application built (`npm run build`)
- [ ] PM2 restarted (`pm2 restart aplus-center`)
- [ ] Logs checked for errors
- [ ] Payroll tile visible on dashboard
- [ ] Permissions configured (if needed)
- [ ] Playwright installed (for PDF generation)

## 🎉 Deployment Complete!

Once deployed, users with PAYROLL_VIEW permission will see the Payroll Management tile on the dashboard and can:
- Import time logs (Excel/CSV)
- Manage employees and pay rates
- Create and manage payroll runs
- Track payments
- View analytics dashboard
- Generate PDF reports
