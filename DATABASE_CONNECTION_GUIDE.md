# Database Connection Guide

## Current Status
⚠️ **Database server not reachable at localhost:5432**

## Connection Details
- **Host**: localhost:5432
- **Database**: apluscenter
- **User**: aplususer
- **Schema**: public

## Troubleshooting Steps

### Step 1: Check if PostgreSQL is Running

#### Windows
```powershell
# Check if PostgreSQL service is running
Get-Service -Name "*postgresql*"

# Start PostgreSQL service (if stopped)
Start-Service -Name "postgresql-x64-14"  # Adjust version number
```

Or check Services:
1. Press `Win + R`
2. Type `services.msc`
3. Look for "PostgreSQL" service
4. Right-click → Start (if stopped)

#### Alternative: Check if port is listening
```powershell
netstat -an | findstr "5432"
```

### Step 2: Verify Database Exists

Connect to PostgreSQL and check:

```bash
# Connect to PostgreSQL
psql -U postgres

# List databases
\l

# Check if apluscenter exists
# If not, create it:
CREATE DATABASE apluscenter;

# Create user if needed
CREATE USER aplususer WITH PASSWORD 'nRJExw6IP1T8qCD5';

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE apluscenter TO aplususer;
```

### Step 3: Test Connection

Once PostgreSQL is running, test the connection:

```bash
# Set environment variable
$env:DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"

# Test with Prisma
npx prisma db pull
```

### Step 4: Run Migration

Once connection is verified:

```bash
# Set environment variable
$env:DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"

# Run migration
npx prisma db push
```

## Common Issues

### Issue: "Can't reach database server"
**Solutions:**
1. PostgreSQL service not running → Start the service
2. Wrong port → Check PostgreSQL configuration (usually 5432)
3. Firewall blocking → Check Windows Firewall settings
4. PostgreSQL not installed → Install PostgreSQL

### Issue: "Database does not exist"
**Solution:**
```sql
CREATE DATABASE apluscenter;
```

### Issue: "Authentication failed"
**Solutions:**
1. Check username/password
2. Verify user exists: `\du` in psql
3. Check pg_hba.conf configuration

### Issue: "Permission denied"
**Solution:**
```sql
GRANT ALL PRIVILEGES ON DATABASE apluscenter TO aplususer;
ALTER USER aplususer CREATEDB;
```

## Quick Setup Script

If you need to set up the database from scratch:

```sql
-- Connect as postgres superuser
psql -U postgres

-- Create database
CREATE DATABASE apluscenter;

-- Create user
CREATE USER aplususer WITH PASSWORD 'nRJExw6IP1T8qCD5';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE apluscenter TO aplususer;
ALTER USER aplususer CREATEDB;

-- Connect to the new database
\c apluscenter

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO aplususer;
```

## Next Steps

Once the database is accessible:

1. **Set environment variable** (already done)
2. **Run migration**: `npx prisma db push`
3. **Verify**: `npx prisma studio`
4. **Start application**: `npm start`

## Alternative: Use .env.local File

Create a `.env.local` file in the project root:

```env
DATABASE_URL="postgresql://aplususer:nRJExw6IP1T8qCD5@localhost:5432/apluscenter?schema=public"
```

This way, you don't need to set the environment variable each time.

---

**Status**: Waiting for database server to be accessible
**Next**: Once PostgreSQL is running, retry migration
