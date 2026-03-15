import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BCBAsList } from '@/components/bcbas/BCBAsList'
import { canAccessRoute } from '@/lib/permissions'

export default async function BCBAsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access based on dashboard visibility (Admin bypasses this check)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    const hasAccess = await canAccessRoute(session.user.id, '/bcbas')
    if (!hasAccess) {
      redirect('/dashboard?error=not-authorized')
    }
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <BCBAsList />
      </main>
    </div>
  )
}

