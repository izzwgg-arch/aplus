# A Plus Center - Deployment Checklist

## Pre-Deployment Verification ✅

### Code Quality
- [x] All features implemented and tested
- [x] No TypeScript errors
- [x] No critical TODOs or FIXMEs
- [x] All dependencies installed

### Features Status
- [x] Authentication & Authorization
- [x] All CRUD operations (Providers, Clients, BCBAs, Insurance, Timesheets, Invoices)
- [x] Timesheet workflow (Draft → Submit → Approve/Reject → Lock)
- [x] Invoice management (payments, adjustments)
- [x] Automatic invoice generation (cron job)
- [x] Analytics dashboard
- [x] Reports system (PDF/CSV/Excel)
- [x] User management
- [x] Audit logs
- [x] Notifications system
- [x] Forgot/Reset password
- [x] Export functionality on all list pages

## Server Setup (First Time)

### 1. Connect to Server
```bash
ssh root@66.94.105.43
```

### 2. Run Initial Setup
```bash
cd /tmp
# Upload deploy.sh from local machine
chmod +x deploy.sh
./deploy.sh
```

### 3. Create Application Directory
```bash
APP_DIR="/var/www/aplus-center"
mkdir -p $APP_DIR
mkdir -p /var/log/aplus-center
cd $APP_DIR
```

### 4. Upload Application Files

**From local machine:**
```bash
# Create deployment archive (exclude unnecessary files)
tar -czf aplus-center.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='*.md' \
  --exclude='docs' \
  .

# Copy to server
scp aplus-center.tar.gz root@66.94.105.43:/var/www/aplus-center/
```

**On server:**
```bash
cd /var/www/aplus-center
tar -xzf aplus-center.tar.gz
rm aplus-center.tar.gz
```

### 5. Install Dependencies
```bash
npm install --production
```

### 6. Configure Environment Variables
```bash
nano .env
```

**Required variables:**
```env
DATABASE_URL="postgresql://aplususer:YOUR_STRONG_PASSWORD@localhost:5432/apluscenter?schema=public"
NEXTAUTH_URL="http://66.94.105.43:3000"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NODE_ENV="production"
TZ="America/New_York"
ENABLE_CRON_JOBS="true"
CRON_SECRET="$(openssl rand -base64 32)"
```

**Optional (for email):**
```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="noreply@apluscenter.com"
```

### 7. Set Up Database
```bash
# Generate Prisma Client
npx prisma generate

# Push schema (for initial setup)
npx prisma db push

# Or use migrations (if you have them)
# npx prisma migrate deploy
```

### 8. Create Admin User
```bash
npm run create-admin admin@apluscenter.com "YourStrongPassword123!"
```

### 9. Build Application
```bash
npm run build
```

### 10. Configure PM2
```bash
# Install PM2 globally (if not already)
npm install -g pm2

# Update PM2 config path if needed
# Edit deploy/pm2.config.js to ensure cwd is correct

# Start application
pm2 start deploy/pm2.config.js

# Save PM2 configuration
pm2 save

# Enable PM2 startup script
pm2 startup
# Follow the instructions output by this command
```

### 11. Configure Nginx
```bash
# Copy nginx config
cp deploy/nginx.conf /etc/nginx/sites-available/aplus-center

# Edit the config
nano /etc/nginx/sites-available/aplus-center
# Update server_name to your domain or IP
# For initial setup without SSL, comment out SSL redirect

# Enable the site
ln -s /etc/nginx/sites-available/aplus-center /etc/nginx/sites-enabled/

# Remove default nginx site (optional)
rm /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Reload nginx
systemctl reload nginx
```

### 12. Set Up SSL (Recommended)
```bash
apt-get install certbot python3-certbot-nginx -y
certbot --nginx -d your-domain.com
# Follow the prompts
```

### 13. Configure Firewall
```bash
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

## Post-Deployment Verification

### 1. Check Application Status
```bash
pm2 status
pm2 logs aplus-center --lines 50
```

### 2. Test Application
- [ ] Access application via browser
- [ ] Login with admin credentials
- [ ] Test creating a provider
- [ ] Test creating a client
- [ ] Test creating a timesheet
- [ ] Test invoice generation (manual trigger)
- [ ] Test notifications
- [ ] Test forgot password flow (if SMTP configured)

### 3. Verify Cron Jobs
```bash
# Check if cron jobs are running
pm2 logs aplus-center | grep CRON

# Manually trigger invoice generation (if needed)
curl -X POST http://localhost:3000/api/cron/invoice-generation \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 4. Monitor Logs
```bash
# Application logs
pm2 logs aplus-center

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u nginx -f
```

## Updating the Application

### Quick Update Process

1. **Build locally:**
```bash
npm run build
```

2. **Create deployment package:**
```bash
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='*.log' \
  .
```

3. **Upload to server:**
```bash
scp deploy.tar.gz root@66.94.105.43:/tmp/
```

4. **On server, update:**
```bash
cd /var/www/aplus-center
tar -xzf /tmp/deploy.tar.gz
npm install --production
npx prisma generate
npx prisma db push  # or migrate deploy
npm run build
pm2 restart aplus-center
```

## Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs aplus-center --lines 100

# Check if port 3000 is in use
netstat -tlnp | grep 3000

# Restart application
pm2 restart aplus-center
```

### Database connection issues
```bash
# Test database connection
sudo -u postgres psql -c "\l" | grep apluscenter

# Check PostgreSQL is running
systemctl status postgresql

# Restart PostgreSQL
systemctl restart postgresql
```

### Permission issues
```bash
# Fix ownership
chown -R www-data:www-data /var/www/aplus-center
chmod -R 755 /var/www/aplus-center
```

### Cron jobs not running
```bash
# Check logs for cron initialization
pm2 logs aplus-center | grep "Cron jobs"

# Verify ENABLE_CRON_JOBS is set to "true" in .env
# Restart application
pm2 restart aplus-center
```

## Backup Strategy

### Database Backup
```bash
# Create backup
sudo -u postgres pg_dump apluscenter > /var/backups/apluscenter-$(date +%Y%m%d).sql

# Restore from backup
sudo -u postgres psql apluscenter < /var/backups/apluscenter-YYYYMMDD.sql
```

### Application Backup
```bash
# Backup application directory
tar -czf /var/backups/aplus-center-app-$(date +%Y%m%d).tar.gz /var/www/aplus-center
```

## Security Checklist

- [ ] Changed default database password
- [ ] Set strong NEXTAUTH_SECRET
- [ ] Configured firewall (ufw)
- [ ] Enabled SSL/HTTPS
- [ ] Set up regular database backups
- [ ] Configured log rotation
- [ ] Reviewed file permissions
- [ ] Set up monitoring/alerting (optional)

## Performance Optimization

- [ ] Enable Next.js production optimizations (already in build)
- [ ] Configure PM2 cluster mode (already configured)
- [ ] Set up database connection pooling (Prisma handles this)
- [ ] Configure CDN for static assets (optional)
- [ ] Set up caching headers in nginx (optional)

## Success Criteria

✅ Application is accessible via browser  
✅ Login works with admin credentials  
✅ All CRUD operations function correctly  
✅ Timesheet workflow works end-to-end  
✅ Invoice generation works (manual and scheduled)  
✅ Analytics dashboard displays data  
✅ Reports can be generated  
✅ Notifications system works  
✅ Email functionality works (if configured)  

---

**Ready for Production!** 🚀
