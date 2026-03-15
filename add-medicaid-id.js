// Script to add medicaidId column to CommunityClient table
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Adding medicaidId column to CommunityClient table...')
    
    // Try to add the column - PostgreSQL will error if it exists, which we'll catch
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "CommunityClient" 
        ADD COLUMN "medicaidId" TEXT
      `)
      console.log('✅ Column medicaidId added successfully!')
    } catch (error) {
      if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate column'))) {
        console.log('✅ Column medicaidId already exists')
      } else {
        // Check if column actually exists by trying to query it
        try {
          await prisma.$executeRawUnsafe(`SELECT "medicaidId" FROM "CommunityClient" LIMIT 1`)
          console.log('✅ Column medicaidId exists (verified by query)')
        } catch (queryError) {
          console.error('❌ Column medicaidId does NOT exist and could not be added:', error.message)
          throw error
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
