const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TARGET_EMAILS = [
  'Esti@apluscenterinc.org',
  'leahw@apluscenterinc.org',
  'Libbyw@apluscenterinc.org',
].map(email => email.toLowerCase().trim())

async function main() {
  console.log('Checking email usage in database...')
  console.log('Target emails:', TARGET_EMAILS.join(', '))
  console.log('')

  // Check with Prisma (respects deletedAt filtering)
  const usersPrisma = await prisma.user.findMany({
    where: {
      email: { in: TARGET_EMAILS },
    },
    select: {
      id: true,
      email: true,
      username: true,
      deletedAt: true,
      active: true,
    },
  })

  console.log('Prisma query results (may filter deletedAt):')
  console.log(`Found ${usersPrisma.length} user(s)`)
  usersPrisma.forEach(user => {
    console.log(`  - ${user.email} (id=${user.id}, deletedAt=${user.deletedAt || 'null'}, active=${user.active})`)
  })
  console.log('')

  // Check with raw SQL to see ALL records including soft-deleted
  const rawQuery = `
    SELECT id, email, username, "deletedAt", active 
    FROM "User" 
    WHERE LOWER(email) IN (${TARGET_EMAILS.map(e => `'${e}'`).join(', ')})
    ORDER BY email;
  `
  
  const rawUsers = await prisma.$queryRawUnsafe(rawQuery)
  console.log('Raw SQL query results (includes soft-deleted):')
  console.log(`Found ${rawUsers.length} user(s)`)
  rawUsers.forEach(user => {
    console.log(`  - ${user.email} (id=${user.id}, deletedAt=${user.deletedAt || 'null'}, active=${user.active})`)
  })
  console.log('')

  // Check unique constraint
  console.log('Checking unique constraint violations...')
  const uniqueCheck = await prisma.$queryRawUnsafe(`
    SELECT 
      email,
      COUNT(*) as count
    FROM "User"
    WHERE LOWER(email) IN (${TARGET_EMAILS.map(e => `'${e}'`).join(', ')})
    GROUP BY email
    HAVING COUNT(*) > 1;
  `)
  
  if (uniqueCheck.length > 0) {
    console.log('⚠️  Found duplicate emails (should not happen):')
    uniqueCheck.forEach(dup => {
      console.log(`  - ${dup.email}: ${dup.count} records`)
    })
  } else {
    console.log('✓ No duplicate emails found')
  }

  await prisma.$disconnect()
}

main().catch(console.error)
