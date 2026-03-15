import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2] || 'admin@apluscenter.com'
  const password = process.argv[3] || 'Admin@12345!'

  // Validate password
  if (password.length < 10 || password.length > 15) {
    throw new Error('Password must be 10-15 characters')
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain lowercase letter')
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    throw new Error('Password must contain special character')
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const username = email.split('@')[0]
  
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username,
      password: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
    create: {
      username,
      email,
      password: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
  })

  console.log(`✅ Admin user created/updated:`)
  console.log(`   Email: ${user.email}`)
  console.log(`   Role: ${user.role}`)
  console.log(`   ID: ${user.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
