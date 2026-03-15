const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('='.repeat(80))
  console.log('CHECKING SCHEDULED EMAILS')
  console.log('='.repeat(80))
  console.log('')

  const now = new Date()
  console.log(`Current time: ${now.toISOString()}`)
  console.log(`Current time (Eastern): ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
  console.log('')

  // Check all scheduled emails
  const scheduledEmails = await prisma.emailQueueItem.findMany({
    where: {
      entityType: 'COMMUNITY_INVOICE',
      scheduledSendAt: { not: null },
      deletedAt: null,
    },
    orderBy: { scheduledSendAt: 'desc' },
    take: 20,
  })

  console.log(`Found ${scheduledEmails.length} scheduled email(s) in queue:`)
  console.log('')

  for (const email of scheduledEmails) {
    const scheduledTime = email.scheduledSendAt
    const isPast = scheduledTime && scheduledTime <= now
    const status = isPast ? '⏰ PAST DUE' : '⏳ PENDING'
    const timeDiff = scheduledTime ? Math.round((scheduledTime.getTime() - now.getTime()) / 1000 / 60) : 0

    console.log(`${status} - ${email.id}`)
    console.log(`  Status: ${email.status}`)
    console.log(`  Scheduled: ${scheduledTime?.toISOString()}`)
    console.log(`  Scheduled (Eastern): ${scheduledTime?.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
    console.log(`  Time difference: ${timeDiff} minutes ${isPast ? '(should have been sent)' : '(will be sent)'}`)
    console.log(`  Recipients: ${email.toEmail || 'NOT SET'}`)
    console.log(`  Entity ID: ${email.entityId}`)
    console.log(`  Created: ${email.createdAt.toISOString()}`)
    if (email.errorMessage) {
      console.log(`  Error: ${email.errorMessage}`)
    }
    console.log('')
  }

  // Check for emails that should have been sent
  const pastDue = scheduledEmails.filter(e => e.scheduledSendAt && e.scheduledSendAt <= now && e.status === 'QUEUED')
  
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total scheduled emails: ${scheduledEmails.length}`)
  console.log(`Past due (should have been sent): ${pastDue.length}`)
  console.log(`Queued: ${scheduledEmails.filter(e => e.status === 'QUEUED').length}`)
  console.log(`Sending: ${scheduledEmails.filter(e => e.status === 'SENDING').length}`)
  console.log(`Sent: ${scheduledEmails.filter(e => e.status === 'SENT').length}`)
  console.log(`Failed: ${scheduledEmails.filter(e => e.status === 'FAILED').length}`)
  console.log('')

  if (pastDue.length > 0) {
    console.log('⚠️  PAST DUE EMAILS (should have been sent but are still QUEUED):')
    pastDue.forEach(e => {
      const minutesPast = Math.round((now.getTime() - e.scheduledSendAt.getTime()) / 1000 / 60)
      console.log(`  - ${e.id}: ${minutesPast} minutes past due, scheduled for ${e.scheduledSendAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
    })
  }

  await prisma.$disconnect()
}

main().catch(console.error)
