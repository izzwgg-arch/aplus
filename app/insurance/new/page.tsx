import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { InsuranceForm } from '@/components/insurance/InsuranceForm'

export default async function NewInsurancePage() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <InsuranceForm />
      </main>
    </div>
  )
}

