import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { RunSummaryReport } from '@/components/payroll/RunSummaryReport'
import { getUserPermissions } from '@/lib/permissions'

export default async function RunSummaryReportPage({
  params,
}: {
  params: Promise<{ runId: string }> | { runId: string }
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

  const { runId } = await Promise.resolve(params)

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <RunSummaryReport runId={runId} />
      </main>
    </div>
  )
}
