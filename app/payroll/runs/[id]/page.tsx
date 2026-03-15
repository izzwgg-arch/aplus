import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { PayrollRunDetail } from '@/components/payroll/PayrollRunDetail'
import { getUserPermissions } from '@/lib/permissions'

export default async function PayrollRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const permissions = await getUserPermissions(session.user.id)
  const canView = permissions['PAYROLL_VIEW']?.canView === true || 
                  permissions['PAYROLL_RUN_CREATE']?.canView === true ||
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canView) {
    redirect('/payroll?error=not-authorized')
  }

  const { id } = await Promise.resolve(params)

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <PayrollRunDetail runId={id} permissions={permissions} userRole={session.user.role} />
      </main>
    </div>
  )
}
