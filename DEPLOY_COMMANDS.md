# Deployment Commands - Copy & Paste Ready

## Step 1: Upload to Server

**On your local machine (PowerShell):**
```powershell
scp aplus-center-deploy.zip root@66.94.105.43:/tmp/
```

## Step 2: On Server - Run These Commands

**SSH into server:**
```bash
ssh root@66.94.105.43
```

**Then run these commands:**
```bash
# Navigate to app directory
cd /var/www/aplus-center

# Backup current version (if exists)
if [ -d ".next" ]; then
  mv .next .next.backup.$(date +%Y%m%d_%H%M%S)
fi

# Extract new version
cd /tmp
unzip -o aplus-center-deploy.zip -d /var/www/aplus-center/
cd /var/www/aplus-center

# Install dependencies
npm install --production

# Generate Prisma Client
npx prisma generate

# Push database schema (if needed)
npx prisma db push

# Build application
npm run build

# Restart PM2
pm2 restart aplus-center

# Check status
pm2 status
pm2 logs aplus-center --lines 20
```

## Step 3: Verify Deployment

```bash
# Check if app is running
curl http://localhost:3000

# Check PM2 status
pm2 status

# View logs
pm2 logs aplus-center --lines 50
```

## If First Time Deployment

If this is the first time deploying, you'll also need:

```bash
# Create .env file
nano .env
# Add your DATABASE_URL, NEXTAUTH_SECRET, etc.

# Create admin user
npm run create-admin admin@apluscenter.com "YourPassword123!"

# Start PM2 (if not already running)
pm2 start deploy/pm2.config.js
pm2 save
pm2 startup
```

## Quick Troubleshooting

```bash
# If build fails
npm run build

# If PM2 won't start
pm2 delete aplus-center
pm2 start deploy/pm2.config.js

# Check nginx
nginx -t
systemctl reload nginx

# Check database
sudo -u postgres psql -d apluscenter -c "SELECT 1;"
```
