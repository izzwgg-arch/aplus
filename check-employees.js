const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkEmployees() {
  try {
    const count = await prisma.payrollEmployee.count()
    console.log('Total employees in database:', count)
    
    const employees = await prisma.payrollEmployee.findMany({
      take: 10,
      orderBy: { fullName: 'asc' }
    })
    
    console.log('\nEmployees found:')
    employees.forEach(emp => {
      console.log(`- ${emp.fullName} (ID: ${emp.id}, Active: ${emp.active})`)
    })
    
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkEmployees()
