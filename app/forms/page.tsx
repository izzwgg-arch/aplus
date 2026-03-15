import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { FormsDashboard } from '@/components/forms/FormsDashboard'
import { getUserPermissions } from '@/lib/permissions'

export default async function FormsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check permissions - use FORMS_VIEW
  const permissions = await getUserPermissions(session.user.id)
  const canView = permissions['FORMS_VIEW']?.canView === true || 
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canView) {
    redirect('/dashboard?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <div className="no-print">
        <DashboardNav userRole={session.user.role} />
      </div>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <FormsDashboard />
      </main>
    </div>
  )
}
