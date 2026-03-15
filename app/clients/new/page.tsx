import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ClientForm } from '@/components/clients/ClientForm'
import { prisma } from '@/lib/prisma'

export default async function NewClientPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const insurances = await prisma.insurance.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <ClientForm insurances={insurances} />
      </main>
    </div>
  )
}

