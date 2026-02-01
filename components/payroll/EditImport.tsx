'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, CheckCircle, AlertCircle, User, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

interface PayrollImportRow {
  id: string
  rowIndex: number
  employeeNameRaw: string | null
  employeeExternalIdRaw: string | null
  workDate: string
  inTime: string | null
  outTime: string | null
  minutesWorked: number | null
  hoursWorked: number | null
  linkedEmployeeId: string | null
  linkedEmployee: {
    id: string
    fullName: string
    scannerExternalId: string | null
  } | null
}

interface PayrollImport {
  id: string
  originalFileName: string
  status: 'DRAFT' | 'FINALIZED'
  periodStart: string | null
  periodEnd: string | null
  mappingJson: any
  rows: PayrollImportRow[]
}

export function EditImport({ importId }: { importId: string }) {
  const router = useRouter()
  const [importData, setImportData] = useState<PayrollImport | null>(null)
  const [rows, setRows] = useState<PayrollImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(100)
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; scannerExternalId: string | null }>>([])
  const [linkingRowId, setLinkingRowId] = useState<string | null>(null)

  useEffect(() => {
    fetchImport()
    fetchEmployees()
  }, [importId])

  const autoLinkEmployees = async () => {
    if (importData?.status === 'FINALIZED') {
      return // Don't auto-link finalized imports
    }

    let linkedCount = 0
    const updates: Array<{ rowId: string; employeeId: string; employeeName: string }> = []

    // Match rows to employees by exact name match (case-insensitive, trimmed)
    rows.forEach((row) => {
      // Skip if already linked
      if (row.linkedEmployeeId) return

      // Try to match by employeeNameRaw first
      if (row.employeeNameRaw) {
        const normalizedName = row.employeeNameRaw.trim()
        const matchedEmployee = employees.find(
          (emp) => emp.fullName.trim().toLowerCase() === normalizedName.toLowerCase()
        )
        if (matchedEmployee) {
          updates.push({ 
            rowId: row.id, 
            employeeId: matchedEmployee.id,
            employeeName: matchedEmployee.fullName,
          })
          linkedCount++
          return
        }
      }

      // Try to match by employeeExternalIdRaw if available
      if (row.employeeExternalIdRaw) {
        const normalizedId = row.employeeExternalIdRaw.trim()
        const matchedEmployee = employees.find(
          (emp) => emp.scannerExternalId && emp.scannerExternalId.trim().toLowerCase() === normalizedId.toLowerCase()
        )
        if (matchedEmployee) {
          updates.push({ 
            rowId: row.id, 
            employeeId: matchedEmployee.id,
            employeeName: matchedEmployee.fullName,
          })
          linkedCount++
        }
      }
    })

    // Apply updates locally
    if (updates.length > 0) {
      setRows(prevRows => prevRows.map(row => {
        const update = updates.find(u => u.rowId === row.id)
        if (update) {
          return {
            ...row,
            linkedEmployeeId: update.employeeId,
            linkedEmployee: {
              id: update.employeeId,
              fullName: update.employeeName,
              scannerExternalId: employees.find(e => e.id === update.employeeId)?.scannerExternalId || null,
            },
          }
        }
        return row
      }))

      // Save to database
      try {
        const response = await fetch(`/api/payroll/imports/${importId}/rows`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: updates.map(u => ({
              id: u.rowId,
              linkedEmployeeId: u.employeeId,
            })),
          }),
        })

        if (response.ok) {
          if (linkedCount > 0) {
            toast.success(`Automatically linked ${linkedCount} employee(s) by name match`)
          }
        } else {
          console.error('Failed to save auto-linked employees')
        }
      } catch (error) {
        console.error('Error saving auto-linked employees:', error)
      }
    }
  }

  const handleAutoLink = async () => {
    await autoLinkEmployees()
  }

  // Auto-link employees when both employees and rows are loaded (only once, only for DRAFT imports)
  useEffect(() => {
    if (employees.length > 0 && rows.length > 0 && importData && importData.status !== 'FINALIZED') {
      // Only auto-link if there are unlinked rows
      const hasUnlinkedRows = rows.some(row => !row.linkedEmployeeId)
      if (hasUnlinkedRows) {
        autoLinkEmployees()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length, rows.length])

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/payroll/employees')
      if (response.ok) {
        const data = await response.json()
        setEmployees(data.employees || [])
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  const fetchImport = async () => {
    try {
      const response = await fetch(`/api/payroll/imports/${importId}`)
      if (response.ok) {
        const data = await response.json()
        setImportData(data.import)
        setRows(data.import.rows || [])
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to load import')
      }
    } catch (error: any) {
      console.error('Failed to fetch import:', error)
      toast.error('Failed to load import')
    } finally {
      setLoading(false)
    }
  }

  const updateRow = (rowId: string, field: keyof PayrollImportRow, value: any) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id !== rowId) return row

      const updatedRow = { ...row, [field]: value }

      // Recalculate hours/minutes if in/out times changed
      if ((field === 'inTime' || field === 'outTime') && updatedRow.inTime && updatedRow.outTime) {
        const inTime = new Date(updatedRow.inTime)
        const outTime = new Date(updatedRow.outTime)
        
        // CRITICAL: Ensure OUT time is never equal to IN time
        if (outTime.getTime() === inTime.getTime()) {
          // If they're the same, don't calculate hours - this is invalid
          updatedRow.minutesWorked = null
          updatedRow.hoursWorked = null
        } else {
          // Handle overnight shifts
          let adjustedOutTime = new Date(outTime)
          if (adjustedOutTime < inTime) {
            adjustedOutTime.setDate(adjustedOutTime.getDate() + 1)
          }

          const diffMs = adjustedOutTime.getTime() - inTime.getTime()
          if (diffMs > 0) {
            updatedRow.minutesWorked = Math.floor(diffMs / (1000 * 60))
            updatedRow.hoursWorked = parseFloat((updatedRow.minutesWorked / 60).toFixed(2))
          } else {
            updatedRow.minutesWorked = null
            updatedRow.hoursWorked = null
          }
        }
      } else if (field === 'minutesWorked' && updatedRow.minutesWorked !== null && updatedRow.minutesWorked >= 0) {
        updatedRow.hoursWorked = parseFloat((updatedRow.minutesWorked / 60).toFixed(2))
      } else if (field === 'hoursWorked' && updatedRow.hoursWorked !== null && updatedRow.hoursWorked >= 0) {
        updatedRow.minutesWorked = Math.round(updatedRow.hoursWorked * 60)
      }

      return updatedRow
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/payroll/imports/${importId}/rows`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save rows')
      }

      toast.success('Rows saved successfully!')
      fetchImport() // Refresh data
    } catch (error: any) {
      console.error('Error saving rows:', error)
      toast.error(error.message || 'Failed to save rows')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return ''
    try {
      // Parse the date string and extract local date components to avoid timezone shift
      const date = new Date(dateString)
      // Use local date components, not UTC, to ensure the displayed date matches the stored date
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    } catch {
      return dateString
    }
  }

  const formatTime = (dateString: string | null) => {
    if (!dateString) return ''
    try {
      return format(new Date(dateString), 'HH:mm')
    } catch {
      return dateString
    }
  }

  const parseTimeToDate = (timeString: string, workDate: string) => {
    if (!timeString || !workDate) return null
    try {
      const [hours, minutes] = timeString.split(':').map(Number)
      if (isNaN(hours) || isNaN(minutes)) return null
      const date = new Date(workDate)
      date.setHours(hours || 0, minutes || 0, 0, 0)
      return date.toISOString()
    } catch {
      return null
    }
  }

  // Validation: Check if OUT < IN (invalid)
  const validateRow = (row: PayrollImportRow): string | null => {
    if (row.inTime && row.outTime) {
      const inTime = new Date(row.inTime)
      const outTime = new Date(row.outTime)
      if (outTime < inTime) {
        return 'OUT time cannot be before IN time'
      }
      if (outTime.getTime() === inTime.getTime()) {
        return 'IN and OUT times cannot be identical'
      }
    }
    return null
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">Loading import...</p>
        </div>
      </div>
    )
  }

  if (!importData) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Import not found</h3>
          <Link
            href="/payroll/imports"
            className="text-primary-600 hover:text-primary-900"
          >
            Back to Imports
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/payroll/imports"
            className="flex items-center text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Imports
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Import</h1>
          <p className="mt-2 text-sm text-gray-600">
            {importData.originalFileName} - {rows.length} rows
          </p>
          <div className="mt-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              importData.status === 'FINALIZED' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {importData.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {importData.status !== 'FINALIZED' && (
            <button
              onClick={handleAutoLink}
              className="px-4 py-2 border border-primary-600 text-primary-600 rounded-md hover:bg-primary-50 flex items-center"
              title="Automatically link employees by matching names exactly"
            >
              <User className="w-4 h-4 mr-2" />
              Auto-Link Employees
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || importData.status === 'FINALIZED'}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Import Info */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">File Name</label>
            <p className="mt-1 text-sm text-gray-900">{importData.originalFileName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <p className="mt-1 text-sm text-gray-900">{importData.status}</p>
          </div>
          {importData.periodStart && importData.periodEnd && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Period Start</label>
                <p className="mt-1 text-sm text-gray-900">
                  {format(new Date(importData.periodStart), 'MM/dd/yyyy')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Period End</label>
                <p className="mt-1 text-sm text-gray-900">
                  {format(new Date(importData.periodEnd), 'MM/dd/yyyy')}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row Count and Pagination Info */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">
              Total rows: <strong>{rows.length}</strong>
            </p>
            {rows.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Showing rows {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, rows.length)} of {rows.length}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Rows per page:</label>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="px-2 py-1 text-sm border border-gray-300 rounded"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
      </div>

      {/* Editable Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">In Time</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Out Time</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Worked</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Linked Employee</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows
                .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                .map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                    {row.rowIndex + 1}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={row.employeeNameRaw || row.employeeExternalIdRaw || ''}
                      onChange={(e) => {
                        if (row.employeeNameRaw) {
                          updateRow(row.id, 'employeeNameRaw', e.target.value)
                        } else {
                          updateRow(row.id, 'employeeExternalIdRaw', e.target.value)
                        }
                      }}
                      disabled={importData.status === 'FINALIZED'}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100"
                      title="Employee Name or ID"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="date"
                      value={formatDate(row.workDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          // Parse the date input (YYYY-MM-DD) as local date
                          // Store as ISO string but ensure it represents local midnight, not UTC
                          const [year, month, day] = e.target.value.split('-').map(Number)
                          // Create date at local midnight
                          const localDate = new Date(year, month - 1, day, 0, 0, 0, 0)
                          // Convert to ISO string - this will be UTC, but we'll handle it on the server
                          // The key is to send the date components explicitly
                          const isoString = localDate.toISOString()
                          updateRow(row.id, 'workDate', isoString)
                        } else {
                          updateRow(row.id, 'workDate', row.workDate)
                        }
                      }}
                      disabled={importData.status === 'FINALIZED'}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="time"
                      value={formatTime(row.inTime)}
                      onChange={(e) => {
                        const timeDate = parseTimeToDate(e.target.value, row.workDate)
                        updateRow(row.id, 'inTime', timeDate)
                      }}
                      disabled={importData.status === 'FINALIZED'}
                      className={`w-full px-2 py-1 text-sm border rounded disabled:bg-gray-100 ${
                        validateRow(row) ? 'border-red-500' : 'border-gray-300'
                      }`}
                      title="Clock-In Time"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="time"
                      value={formatTime(row.outTime)}
                      onChange={(e) => {
                        const timeDate = parseTimeToDate(e.target.value, row.workDate)
                        updateRow(row.id, 'outTime', timeDate)
                      }}
                      disabled={importData.status === 'FINALIZED'}
                      className={`w-full px-2 py-1 text-sm border rounded disabled:bg-gray-100 ${
                        validateRow(row) ? 'border-red-500' : 'border-gray-300'
                      }`}
                      title="Clock-Out Time"
                    />
                    {validateRow(row) && (
                      <div className="text-xs text-red-600 mt-1">{validateRow(row)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const totalMinutes = row.minutesWorked || 0
                      if (totalMinutes === 0) return '-'
                      const hours = Math.floor(totalMinutes / 60)
                      const minutes = totalMinutes % 60
                      return `${hours} hours${minutes > 0 ? ` ${minutes} minutes` : ''}`
                    })()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm">
                    {linkingRowId === row.id ? (
                      <select
                        value={row.linkedEmployeeId || ''}
                        onChange={(e) => {
                          updateRow(row.id, 'linkedEmployeeId', e.target.value || null)
                          setLinkingRowId(null)
                        }}
                        onBlur={() => setLinkingRowId(null)}
                        autoFocus
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      >
                        <option value="">Select employee...</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName} {emp.scannerExternalId ? `(${emp.scannerExternalId})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center justify-between">
                        {row.linkedEmployee ? (
                          <div className="flex items-center">
                            <User className="w-4 h-4 mr-1" />
                            {row.linkedEmployee.fullName}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not linked</span>
                        )}
                        {importData.status !== 'FINALIZED' && (
                          <button
                            onClick={() => setLinkingRowId(row.id)}
                            className="ml-2 text-xs text-primary-600 hover:text-primary-900"
                          >
                            {row.linkedEmployee ? 'Change' : 'Link'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {rows.length > rowsPerPage && (
        <div className="mt-4 flex items-center justify-between bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {Math.ceil(rows.length / rowsPerPage)}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(Math.ceil(rows.length / rowsPerPage), currentPage + 1))}
              disabled={currentPage >= Math.ceil(rows.length / rowsPerPage)}
              className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center mt-6">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No rows found</h3>
          <p className="text-gray-600">This import has no rows to display.</p>
        </div>
      )}
    </div>
  )
}
