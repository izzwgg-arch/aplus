import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BcbaInsuranceForm } from '@/components/bcba-insurance/BcbaInsuranceForm'
import { getUserPermissions } from '@/lib/permissions'

export default async function NewBcbaInsurancePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check permissions
  const permissions = await getUserPermissions(session.user.id)
  const canCreate = 
    permissions['bcbaInsurance.manage']?.canCreate === true ||
    session.user.role === 'ADMIN' ||
    session.user.role === 'SUPER_ADMIN'

  if (!canCreate) {
    redirect('/bcba-insurance?error=not-authorized')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <BcbaInsuranceForm />
      </main>
    </div>
  )
}
