import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ImportsLibrary } from '@/components/payroll/ImportsLibrary'
import { getUserPermissions } from '@/lib/permissions'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function PayrollImportsPage() {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const permissions = await getUserPermissions(session.user.id)
  const canView = permissions['PAYROLL_VIEW']?.canView === true || 
                  permissions['PAYROLL_IMPORT_EDIT']?.canView === true ||
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canView) {
    redirect('/payroll?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <ImportsLibrary
          permissions={permissions}
          userRole={session.user.role}
          canView={canView}
        />
      </main>
    </div>
  )
}
