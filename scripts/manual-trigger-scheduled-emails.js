const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Manually triggering scheduled email processing...')
  console.log('')

  // Import the cron function
  const { processScheduledEmails } = require('../lib/cron')
  
  try {
    await processScheduledEmails()
    console.log('✓ Scheduled email processing completed')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  }

  await prisma.$disconnect()
}

main().catch(console.error)
