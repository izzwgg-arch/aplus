import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ParentTrainingSignInForm } from '@/components/bcbas/forms/ParentTrainingSignInForm'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export default async function ParentTrainingSignInPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check permissions
  const permissions = await getUserPermissions(session.user.id)
  const canView = permissions['FORMS_VIEW']?.canView === true || 
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canView) {
    redirect('/dashboard?error=not-authorized')
  }

  const clients = await prisma.client.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
    },
  })

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <ParentTrainingSignInForm clients={clients} />
      </main>
    </div>
  )
}
