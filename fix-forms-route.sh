#!/bin/bash
# Fix forms/route.ts

cd /var/www/aplus-center

echo "=== Fixing forms/route.ts ==="
echo ""

if [ -f forms/route.ts ]; then
    echo "Fixing year field and removing deletedAt..."
    sed -i 's/year: parseInt(year),/year: year ? parseInt(year) : undefined,/' forms/route.ts
    sed -i '/deletedAt: null,/d' forms/route.ts
    echo "✅ Fixed"
else
    echo "❌ forms/route.ts not found"
    exit 1
fi

echo ""
echo "Building..."
npm run build 2>&1 | tail -30
