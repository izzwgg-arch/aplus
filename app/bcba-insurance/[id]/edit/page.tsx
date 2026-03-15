import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BcbaInsuranceForm } from '@/components/bcba-insurance/BcbaInsuranceForm'
import { getUserPermissions } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

export default async function EditBcbaInsurancePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check permissions
  const permissions = await getUserPermissions(session.user.id)
  const canUpdate = 
    permissions['bcbaInsurance.manage']?.canUpdate === true ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN'

  if (!canUpdate) {
    redirect('/bcba-insurance?error=not-authorized')
  }

  const resolvedParams = await Promise.resolve(params)
  const insurance = await (prisma as any).bcbaInsurance.findUnique({
    where: { id: resolvedParams.id },
  })

  if (!insurance) {
    redirect('/bcba-insurance?error=not-found')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <BcbaInsuranceForm
          insurance={{
            id: insurance.id,
            name: insurance.name,
            ratePerUnit: typeof insurance.ratePerUnit === 'object' && 'toNumber' in insurance.ratePerUnit
              ? insurance.ratePerUnit.toNumber()
              : Number(insurance.ratePerUnit) || 0,
            unitMinutes: insurance.unitMinutes || 15,
            active: insurance.active,
            notes: insurance.notes,
          }}
        />
      </main>
    </div>
  )
}
