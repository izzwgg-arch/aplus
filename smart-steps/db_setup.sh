#!/bin/bash
LOG=/tmp/db_setup.log
exec > $LOG 2>&1
echo "=== DB Setup ==="

# Set password for aba_user
sudo -u postgres psql <<SQL
ALTER USER aba_user PASSWORD 'abapass123';
GRANT ALL PRIVILEGES ON DATABASE aba_db TO aba_user;
SQL

echo "Password set"

# Add DATABASE_URL to env.local
ENVFILE=/var/www/aplus/aplus-center-scheduling/smart-steps/.env.local
if ! grep -q DATABASE_URL "$ENVFILE" 2>/dev/null; then
  echo 'DATABASE_URL="postgresql://aba_user:abapass123@localhost:5432/aba_db?schema=public"' >> "$ENVFILE"
  echo "Added DATABASE_URL to $ENVFILE"
else
  echo "DATABASE_URL already in $ENVFILE"
fi

echo "=== Testing connection ==="
PGPASSWORD=abapass123 psql -U aba_user -d aba_db -c "\dt" 2>&1 | head -20

echo "=== Running prisma db push ==="
cd /var/www/aplus/aplus-center-scheduling/smart-steps
DATABASE_URL="postgresql://aba_user:abapass123@localhost:5432/aba_db?schema=public" npx prisma db push --accept-data-loss 2>&1

echo "=== DONE ==="