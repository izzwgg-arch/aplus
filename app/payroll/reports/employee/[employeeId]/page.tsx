import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { EmployeeMonthlyReport } from '@/components/payroll/EmployeeMonthlyReport'
import { getUserPermissions } from '@/lib/permissions'

export default async function EmployeeMonthlyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }> | { employeeId: string }
  searchParams: Promise<{ month?: string }> | { month?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const permissions = await getUserPermissions(session.user.id)
  const canView = permissions['PAYROLL_REPORTS_EXPORT']?.canView === true ||
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canView) {
    redirect('/payroll?error=not-authorized')
  }

  const { employeeId } = await Promise.resolve(params)
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams
  const month = resolvedSearchParams?.month

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <EmployeeMonthlyReport employeeId={employeeId} month={month} />
      </main>
    </div>
  )
}
