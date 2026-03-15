#!/bin/bash
# Force Regenerate Prisma Client

cd /var/www/aplus-center

echo "=== Force Regenerating Prisma Client ==="
echo ""

echo "1. Removing all Prisma caches..."
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client
rm -rf .prisma

echo ""
echo "2. Validating schema..."
npx prisma validate 2>&1

echo ""
echo "3. Generating Prisma Client with verbose output..."
npx prisma generate --schema=./prisma/schema.prisma 2>&1 | tee /tmp/prisma-generate.log

echo ""
echo "4. Checking generation log for errors..."
if grep -i "error" /tmp/prisma-generate.log; then
    echo "⚠️  Errors found in generation log"
    grep -i "error" /tmp/prisma-generate.log
else
    echo "✅ No errors in generation log"
fi

echo ""
echo "5. Checking if payrollRun exists in generated client..."
if [ -f node_modules/@prisma/client/index.d.ts ]; then
    if grep -q "payrollRun" node_modules/@prisma/client/index.d.ts; then
        echo "✅ payrollRun found!"
        grep "payrollRun" node_modules/@prisma/client/index.d.ts | head -3
    else
        echo "❌ payrollRun still not found"
        echo ""
        echo "Checking what models ARE generated..."
        grep -E "^\s+[a-z]+:" node_modules/@prisma/client/index.d.ts | head -40
    fi
fi

echo ""
echo "6. Testing with Node..."
node -e "
try {
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    const allKeys = Object.keys(p).sort();
    console.log('Total PrismaClient keys:', allKeys.length);
    const payrollKeys = allKeys.filter(k => k.toLowerCase().includes('payroll'));
    console.log('Payroll keys:', payrollKeys.length > 0 ? payrollKeys.join(', ') : 'NONE');
    if (payrollKeys.length === 0) {
        console.log('First 20 keys:', allKeys.slice(0, 20).join(', '));
    }
} catch (e) {
    console.error('Error:', e.message);
}
" 2>&1

echo ""
echo "7. Building to see if it works now..."
npm run build 2>&1 | grep -E "(payrollRun|BUILD|SUCCESS|FAILED)" | head -10
