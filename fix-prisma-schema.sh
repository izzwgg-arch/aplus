#!/bin/bash
# Fix Prisma Schema and Regenerate

cd /var/www/aplus-center

echo "=== Fixing Prisma Schema ==="
echo ""

echo "1. Checking for PayrollRun model in schema..."
if grep -q "model PayrollRun" prisma/schema.prisma; then
    echo "✅ PayrollRun model found"
    grep "model PayrollRun" prisma/schema.prisma
else
    echo "❌ PayrollRun model NOT FOUND in schema!"
    echo "This is the problem - schema is missing PayrollRun"
    exit 1
fi

echo ""
echo "2. Checking all Payroll models..."
grep "^model Payroll" prisma/schema.prisma | head -10

echo ""
echo "3. Removing old Prisma Client..."
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client

echo ""
echo "4. Regenerating Prisma Client..."
npx prisma generate 2>&1 | tail -10

echo ""
echo "5. Verifying PayrollRun in generated client..."
if grep -q "payrollRun" node_modules/@prisma/client/index.d.ts 2>/dev/null; then
    echo "✅ payrollRun found in Prisma Client"
else
    echo "❌ payrollRun NOT in Prisma Client"
    echo "Checking what models are available..."
    grep -o "^\s*[a-zA-Z]*:" node_modules/@prisma/client/index.d.ts | grep -i payroll | head -10
fi

echo ""
echo "6. Building application..."
rm -rf .next
npm run build 2>&1 | tee /tmp/prisma-fix-build.log

BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ] && [ -d .next ] && [ -f .next/BUILD_ID ]; then
    echo ""
    echo "✅✅✅ BUILD SUCCESSFUL! ✅✅✅"
    echo ""
    echo "7. Starting PM2..."
    pm2 start aplus-center
    sleep 5
    pm2 status
    echo ""
    echo "✅ Application is running!"
else
    echo ""
    echo "❌ BUILD FAILED"
    echo "Last 30 lines:"
    tail -30 /tmp/prisma-fix-build.log
    exit 1
fi
