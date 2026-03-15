import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { InsuranceForm } from '@/components/insurance/InsuranceForm'
import { prisma } from '@/lib/prisma'

export default async function EditInsurancePage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const insurance = await prisma.insurance.findUnique({
    where: { id: params.id },
  })

  if (!insurance || insurance.deletedAt) {
    redirect('/insurance')
  }

  // Transform insurance to match form interface
  const insuranceData = {
    id: insurance.id,
    name: insurance.name,
    ratePerUnit: parseFloat(insurance.ratePerUnit.toString()),
    regularRatePerUnit: (insurance as any).regularRatePerUnit ? parseFloat((insurance as any).regularRatePerUnit.toString()) : null,
    regularUnitMinutes: (insurance as any).regularUnitMinutes || null,
    bcbaRatePerUnit: (insurance as any).bcbaRatePerUnit ? parseFloat((insurance as any).bcbaRatePerUnit.toString()) : null,
    bcbaUnitMinutes: (insurance as any).bcbaUnitMinutes || null,
    active: insurance.active,
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <InsuranceForm insurance={insuranceData} />
      </main>
    </div>
  )
}
