import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard'
import { canAccessRoute } from '@/lib/permissions'

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access based on dashboard visibility (Admin bypasses this check)
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    const hasAccess = await canAccessRoute(session.user.id, '/analytics')
    if (!hasAccess) {
      redirect('/dashboard?error=not-authorized')
    }
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Analytics Dashboard</h1>
          <AnalyticsDashboard />
        </div>
      </main>
    </div>
  )
}

