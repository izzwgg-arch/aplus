import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { TimesheetsList } from '@/components/timesheets/TimesheetsList'
import { canAccessRoute } from '@/lib/permissions'

export default async function TimesheetArchivePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access
  const hasAccess = await canAccessRoute(session.user.id, '/reports/timesheet-archive')
  if (!hasAccess) {
    redirect('/dashboard?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Regular Timesheet Archive</h1>
          <p className="text-gray-600 mb-6">View invoiced regular timesheets</p>
          <TimesheetsList isArchive={true} />
        </div>
      </main>
    </div>
  )
}
