import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ReportsGenerator } from '@/components/reports/ReportsGenerator'
import { prisma } from '@/lib/prisma'
import { canAccessRoute } from '@/lib/permissions'

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access based on dashboard visibility
  const hasAccess = await canAccessRoute(session.user.id, '/reports')
  if (!hasAccess) {
    redirect('/dashboard?error=not-authorized')
  }

  // Get filter options
  const [providers, clients, insurances, bcbas] = await Promise.all([
    prisma.provider.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.client.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.insurance.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.bCBA.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Check permissions for archive views
  const { getUserPermissions } = await import('@/lib/permissions')
  const permissions = await getUserPermissions(session.user.id)
  const canViewRegularArchive = permissions['reports.timesheetArchive.view']?.canView === true ||
                                session.user.role === 'ADMIN' ||
                                session.user.role === 'SUPER_ADMIN'
  const canViewBCBAArchive = permissions['reports.bcbaTimesheetArchive.view']?.canView === true ||
                             session.user.role === 'ADMIN' ||
                             session.user.role === 'SUPER_ADMIN'

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Reports</h1>
          
          {/* Archive Tiles */}
          {(canViewRegularArchive || canViewBCBAArchive) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {canViewRegularArchive && (
                <a
                  href="/reports/timesheet-archive"
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-blue-500 p-3 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Regular Timesheet Archive
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        View invoiced regular timesheets
                      </p>
                    </div>
                  </div>
                </a>
              )}
              {canViewBCBAArchive && (
                <a
                  href="/reports/bcba-timesheet-archive"
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-green-500 p-3 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        BCBA Timesheet Archive
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        View invoiced BCBA timesheets
                      </p>
                    </div>
                  </div>
                </a>
              )}
            </div>
          )}

          <ReportsGenerator
            providers={providers}
            clients={clients}
            insurances={insurances}
            bcbas={bcbas}
          />
        </div>
      </main>
    </div>
  )
}

