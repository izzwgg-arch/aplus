import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ParentABCDataForm } from '@/components/bcbas/forms/ParentABCDataForm'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export default async function ParentABCDataViewPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const permissions = await getUserPermissions(session.user.id)
  const canView =
    permissions['FORMS_VIEW']?.canView === true ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN'

  if (!canView) redirect('/dashboard?error=not-authorized')

  const form = await prisma.parentABCData.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { rows: true },
  })

  if (!form) redirect('/bcbas/forms')

  const clients = await prisma.client.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  const edit = searchParams.edit === '1'
  const print = searchParams.print === '1'
  const behaviorText = form.rows[0]?.behavior || ''

  return (
    <div className="min-h-screen">
      <div className={print ? 'print:hidden' : ''}>
        <DashboardNav userRole={session.user.role} />
      </div>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <ParentABCDataForm
          clients={clients}
          formData={{
            id: form.id,
            clientId: form.clientId,
            month: form.month,
            year: form.year,
            behaviorText,
            rows: form.rows.map((r) => ({
              id: r.id,
              date: r.date.toISOString(),
              startTime: r.startTime,
              endTime: r.endTime,
              antecedent: r.antecedent,
              consequences: r.consequences,
              notes: r.notes,
            })),
          }}
          readOnly={!edit}
        />
      </main>
    </div>
  )
}

