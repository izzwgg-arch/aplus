import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { InvoiceEditForm } from '@/components/invoices/InvoiceEditForm'
import { prisma } from '@/lib/prisma'

export default async function EditInvoicePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Only admins can edit invoices
  if (session.user.role !== 'ADMIN') {
    redirect('/invoices')
  }

  // Fetch invoice
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      entries: {
        include: {
          timesheet: {
            select: { isBCBA: true },
          },
        },
      },
    },
  })

  if (!invoice || invoice.deletedAt) {
    redirect('/invoices')
  }

  // Only DRAFT and READY invoices can be edited
  if (!['DRAFT', 'READY'].includes(invoice.status)) {
    redirect(`/invoices/${params.id}`)
  }

  // Transform invoice to match form interface
  const regularEntry = invoice.entries.find((entry) => !entry.timesheet?.isBCBA)
  const bcbaEntry = invoice.entries.find((entry) => entry.timesheet?.isBCBA)

  const invoiceData = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    checkNumber: invoice.checkNumber,
    notes: invoice.notes,
    regularRatePerUnit: regularEntry ? Number(regularEntry.rate) : null,
    bcbaRatePerUnit: bcbaEntry ? Number(bcbaEntry.rate) : null,
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0066cc' }}>
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <InvoiceEditForm invoice={invoiceData} />
      </main>
    </div>
  )
}
