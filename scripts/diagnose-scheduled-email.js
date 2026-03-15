const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Diagnosing scheduled email issue...')
  console.log('')

  const now = new Date()
  console.log(`Current time: ${now.toISOString()}`)
  console.log(`Current time (Eastern): ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
  console.log('')

  // Check ALL email queue items (not just scheduled)
  const allEmails = await prisma.emailQueueItem.findMany({
    where: {
      entityType: 'COMMUNITY_INVOICE',
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  console.log(`Found ${allEmails.length} recent Community invoice email(s):`)
  console.log('')

  for (const email of allEmails) {
    console.log(`ID: ${email.id}`)
    console.log(`  Status: ${email.status}`)
    console.log(`  Created: ${email.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York' })}`)
    console.log(`  Scheduled: ${email.scheduledSendAt ? email.scheduledSendAt.toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'NOT SCHEDULED'}`)
    console.log(`  Recipients: ${email.toEmail || 'NOT SET'}`)
    console.log(`  Context: ${email.context || 'NOT SET'}`)
    
    if (email.scheduledSendAt) {
      const isPast = email.scheduledSendAt <= now
      const minutesDiff = Math.round((email.scheduledSendAt.getTime() - now.getTime()) / 1000 / 60)
      console.log(`  Time status: ${isPast ? 'PAST DUE' : 'FUTURE'} (${minutesDiff} minutes ${isPast ? 'ago' : 'from now'})`)
      
      if (email.status === 'QUEUED' && isPast) {
        console.log(`  ⚠️  This email should have been sent!`)
      }
    }
    
    if (email.errorMessage) {
      console.log(`  Error: ${email.errorMessage}`)
    }
    console.log('')
  }

  // Check specifically for QUEUED emails with scheduledSendAt
  const queuedScheduled = await prisma.emailQueueItem.findMany({
    where: {
      entityType: 'COMMUNITY_INVOICE',
      status: 'QUEUED',
      scheduledSendAt: { not: null },
      deletedAt: null,
    },
    orderBy: { scheduledSendAt: 'asc' },
  })

  console.log(`QUEUED scheduled emails: ${queuedScheduled.length}`)
  if (queuedScheduled.length > 0) {
    console.log('')
    queuedScheduled.forEach(e => {
      const isPast = e.scheduledSendAt && e.scheduledSendAt <= now
      console.log(`  - ${e.id}: ${e.scheduledSendAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} ${isPast ? '(PAST DUE)' : '(FUTURE)'}`)
    })
  }

  await prisma.$disconnect()
}

main().catch(console.error)
