import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { CommunityInvoicesList } from '@/components/community/CommunityInvoicesList'
import { canAccessCommunitySection } from '@/lib/permissions'

export default async function CommunityInvoicesPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check Community Classes subsection access
  const hasAccess = await canAccessCommunitySection(session.user.id, 'invoices')
  if (!hasAccess) {
    redirect('/community?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Link
            href="/community"
            className="inline-flex items-center text-white hover:text-gray-200 mb-4"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Community Classes
          </Link>
        </div>
        <CommunityInvoicesList />
      </main>
    </div>
  )
}
