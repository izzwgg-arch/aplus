const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TARGET_EMAIL = 'Leahw@apluscenterinc.org' // Case-sensitive match

async function main() {
  console.log('Hard-deleting remaining soft-deleted user...')
  console.log(`Target email: ${TARGET_EMAIL}`)
  console.log('')

  // Find the user
  const user = await prisma.user.findFirst({
    where: {
      email: TARGET_EMAIL,
    },
  })

  if (!user) {
    console.log('User not found. Checking case-insensitive...')
    const userLower = await prisma.user.findFirst({
      where: {
        email: { contains: 'leahw', mode: 'insensitive' },
      },
    })
    if (userLower) {
      console.log(`Found user with email: ${userLower.email}`)
      console.log('Proceeding with hard delete...')
      
      const userId = userLower.id
      
      // Hard delete the user
      await prisma.user.delete({
        where: { id: userId },
      })
      
      console.log(`✓ Hard-deleted user: ${userLower.email} (id: ${userId})`)
    } else {
      console.log('No user found with that email pattern')
    }
  } else {
    console.log(`Found user: ${user.email} (id: ${user.id}, deletedAt: ${user.deletedAt})`)
    
    // Hard delete the user
    await prisma.user.delete({
      where: { id: user.id },
    })
    
    console.log(`✓ Hard-deleted user: ${user.email} (id: ${user.id})`)
  }

  // Verify deletion
  const remaining = await prisma.$queryRawUnsafe(`
    SELECT id, email, "deletedAt"
    FROM "User"
    WHERE LOWER(email) = LOWER('${TARGET_EMAIL}');
  `)
  
  console.log('')
  console.log('Verification:')
  if (remaining.length === 0) {
    console.log('✓ No users found with that email (case-insensitive)')
  } else {
    console.log('⚠️  Still found users:')
    remaining.forEach(u => {
      console.log(`  - ${u.email} (id: ${u.id}, deletedAt: ${u.deletedAt || 'null'})`)
    })
  }

  await prisma.$disconnect()
}

main().catch(console.error)
