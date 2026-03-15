import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ClientsList } from '@/components/clients/ClientsList'
import { canAccessRoute } from '@/lib/permissions'

export default async function ClientsPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access based on dashboard visibility
  const hasAccess = await canAccessRoute(session.user.id, '/clients')
  if (!hasAccess) {
    redirect('/dashboard?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <ClientsList />
      </main>
    </div>
  )
}

