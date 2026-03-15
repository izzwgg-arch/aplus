'use client'

import { useState } from 'react'
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
    email: string
    role: string
    active: boolean
    activationStart: string | null
    activationEnd: string | null
  }
}

export function UserForm({ user }: UserFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'USER'>(user?.role as 'ADMIN' | 'USER' || 'USER')
  const [active, setActive] = useState(user?.active !== undefined ? user.active : true)
  const [activationStart, setActivationStart] = useState<Date | null>(
    user?.activationStart ? new Date(user.activationStart) : null
  )
  const [activationEnd, setActivationEnd] = useState<Date | null>(
    user?.activationEnd ? new Date(user.activationEnd) : null
  )
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])

  const validatePasswordOnChange = (pwd: string) => {
    if (!user || pwd) {
      // Only validate if creating new user or if password is being changed
      const validation = validatePassword(pwd)
      setPasswordErrors(validation.errors)
      return validation.valid
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Email is required')
      return
    }

    // Validate password only if creating new user or password is provided
    if (!user || password) {
      const validation = validatePassword(password)
      if (!validation.valid) {
        toast.error(validation.errors.join(', '))
        return
      }
    }

    // Validate activation dates
    if (activationStart && activationEnd && activationStart >= activationEnd) {
      toast.error('Activation end date must be after start date')
      return
    }

    setLoading(true)

    try {
      const url = user ? `/api/users/${user.id}` : '/api/users'
      const method = user ? 'PUT' : 'POST'

      const body: any = {
        email: email.trim(),
        role,
        active,
        activationStart: activationStart ? activationStart.toISOString() : null,
        activationEnd: activationEnd ? activationEnd.toISOString() : null,
      }

      // Only include password if provided (for new users or updates)
      if (!user || password) {
        body.password = password
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        toast.success(`User ${user ? 'updated' : 'created'} successfully`)
        router.push('/users')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || `Failed to ${user ? 'update' : 'create'} user`)
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
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

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="space-y-6">
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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password {!user && <span className="text-red-500">*</span>}
              {user && <span className="text-gray-500 text-xs ml-2">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              id="password"
              required={!user}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                validatePasswordOnChange(e.target.value)
              }}
              className={`w-full px-3 py-2 border rounded-md focus:ring-primary-500 focus:border-primary-500 ${
                passwordErrors.length > 0 ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder={user ? 'Enter new password' : 'Enter password'}
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

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              id="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'USER')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
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
        </div>
      </form>
    </div>
  )
}
