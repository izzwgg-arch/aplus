import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BCBATimesheetForm } from '@/components/timesheets/BCBATimesheetForm'
import { TimesheetErrorBoundary } from '@/components/timesheets/TimesheetErrorBoundary'
import { prisma } from '@/lib/prisma'

export default async function EditBCBATimesheetPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Fetch timesheet with all relations
  // Use any cast since Prisma client may not have bcbaInsurance relation yet
  const timesheet = await (prisma as any).timesheet.findUnique({
    where: { id: params.id },
      include: {
        client: true,
        provider: true,
        bcba: true,
        insurance: true, // BCBA timesheets now use regular Insurance
        entries: {
          orderBy: { date: 'asc' },
        },
        user: true,
      },
  })

  if (!timesheet || timesheet.deletedAt) {
    redirect('/bcba-timesheets')
  }

  // Check permissions
  if (session.user.role !== 'ADMIN' && timesheet.userId !== session.user.id) {
    redirect('/bcba-timesheets')
  }

  // Only DRAFT timesheets can be edited
  if (timesheet.status !== 'DRAFT') {
    redirect(`/bcba-timesheets`)
  }

  // Fetch all options for dropdowns
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

  // Transform timesheet to match form interface
  const timesheetData = {
    id: timesheet.id,
    providerId: timesheet.providerId,
    clientId: timesheet.clientId,
    bcbaId: timesheet.bcbaId,
    // Use insuranceId if available, otherwise fallback to bcbaInsuranceId (for migration)
    insuranceId: timesheet.insuranceId || (timesheet as any).bcbaInsuranceId || null,
    serviceType: timesheet.serviceType || null,
    sessionData: timesheet.sessionData || null,
    startDate: timesheet.startDate.toISOString(),
    endDate: timesheet.endDate.toISOString(),
    status: timesheet.status,
    entries: timesheet.entries.map((entry: any) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      startTime: entry.startTime,
      endTime: entry.endTime,
      minutes: entry.minutes,
      units: entry.units.toNumber(),
      notes: entry.notes,
    })),
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <TimesheetErrorBoundary>
          <BCBATimesheetForm
            providers={providers}
            clients={clients}
            bcbas={bcbas}
            insurances={insurances}
            timesheet={timesheetData}
          />
        </TimesheetErrorBoundary>
      </main>
    </div>
  )
}
