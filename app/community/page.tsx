import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { getUserPermissions, canAccessRoute } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import {
  Users,
  GraduationCap,
  Receipt,
  Mail,
} from 'lucide-react'

export default async function CommunityDashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Check route access - Community Classes requires dashboard.community permission
  const hasAccess = await canAccessRoute(session.user.id, '/community')
  if (!hasAccess) {
    // Check dashboard visibility for CUSTOM roles
    if (session.user.role === 'CUSTOM') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { customRoleId: true },
      })
      
      if (user?.customRoleId) {
        const roleVisibility = await prisma.roleDashboardVisibility.findUnique({
          where: {
            roleId_section: {
              roleId: user.customRoleId,
              section: 'quickAccess.community',
            },
          },
        })
        
        if (!roleVisibility?.visible) {
          redirect('/dashboard?error=not-authorized')
        }
      } else {
        redirect('/dashboard?error=not-authorized')
      }
    } else {
      redirect('/dashboard?error=not-authorized')
    }
  }

  // Get Community Classes permissions
  const { getCommunityPermissions } = await import('@/lib/permissions')
  const communityPerms = await getCommunityPermissions(session.user.id)
  
  // If Community Classes is not enabled, redirect
  if (!communityPerms.enabled) {
    redirect('/dashboard?error=not-authorized')
  }

  // Helper function to check if user can see a section
  const canSeeSection = (section: 'classes' | 'clients' | 'invoices' | 'emailQueue'): boolean => {
    // SUPER_ADMIN and ADMIN see all by default
    if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') {
      return true
    }

    // Check Community Classes subsection permissions
    return communityPerms.sections[section] === true
  }

  const cards = [
    {
      title: 'Classes',
      description: 'Manage community classes and rates',
      href: '/community/classes',
      icon: GraduationCap,
      color: 'bg-blue-500',
      section: 'classes' as const,
    },
    {
      title: 'Clients',
      description: 'Manage community clients',
      href: '/community/clients',
      icon: Users,
      color: 'bg-green-500',
      section: 'clients' as const,
    },
    {
      title: 'Invoices',
      description: 'View and manage community invoices',
      href: '/community/invoices',
      icon: Receipt,
      color: 'bg-purple-500',
      section: 'invoices' as const,
    },
    {
      title: 'Email Queue',
      description: 'Manage queued invoices for email',
      href: '/community/email-queue',
      icon: Mail,
      color: 'bg-cyan-500',
      section: 'emailQueue' as const,
    },
  ]

  // Filter cards based on Community Classes subsection permissions
  const visibleCards = cards.filter(card => canSeeSection(card.section))

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-primary-600 mb-2">Community Classes</h1>
          <p className="text-gray-600 mb-8">Manage community classes, clients, and invoices</p>

          {visibleCards.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-600">
                No community sections available. Contact your administrator to grant access.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleCards.map((card) => {
                const Icon = card.icon
                return (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`${card.color} p-3 rounded-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {card.title}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {card.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
