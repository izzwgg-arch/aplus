# Server Migration Commands

## Quick Migration (Run on Server)

SSH into your server and run these commands:

```bash
# SSH into server
ssh root@66.94.105.43

# Navigate to app directory
cd /var/www/aplus-center

# Generate Prisma Client
npx prisma generate

# Run migration
npx prisma migrate deploy --name add_role_dashboard_visibility

# OR if migrate deploy doesn't work, use db push:
# npx prisma db push

# Restart application
pm2 restart aplus-center

# Check status
pm2 status
pm2 logs aplus-center --lines 20
```

## One-Line Command (Copy & Paste)

```bash
cd /var/www/aplus-center && npx prisma generate && npx prisma migrate deploy --name add_role_dashboard_visibility && pm2 restart aplus-center && pm2 logs aplus-center --lines 20
```

## Alternative: Using db push (if migrations are disabled)

```bash
cd /var/www/aplus-center && npx prisma generate && npx prisma db push && pm2 restart aplus-center
```

## What This Does

1. **Generates Prisma Client** - Updates the Prisma client with the new `RoleDashboardVisibility` model
2. **Applies Migration** - Creates the new `RoleDashboardVisibility` table in the database
3. **Restarts App** - Restarts PM2 so the app uses the updated schema

## Verification

After migration, verify it worked:

```bash
# Check if table exists
sudo -u postgres psql -d apluscenter -c "\d \"RoleDashboardVisibility\""

# Or using Prisma Studio
npx prisma studio
```

## Troubleshooting

If migration fails:

1. **Check DATABASE_URL in .env:**
   ```bash
   cat .env | grep DATABASE_URL
   ```

2. **Test database connection:**
   ```bash
   npx prisma db pull
   ```

3. **Use db push instead:**
   ```bash
   npx prisma db push
   ```

4. **Check PM2 logs:**
   ```bash
   pm2 logs aplus-center --lines 50
   ```
