import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BcbaInsuranceList } from '@/components/bcba-insurance/BcbaInsuranceList'
import { canAccessRoute } from '@/lib/permissions'

export default async function BcbaInsurancePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access (Admin bypasses this check)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    const hasAccess = await canAccessRoute(session.user.id, '/bcba-insurance')
    if (!hasAccess) {
      redirect('/dashboard?error=not-authorized')
    }
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <BcbaInsuranceList />
      </main>
    </div>
  )
}
