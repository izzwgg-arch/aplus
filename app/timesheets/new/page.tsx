import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { TimesheetForm } from '@/components/timesheets/TimesheetForm'
import { TimesheetErrorBoundary } from '@/components/timesheets/TimesheetErrorBoundary'
import { prisma } from '@/lib/prisma'

export default async function NewTimesheetPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const [providers, clients, bcbas, insurances] = await Promise.all([
    prisma.provider.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.client.findMany({
      where: { active: true, deletedAt: null },
      include: { insurance: true },
      orderBy: { name: 'asc' },
    }),
    prisma.bCBA.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    }),
    prisma.insurance.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <TimesheetErrorBoundary>
          <TimesheetForm
            providers={providers}
            clients={clients}
            bcbas={bcbas}
            insurances={insurances}
          />
        </TimesheetErrorBoundary>
      </main>
    </div>
  )
}

