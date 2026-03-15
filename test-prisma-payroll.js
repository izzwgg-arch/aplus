const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function test() {
  try {
    console.log('Testing Prisma Payroll models...')
    console.log('PayrollImport model exists:', typeof prisma.payrollImport !== 'undefined')
    console.log('PayrollImport.findFirst type:', typeof prisma.payrollImport?.findFirst)
    
    // Try to list all models
    const modelKeys = Object.keys(prisma).filter(k => 
      k.toLowerCase().includes('payroll') && 
      !k.startsWith('$') && 
      !k.startsWith('_')
    )
    console.log('Payroll-related models found:', modelKeys.join(', '))
    
    // Try a simple query
    const count = await prisma.payrollImport.count()
    console.log('PayrollImport count:', count)
    
    console.log('✅ Prisma Payroll models are working!')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

test()
