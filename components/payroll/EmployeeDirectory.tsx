'use client'

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react'
import Link from 'next/link'
import { Plus, Edit, Trash2, X, Save, User, DollarSign, Hash, Mail, Phone, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

// Proper React Error Boundary
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('EmployeeDirectory Error Boundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center mb-2">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold text-red-900">Error Loading Employee Directory</h2>
            </div>
            <p className="text-red-700 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

interface PayrollEmployee {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  active: boolean
  defaultHourlyRate: number
  overtimeRateHourly: number | null
  overtimeStartTime: number | null // Minutes since midnight
  overtimeEnabled: boolean
  scannerExternalId: string | null
  notes: string | null
}

export function EmployeeDirectory({ permissions, userRole }: { permissions: any, userRole: string }) {
  // Add safety checks for props
  const safePermissions = permissions || {}
  const safeUserRole = userRole || 'USER'
  
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<PayrollEmployee | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [active, setActive] = useState(true)
  const [defaultHourlyRate, setDefaultHourlyRate] = useState('')
  const [overtimeRateHourly, setOvertimeRateHourly] = useState('')
  const [overtimeStartTime, setOvertimeStartTime] = useState('') // HH:MM format
  const [overtimeEnabled, setOvertimeEnabled] = useState(false)
  const [scannerExternalId, setScannerExternalId] = useState('')
  const [notes, setNotes] = useState('')

  // Safe permission checks with fallbacks
  const isAdmin = safeUserRole === 'ADMIN' || safeUserRole === 'SUPER_ADMIN'
  const canEdit = (safePermissions['PAYROLL_MANAGE_EMPLOYEES']?.canView === true) || isAdmin

  useEffect(() => {
    fetchEmployees()
  }, [])

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/payroll/employees')
      if (response.ok) {
        const data = await response.json()
        setEmployees(data.employees || [])
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const handleNewEmployee = () => {
    setEditingEmployee(null)
    setFullName('')
    setEmail('')
    setPhone('')
    setActive(true)
    setDefaultHourlyRate('')
    setOvertimeRateHourly('')
    setOvertimeStartTime('')
    setOvertimeEnabled(false)
    setScannerExternalId('')
    setNotes('')
    setShowForm(true)
  }

  // Convert minutes since midnight to HH:MM format
  const minutesToTime = (minutes: number | null): string => {
    if (minutes === null || minutes === undefined) return ''
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    return `${displayHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${period}`
  }

  // Convert HH:MM AM/PM to minutes since midnight
  const timeToMinutes = (timeStr: string): number | null => {
    if (!timeStr.trim()) return null
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (!match) return null
    let hours = parseInt(match[1])
    const minutes = parseInt(match[2])
    const period = match[3].toUpperCase()
    
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    
    return hours * 60 + minutes
  }

  const handleEditEmployee = (employee: PayrollEmployee) => {
    setEditingEmployee(employee)
    setFullName(employee.fullName || '')
    setEmail(employee.email || '')
    setPhone(employee.phone || '')
    setActive(employee.active ?? true)
    setDefaultHourlyRate((employee.defaultHourlyRate || 0).toString())
    setOvertimeRateHourly((employee.overtimeRateHourly || '').toString())
    setOvertimeStartTime(minutesToTime(employee.overtimeStartTime))
    setOvertimeEnabled(employee.overtimeEnabled ?? false)
    setScannerExternalId(employee.scannerExternalId || '')
    setNotes(employee.notes || '')
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingEmployee(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName.trim()) {
      toast.error('Full name is required')
      return
    }

    if (!defaultHourlyRate || isNaN(parseFloat(defaultHourlyRate)) || parseFloat(defaultHourlyRate) < 0) {
      toast.error('Valid default hourly rate is required')
      return
    }

    // Validate overtime fields
    let overtimeRate: number | null = null
    let overtimeStart: number | null = null
    
    if (overtimeRateHourly.trim()) {
      overtimeRate = parseFloat(overtimeRateHourly)
      if (isNaN(overtimeRate) || overtimeRate <= 0) {
        toast.error('Overtime rate must be a positive number')
        return
      }
      
      if (!overtimeStartTime.trim()) {
        toast.error('Overtime start time is required when overtime rate is set')
        return
      }
      
      overtimeStart = timeToMinutes(overtimeStartTime)
      if (overtimeStart === null) {
        toast.error('Invalid overtime start time format. Use HH:MM AM/PM (e.g., 5:00 PM)')
        return
      }
    } else if (overtimeStartTime.trim()) {
      toast.error('Overtime rate is required when overtime start time is set')
      return
    }

    setSaving(true)

    try {
      const url = editingEmployee
        ? `/api/payroll/employees/${editingEmployee.id}`
        : '/api/payroll/employees'

      const method = editingEmployee ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          active,
          defaultHourlyRate: parseFloat(defaultHourlyRate),
          overtimeRateHourly: overtimeRate,
          overtimeStartTime: overtimeStart,
          overtimeEnabled: overtimeEnabled && overtimeRate !== null,
          scannerExternalId: scannerExternalId.trim() || null,
          notes: notes.trim() || null,
        }),
      })

      if (response.ok) {
        toast.success(`Employee ${editingEmployee ? 'updated' : 'created'} successfully`)
        setShowForm(false)
        setEditingEmployee(null)
        fetchEmployees()
      } else {
        const error = await response.json()
        toast.error(error.error || `Failed to save employee`)
      }
    } catch (error: any) {
      console.error('Error saving employee:', error)
      toast.error('Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (employee: PayrollEmployee) => {
    if (!confirm(`Are you sure you want to delete ${employee.fullName}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/payroll/employees/${employee.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Employee deleted successfully')
        fetchEmployees()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to delete employee')
      }
    } catch (error: any) {
      console.error('Error deleting employee:', error)
      toast.error('Failed to delete employee')
    }
  }

  const filteredEmployees = employees.filter(emp =>
    emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.scannerExternalId?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Wrap in error boundary
  return (
    <ErrorBoundary>
      <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/payroll"
            className="flex items-center text-white hover:text-gray-100 mb-2"
          >
            ← Back to Payroll
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Employee Directory</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage employee directory and pay rates
          </p>
        </div>
        {canEdit && (
          <button
            onClick={handleNewEmployee}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Employee
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name, email, or scanner ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingEmployee ? 'Edit Employee' : 'New Employee'}
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Hourly Rate <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={defaultHourlyRate}
                    onChange={(e) => setDefaultHourlyRate(e.target.value)}
                    required
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="md:col-span-2 border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Overtime Settings</h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Overtime Hourly Rate
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={overtimeRateHourly}
                    onChange={(e) => setOvertimeRateHourly(e.target.value)}
                    placeholder="Optional"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Overtime Start Time
                </label>
                <input
                  type="text"
                  value={overtimeStartTime}
                  onChange={(e) => setOvertimeStartTime(e.target.value)}
                  placeholder="5:00 PM"
                  pattern="\d{1,2}:\d{2}\s*(AM|PM)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">Format: HH:MM AM/PM (e.g., 5:00 PM)</p>
              </div>

              <div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overtimeEnabled}
                    onChange={(e) => setOvertimeEnabled(e.target.checked)}
                    disabled={!overtimeRateHourly.trim()}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded disabled:opacity-50"
                  />
                  <span className="ml-2 text-sm text-gray-700">Overtime Enabled</span>
                </label>
                <p className="mt-1 text-xs text-gray-500">Automatically enabled when overtime rate is set</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Scanner External ID
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={scannerExternalId}
                    onChange={(e) => setScannerExternalId(e.target.value)}
                    placeholder="Fingerprint scanner ID"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : editingEmployee ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Employees List */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">Loading employees...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? 'No employees found' : 'No employees yet'}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchTerm ? 'Try a different search term' : 'Get started by adding your first employee'}
          </p>
          {!searchTerm && canEdit && (
            <button
              onClick={handleNewEmployee}
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Employee
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hourly Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scanner ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                {canEdit && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className={employee.active ? '' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="w-5 h-5 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-900">{employee.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.phone || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${((employee.defaultHourlyRate ?? 0) || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.scannerExternalId || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      employee.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {employee.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditEmployee(employee)}
                          className="text-primary-600 hover:text-primary-900 flex items-center"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(employee)}
                          className="text-red-600 hover:text-red-900 flex items-center"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </ErrorBoundary>
  )
}
