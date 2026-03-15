import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { ProviderForm } from '@/components/providers/ProviderForm'
import { prisma } from '@/lib/prisma'

export default async function EditProviderPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const provider = await prisma.provider.findUnique({
    where: { id: params.id },
  })

  if (!provider || provider.deletedAt) {
    redirect('/providers')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0066cc' }}>
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <ProviderForm provider={provider} />
      </main>
    </div>
  )
}
