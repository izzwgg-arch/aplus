import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { InvoiceForm } from '@/components/invoices/InvoiceForm'
import { prisma } from '@/lib/prisma'

export default async function NewInvoicePage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const clients = await prisma.client.findMany({
    where: { active: true, deletedAt: null },
    include: { insurance: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <InvoiceForm clients={clients} />
      </main>
    </div>
  )
}

