const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TARGET_EMAILS = [
  'Esti@apluscenterinc.org',
  'leahw@apluscenterinc.org',
  'Libbyw@apluscenterinc.org',
].map(email => email.toLowerCase().trim())

async function main() {
  console.log('Verifying user deletion...')
  console.log('Target emails:', TARGET_EMAILS.join(', '))
  console.log('')

  const users = await prisma.user.findMany({
    where: {
      email: { in: TARGET_EMAILS },
    },
    select: {
      id: true,
      email: true,
      deletedAt: true,
    },
  })

  if (users.length === 0) {
    console.log('✅ SUCCESS: No users found with target email addresses')
    console.log('✅ All email addresses are available for reuse')
  } else {
    console.log('⚠️  Found remaining users:')
    users.forEach(user => {
      console.log(`  - ${user.email} (id=${user.id}, deletedAt=${user.deletedAt || 'null'})`)
    })
  }

  await prisma.$disconnect()
}

main().catch(console.error)
