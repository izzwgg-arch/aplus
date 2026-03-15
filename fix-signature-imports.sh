#!/bin/bash
# Fix SignatureCapture Imports

cd /var/www/aplus-center

echo "=== Fixing SignatureCapture Imports ==="
echo ""

echo "1. Finding all files with SignatureCapture import..."
grep -r "from './SignatureCapture'" --include="*.tsx" --include="*.ts" . 2>/dev/null | grep -v node_modules | head -10

echo ""
echo "2. Fixing imports..."
find . -name "*.tsx" -o -name "*.ts" | grep -v node_modules | grep -v .next | xargs sed -i "s|from './SignatureCapture'|from '@/components/forms/SignatureCapture'|g" 2>/dev/null

echo ""
echo "3. Verifying SignatureCapture file exists..."
if [ -f components/forms/SignatureCapture.tsx ]; then
    echo "✅ components/forms/SignatureCapture.tsx"
fi
if [ -f components/bcbas/forms/SignatureCapture.tsx ]; then
    echo "✅ components/bcbas/forms/SignatureCapture.tsx"
fi

echo ""
echo "4. Building..."
rm -rf .next
npm run build 2>&1 | tail -50

if [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESS! ✅✅✅"
    pm2 start aplus-center
    sleep 5
    pm2 status
else
    echo ""
    echo "❌ Build failed - checking errors..."
    exit 1
fi
