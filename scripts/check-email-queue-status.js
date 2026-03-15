const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('CHECKING EMAIL QUEUE STATUS')
  console.log('='.repeat(80))
  console.log('')

  // Check all recent Community invoice emails
  const recentEmails = await prisma.emailQueueItem.findMany({
    where: {
      entityType: 'COMMUNITY_INVOICE',
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  console.log(`Found ${recentEmails.length} recent Community invoice email(s):`)
  console.log('')

  for (const email of recentEmails) {
    console.log(`- ${email.id}`)
    console.log(`  Status: ${email.status}`)
    console.log(`  Scheduled: ${email.scheduledSendAt ? email.scheduledSendAt.toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'NOT SCHEDULED'}`)
    console.log(`  Recipients: ${email.toEmail || 'NOT SET'}`)
    console.log(`  Created: ${email.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
    console.log(`  Sent: ${email.sentAt ? email.sentAt.toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'NOT SENT'}`)
    if (email.errorMessage) {
      console.log(`  Error: ${email.errorMessage}`)
    }
    console.log('')
  }

  // Summary
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total: ${recentEmails.length}`)
  console.log(`Queued: ${recentEmails.filter(e => e.status === 'QUEUED').length}`)
  console.log(`Sending: ${recentEmails.filter(e => e.status === 'SENDING').length}`)
  console.log(`Sent: ${recentEmails.filter(e => e.status === 'SENT').length}`)
  console.log(`Failed: ${recentEmails.filter(e => e.status === 'FAILED').length}`)
  console.log(`With scheduledSendAt: ${recentEmails.filter(e => e.scheduledSendAt).length}`)
  console.log('')

  await prisma.$disconnect()
}

main().catch(console.error)
