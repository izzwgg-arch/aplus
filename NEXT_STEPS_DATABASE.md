# Next Steps - Database Configuration & Migration

## Current Status
✅ **Build**: Complete and successful
✅ **Code**: Ready for production
⚠️ **Database**: Needs configuration and migration

## Step-by-Step: Database Setup

### Step 1: Configure Database Connection

You need to set the `DATABASE_URL` environment variable. This can be done in several ways:

#### Option A: Create .env.local file (Development/Testing)
Create a file named `.env.local` in the project root:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
```

**Example:**
```env
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/aplus_center"
```

#### Option B: Set Environment Variable (Production)
For production deployment, set the environment variable in your hosting platform:

**Vercel:**
- Go to Project Settings → Environment Variables
- Add: `DATABASE_URL` = `postgresql://...`

**Railway/Render/Heroku:**
- Set in platform's environment variables section
- Add: `DATABASE_URL` = `postgresql://...`

**Docker:**
```bash
docker run -e DATABASE_URL="postgresql://..." your-image
```

**PM2/Node:**
```bash
export DATABASE_URL="postgresql://..."
npm start
```

### Step 2: Verify Database Connection

Once `DATABASE_URL` is set, verify the connection:

```bash
# Test Prisma connection
npx prisma db pull

# Or check connection
npx prisma studio
```

### Step 3: Run Database Migration

After verifying the connection, run the migration:

```bash
# Apply schema changes
npx prisma db push

# Or if using migrations
npx prisma migrate deploy
```

**What this does:**
- Adds `TimesheetEntry.invoiced` field (Boolean, default: false)
- Adds `TimesheetEntry.overnight` field (Boolean, default: false)
- Ensures `Timesheet.status` includes 'LOCKED'
- Adds `Timesheet.lockedAt` field (DateTime?)
- Adds `Timesheet.timezone` field (String, default: "America/New_York")

### Step 4: Verify Migration

Check that the migration was successful:

```sql
-- Check TimesheetEntry has invoiced field
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'TimesheetEntry' 
AND column_name IN ('invoiced', 'overnight');

-- Check Timesheet has LOCKED status
SELECT unnest(enum_range(NULL::"TimesheetStatus")) AS status;
-- Should include: DRAFT, SUBMITTED, APPROVED, REJECTED, LOCKED
```

Or use Prisma Studio:
```bash
npx prisma studio
```

### Step 5: Start Application

```bash
npm start
```

### Step 6: Verify Deployment

1. **Check Logs** - Look for:
   ```
   [CRON] Initializing cron jobs...
   [CRON] Invoice generation job scheduled: 0 7 * * 2 (America/New_York)
   Cron jobs initialized
   ✅ Server initialization complete: Cron jobs started
   ```

2. **Test Manual Invoice Generation**:
   - Log in as ADMIN user
   - Navigate to Invoices page
   - Click "Generate Invoices" button
   - Select "Current Billing Period"
   - Click "Generate"
   - Verify invoice is created

3. **Verify Invoice Detail**:
   - Open created invoice
   - Check line items show correctly
   - Verify DR/SV times with AM/PM
   - Test print functionality

## Database URL Format

### PostgreSQL
```
postgresql://[user]:[password]@[host]:[port]/[database]
```

**Examples:**
- Local: `postgresql://postgres:password@localhost:5432/aplus_center`
- Remote: `postgresql://user:pass@db.example.com:5432/production_db`
- With SSL: `postgresql://user:pass@host:5432/db?sslmode=require`

### Connection Pooling (Recommended for Production)
```
postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
```

## Troubleshooting

### Error: "Environment variable not found: DATABASE_URL"
**Solution**: Set the `DATABASE_URL` environment variable (see Step 1)

### Error: "Can't reach database server"
**Solution**: 
- Check database server is running
- Verify connection string is correct
- Check firewall/network settings
- Verify credentials

### Error: "Migration failed"
**Solution**:
- Check database permissions
- Verify schema is compatible
- Check for existing conflicting data
- Review error message for specific issue

## Quick Commands Reference

```bash
# 1. Set environment variable (Windows PowerShell)
$env:DATABASE_URL="postgresql://user:pass@host:5432/db"

# 2. Generate Prisma Client
npx prisma generate

# 3. Push schema to database
npx prisma db push

# 4. Open Prisma Studio (to verify)
npx prisma studio

# 5. Start application
npm start
```

## Production Checklist

- [ ] `DATABASE_URL` environment variable set
- [ ] Database connection verified
- [ ] Database migration completed
- [ ] Application starts successfully
- [ ] Cron job initializes (check logs)
- [ ] Manual invoice generation tested
- [ ] Invoice detail view verified
- [ ] Ready for first automatic run (Tuesday 7:00 AM ET)

## Next: After Database Setup

Once the database is configured and migration is complete:

1. **Start the application**: `npm start`
2. **Monitor logs**: Check for cron job initialization
3. **Test manually**: Generate an invoice via Admin UI
4. **Wait for automatic run**: Next Tuesday at 7:00 AM ET

---

**Current Step**: Database Configuration
**Next Step**: Run Migration → Start Application → Verify

*Ready to proceed once DATABASE_URL is configured*
