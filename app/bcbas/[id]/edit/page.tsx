import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { BCBAForm } from '@/components/bcbas/BCBAForm'
import { prisma } from '@/lib/prisma'

export default async function EditBCBAPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const bcba = await prisma.bCBA.findUnique({
    where: { id: params.id },
  })

  if (!bcba || bcba.deletedAt) {
    redirect('/bcbas')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <BCBAForm bcba={bcba} />
      </main>
    </div>
  )
}
