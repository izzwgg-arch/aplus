import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function updateUsernames() {
  try {
    // Use raw SQL to find and update users with null usernames
    const result = await prisma.$executeRaw`
      UPDATE "User" 
      SET username = split_part(email, '@', 1) || '_' || substring(id::text, 1, 8)
      WHERE username IS NULL
    `
    
    console.log(`Updated ${result} users with usernames`)
    console.log('All users updated!')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

updateUsernames()
