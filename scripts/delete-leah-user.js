const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Deleting user with email containing "leahw"...')
  
  // Find user case-insensitively
  const users = await prisma.$queryRaw`
    SELECT id, email, "deletedAt"
    FROM "User"
    WHERE LOWER(email) = LOWER('Leahw@apluscenterinc.org');
  `
  
  console.log(`Found ${users.length} user(s):`)
  users.forEach(u => {
    console.log(`  - ${u.email} (id: ${u.id}, deletedAt: ${u.deletedAt || 'null'})`)
  })
  
  if (users.length > 0) {
    for (const user of users) {
      console.log(`\nDeleting user: ${user.email} (id: ${user.id})...`)
      await prisma.user.delete({
        where: { id: user.id },
      })
      console.log(`✓ Deleted`)
    }
  }
  
  // Verify
  const remaining = await prisma.$queryRaw`
    SELECT id, email
    FROM "User"
    WHERE LOWER(email) = LOWER('Leahw@apluscenterinc.org');
  `
  
  console.log('\nVerification:')
  if (remaining.length === 0) {
    console.log('✓ No users found with that email')
  } else {
    console.log('⚠️  Still found:')
    remaining.forEach(u => console.log(`  - ${u.email}`))
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
