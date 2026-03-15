import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { PayrollDashboard } from '@/components/payroll/PayrollDashboard'
import { getUserPermissions } from '@/lib/permissions'

export default async function PayrollPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const permissions = await getUserPermissions(session.user.id)
  const canView = permissions['PAYROLL_VIEW']?.canView === true || 
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canView) {
    redirect('/dashboard?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <PayrollDashboard permissions={permissions} userRole={session.user.role} />
      </main>
    </div>
  )
}
