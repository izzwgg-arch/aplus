#!/bin/bash
# Complete Build and Start

cd /var/www/aplus-center

echo "=== Completing Build ==="
echo ""

echo "1. Stopping PM2..."
pm2 stop aplus-center

echo ""
echo "2. Removing old build..."
rm -rf .next

echo ""
echo "3. Building application..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "4. Starting PM2..."
    pm2 start aplus-center
    
    echo ""
    echo "5. Waiting for startup..."
    sleep 5
    
    echo ""
    echo "6. Status:"
    pm2 status
    
    echo ""
    echo "7. Testing application..."
    curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3000
    
    echo ""
    echo "✅ Application should be running now!"
else
    echo ""
    echo "❌ Build failed! Check errors above."
    exit 1
fi
