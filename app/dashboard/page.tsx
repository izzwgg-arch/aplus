import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DashboardNav } from '@/components/DashboardNav'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { getUserPermissions, canSeeDashboardSection } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import {
  BarChart3,
  Users,
  UserCheck,
  Calendar,
  FileText,
  FileCheck,
  Shield,
  Receipt,
  ClipboardList,
  Mail,
  GraduationCap,
  DollarSign,
} from 'lucide-react'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // Get user permissions for dashboard visibility control
  const userPermissions = await getUserPermissions(session.user.id)
  
  // Get user with customRoleId to check dashboard visibility
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { customRoleId: true },
  })
  
  // Get dashboard section visibility for users with an assigned role (customRoleId)
  let dashboardVisibility: Record<string, boolean> = {}
  if (user?.customRoleId) {
    const roleVisibility = await prisma.roleDashboardVisibility.findMany({
      where: { roleId: user.customRoleId },
    })
    roleVisibility.forEach(v => {
      dashboardVisibility[v.section] = v.visible
    })
  }
  
  // Helper to check if a dashboard section is visible
  const isSectionVisible = (section: string): boolean => {
    if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') {
      return true
    }
    return dashboardVisibility[section] === true
  }

  const cards = [
    {
      title: 'Analytics',
      description: 'View detailed analytics and reports',
      href: '/analytics',
      icon: BarChart3,
      color: 'bg-blue-500',
      permissionKey: 'dashboard.analytics',
    },
    {
      title: 'Providers',
      description: 'Manage provider information',
      href: '/providers',
      icon: Users,
      color: 'bg-green-500',
      permissionKey: 'dashboard.providers',
    },
    {
      title: 'Clients',
      description: 'Track client details and activities',
      href: '/clients',
      icon: UserCheck,
      color: 'bg-purple-500',
      permissionKey: 'dashboard.clients',
    },
    {
      title: 'Timesheet',
      description: 'Monitor time tracking and hours',
      href: '/timesheets',
      icon: Calendar,
      color: 'bg-orange-500',
      permissionKey: 'dashboard.timesheets',
    },
    {
      title: 'BCBA Timesheets',
      description: 'Manage BCBA time tracking and hours',
      href: '/bcba-timesheets',
      icon: ClipboardList,
      color: 'bg-teal-500',
      permissionKey: 'dashboard.bcbaTimesheets',
    },
    {
      title: 'Forms',
      description: 'Parent training, ABC data, and visit attestation forms',
      href: '/forms',
      icon: FileText,
      color: 'bg-indigo-500',
      permissionKey: 'dashboard.forms',
    },
    {
      title: 'Payroll Management',
      description: 'Import time logs, manage employees, and process payroll',
      href: '/payroll',
      icon: DollarSign,
      color: 'bg-yellow-500',
      permissionKey: 'dashboard.payroll',
    },
    {
      title: 'Email Queue',
      description: 'Manage queued emails (timesheets/invoices)',
      href: '/email-queue',
      icon: Mail,
      color: 'bg-emerald-500',
      permissionKey: 'dashboard.emailQueue',
    },
    {
      title: 'Invoices',
      description: 'View and manage invoices',
      href: '/invoices',
      icon: Receipt,
      color: 'bg-cyan-500',
      permissionKey: 'dashboard.invoices',
    },
    {
      title: 'Reports',
      description: 'Generate and view system reports',
      href: '/reports',
      icon: FileCheck,
      color: 'bg-pink-500',
      permissionKey: 'dashboard.reports',
    },
  ]

  const adminCards = [
    {
      title: 'Users',
      description: 'Manage users, roles, and permissions',
      href: '/users',
      icon: Users,
      color: 'bg-red-500',
      permissionKey: 'dashboard.users',
    },
    {
      title: 'BCBAs',
      description: 'Manage Board Certified Behavior Analysts',
      href: '/bcbas',
      icon: UserCheck,
      color: 'bg-indigo-500',
      permissionKey: 'dashboard.bcbas',
    },
    {
      title: 'Insurance',
      description: 'Configure insurance rates and settings',
      href: '/insurance',
      icon: Shield,
      color: 'bg-teal-500',
      permissionKey: 'dashboard.insurance',
    },
    {
      title: 'Community Classes',
      description: 'Manage community classes, clients, and invoices',
      href: '/community',
      icon: GraduationCap,
      color: 'bg-amber-500',
      permissionKey: 'dashboard.community',
    },
  ]

  // Helper function to check if user can see a dashboard section
  const canSeeSection = (permissionKey: string): boolean => {
    // SUPER_ADMIN and ADMIN see all by default
    if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') {
      return true
    }

    // Users with an assigned role (customRoleId) can use dashboard visibility settings
    if (user?.customRoleId) {
      // Map permission keys to dashboard visibility section keys
      const sectionKeyMap: Record<string, string> = {
        'dashboard.analytics': 'quickAccess.analytics',
        'dashboard.providers': 'quickAccess.providers',
        'dashboard.clients': 'quickAccess.clients',
        'dashboard.timesheets': 'quickAccess.timesheets',
        'dashboard.invoices': 'quickAccess.invoices',
        'dashboard.reports': 'quickAccess.reports',
        'dashboard.users': 'quickAccess.users',
        'dashboard.bcbas': 'quickAccess.bcbas',
        'dashboard.insurance': 'quickAccess.insurance',
        'dashboard.community': 'quickAccess.community',
        'dashboard.emailQueue': 'quickAccess.emailQueue',
        'dashboard.bcbaTimesheets': 'quickAccess.bcbaTimesheets',
        'dashboard.forms': 'quickAccess.forms',
        'dashboard.payroll': 'quickAccess.payroll',
      }
      const sectionKey = sectionKeyMap[permissionKey]
      if (sectionKey && dashboardVisibility[sectionKey] !== undefined) {
        return dashboardVisibility[sectionKey] === true
      }
    }

    // USER roles check permissions
    const permission = userPermissions[permissionKey]
    return (
      permission?.canView === true ||
      permission?.canCreate === true ||
      permission?.canUpdate === true ||
      permission?.canDelete === true ||
      permission?.canApprove === true ||
      permission?.canExport === true
    )
  }

  // Filter cards based on permissions and visibility
  const visibleCards = cards.filter(card => {
    return canSeeSection(card.permissionKey)
  })

  // Filter admin cards based on permissions and role
  const visibleAdminCards = adminCards.filter(card => {
    // Community Classes can be shown based on dashboard visibility permission
    if (card.permissionKey === 'dashboard.community') {
      // Use canSeeSection which handles all role types (SUPER_ADMIN, ADMIN, CUSTOM, USER)
      return canSeeSection(card.permissionKey)
    }
    
    // Other admin cards only show to ADMIN and SUPER_ADMIN roles
    if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
      return false
    }
    // Check permission for the card
    return canSeeSection(card.permissionKey)
  })

  return (
    <div className="min-h-screen">
      <DashboardNav userRole={session.user.role} />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-primary-600 mb-2">Dashboard</h1>
          <p className="text-white mb-8">Welcome to Smart Steps Dashboard</p>

          {/* Quick Access - FIRST SECTION */}
          <div className="mb-8">
            {visibleCards.length === 0 && visibleAdminCards.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <p className="text-gray-600">
                  No dashboard sections available. Contact your administrator to grant access.
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

                {visibleAdminCards.map((card) => {
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

          {/* Dashboard Stats - Other Sections Below Quick Access */}
          <div className="mt-8">
            <DashboardStats 
              showPendingApprovals={isSectionVisible('sections.pendingApprovals')}
              showRecentActivity={isSectionVisible('sections.recentActivity')}
              showRecentInvoices={isSectionVisible('sections.recentInvoices')}
              showOutstanding={isSectionVisible('sections.outstanding')}
            />
          </div>

          {/* Debug Permissions Panel (Admin/Dev Only) */}
          {(session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') && process.env.NODE_ENV === 'development' && (
            <div className="mt-8 bg-white shadow rounded-lg p-6">
              <details className="cursor-pointer">
                <summary className="text-lg font-semibold text-gray-900 mb-4">
                  🔍 Debug: User Permissions & Dashboard Visibility
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">User Info</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <p><strong>Role:</strong> {session.user.role}</p>
                      <p><strong>User ID:</strong> {session.user.id}</p>
                      {user?.customRoleId && <p><strong>Custom Role ID:</strong> {user.customRoleId}</p>}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">Dashboard Visibility</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                      {Object.entries(dashboardVisibility).map(([section, visible]) => (
                        <p key={section}>
                          <strong>{section}:</strong> {visible ? '✅ Visible' : '❌ Hidden'}
                        </p>
                      ))}
                      {Object.keys(dashboardVisibility).length === 0 && (
                        <p className="text-gray-500">No custom dashboard visibility settings</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">Dashboard Cards Visibility</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                      {cards.map(card => (
                        <p key={card.href}>
                          <strong>{card.title}:</strong> {canSeeSection(card.permissionKey) ? '✅ Visible' : '❌ Hidden'}
                        </p>
                      ))}
                      {adminCards.map(card => (
                        <p key={card.href}>
                          <strong>{card.title}:</strong> {canSeeSection(card.permissionKey) ? '✅ Visible' : '❌ Hidden'}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">Permissions (Sample)</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm space-y-1 max-h-48 overflow-y-auto">
                      {Object.entries(userPermissions).slice(0, 20).map(([perm, value]) => (
                        <p key={perm}>
                          <strong>{perm}:</strong> {value.canView ? '✅' : '❌'} View, {value.canCreate ? '✅' : '❌'} Create
                        </p>
                      ))}
                      {Object.keys(userPermissions).length > 20 && (
                        <p className="text-gray-500 italic">... and {Object.keys(userPermissions).length - 20} more</p>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

