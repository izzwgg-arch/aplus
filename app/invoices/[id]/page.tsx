import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail'

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0066cc' }}>
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <InvoiceDetail invoiceId={params.id} userRole={session.user.role} />
      </main>
    </div>
  )
}
