import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { CommunityClassForm } from '@/components/community/CommunityClassForm'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function EditCommunityClassPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const resolvedParams = await Promise.resolve(params)
  const classItem = await prisma.communityClass.findUnique({
    where: { id: resolvedParams.id },
  })

  if (!classItem || classItem.deletedAt) {
    redirect('/community/classes')
  }

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Link
            href="/community/classes"
            className="inline-flex items-center text-white hover:text-gray-200 mb-4"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Community Classes
          </Link>
        </div>
        <CommunityClassForm classItem={{
          id: classItem.id,
          name: classItem.name,
          ratePerUnit: classItem.ratePerUnit.toNumber(),
          isActive: classItem.isActive ?? true,
        }} />
      </main>
    </div>
  )
}
