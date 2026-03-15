import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { EditImport } from '@/components/payroll/EditImport'
import { getUserPermissions } from '@/lib/permissions'

export default async function EditPayrollImportPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const permissions = await getUserPermissions(session.user.id)
  const canEdit = permissions['PAYROLL_IMPORT_EDIT']?.canView === true ||
                  session.user.role === 'ADMIN' || 
                  session.user.role === 'SUPER_ADMIN'

  if (!canEdit) {
    redirect('/payroll?error=not-authorized')
  }

  const { id } = await Promise.resolve(params)

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <EditImport importId={id} />
      </main>
    </div>
  )
}
