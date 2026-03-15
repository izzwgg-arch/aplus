const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Testing password reset for leahw...\n')
  
  // Find the user
  const user = await prisma.user.findFirst({
    where: {
      email: {
        contains: 'leahw',
        mode: 'insensitive',
      },
    },
  })
  
  if (!user) {
    console.log('❌ User not found')
    await prisma.$disconnect()
    return
  }
  
  console.log(`✅ Found user: ${user.email}`)
  console.log(`   Active: ${user.active}`)
  console.log(`   Deleted: ${user.deletedAt ? 'Yes' : 'No'}\n`)
  
  if (user.deletedAt || !user.active) {
    console.log('❌ User is inactive or deleted. Cannot send password reset.')
    await prisma.$disconnect()
    return
  }
  
  // Make API call to trigger password reset
  console.log('Making password reset request...')
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const apiUrl = `${baseUrl}/api/auth/forgot-password`
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
      }),
    })
    
    const data = await response.json()
    
    console.log(`\nResponse Status: ${response.status}`)
    console.log(`Response Body:`, JSON.stringify(data, null, 2))
    
    if (response.ok) {
      console.log('\n✅ Password reset request sent successfully')
      console.log('   Check the PM2 logs for email sending details:')
      console.log('   pm2 logs aplus-center --lines 50 | grep FORGOT_PASSWORD')
    } else {
      console.log('\n❌ Password reset request failed')
    }
  } catch (error) {
    console.error('\n❌ Error making request:', error.message)
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)
