# Production Server Deployment Guide

## Server Information
- **URL**: http://66.94.105.43:3000/
- **Status**: ✅ Application is accessible
- **Current State**: Login page visible

## Deployment Steps for Production Server

### Step 1: Connect to Production Server

You'll need SSH access to deploy:

```bash
# SSH into the server (adjust credentials)
ssh user@66.94.105.43
```

### Step 2: Set Environment Variables on Server

On the production server, set the DATABASE_URL:

```bash
# Add to .env file or environment
export DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"
```

Or create/update `.env.local` or `.env.production`:

```env
DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"
NEXTAUTH_URL="http://66.94.105.43:3000"
NEXTAUTH_SECRET="your-secret-key"
```

### Step 3: Deploy Code to Server

#### Option A: Git Deployment
```bash
# On server
cd /path/to/application
git pull origin main
npm install
npm run build
pm2 restart all  # or your process manager
```

#### Option B: Manual File Transfer
```bash
# From local machine
scp -r . user@66.94.105.43:/path/to/application
```

### Step 4: Run Database Migration on Server

```bash
# SSH into server
ssh user@66.94.105.43

# Navigate to application directory
cd /path/to/application

# Set environment variable
export DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"

# Run migration
npx prisma generate
npx prisma db push
```

### Step 5: Restart Application

```bash
# Using PM2
pm2 restart aplus-center

# Or using systemd
sudo systemctl restart aplus-center

# Or manually
npm start
```

### Step 6: Verify Deployment

1. **Check Application**: http://66.94.105.43:3000/
2. **Check Logs**: Look for cron job initialization
3. **Test Login**: Verify authentication works
4. **Test Invoice Generation**: Log in as admin and test manual generation

## Server Configuration Checklist

- [ ] SSH access to server
- [ ] Application directory located
- [ ] Node.js and npm installed
- [ ] PostgreSQL running on server
- [ ] Database `apluscenter` exists
- [ ] Environment variables set
- [ ] Code deployed
- [ ] Database migration run
- [ ] Application restarted
- [ ] Cron job initialized (check logs)

## Verification Commands

### On Production Server:

```bash
# Check if application is running
ps aux | grep node
# or
pm2 list

# Check application logs
pm2 logs aplus-center
# or
tail -f /path/to/logs/app.log

# Check database connection
npx prisma db pull

# Check cron job initialization
grep "CRON" /path/to/logs/app.log
```

## Expected Log Output

After deployment, you should see:

```
[CRON] Initializing cron jobs...
[CRON] Invoice generation job scheduled: 0 7 * * 2 (America/New_York)
Cron jobs initialized
✅ Server initialization complete: Cron jobs started
```

## Troubleshooting

### Application Not Accessible
- Check if Node.js process is running
- Check firewall settings (port 3000)
- Check nginx/reverse proxy configuration

### Database Connection Issues
- Verify PostgreSQL is running on server
- Check DATABASE_URL is set correctly
- Verify database exists and user has permissions

### Cron Job Not Initializing
- Check application logs
- Verify cron job code is deployed
- Check timezone settings

## Next Steps After Deployment

1. **Monitor First Run**: Watch for automatic invoice generation (Tuesday 7:00 AM ET)
2. **Test Manual Generation**: Use admin UI to generate test invoice
3. **Verify Invoice Detail**: Check line items display correctly
4. **Check Logs**: Monitor for any errors

---

**Server URL**: http://66.94.105.43:3000/
**Status**: Application accessible
**Next**: Deploy code and run migration on server
