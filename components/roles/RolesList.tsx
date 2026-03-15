'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Edit, Trash2, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

interface Role {
  id: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
  _count: {
    users: number
  }
  permissions: Array<{
    permission: {
      id: string
      name: string
      category: string
    }
    canView: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
    canApprove: boolean
    canExport: boolean
  }>
}

export function RolesList() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles || [])
      } else {
        toast.error('Failed to load roles')
      }
    } catch (error) {
      toast.error('An error occurred while loading roles')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string, userCount: number) => {
    if (userCount > 0) {
      toast.error(`Cannot delete role "${name}" because it is assigned to ${userCount} user(s)`)
      return
    }

    if (!confirm(`Are you sure you want to delete role "${name}"?`)) {
      return
    }

    setDeletingId(id)
    try {
      const res = await fetch(`/api/roles/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Role deleted successfully')
        fetchRoles()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete role')
      }
    } catch (error) {
      toast.error('An error occurred while deleting role')
    } finally {
      setDeletingId(null)
    }
  }

  const getPermissionCount = (role: Role) => {
    return role.permissions.filter(p => 
      p.canView || p.canCreate || p.canUpdate || p.canDelete || p.canApprove || p.canExport
    ).length
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Role Management</h1>
          <p className="text-gray-600 mt-1">Create and manage custom roles with granular permissions</p>
        </div>
        <Link
          href="/roles/new"
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Role
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading roles...</div>
        ) : roles.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">No custom roles found</p>
            <Link
              href="/roles/new"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Role
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permissions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Users
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {roles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{role.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">
                      {role.description || <span className="text-gray-400">No description</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {getPermissionCount(role)} permission{getPermissionCount(role) !== 1 ? 's' : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{role._count.users}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        role.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {role.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/roles/${role.id}/edit`}
                      className="text-primary-600 hover:text-primary-900 mr-4"
                    >
                      <Edit className="w-4 h-4 inline" />
                    </Link>
                    <button
                      onClick={() => handleDelete(role.id, role.name, role._count.users)}
                      disabled={deletingId === role.id || role._count.users > 0}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={role._count.users > 0 ? 'Cannot delete role assigned to users' : 'Delete role'}
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        <p>💡 Tip: Create custom roles to grant users specific permissions. Users with custom roles will have limited access based on the permissions you assign.</p>
      </div>
    </div>
  )
}
