#!/bin/bash
# Check Prisma Client for PayrollRun

cd /var/www/aplus-center

echo "=== Checking Prisma Client ==="
echo ""

echo "1. Checking schema for PayrollRun model..."
if grep -q "^model PayrollRun" prisma/schema.prisma; then
    echo "✅ PayrollRun model found in schema"
    grep "^model PayrollRun" prisma/schema.prisma
else
    echo "❌ PayrollRun model NOT in schema!"
    exit 1
fi

echo ""
echo "2. Regenerating Prisma Client..."
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client
npx prisma generate 2>&1 | tail -5

echo ""
echo "3. Checking Prisma Client exports..."
if [ -f node_modules/@prisma/client/index.d.ts ]; then
    echo "Checking for payroll models in Prisma Client..."
    # Prisma uses camelCase, so PayrollRun becomes payrollRun
    if grep -q "payrollRun:" node_modules/@prisma/client/index.d.ts; then
        echo "✅ payrollRun found in Prisma Client!"
    else
        echo "❌ payrollRun NOT found"
        echo ""
        echo "Available models (first 30):"
        grep -E "^\s+[a-z]+:" node_modules/@prisma/client/index.d.ts | head -30
        echo ""
        echo "Searching for any payroll-related exports:"
        grep -i "payroll" node_modules/@prisma/client/index.d.ts | head -10
    fi
else
    echo "❌ Prisma Client index.d.ts not found!"
fi

echo ""
echo "4. Testing Prisma Client in Node..."
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const keys = Object.keys(p).filter(k => k.toLowerCase().includes('payroll'));
console.log('Payroll-related keys in PrismaClient:', keys.length > 0 ? keys.join(', ') : 'NONE FOUND');
" 2>&1

echo ""
echo "5. Building to see actual error..."
npm run build 2>&1 | grep -A 5 "payrollRun" | head -10
