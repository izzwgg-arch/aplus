import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { RoleForm } from '@/components/roles/RoleForm'
import { prisma } from '@/lib/prisma'

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    redirect('/dashboard')
  }

  const { id } = await params
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: {
        include: {
          permission: true
        }
      },
      timesheetVisibility: {
        include: {
          user: {
            select: { id: true, username: true, email: true }
          }
        }
      }
    }
  })

  if (!role || role.deletedAt) {
    redirect('/roles')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <RoleForm role={role} />
      </main>
    </div>
  )
}
