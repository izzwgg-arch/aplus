import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { UserFormEnhanced } from '@/components/users/UserFormEnhanced'
import { prisma } from '@/lib/prisma'

export default async function EditUserPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      customRoleId: true,
      customRole: {
        select: {
          id: true,
          name: true,
        }
      },
      active: true,
      activationStart: true,
      activationEnd: true,
    },
  })

  if (!user) {
    redirect('/users')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#ccff33' }}>
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <UserFormEnhanced
          user={{
            ...user,
            customRoleId: user.customRoleId || null,
            customRole: user.customRole,
            activationStart: user.activationStart?.toISOString() || null,
            activationEnd: user.activationEnd?.toISOString() || null,
          }}
        />
      </main>
    </div>
  )
}
