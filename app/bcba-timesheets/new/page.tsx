import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BCBATimesheetForm } from '@/components/timesheets/BCBATimesheetForm'
import { TimesheetErrorBoundary } from '@/components/timesheets/TimesheetErrorBoundary'
import { prisma } from '@/lib/prisma'

export default async function NewBCBATimesheetPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  let providers: any[] = []
  let clients: any[] = []
  let bcbas: any[] = []
  let insurances: any[] = []
  
  try {
    const results = await Promise.all([
      prisma.provider.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      }).catch((err: any) => {
        console.error('[BCBA NEW PAGE] Error fetching providers:', err)
        return []
      }),
      prisma.client.findMany({
        where: { active: true, deletedAt: null },
        include: { insurance: true },
        orderBy: { name: 'asc' },
      }).catch((err: any) => {
        console.error('[BCBA NEW PAGE] Error fetching clients:', err)
        return []
      }),
      ((prisma as any).bCBA ? (prisma as any).bCBA.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      }) : Promise.resolve([])).catch((err: any) => {
        console.error('[BCBA NEW PAGE] Error fetching BCBAs:', err)
        return []
      }),
      prisma.insurance.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
      }).catch((err: any) => {
        console.error('[BCBA NEW PAGE] Error fetching Insurance:', err)
        return []
      }),
    ])
    
    providers = results[0] || []
    clients = results[1] || []
    bcbas = results[2] || []
    insurances = results[3] || []
  } catch (error: any) {
    console.error('[BCBA NEW PAGE] Error fetching data:', error)
    console.error('[BCBA NEW PAGE] Error stack:', error?.stack)
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
          />
        </TimesheetErrorBoundary>
      </main>
    </div>
  )
}
