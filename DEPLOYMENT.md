# Deployment Guide for A Plus Center

## Server Setup (First Time)

### 1. Connect to Server
```bash
ssh root@66.94.105.43
```

### 2. Run Initial Setup Script
```bash
cd /tmp
# Copy deploy.sh from your local machine first, or create it on server
chmod +x deploy.sh
./deploy.sh
```

### 3. Create Application Directory
```bash
APP_DIR="/var/www/aplus-center"
mkdir -p $APP_DIR
cd $APP_DIR
```

### 4. Upload Application Files
From your local machine:
```bash
# Create archive (exclude node_modules, .next, etc.)
tar -czf aplus-center.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='*.log' \
  .

# Copy to server
scp aplus-center.tar.gz root@66.94.105.43:/var/www/aplus-center/
```

On server:
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

Set these variables:
```
DATABASE_URL="postgresql://aplususer:YOUR_PASSWORD@localhost:5432/apluscenter?schema=public"
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NODE_ENV=production
TZ=America/New_York
```

### 7. Set Up Database
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Or push schema (for initial setup)
npx prisma db push
```

### 8. Create Admin User
```bash
npm run create-admin admin@example.com Admin@12345!
```

### 9. Build Application
```bash
npm run build
```

### 10. Start with PM2
```bash
# Install PM2 if not already installed
npm install -g pm2

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
# Update server_name and SSL paths

# Enable the site
ln -s /etc/nginx/sites-available/aplus-center /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload nginx
systemctl reload nginx
```

### 12. Set Up SSL (Optional but Recommended)
```bash
apt-get install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

### 13. Set Up Scheduled Jobs
Create a cron job or use PM2 cron module for invoice generation:
```bash
# The application includes a cron job setup in lib/cron.ts
# Make sure it runs when the app starts
```

## Updating the Application

### Quick Update Process

1. **Build locally**:
```bash
npm run build
```

2. **Create deployment package**:
```bash
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env' \
  .
```

3. **Upload to server**:
```bash
scp deploy.tar.gz root@66.94.105.43:/tmp/
```

4. **On server, update**:
```bash
cd /var/www/aplus-center
tar -xzf /tmp/deploy.tar.gz
npm install --production
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart aplus-center
```

## Monitoring

### Check Application Status
```bash
pm2 status
pm2 logs aplus-center
pm2 monit
```

### Check Nginx Status
```bash
systemctl status nginx
tail -f /var/log/nginx/error.log
```

### Check Database
```bash
sudo -u postgres psql apluscenter
```

## Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs aplus-center --lines 50

# Check if port 3000 is in use
netstat -tlnp | grep 3000
```

### Database connection issues
```bash
# Test database connection
sudo -u postgres psql -c "\l" | grep apluscenter

# Check PostgreSQL is running
systemctl status postgresql
```

### Permission issues
```bash
# Fix ownership
chown -R www-data:www-data /var/www/aplus-center
chmod -R 755 /var/www/aplus-center
```

## Backup Database
```bash
# Create backup
sudo -u postgres pg_dump apluscenter > /var/backups/apluscenter-$(date +%Y%m%d).sql

# Restore from backup
sudo -u postgres psql apluscenter < /var/backups/apluscenter-YYYYMMDD.sql
```

## Security Checklist

- [ ] Change default database password
- [ ] Set strong NEXTAUTH_SECRET
- [ ] Configure firewall (ufw)
- [ ] Enable SSL/HTTPS
- [ ] Set up regular database backups
- [ ] Configure log rotation
- [ ] Review file permissions
- [ ] Set up monitoring/alerting
