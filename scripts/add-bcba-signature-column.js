const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    await prisma.$executeRaw`ALTER TABLE "BCBA" ADD COLUMN IF NOT EXISTS signature TEXT;`
    console.log('✅ BCBA signature column added successfully!')
  } catch (error) {
    console.error('❌ Error adding column:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
