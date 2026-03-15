const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function test() {
  try {
    const user = await prisma.user.findFirst({
      where: { role: 'CUSTOM' },
      include: { customRole: true }
    })
    if (user && user.customRole) {
      console.log('User found:', user.id)
      console.log('Role ID:', user.customRole.id)
      console.log('canViewCommunityClasses:', user.customRole.canViewCommunityClasses)
      console.log('canViewCommunityClassesClasses:', user.customRole.canViewCommunityClassesClasses)
    } else {
      console.log('No CUSTOM user with role found')
    }
  } catch (error) {
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

test()
