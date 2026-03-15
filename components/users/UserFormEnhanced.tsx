'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { validatePassword } from '@/lib/utils'

interface UserFormProps {
  user?: {
    id: string
    username: string
    email: string
    role: string
    customRoleId?: string | null
    customRole?: {
      id: string
      name: string
    } | null
    active: boolean
    activationStart: string | null
    activationEnd: string | null
  }
}

interface Role {
  id: string
  name: string
  description: string | null
}

interface Permission {
  id: string
  name: string
  description: string | null
  category: string
}

export function UserFormEnhanced({ user }: UserFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState(user?.id ? '' : '') // Only allow password for existing users
  const [role, setRole] = useState<'SUPER_ADMIN' | 'ADMIN' | 'USER' | 'CUSTOM'>(user?.role as any || 'USER')
  const [customRoleId, setCustomRoleId] = useState<string>(user?.customRoleId || '')
  const [active, setActive] = useState(user?.active !== undefined ? user.active : true)
  const [activationStart, setActivationStart] = useState<Date | null>(
    user?.activationStart ? new Date(user.activationStart) : null
  )
  const [activationEnd, setActivationEnd] = useState<Date | null>(
    user?.activationEnd ? new Date(user.activationEnd) : null
  )
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)

  useEffect(() => {
    // Any non-admin user can be assigned a Role (customRoleId)
    if (role === 'CUSTOM' || role === 'USER') {
      fetchRoles()
    }
  }, [role])

  const fetchRoles = async () => {
    setLoadingRoles(true)
    try {
      const res = await fetch('/api/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data.roles || [])
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    } finally {
      setLoadingRoles(false)
    }
  }

  const validatePasswordOnChange = (pwd: string) => {
    if (!user || pwd) {
      const validation = validatePassword(pwd)
      setPasswordErrors(validation.errors)
      return validation.valid
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!username.trim()) {
      toast.error('Username is required')
      return
    }

    if (!email.trim()) {
      toast.error('Email is required')
      return
    }

    // Only validate password if editing existing user and password is provided
    if (user && password) {
      const validation = validatePassword(password)
      if (!validation.valid) {
        toast.error(validation.errors.join(', '))
        return
      }
    }

    // Require selecting a role for non-admin accounts (USER/CUSTOM) so permissions apply
    if ((role === 'CUSTOM' || role === 'USER') && !customRoleId) {
      toast.error('Please select a role')
      return
    }

    if (activationStart && activationEnd && activationStart >= activationEnd) {
      toast.error('Activation end date must be after start date')
      return
    }

    setLoading(true)

    try {
      const url = user ? `/api/users/${user.id}` : '/api/users'
      const method = user ? 'PUT' : 'POST'

      const body: any = {
        username: username.trim(),
        email: email.trim(),
        role,
        active,
        activationStart: activationStart ? activationStart.toISOString() : null,
        activationEnd: activationEnd ? activationEnd.toISOString() : null,
      }

      // Allow assigning a role to USER/CUSTOM accounts
      if (role === 'CUSTOM' || role === 'USER') {
        body.customRoleId = customRoleId
      }

      // Only include password if editing existing user and password is provided
      if (user && password) {
        body.password = password
      }

      // Log request payload (excluding sensitive data)
      console.log('[CREATE USER] Request', {
        url,
        method,
        body: {
          ...body,
          password: body.password ? '[REDACTED]' : undefined,
        },
      })

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Log response
      const responseText = await res.text()
      let responseData
      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = { error: responseText }
      }

      console.log('[CREATE USER] Response', {
        status: res.status,
        statusText: res.statusText,
        data: responseData,
      })

      if (res.ok) {
        const data = responseData
        if (!user) {
          // New user created
          if (data.emailSent) {
            toast.success('User created. Invitation email sent.')
          } else {
            toast.success('User created, but invitation email failed. You can resend the invitation from the user list.', { duration: 6000 })
          }
        } else {
          toast.success('User updated successfully')
        }
        router.push('/users')
        router.refresh()
      } else {
        // Handle specific error codes
        const errorCode = responseData.error || 'UNKNOWN_ERROR'
        const errorMessage = responseData.message || responseData.error || `Failed to ${user ? 'update' : 'create'} user`
        
        let displayMessage = errorMessage
        
        // Map error codes to user-friendly messages
        switch (errorCode) {
          case 'DUPLICATE_EMAIL':
            displayMessage = 'That email is already in use'
            break
          case 'DUPLICATE_USERNAME':
            displayMessage = 'That username is already in use'
            break
          case 'DUPLICATE_ENTRY':
            displayMessage = 'A user with this information already exists'
            break
          case 'VALIDATION_ERROR':
            displayMessage = errorMessage // Already user-friendly
            break
          case 'UNAUTHORIZED':
            displayMessage = 'You do not have permission to perform this action'
            break
          case 'DATABASE_ERROR':
            displayMessage = 'Database error occurred. Please contact support.'
            break
          case 'SERVER_ERROR':
            displayMessage = 'Server error occurred. Please try again or contact support.'
            break
          default:
            displayMessage = errorMessage
        }
        
        console.error('[CREATE USER] Error response', {
          status: res.status,
          errorCode,
          errorMessage,
          displayMessage,
        })
        
        toast.error(displayMessage, { duration: 5000 })
      }
    } catch (error: any) {
      console.error('[CREATE USER] Network/parsing error', {
        error: error?.message,
        stack: error?.stack,
      })
      toast.error('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/users"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Users
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {user ? 'Edit User' : 'Create New User'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            placeholder="username"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            placeholder="user@example.com"
          />
        </div>

        {user ? (
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-gray-500 text-xs ml-2">(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                validatePasswordOnChange(e.target.value)
              }}
              className={`w-full px-3 py-2 border rounded-md focus:ring-primary-500 focus:border-primary-500 ${
                passwordErrors.length > 0 ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter new password"
            />
            {passwordErrors.length > 0 && (
              <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                {passwordErrors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Password must be 10-15 characters with uppercase, lowercase, and special character
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-800">
              <strong>Invite User:</strong> A temporary password will be generated and emailed to the user. 
              They will be required to set a new password on first login.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
            Role <span className="text-red-500">*</span>
          </label>
          <select
            id="role"
            required
            value={role}
            onChange={(e) => {
              setRole(e.target.value as any)
              // Keep selected role only for USER/CUSTOM. Clear it for ADMIN/SUPER_ADMIN.
              if (e.target.value === 'ADMIN' || e.target.value === 'SUPER_ADMIN') {
                setCustomRoleId('')
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="CUSTOM">Custom Role</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Super Admin has full system access. Admin has administrative privileges. Custom Role uses predefined role permissions.
          </p>
        </div>

        {(role === 'CUSTOM' || role === 'USER') && (
          <div>
            <label htmlFor="customRole" className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            {loadingRoles ? (
              <div className="text-sm text-gray-500">Loading roles...</div>
            ) : (
              <select
                id="customRole"
                required
                value={customRoleId}
                onChange={(e) => setCustomRoleId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select a role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.description && `- ${r.description}`}
                  </option>
                ))}
              </select>
            )}
            {roles.length === 0 && !loadingRoles && (
              <p className="mt-1 text-xs text-yellow-600">
                No custom roles available. Create roles in the Roles management section.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center">
          <input
            type="checkbox"
            id="active"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="active" className="ml-2 block text-sm text-gray-700">
            Active (User can log in)
          </label>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Activation Schedule (Optional)
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Schedule when the user account should be active. Leave blank for immediate activation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Activation Start Date & Time
              </label>
              <DatePicker
                selected={activationStart}
                onChange={(date) => setActivationStart(date)}
                showTimeSelect
                timeIntervals={15}
                dateFormat="MM/dd/yyyy h:mm aa"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholderText="Select start date/time"
              />
              {activationStart && (
                <button
                  type="button"
                  onClick={() => setActivationStart(null)}
                  className="mt-1 text-sm text-red-600 hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Activation End Date & Time
              </label>
              <DatePicker
                selected={activationEnd}
                onChange={(date) => setActivationEnd(date)}
                showTimeSelect
                timeIntervals={15}
                dateFormat="MM/dd/yyyy h:mm aa"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholderText="Select end date/time"
              />
              {activationEnd && (
                <button
                  type="button"
                  onClick={() => setActivationEnd(null)}
                  className="mt-1 text-sm text-red-600 hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4 pt-4">
          <Link
            href="/users"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : user ? 'Update User' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  )
}
