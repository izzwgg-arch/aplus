# Complete Deployment Guide - Smart Steps Updates

## Quick Deploy (All-in-One)

### Option 1: Automated Server Script

**On your local machine, copy the server script to the server:**
```bash
scp deploy-migration-server.sh root@66.94.105.43:/tmp/
```

**Then SSH and run:**
```bash
ssh root@66.94.105.43
bash /tmp/deploy-migration-server.sh
```

### Option 2: Manual Step-by-Step

**SSH into server:**
```bash
ssh root@66.94.105.43
```

**Run these commands:**
```bash
cd /var/www/aplus-center

# Generate Prisma Client
npx prisma generate

# Apply migration
npx prisma migrate deploy --name add_role_dashboard_visibility || npx prisma db push

# Restart application
pm2 restart aplus-center

# Check status
pm2 status
pm2 logs aplus-center --lines 20
```

### Option 3: One-Line Command

```bash
ssh root@66.94.105.43 "cd /var/www/aplus-center && npx prisma generate && (npx prisma migrate deploy --name add_role_dashboard_visibility || npx prisma db push) && pm2 restart aplus-center && pm2 logs aplus-center --lines 10"
```

## What Gets Deployed

### Database Changes:
- ✅ New `RoleDashboardVisibility` table
- ✅ Relation added to `Role` model
- ✅ All existing data preserved

### Code Changes:
- ✅ All files already updated locally
- ✅ Just need to upload and restart

## Full Deployment Process

### Step 1: Upload Code Changes (if needed)

If you need to upload the updated code files:

```bash
# From local machine
cd "c:\dev\projects\A Plus center"

# Create deployment package (if needed)
# Or use git pull on server if using version control
```

### Step 2: Run Migration on Server

Use one of the options above.

### Step 3: Verify Deployment

```bash
# On server, check:
pm2 status
curl http://localhost:3000

# Check database
sudo -u postgres psql -d apluscenter -c "\d \"RoleDashboardVisibility\""
```

## Troubleshooting

### If Migration Fails:

1. **Check database connection:**
   ```bash
   cat .env | grep DATABASE_URL
   npx prisma db pull
   ```

2. **Use db push instead:**
   ```bash
   npx prisma db push
   ```

3. **Check Prisma version:**
   ```bash
   npx prisma --version
   npm install prisma@latest @prisma/client@latest
   ```

### If PM2 Fails:

```bash
# Check PM2 status
pm2 list

# Restart manually
pm2 delete aplus-center
pm2 start deploy/pm2.config.js
pm2 save
```

### If Application Errors:

```bash
# Check logs
pm2 logs aplus-center --lines 50

# Rebuild
npm run build
pm2 restart aplus-center
```

## Post-Deployment Checklist

- [ ] Migration completed successfully
- [ ] Application restarted without errors
- [ ] Can log in to application
- [ ] Dashboard shows "Smart Steps" branding
- [ ] Quick Access section is at the top
- [ ] Header only shows Home, Notifications, Sign Out
- [ ] Can create/edit roles with dashboard visibility toggles
- [ ] Route protection works (test with different roles)
- [ ] Dashboard sections respect visibility settings

## Rollback (if needed)

If you need to rollback:

```bash
# On server
cd /var/www/aplus-center

# Revert to previous migration
npx prisma migrate resolve --rolled-back add_role_dashboard_visibility

# Or manually drop table (DANGEROUS - backup first!)
# sudo -u postgres psql -d apluscenter -c "DROP TABLE IF EXISTS \"RoleDashboardVisibility\";"

# Restart
pm2 restart aplus-center
```

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs aplus-center --lines 50`
2. Check database: `npx prisma studio`
3. Verify .env file has correct DATABASE_URL
4. Ensure Prisma Client is generated: `npx prisma generate`
