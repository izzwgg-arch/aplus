import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { NewPayrollRun } from '@/components/payroll/NewPayrollRun'
import { getUserPermissions } from '@/lib/permissions'

export default async function NewPayrollRunPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const permissions = await getUserPermissions(session.user.id)
  const canCreate = permissions['PAYROLL_RUN_CREATE']?.canView === true ||
                    session.user.role === 'ADMIN' || 
                    session.user.role === 'SUPER_ADMIN'

  if (!canCreate) {
    redirect('/payroll?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <NewPayrollRun />
      </main>
    </div>
  )
}
