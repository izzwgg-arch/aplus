const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function test() {
  try {
    console.log('All Prisma client properties:')
    const keys = Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_'))
    console.log(keys.sort().join(', '))
    
    console.log('\nLooking for Payroll models:')
    keys.forEach(k => {
      if (k.toLowerCase().includes('payroll') || k.toLowerCase().includes('import')) {
        console.log(`  - ${k}: ${typeof prisma[k]}`)
      }
    })
    
    // Try to access it with different casing
    console.log('\nTrying different casings:')
    console.log('  payrollImport:', typeof prisma.payrollImport)
    console.log('  PayrollImport:', typeof prisma.PayrollImport)
    console.log('  payroll_import:', typeof prisma.payroll_import)
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

test()
