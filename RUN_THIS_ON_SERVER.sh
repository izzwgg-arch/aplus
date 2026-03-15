#!/bin/bash
# ============================================================================
# EMERGENCY FIX: ERR_EMPTY_RESPONSE - Prerender Manifest Issue
# Run this on server: 66.94.105.43
# ============================================================================

set -e

echo "============================================================================"
echo "🔧 FIXING SERVER: ERR_EMPTY_RESPONSE"
echo "============================================================================"
echo ""

# Set app directory (adjust if different)
APP_DIR="/var/www/aplus-center"

# Check if directory exists
if [ ! -d "$APP_DIR" ]; then
    echo "❌ Error: Directory $APP_DIR not found!"
    echo "Please update APP_DIR in this script to match your server setup."
    exit 1
fi

cd "$APP_DIR"
echo "📁 Working directory: $(pwd)"
echo ""

# Step 1: Ensure .next directory exists
echo "Step 1: Checking .next directory..."
if [ ! -d ".next" ]; then
    echo "   Creating .next directory..."
    mkdir -p .next
    echo "   ✅ Created"
else
    echo "   ✅ Already exists"
fi
echo ""

# Step 2: Create prerender-manifest.json
echo "Step 2: Creating prerender-manifest.json..."
MANIFEST_FILE=".next/prerender-manifest.json"

# Remove old file if corrupted
if [ -f "$MANIFEST_FILE" ]; then
    # Try to validate JSON
    if ! python3 -m json.tool "$MANIFEST_FILE" > /dev/null 2>&1 && ! node -e "JSON.parse(require('fs').readFileSync('$MANIFEST_FILE'))" 2>/dev/null; then
        echo "   ⚠️  Existing file is corrupted, removing..."
        rm "$MANIFEST_FILE"
    fi
fi

# Create the manifest
cat > "$MANIFEST_FILE" << 'EOF'
{
  "version": 4,
  "routes": {},
  "dynamicRoutes": {},
  "notFoundRoutes": [],
  "preview": {
    "previewModeId": "",
    "previewModeSigningKey": "",
    "previewModeEncryptionKey": ""
  }
}
EOF

# Verify it was created
if [ -f "$MANIFEST_FILE" ]; then
    echo "   ✅ File created successfully"
    echo "   📄 File size: $(stat -f%z "$MANIFEST_FILE" 2>/dev/null || stat -c%s "$MANIFEST_FILE" 2>/dev/null) bytes"
else
    echo "   ❌ Failed to create file!"
    exit 1
fi
echo ""

# Step 3: Restart PM2
echo "Step 3: Restarting PM2..."
if command -v pm2 &> /dev/null; then
    # Try to find the app name
    APP_NAME=""
    if pm2 list | grep -q "aplus-center"; then
        APP_NAME="aplus-center"
    elif pm2 list | grep -q "a-plus-center"; then
        APP_NAME="a-plus-center"
    else
        # Get first app name
        APP_NAME=$(pm2 jlist | python3 -c "import sys, json; apps=json.load(sys.stdin); print(apps[0]['name'] if apps else '')" 2>/dev/null || echo "")
    fi
    
    if [ -n "$APP_NAME" ]; then
        echo "   Restarting: $APP_NAME"
        pm2 restart "$APP_NAME"
        echo "   ✅ PM2 restarted"
    else
        echo "   ⚠️  Could not find PM2 app, restarting all..."
        pm2 restart all
        echo "   ✅ All PM2 apps restarted"
    fi
else
    echo "   ⚠️  PM2 not found. Please restart manually."
fi
echo ""

# Step 4: Show status
echo "Step 4: Checking status..."
if command -v pm2 &> /dev/null; then
    echo ""
    echo "📊 PM2 Status:"
    pm2 status
    echo ""
    echo "📋 Recent logs (last 15 lines):"
    pm2 logs --lines 15 --nostream 2>/dev/null || echo "   (Could not fetch logs)"
fi
echo ""

# Final message
echo "============================================================================"
echo "✅ FIX COMPLETE!"
echo "============================================================================"
echo ""
echo "🌐 Test your server: http://66.94.105.43:3000"
echo ""
echo "If it's still not working:"
echo "  1. Check PM2 logs: pm2 logs --lines 50"
echo "  2. Verify .next/prerender-manifest.json exists"
echo "  3. Try rebuilding: npm run build && pm2 restart all"
echo ""
