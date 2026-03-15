import { prisma } from './prisma'

export interface UserPermissions {
  [key: string]: {
    canView: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
    canApprove: boolean
    canExport: boolean
  }
}

export interface TimesheetVisibilityScope {
  viewAll: boolean
  allowedUserIds: string[]
}

/**
 * Get all permissions for a user based on their role
 */
export interface CommunityPermissions {
  enabled: boolean
  sections: {
    classes: boolean
    clients: boolean
    invoices: boolean
    emailQueue: boolean
  }
}

function hasAnyCapability(
  perm:
    | {
        canView?: boolean
        canCreate?: boolean
        canUpdate?: boolean
        canDelete?: boolean
        canApprove?: boolean
        canExport?: boolean
      }
    | undefined
): boolean {
  if (!perm) return false
  return (
    perm.canView === true ||
    perm.canCreate === true ||
    perm.canUpdate === true ||
    perm.canDelete === true ||
    perm.canApprove === true ||
    perm.canExport === true
  )
}

/**
 * Helper function to check if user has payroll access (either PAYROLL_MANAGEMENT or specific payroll permission)
 */
export function hasPayrollAccess(permissions: UserPermissions, specificPermission?: string): boolean {
  if (permissions['PAYROLL_MANAGEMENT']?.canView === true) {
    return true
  }
  if (specificPermission && permissions[specificPermission]?.canView === true) {
    return true
  }
  return false
}

export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customRole: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  })

  if (!user) {
    return {}
  }

  const permissions: UserPermissions = {}

  // SUPER_ADMIN has all permissions
  if (user.role === 'SUPER_ADMIN') {
    const allPerms = await prisma.permission.findMany()
    allPerms.forEach(perm => {
      permissions[perm.name] = {
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canApprove: true,
        canExport: true,
      }
    })
    // SUPER_ADMIN has all Community Email Queue permissions
    permissions['community.invoices.emailqueue.view'] = {
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
    }
    permissions['community.invoices.emailqueue.send'] = {
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
    }
    permissions['community.invoices.emailqueue.schedule'] = {
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
    }
    permissions['community.invoices.emailqueue.attachPdf'] = {
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
    }
    permissions['community.invoices.emailqueue.delete'] = {
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
    }
    return permissions
  }

  // ADMIN has admin permissions
  if (user.role === 'ADMIN') {
    const adminPerms = await prisma.permission.findMany({
      where: {
        name: {
          not: {
            in: ['users.delete', 'roles.delete'] // Limit some dangerous operations
          }
        }
      }
    })
    adminPerms.forEach(perm => {
      permissions[perm.name] = {
        canView: true,
        canCreate: !perm.name.includes('.delete'),
        canUpdate: true,
        canDelete: false,
        canApprove: true,
        canExport: true,
      }
    })
    // ADMIN automatically has all payroll permissions
    const payrollPerms = [
      'PAYROLL_VIEW',
      'PAYROLL_MANAGE_EMPLOYEES',
      'PAYROLL_IMPORT_EDIT',
      'PAYROLL_RUN_CREATE',
      'PAYROLL_PAYMENTS_EDIT',
      'PAYROLL_ANALYTICS_VIEW',
      'PAYROLL_REPORTS_EXPORT',
      'dashboard.payroll',
    ]
    payrollPerms.forEach(permName => {
      permissions[permName] = {
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
        canApprove: true,
        canExport: true,
      }
    })
    // ADMIN has all Community Email Queue permissions
    permissions['community.invoices.emailqueue.view'] = {
      canView: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
    }
    permissions['community.invoices.emailqueue.send'] = {
      canView: false,
      canCreate: true,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
    }
    permissions['community.invoices.emailqueue.schedule'] = {
      canView: false,
      canCreate: true,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
    }
    permissions['community.invoices.emailqueue.attachPdf'] = {
      canView: false,
      canCreate: true,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
    }
    permissions['community.invoices.emailqueue.delete'] = {
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: true,
      canApprove: false,
      canExport: false,
    }
    return permissions
  }

  // If a user has a customRole assigned, use it (even if user.role isn't CUSTOM).
  // This prevents misconfigured accounts from losing access even though a role was assigned.
  if (user.customRole) {
    user.customRole.permissions.forEach(rp => {
      permissions[rp.permission.name] = {
        canView: rp.canView,
        canCreate: rp.canCreate,
        canUpdate: rp.canUpdate,
        canDelete: rp.canDelete,
        canApprove: rp.canApprove,
        canExport: rp.canExport,
      }
    })

    // Add granular Community Email Queue permissions from Role model
    if (user.customRole.communityEmailQueueView) {
      permissions['community.invoices.emailqueue.view'] = {
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      }
    }
    if (user.customRole.communityEmailQueueSendNow) {
      permissions['community.invoices.emailqueue.send'] = {
        canView: false,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      }
    }
    if (user.customRole.communityEmailQueueSchedule) {
      permissions['community.invoices.emailqueue.schedule'] = {
        canView: false,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      }
    }
    if (user.customRole.communityEmailQueueAttachPdf) {
      permissions['community.invoices.emailqueue.attachPdf'] = {
        canView: false,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      }
    }
    if (user.customRole.communityEmailQueueDelete) {
      permissions['community.invoices.emailqueue.delete'] = {
        canView: false,
        canCreate: false,
        canUpdate: false,
        canDelete: true,
        canApprove: false,
        canExport: false,
      }
    }

    // For CUSTOM roles, also grant dashboard permissions based on underlying permissions
    const dashboardPermissionMap: Record<string, string[]> = {
      'dashboard.timesheets': [
        'timesheets.view',
        'timesheets.create',
        'timesheets.update',
        'timesheets.delete',
        'timesheets.submit',
        'timesheets.approve',
        'timesheets.reject',
        'timesheets.export',
        'timesheets.viewAll',
        'timesheets.viewSelectedUsers',
      ],
      'dashboard.invoices': ['invoices.view'],
      'dashboard.providers': [
        'providers.view',
        'providers.create',
        'providers.update',
        'providers.delete',
        'providers.export',
      ],
      'dashboard.clients': [
        'clients.view',
        'clients.create',
        'clients.update',
        'clients.delete',
        'clients.export',
      ],
      'dashboard.reports': ['reports.view'],
      'dashboard.analytics': ['analytics.view'],
      'dashboard.users': ['users.view'],
      'dashboard.bcbas': ['bcbas.view'],
      'dashboard.insurance': ['insurance.view'],
      'dashboard.community': ['community.view', 'community.classes.view', 'community.clients.view', 'community.invoices.view'],
      'dashboard.emailQueue': ['emailQueue.view'],
      'dashboard.bcbaTimesheets': ['bcbaTimesheets.view'],
      'dashboard.payroll': ['payroll.view'],
    }

    for (const [dashboardPerm, underlyingPerms] of Object.entries(dashboardPermissionMap)) {
      // Only add if not already set explicitly
      if (!permissions[dashboardPerm]) {
        const hasUnderlying = underlyingPerms.some(up => hasAnyCapability(permissions[up]))
        if (hasUnderlying) {
          permissions[dashboardPerm] = {
            canView: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
          }
        }
      }
    }

    return permissions
  }

  // USER role has basic view permissions
  const basicPerms = await prisma.permission.findMany({
    where: {
      name: {
        in: [
          'timesheets.view',
          'timesheets.create',
          'timesheets.update',
          'timesheets.submit',
          'invoices.view',
        ]
      }
    }
  })
  basicPerms.forEach(perm => {
    permissions[perm.name] = {
      canView: true,
      canCreate: perm.name.includes('.create'),
      canUpdate: perm.name.includes('.update'),
      canDelete: false,
      canApprove: false,
      canExport: false,
    }
  })

  // For USER roles, grant dashboard permissions based on underlying permissions
  // If user has timesheets.view, grant dashboard.timesheets
  const dashboardPermissionMap: Record<string, string[]> = {
    'dashboard.timesheets': [
      'timesheets.view',
      'timesheets.create',
      'timesheets.update',
      'timesheets.delete',
      'timesheets.submit',
      'timesheets.approve',
      'timesheets.reject',
      'timesheets.export',
      'timesheets.viewAll',
      'timesheets.viewSelectedUsers',
    ],
    'dashboard.invoices': ['invoices.view'],
    'dashboard.providers': [
      'providers.view',
      'providers.create',
      'providers.update',
      'providers.delete',
      'providers.export',
    ],
    'dashboard.clients': [
      'clients.view',
      'clients.create',
      'clients.update',
      'clients.delete',
      'clients.export',
    ],
    'dashboard.reports': ['reports.view'],
    'dashboard.analytics': ['analytics.view'],
    'dashboard.users': ['users.view'],
    'dashboard.bcbas': ['bcbas.view'],
    'dashboard.insurance': ['insurance.view'],
    'dashboard.community': ['community.view', 'community.classes.view', 'community.clients.view', 'community.invoices.view'],
    'dashboard.payroll': ['payroll.view'],
  }

  for (const [dashboardPerm, underlyingPerms] of Object.entries(dashboardPermissionMap)) {
    const hasUnderlying = underlyingPerms.some(up => hasAnyCapability(permissions[up]))
    if (hasUnderlying) {
      permissions[dashboardPerm] = {
        canView: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      }
    }
  }

  return permissions
}

/**
 * Get Community Classes permissions for a user
 */
export async function getCommunityPermissions(userId: string): Promise<CommunityPermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customRole: true
    }
  })

  if (!user) {
    return {
      enabled: false,
      sections: {
        classes: false,
        clients: false,
        invoices: false,
        emailQueue: false,
      }
    }
  }

  // SUPER_ADMIN and ADMIN have all Community Classes permissions
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return {
      enabled: true,
      sections: {
        classes: true,
        clients: true,
        invoices: true,
        emailQueue: true,
      }
    }
  }

  // CUSTOM role uses role's Community Classes permissions
  if (user.role === 'CUSTOM' && user.customRole) {
    return {
      enabled: user.customRole.canViewCommunityClasses || false,
      sections: {
        classes: user.customRole.canViewCommunityClassesClasses || false,
        clients: user.customRole.canViewCommunityClassesClients || false,
        invoices: user.customRole.canViewCommunityClassesInvoices || false,
        emailQueue: user.customRole.canViewCommunityClassesEmailQueue || false,
      }
    }
  }

  // USER role has no Community Classes permissions by default
  return {
    enabled: false,
    sections: {
      classes: false,
      clients: false,
      invoices: false,
      emailQueue: false,
    }
  }
}

/**
 * Check if user can access a Community Classes subsection
 */
export async function canAccessCommunitySection(
  userId: string, 
  section: 'classes' | 'clients' | 'invoices' | 'emailQueue'
): Promise<boolean> {
  const communityPerms = await getCommunityPermissions(userId)
  
  // Must have Community Classes enabled
  if (!communityPerms.enabled) {
    return false
  }
  
  // Check specific section permission
  return communityPerms.sections[section] === true
}

/**
 * Check if user can see a dashboard section
 */
export async function canSeeDashboardSection(userId: string, section: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId)
  const permissionName = `dashboard.${section}`
  
  // SUPER_ADMIN and ADMIN can see everything
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') {
    return true
  }

  // Check explicit dashboard permission first
  if (hasAnyCapability(permissions[permissionName])) {
    return true
  }

  // Fallback: Check underlying permissions if dashboard permission doesn't exist
  const underlyingPermissionMap: Record<string, string[]> = {
    'timesheets': [
      'timesheets.view',
      'timesheets.create',
      'timesheets.update',
      'timesheets.delete',
      'timesheets.submit',
      'timesheets.approve',
      'timesheets.reject',
      'timesheets.export',
      'timesheets.viewAll',
      'timesheets.viewSelectedUsers',
    ],
    'invoices': ['invoices.view'],
    'providers': [
      'providers.view',
      'providers.create',
      'providers.update',
      'providers.delete',
      'providers.export',
    ],
    'clients': [
      'clients.view',
      'clients.create',
      'clients.update',
      'clients.delete',
      'clients.export',
    ],
    'reports': ['reports.view'],
    'analytics': ['analytics.view'],
    'users': ['users.view'],
    'bcbas': ['bcbas.view'],
    'insurance': ['insurance.view'],
    'community': ['community.view', 'community.classes.view', 'community.clients.view', 'community.invoices.view'],
    'emailQueue': ['emailQueue.view'],
    'bcbaTimesheets': ['bcbaTimesheets.view'],
    'payroll': ['payroll.view'],
  }

  const underlyingPerms = underlyingPermissionMap[section]
  if (underlyingPerms) {
    return underlyingPerms.some(up => hasAnyCapability(permissions[up]))
  }

  return false
}

/**
 * Check if user can access a route based on dashboard visibility permission
 * Returns true if user has access, false otherwise
 */
export async function canAccessRoute(userId: string, route: string): Promise<boolean> {
  // Handle archive routes
  if (route === '/reports/timesheet-archive' || route.startsWith('/reports/timesheet-archive/')) {
    const permissions = await getUserPermissions(userId)
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return permissions['reports.timesheetArchive.view']?.canView === true ||
           user?.role === 'ADMIN' ||
           user?.role === 'SUPER_ADMIN'
  }
  if (route === '/reports/bcba-timesheet-archive' || route.startsWith('/reports/bcba-timesheet-archive/')) {
    const permissions = await getUserPermissions(userId)
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return permissions['reports.bcbaTimesheetArchive.view']?.canView === true ||
           user?.role === 'ADMIN' ||
           user?.role === 'SUPER_ADMIN'
  }
  
  // BCBA Insurance route removed - BCBA timesheets now use regular Insurance
  // Route check removed (will 404 if accessed)
  
  // Handle Community Classes subsection routes
  if (route.startsWith('/community/')) {
    const { getCommunityPermissions } = await import('@/lib/permissions')
    const communityPerms = await getCommunityPermissions(userId)
    
    // Must have Community Classes enabled
    if (!communityPerms.enabled) {
      return false
    }
    
    // Map subsection routes to sections
    if (route === '/community/classes' || route.startsWith('/community/classes/')) {
      return communityPerms.sections.classes
    }
    if (route === '/community/clients' || route.startsWith('/community/clients/')) {
      return communityPerms.sections.clients
    }
    if (route === '/community/invoices' || route.startsWith('/community/invoices/')) {
      return communityPerms.sections.invoices
    }
    if (route === '/community/email-queue' || route.startsWith('/community/email-queue/')) {
      return communityPerms.sections.emailQueue
    }
    
    // Main /community route - just check if enabled
    if (route === '/community') {
      return communityPerms.enabled
    }
    
    // Unknown community route - deny by default
    return false
  }
  
  // Map routes to dashboard section names
  const routeSectionMap: Record<string, string> = {
    '/providers': 'providers',
    '/clients': 'clients',
    '/timesheets': 'timesheets',
    '/invoices': 'invoices',
    '/reports': 'reports',
    '/analytics': 'analytics',
    '/users': 'users',
    '/bcbas': 'bcbas',
    '/insurance': 'insurance',
    '/community': 'community',
    '/email-queue': 'emailQueue',
    '/bcba-timesheets': 'bcbaTimesheets',
    '/payroll': 'payroll',
  }

  const section = routeSectionMap[route]
  if (!section) {
    // Route not in map, allow access (default behavior)
    return true
  }

  return canSeeDashboardSection(userId, section)
}

/**
 * Get timesheet visibility scope for a user
 * Returns which timesheets the user can view based on their permissions
 */
export async function getTimesheetVisibilityScope(userId: string): Promise<TimesheetVisibilityScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      customRole: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          },
          timesheetVisibility: {
            include: {
              user: {
                select: { id: true }
              }
            }
          }
        }
      }
    }
  })

  if (!user) {
    // User not found, can only see own (empty list)
    return { viewAll: false, allowedUserIds: [] }
  }

  // SUPER_ADMIN and ADMIN can see all
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return { viewAll: true, allowedUserIds: [] }
  }

  // Get user permissions
  const permissions = await getUserPermissions(userId)

  // Check if user has timesheets.viewAll permission
  if (permissions['timesheets.viewAll']?.canView === true) {
    return { viewAll: true, allowedUserIds: [] }
  }

  // Check if user has timesheets.viewSelectedUsers permission
  if (permissions['timesheets.viewSelectedUsers']?.canView === true && user.customRole) {
    // Get allowed user IDs from role's timesheetVisibility
    const allowedUserIds = user.customRole.timesheetVisibility.map(tv => tv.userId)
    // Always include own user ID
    const finalAllowedIds = [userId, ...allowedUserIds].filter((id, index, self) => self.indexOf(id) === index) // Remove duplicates
    return { viewAll: false, allowedUserIds: finalAllowedIds }
  }

  // Default: can only see own timesheets
  return { viewAll: false, allowedUserIds: [userId] }
}