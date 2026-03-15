import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { VisitAttestationForm } from '@/components/bcbas/forms/VisitAttestationForm'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export default async function VisitAttestationPage() {
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

  const [clients, providers] = await Promise.all([
    prisma.client.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.provider.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
      },
    }),
  ])

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <VisitAttestationForm clients={clients} providers={providers} />
      </main>
    </div>
  )
}
