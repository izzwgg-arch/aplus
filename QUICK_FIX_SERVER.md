# Quick Fix: ERR_EMPTY_RESPONSE on Server

## Problem
Server at `66.94.105.43` returns `ERR_EMPTY_RESPONSE` - this is usually caused by missing or corrupted `prerender-manifest.json`.

## Quick Fix (Run on Server)

### Option 1: Use the fix script
```bash
cd /var/www/aplus-center
chmod +x fix-server-prerender.sh
./fix-server-prerender.sh
```

### Option 2: Manual fix

**Step 1: SSH into server**
```bash
ssh root@66.94.105.43
```

**Step 2: Navigate to app directory**
```bash
cd /var/www/aplus-center
```

**Step 3: Create prerender-manifest.json**
```bash
mkdir -p .next

cat > .next/prerender-manifest.json << 'EOF'
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
```

**Step 4: Restart PM2**
```bash
pm2 restart aplus-center
```

**Step 5: Check status**
```bash
pm2 status
pm2 logs aplus-center --lines 20
```

## Alternative: Rebuild

If the above doesn't work, rebuild the application:

```bash
cd /var/www/aplus-center
npm run build
pm2 restart aplus-center
```

## Verify Fix

1. Visit `http://66.94.105.43:3000` in browser
2. Should see login page or dashboard
3. Check PM2 logs: `pm2 logs aplus-center --lines 50`

## Prevention

The `postbuild` script in `package.json` should automatically create this file after each build. If it's missing, the build may have failed or the file was deleted.

To ensure it's always created, the `create-prerender.js` script runs automatically after `npm run build`.
