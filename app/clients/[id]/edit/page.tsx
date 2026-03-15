import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ClientForm } from '@/components/clients/ClientForm'
import { prisma } from '@/lib/prisma'

export default async function EditClientPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const [client, insurances] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.id },
    }),
    prisma.insurance.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!client || client.deletedAt) {
    redirect('/clients')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <ClientForm client={client} insurances={insurances} />
      </main>
    </div>
  )
}
