'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import * as React from 'react'

interface RoleFormProps {
  role?: {
    id: string
    name: string
    description: string | null
    active: boolean
    permissions: Array<{
      permission: {
        id: string
        name: string
        description: string | null
        category: string
      }
      canView: boolean
      canCreate: boolean
      canUpdate: boolean
      canDelete: boolean
      canApprove: boolean
      canExport: boolean
    }>
    timesheetVisibility?: Array<{
      userId: string
      user?: {
        id: string
        username: string
        email: string
      }
    }>
  }
}

interface Permission {
  id: string
  name: string
  description: string | null
  category: string
}

interface PermissionGroup {
  category: string
  permissions: Permission[]
}

interface PermissionState {
  permissionId: string
  canView: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canApprove: boolean
  canExport: boolean
}

export function RoleForm({ role }: RoleFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState(true)
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [active, setActive] = useState(role?.active !== undefined ? role.active : true)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [groupedPermissions, setGroupedPermissions] = useState<PermissionGroup[]>([])
  const [permissionStates, setPermissionStates] = useState<Record<string, PermissionState>>({})
  const [dashboardVisibility, setDashboardVisibility] = useState<Record<string, boolean>>({})
  const [timesheetViewAll, setTimesheetViewAll] = useState(false)
  const [timesheetViewSelectedUsers, setTimesheetViewSelectedUsers] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [users, setUsers] = useState<Array<{ id: string; username: string; email: string }>>([])
  const [userSearch, setUserSearch] = useState('')
  const [showUserSelector, setShowUserSelector] = useState(false)
  const userSelectorRef = useRef<HTMLDivElement>(null)
  
  // Community Classes permissions
  const [canViewCommunityClasses, setCanViewCommunityClasses] = useState(false)
  const [canViewCommunityClassesClasses, setCanViewCommunityClassesClasses] = useState(false)
  const [canViewCommunityClassesClients, setCanViewCommunityClassesClients] = useState(false)
  const [canViewCommunityClassesInvoices, setCanViewCommunityClassesInvoices] = useState(false)
  const [canViewCommunityClassesEmailQueue, setCanViewCommunityClassesEmailQueue] = useState(false)
  
  // Community Email Queue granular permissions
  const [communityEmailQueueView, setCommunityEmailQueueView] = useState(false)
  const [communityEmailQueueSendNow, setCommunityEmailQueueSendNow] = useState(false)
  const [communityEmailQueueSchedule, setCommunityEmailQueueSchedule] = useState(false)
  const [communityEmailQueueDelete, setCommunityEmailQueueDelete] = useState(false)
  const [communityEmailQueueAttachPdf, setCommunityEmailQueueAttachPdf] = useState(false)
  
  // Close user selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userSelectorRef.current && !userSelectorRef.current.contains(event.target as Node)) {
        setShowUserSelector(false)
      }
    }
    
    if (showUserSelector) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserSelector])

  useEffect(() => {
    fetchPermissions()
    fetchUsers()
  }, [])

  useEffect(() => {
    // Initialize timesheet visibility from role
    if (role?.timesheetVisibility) {
      const userIds = role.timesheetVisibility.map(tv => tv.userId)
      setSelectedUserIds(userIds)
      
      // Check if role has viewAll or viewSelectedUsers permissions
      if (role.permissions) {
        const viewAllPerm = role.permissions.find(rp => rp.permission.name === 'timesheets.viewAll')
        const viewSelectedPerm = role.permissions.find(rp => rp.permission.name === 'timesheets.viewSelectedUsers')
        
        if (viewAllPerm?.canView) {
          setTimesheetViewAll(true)
          setTimesheetViewSelectedUsers(false)
        } else if (viewSelectedPerm?.canView) {
          setTimesheetViewAll(false)
          setTimesheetViewSelectedUsers(true)
          setShowUserSelector(true)
        }
      }
    }
  }, [role])

  useEffect(() => {
    if (role?.id) {
      fetchDashboardVisibility()
      // Fetch role to get Community Classes permissions
      fetch(`/api/roles/${role.id}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            setCanViewCommunityClasses(data.canViewCommunityClasses || false)
            setCanViewCommunityClassesClasses(data.canViewCommunityClassesClasses || false)
            setCanViewCommunityClassesClients(data.canViewCommunityClassesClients || false)
            setCanViewCommunityClassesInvoices(data.canViewCommunityClassesInvoices || false)
            setCanViewCommunityClassesEmailQueue(data.canViewCommunityClassesEmailQueue || false)
            // Load granular Community Email Queue permissions
            setCommunityEmailQueueView(data.communityEmailQueueView || false)
            setCommunityEmailQueueSendNow(data.communityEmailQueueSendNow || false)
            setCommunityEmailQueueSchedule(data.communityEmailQueueSchedule || false)
            setCommunityEmailQueueDelete(data.communityEmailQueueDelete || false)
            setCommunityEmailQueueAttachPdf(data.communityEmailQueueAttachPdf || false)
          }
        })
        .catch(err => console.error('Failed to fetch role permissions:', err))
    }
  }, [role?.id])

  const fetchDashboardVisibility = async () => {
    if (!role?.id) return
    try {
      const res = await fetch(`/api/roles/${role.id}/dashboard-visibility`)
      if (res.ok) {
        const data = await res.json()
        const visibility: Record<string, boolean> = {}
        data.visibility?.forEach((v: { section: string; visible: boolean }) => {
          visibility[v.section] = v.visible
        })
        setDashboardVisibility(visibility)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard visibility:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users?limit=1000&active=true')
      if (res.ok) {
        const data = await res.json()
        setUsers((data.users || []).map((u: any) => ({
          id: u.id,
          username: u.username || u.email,
          email: u.email,
        })))
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  useEffect(() => {
    if (role && permissions.length > 0) {
      // Initialize permission states from existing role
      const states: Record<string, PermissionState> = {}
      
      // First, set all permissions to false
      permissions.forEach(perm => {
        states[perm.id] = {
          permissionId: perm.id,
          canView: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        }
      })

      // Then apply role's permissions
      role.permissions.forEach(rp => {
        if (states[rp.permission.id]) {
          states[rp.permission.id] = {
            permissionId: rp.permission.id,
            canView: rp.canView,
            canCreate: rp.canCreate,
            canUpdate: rp.canUpdate,
            canDelete: rp.canDelete,
            canApprove: rp.canApprove,
            canExport: rp.canExport,
          }
        }
      })

      setPermissionStates(states)
    }
  }, [role, permissions])

  const fetchPermissions = async () => {
    setLoadingPermissions(true)
    try {
      const res = await fetch('/api/permissions')
      if (res.ok) {
        const data = await res.json()
        setPermissions(data.permissions || [])
        
        // Group by category
        const grouped: PermissionGroup[] = []
        Object.entries(data.grouped || {}).forEach(([category, perms]) => {
          grouped.push({
            category,
            permissions: perms as Permission[]
          })
        })
        setGroupedPermissions(grouped)

        // Initialize permission states if creating new role
        if (!role) {
          const states: Record<string, PermissionState> = {}
          data.permissions.forEach((perm: Permission) => {
            states[perm.id] = {
              permissionId: perm.id,
              canView: false,
              canCreate: false,
              canUpdate: false,
              canDelete: false,
              canApprove: false,
              canExport: false,
            }
          })
          setPermissionStates(states)
        }
      } else {
        console.error('Failed to load permissions:', res.status, res.statusText)
        toast.error('Failed to load permissions')
      }
    } catch (error) {
      toast.error('An error occurred while loading permissions')
    } finally {
      setLoadingPermissions(false)
    }
  }

  const updatePermission = (permissionId: string, field: keyof PermissionState, value: boolean) => {
    setPermissionStates(prev => ({
      ...prev,
      [permissionId]: {
        ...prev[permissionId],
        [field]: value,
      }
    }))
  }

  const toggleCategory = (category: string, enabled: boolean) => {
    const categoryPerms = permissions.filter(p => p.category === category)
    setPermissionStates(prev => {
      const updated = { ...prev }
      categoryPerms.forEach(perm => {
        if (updated[perm.id]) {
          updated[perm.id] = {
            ...updated[perm.id],
            canView: enabled,
            canCreate: enabled && (perm.name.includes('.create') || perm.name.includes('.generate') || perm.name.includes('.sendBatch') || perm.name.includes('.send')),
            canDelete: enabled && perm.name.includes('.delete'),
            canUpdate: enabled && perm.name.includes('.update'),
            canApprove: enabled && perm.name.includes('.approve'),
            canExport: enabled && perm.name.includes('.export'),
          }
        }
      })
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }

    setLoading(true)

    try {
      const url = role ? `/api/roles/${role.id}` : '/api/roles'
      const method = role ? 'PUT' : 'POST'

      const permissionsArray = Object.values(permissionStates).filter(p => 
        p.canView || p.canCreate || p.canUpdate || p.canDelete || p.canApprove || p.canExport
      )

      // Find permission IDs for timesheet visibility permissions
      const viewAllPerm = permissions.find(p => p.name === 'timesheets.viewAll')
      const viewSelectedPerm = permissions.find(p => p.name === 'timesheets.viewSelectedUsers')
      
      // Add timesheet visibility permissions to permissionsArray if enabled
      if (timesheetViewAll && viewAllPerm) {
        const existingIndex = permissionsArray.findIndex(p => p.permissionId === viewAllPerm.id)
        if (existingIndex >= 0) {
          permissionsArray[existingIndex].canView = true
        } else {
          permissionsArray.push({
            permissionId: viewAllPerm.id,
            canView: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
          })
        }
        // Remove viewSelectedUsers if viewAll is enabled
        if (viewSelectedPerm) {
          const selectedIndex = permissionsArray.findIndex(p => p.permissionId === viewSelectedPerm.id)
          if (selectedIndex >= 0) {
            permissionsArray[selectedIndex].canView = false
          }
        }
      } else if (timesheetViewSelectedUsers && viewSelectedPerm) {
        const existingIndex = permissionsArray.findIndex(p => p.permissionId === viewSelectedPerm.id)
        if (existingIndex >= 0) {
          permissionsArray[existingIndex].canView = true
        } else {
          permissionsArray.push({
            permissionId: viewSelectedPerm.id,
            canView: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
          })
        }
        // Remove viewAll if viewSelectedUsers is enabled
        if (viewAllPerm) {
          const allIndex = permissionsArray.findIndex(p => p.permissionId === viewAllPerm.id)
          if (allIndex >= 0) {
            permissionsArray[allIndex].canView = false
          }
        }
      } else {
        // Remove both if neither is enabled
        if (viewAllPerm) {
          const allIndex = permissionsArray.findIndex(p => p.permissionId === viewAllPerm.id)
          if (allIndex >= 0) {
            permissionsArray[allIndex].canView = false
          }
        }
        if (viewSelectedPerm) {
          const selectedIndex = permissionsArray.findIndex(p => p.permissionId === viewSelectedPerm.id)
          if (selectedIndex >= 0) {
            permissionsArray[selectedIndex].canView = false
          }
        }
      }

      const body = {
        name: name.trim(),
        description: description.trim() || null,
        active,
        permissions: permissionsArray,
        dashboardVisibility: Object.entries(dashboardVisibility).map(([section, visible]) => ({
          section,
          visible,
        })),
        timesheetVisibility: timesheetViewSelectedUsers ? selectedUserIds : [],
        // Community Classes permissions
        // Sync with dashboard visibility - if quickAccess.community is enabled, enable canViewCommunityClasses
        canViewCommunityClasses: dashboardVisibility['quickAccess.community'] || canViewCommunityClasses || false,
        canViewCommunityClassesClasses: canViewCommunityClassesClasses,
        canViewCommunityClassesClients: canViewCommunityClassesClients,
        canViewCommunityClassesInvoices: canViewCommunityClassesInvoices,
        canViewCommunityClassesEmailQueue: canViewCommunityClassesEmailQueue,
        // Community Email Queue granular permissions
        communityEmailQueueView: communityEmailQueueView,
        communityEmailQueueSendNow: communityEmailQueueSendNow,
        communityEmailQueueSchedule: communityEmailQueueSchedule,
        communityEmailQueueDelete: communityEmailQueueDelete,
        communityEmailQueueAttachPdf: communityEmailQueueAttachPdf,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast.success(`Role ${role ? 'updated' : 'created'} successfully`)
        router.push('/roles')
        router.refresh()
      } else {
        const data = await res.json()
        console.error('Role creation error:', data)
        toast.error(data.details || data.error || `Failed to ${role ? 'update' : 'create'} role`)
      }
    } catch (error: any) {
      console.error('Role creation exception:', error)
      toast.error(error?.message || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getCategoryPermissionCount = (category: string) => {
    const categoryPerms = permissions.filter(p => p.category === category)
    let count = 0
    categoryPerms.forEach(perm => {
      const state = permissionStates[perm.id]
      if (state && (state.canView || state.canCreate || state.canUpdate || state.canDelete || state.canApprove || state.canExport)) {
        count++
      }
    })
    return { total: categoryPerms.length, enabled: count }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/roles"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Roles
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {role ? 'Edit Role' : 'Create New Role'}
        </h1>
        <p className="text-gray-600 mt-2">
          Define permissions for this role. Users assigned to this role will have the permissions you configure below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Basic Information */}
        <div className="border-b pb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Role Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="e.g., Manager, Editor, Viewer"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="active" className="ml-2 block text-sm text-gray-700">
                Active (Role can be assigned to users)
              </label>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              placeholder="Describe what this role is for..."
            />
          </div>
        </div>

        {/* Dashboard Visibility - Quick Access Tiles */}
        <div className="border-b pb-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Dashboard Visibility - Quick Access</h2>
          <p className="text-sm text-gray-600 mb-4">
            Control which Quick Access tiles users with this role can see in their Dashboard
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'quickAccess.analytics', label: 'Analytics', icon: '📊', subtext: 'View analytics and reports' },
              { key: 'quickAccess.providers', label: 'Providers', icon: '👥', subtext: 'Manage providers' },
              { key: 'quickAccess.clients', label: 'Clients', icon: '👤', subtext: 'Manage clients' },
              { key: 'quickAccess.timesheets', label: 'Timesheets', icon: '📅', subtext: 'View and manage timesheets' },
              { key: 'quickAccess.forms', label: 'Forms', icon: '📝', subtext: 'Parent training, ABC data, and visit attestation forms' },
              { key: 'quickAccess.invoices', label: 'Invoices', icon: '📄', subtext: 'View and manage invoices' },
              { key: 'quickAccess.reports', label: 'Reports', icon: '📋', subtext: 'Generate and view reports' },
              { key: 'quickAccess.users', label: 'Users', icon: '👤', subtext: 'Manage users and roles' },
              { key: 'quickAccess.bcbas', label: 'BCBAs', icon: '🎓', subtext: 'Manage BCBAs' },
              { key: 'quickAccess.insurance', label: 'Insurance', icon: '🛡️', subtext: 'Manage insurance information' },
              { key: 'quickAccess.community', label: 'Community Classes', icon: '🎓', subtext: 'Manage community classes, clients, and invoices' },
              { key: 'quickAccess.emailQueue', label: 'Email Queue', icon: '📧', subtext: 'Manage queued emails (timesheets/invoices)' },
              { key: 'quickAccess.bcbaTimesheets', label: 'BCBA Timesheets', icon: '📋', subtext: 'Manage BCBA time tracking and hours' },
              { key: 'quickAccess.payroll', label: 'Payroll Management', icon: '💰', subtext: 'Import time logs, manage employees, and process payroll' },
            ].map((section) => (
              <div
                key={section.key}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dashboardVisibility[section.key] || false}
                    onChange={(e) => {
                      setDashboardVisibility(prev => ({
                        ...prev,
                        [section.key]: e.target.checked
                      }))
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center">
                      <span className="text-xl mr-2">{section.icon}</span>
                      <span className="font-medium text-gray-900">{section.label}</span>
                    </div>
                    {section.subtext && (
                      <p className="text-xs text-gray-500 mt-1 ml-7">{section.subtext}</p>
                    )}
                  </div>
                </label>
                {dashboardVisibility[section.key] && (
                  <p className="text-xs text-green-600 mt-1 ml-7">Visible in Dashboard</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard Visibility - Other Sections */}
        <div className="border-b pb-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Dashboard Visibility - Other Sections</h2>
          <p className="text-sm text-gray-600 mb-4">
            Control which dashboard sections users with this role can see
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'sections.pendingApprovals', label: 'Pending Approvals', icon: '⏳' },
              { key: 'sections.recentActivity', label: 'Recent Activity', icon: '📊' },
              { key: 'sections.recentInvoices', label: 'Recent Invoices', icon: '📄' },
              { key: 'sections.outstanding', label: 'Outstanding', icon: '💰' },
            ].map((section) => (
              <div
                key={section.key}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dashboardVisibility[section.key] || false}
                    onChange={(e) => {
                      setDashboardVisibility(prev => ({
                        ...prev,
                        [section.key]: e.target.checked
                      }))
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <div className="ml-3 flex items-center">
                    <span className="text-xl mr-2">{section.icon}</span>
                    <span className="font-medium text-gray-900">{section.label}</span>
                  </div>
                </label>
                {dashboardVisibility[section.key] && (
                  <p className="text-xs text-green-600 mt-1 ml-7">Visible in Dashboard</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Community Classes - Subsections */}
        <div className="border-b pb-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Community Classes - Subsections</h2>
          <p className="text-sm text-gray-600 mb-4">
            Control which Community Classes subsections users with this role can access. 
            The main Community Classes tile must be enabled in "Quick Access" above for these to take effect.
          </p>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Subsection toggles are disabled until "Community Classes" is enabled in Quick Access above.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { 
                key: 'classes', 
                label: 'Classes', 
                icon: '🎓',
                state: canViewCommunityClassesClasses,
                setState: setCanViewCommunityClassesClasses,
              },
              { 
                key: 'clients', 
                label: 'Clients', 
                icon: '👥',
                state: canViewCommunityClassesClients,
                setState: setCanViewCommunityClassesClients,
              },
              { 
                key: 'invoices', 
                label: 'Invoices', 
                icon: '📄',
                state: canViewCommunityClassesInvoices,
                setState: setCanViewCommunityClassesInvoices,
              },
              { 
                key: 'emailQueue', 
                label: 'Email Queue', 
                icon: '📧',
                state: canViewCommunityClassesEmailQueue,
                setState: setCanViewCommunityClassesEmailQueue,
              },
            ].map((section) => {
              const isDisabled = !canViewCommunityClasses && !dashboardVisibility['quickAccess.community']
              return (
                <div
                  key={section.key}
                  className={`border border-gray-200 rounded-lg p-4 transition-colors ${
                    isDisabled ? 'bg-gray-100 opacity-60' : 'hover:bg-gray-50'
                  }`}
                >
                  <label className={`flex items-center ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={section.state}
                      disabled={isDisabled}
                      onChange={(e) => {
                        if (!isDisabled) {
                          section.setState(e.target.checked)
                        }
                      }}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded disabled:opacity-50"
                    />
                    <div className="ml-3 flex items-center">
                      <span className="text-xl mr-2">{section.icon}</span>
                      <span className="font-medium text-gray-900">{section.label}</span>
                    </div>
                  </label>
                  {section.state && !isDisabled && (
                    <p className="text-xs text-green-600 mt-1 ml-7">Access Enabled</p>
                  )}
                  {isDisabled && (
                    <p className="text-xs text-gray-500 mt-1 ml-7">Enable Community Classes first</p>
                  )}
                  {section.state && section.key === 'emailQueue' && !isDisabled && (
                    <div className="mt-4 ml-7 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Email Queue Permissions</h4>
                      <div className="space-y-2">
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="checkbox"
                            checked={communityEmailQueueView}
                            onChange={(e) => setCommunityEmailQueueView(e.target.checked)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                          />
                          <div className="ml-2">
                            <div className="font-medium text-sm text-gray-900">View Email Queue</div>
                            <div className="text-xs text-gray-500 mt-0.5">View queued, sent, and failed emails</div>
                          </div>
                        </label>
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="checkbox"
                            checked={communityEmailQueueSendNow}
                            onChange={(e) => setCommunityEmailQueueSendNow(e.target.checked)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                          />
                          <div className="ml-2">
                            <div className="font-medium text-sm text-gray-900">Send Now</div>
                            <div className="text-xs text-gray-500 mt-0.5">Send emails immediately</div>
                          </div>
                        </label>
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="checkbox"
                            checked={communityEmailQueueSchedule}
                            onChange={(e) => setCommunityEmailQueueSchedule(e.target.checked)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                          />
                          <div className="ml-2">
                            <div className="font-medium text-sm text-gray-900">Schedule Emails</div>
                            <div className="text-xs text-gray-500 mt-0.5">Schedule emails for future delivery</div>
                          </div>
                        </label>
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="checkbox"
                            checked={communityEmailQueueAttachPdf}
                            onChange={(e) => setCommunityEmailQueueAttachPdf(e.target.checked)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                          />
                          <div className="ml-2">
                            <div className="font-medium text-sm text-gray-900">Attach PDF</div>
                            <div className="text-xs text-gray-500 mt-0.5">Upload and attach additional PDF files to emails</div>
                          </div>
                        </label>
                        <label className="flex items-start cursor-pointer">
                          <input
                            type="checkbox"
                            checked={communityEmailQueueDelete}
                            onChange={(e) => setCommunityEmailQueueDelete(e.target.checked)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                          />
                          <div className="ml-2">
                            <div className="font-medium text-sm text-gray-900">Delete Emails</div>
                            <div className="text-xs text-gray-500 mt-0.5">Delete queued, sent, or failed emails</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Permissions */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Permissions</h2>
            {loadingPermissions && (
              <span className="text-sm text-gray-500">Loading permissions...</span>
            )}
          </div>

          {loadingPermissions ? (
            <div className="text-center py-8 text-gray-500">Loading permissions...</div>
          ) : (
            <div className="space-y-6">
              {groupedPermissions.map((group) => {
                const { total, enabled } = getCategoryPermissionCount(group.category)
                const allEnabled = total > 0 && enabled === total

                return (
                  <div key={group.category} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900 capitalize">
                          {group.category}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {enabled} of {total} permissions enabled
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCategory(group.category, !allEnabled)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          allEnabled
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {allEnabled ? 'Disable All' : 'Enable All'}
                      </button>
                    </div>

                    {/* Special handling for timesheets category - add visibility permissions */}
                    {group.category === 'timesheets' && (
                      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Timesheet Visibility</h4>
                        <div className="space-y-3">
                          <label className="flex items-start cursor-pointer">
                            <input
                              type="checkbox"
                              checked={timesheetViewAll}
                              onChange={(e) => {
                                setTimesheetViewAll(e.target.checked)
                                if (e.target.checked) {
                                  setTimesheetViewSelectedUsers(false)
                                  setShowUserSelector(false)
                                }
                              }}
                              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5"
                            />
                            <div className="ml-3">
                              <div className="font-medium text-sm text-gray-900">View all timesheets</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Allows viewing timesheets from ALL users (global access)
                              </div>
                            </div>
                          </label>
                          
                          <label className="flex items-start cursor-pointer">
                            <input
                              type="checkbox"
                              checked={timesheetViewSelectedUsers}
                              onChange={(e) => {
                                setTimesheetViewSelectedUsers(e.target.checked)
                                if (e.target.checked) {
                                  setTimesheetViewAll(false)
                                  setShowUserSelector(true)
                                } else {
                                  setShowUserSelector(false)
                                  setSelectedUserIds([])
                                }
                              }}
                              disabled={timesheetViewAll}
                              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-0.5 disabled:opacity-50"
                            />
                            <div className="ml-3 flex-1">
                              <div className="font-medium text-sm text-gray-900">View selected users' timesheets</div>
                              <div className="text-xs text-gray-500 mt-1">
                                When enabled, select specific users whose timesheets are visible
                              </div>
                              
                              {timesheetViewSelectedUsers && (
                                <div className="mt-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-gray-700">
                                      Selected Users ({selectedUserIds.length})
                                    </span>
                                    <div className="flex gap-2">
                                      {users.length > 0 && selectedUserIds.length < users.length && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedUserIds(users.map(u => u.id))
                                          }}
                                          className="text-xs text-blue-600 hover:text-blue-800"
                                        >
                                          Select All
                                        </button>
                                      )}
                                      {selectedUserIds.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedUserIds([])
                                          }}
                                          className="text-xs text-red-600 hover:text-red-800"
                                        >
                                          Clear All
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="relative" ref={userSelectorRef}>
                                    <input
                                      type="text"
                                      placeholder="Search users..."
                                      value={userSearch}
                                      onChange={(e) => setUserSearch(e.target.value)}
                                      onFocus={() => setShowUserSelector(true)}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                    />
                                    
                                    {showUserSelector && (
                                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                        {users.length > 0 && (
                                          <div className="sticky top-0 bg-gray-50 border-b px-3 py-2 flex items-center justify-between">
                                            <span className="text-xs text-gray-600">
                                              {users.filter(u => 
                                                !userSearch || 
                                                u.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
                                                u.email?.toLowerCase().includes(userSearch.toLowerCase())
                                              ).length} users
                                            </span>
                                            {userSearch && (
                                              <button
                                                type="button"
                                                onClick={() => setUserSearch('')}
                                                className="text-xs text-gray-500 hover:text-gray-700"
                                              >
                                                Clear search
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        {users
                                          .filter(u => 
                                            !userSearch || 
                                            u.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
                                            u.email?.toLowerCase().includes(userSearch.toLowerCase())
                                          )
                                          .map((user) => (
                                            <label
                                              key={user.id}
                                              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={selectedUserIds.includes(user.id)}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedUserIds([...selectedUserIds, user.id])
                                                  } else {
                                                    setSelectedUserIds(selectedUserIds.filter(id => id !== user.id))
                                                  }
                                                }}
                                                className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                              />
                                              <div className="ml-2 flex-1">
                                                <div className="text-sm text-gray-900">{user.username || user.email}</div>
                                                {user.username && user.email && (
                                                  <div className="text-xs text-gray-500">{user.email}</div>
                                                )}
                                              </div>
                                            </label>
                                          ))}
                                        {users.filter(u => 
                                          !userSearch || 
                                          u.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
                                          u.email?.toLowerCase().includes(userSearch.toLowerCase())
                                        ).length === 0 && (
                                          <div className="px-3 py-2 text-sm text-gray-500">No users found</div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {selectedUserIds.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedUserIds.map((userId) => {
                                        const user = users.find(u => u.id === userId)
                                        if (!user) return null
                                        return (
                                          <span
                                            key={userId}
                                            className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-blue-100 text-blue-800"
                                          >
                                            {user.username || user.email}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSelectedUserIds(selectedUserIds.filter(id => id !== userId))
                                              }}
                                              className="ml-1 text-blue-600 hover:text-blue-800"
                                            >
                                              ×
                                            </button>
                                          </span>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.permissions.map((perm) => {
                        // Skip viewAll and viewSelectedUsers as they're handled above
                        if (perm.name === 'timesheets.viewAll' || perm.name === 'timesheets.viewSelectedUsers') {
                          return null
                        }
                        
                        const state = permissionStates[perm.id]
                        if (!state) return null

                        return (
                          <div
                            key={perm.id}
                            className="border border-gray-200 rounded p-3 hover:bg-gray-50"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="font-medium text-sm text-gray-900">
                                  {perm.name.replace(`${perm.category}.`, '')}
                                </div>
                                {perm.description && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {perm.description}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {perm.name.includes('.view') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canView}
                                    onChange={(e) => updatePermission(perm.id, 'canView', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">View</span>
                                </label>
                              )}
                              {perm.name.includes('.create') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canCreate}
                                    onChange={(e) => updatePermission(perm.id, 'canCreate', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Create</span>
                                </label>
                              )}
                              {perm.name.includes('.update') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canUpdate}
                                    onChange={(e) => updatePermission(perm.id, 'canUpdate', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Update</span>
                                </label>
                              )}
                              {perm.name.includes('.delete') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canDelete}
                                    onChange={(e) => updatePermission(perm.id, 'canDelete', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Delete</span>
                                </label>
                              )}
                              {perm.name.includes('.approve') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canApprove}
                                    onChange={(e) => updatePermission(perm.id, 'canApprove', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Approve</span>
                                </label>
                              )}
                              {perm.name.includes('.export') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canExport}
                                    onChange={(e) => updatePermission(perm.id, 'canExport', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Export</span>
                                </label>
                              )}
                              {perm.name.includes('.submit') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canApprove}
                                    onChange={(e) => updatePermission(perm.id, 'canApprove', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Submit</span>
                                </label>
                              )}
                              {perm.name.includes('.generate') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canCreate}
                                    onChange={(e) => updatePermission(perm.id, 'canCreate', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Generate</span>
                                </label>
                              )}
                              {perm.name.includes('.sendBatch') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canCreate}
                                    onChange={(e) => updatePermission(perm.id, 'canCreate', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Send Batch</span>
                                </label>
                              )}
                              {perm.name.includes('.delete') && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={state.canDelete}
                                    onChange={(e) => updatePermission(perm.id, 'canDelete', e.target.checked)}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-700">Delete</span>
                                </label>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t">
          <Link
            href="/roles"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : role ? 'Update Role' : 'Create Role'}
          </button>
        </div>
      </form>
    </div>
  )
}
