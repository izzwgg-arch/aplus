const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Checking user "leahw"...\n')
  
  // Check for user with email containing leahw (case-insensitive)
  const users = await prisma.user.findMany({
    where: {
      email: {
        contains: 'leahw',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      email: true,
      username: true,
      active: true,
      deletedAt: true,
      resetToken: true,
      resetTokenExpiry: true,
    },
  })
  
  console.log(`Found ${users.length} user(s):`)
  users.forEach(user => {
    console.log(`\n  Email: ${user.email}`)
    console.log(`  Username: ${user.username}`)
    console.log(`  Active: ${user.active}`)
    console.log(`  Deleted: ${user.deletedAt ? 'Yes (' + user.deletedAt + ')' : 'No'}`)
    console.log(`  Has Reset Token: ${user.resetToken ? 'Yes' : 'No'}`)
    if (user.resetTokenExpiry) {
      console.log(`  Reset Token Expires: ${user.resetTokenExpiry}`)
      console.log(`  Token Expired: ${new Date() > user.resetTokenExpiry ? 'Yes' : 'No'}`)
    }
  })
  
  // Check exact email match
  const exactEmail = users.find(u => u.email.toLowerCase() === 'leahw@apluscenterinc.org')
  if (!exactEmail) {
    console.log('\n⚠️  No user found with exact email: leahw@apluscenterinc.org')
    console.log('   Trying case-insensitive match...')
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
