import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BCBATimesheetsList } from '@/components/timesheets/BCBATimesheetsList'
import { canAccessRoute } from '@/lib/permissions'

export default async function BCBATimesheetArchivePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access
  const hasAccess = await canAccessRoute(session.user.id, '/reports/bcba-timesheet-archive')
  if (!hasAccess) {
    redirect('/dashboard?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">BCBA Timesheet Archive</h1>
          <p className="text-gray-600 mb-6">View invoiced BCBA timesheets</p>
          <BCBATimesheetsList isArchive={true} />
        </div>
      </main>
    </div>
  )
}
