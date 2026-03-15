#!/bin/bash

# A Plus Center Deployment Script
# Run this on the server: root@66.94.105.43

set -e

echo "🚀 Starting A Plus Center deployment..."

# Update system
apt-get update -y
apt-get upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PostgreSQL
apt-get install -y postgresql postgresql-contrib

# Install PM2 for process management
npm install -g pm2

# Install nginx
apt-get install -y nginx

# Create application directory
APP_DIR="/var/www/aplus-center"
mkdir -p $APP_DIR
cd $APP_DIR

# Create .env file template (user should fill this)
cat > .env << EOF
DATABASE_URL="postgresql://aplususer:CHANGE_THIS_PASSWORD@localhost:5432/apluscenter?schema=public"
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
TZ=America/New_York
EOF

# Create PostgreSQL database and user
sudo -u postgres psql << EOF
CREATE USER aplususer WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE apluscenter OWNER aplususer;
GRANT ALL PRIVILEGES ON DATABASE apluscenter TO aplususer;
\q
EOF

echo "✅ Basic server setup complete!"
echo "📝 Next steps:"
echo "1. Upload your application files to $APP_DIR"
echo "2. Update .env with your actual credentials"
echo "3. Run: cd $APP_DIR && npm install"
echo "4. Run: npx prisma migrate deploy"
echo "5. Run: npm run build"
echo "6. Run: pm2 start npm --name aplus-center -- start"
echo "7. Configure nginx reverse proxy"
