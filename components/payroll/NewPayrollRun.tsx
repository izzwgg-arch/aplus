'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, FileSpreadsheet, AlertCircle, User, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'

interface PayrollImport {
  id: string
  originalFileName: string
  status: 'DRAFT' | 'FINALIZED'
  periodStart: string | null
  periodEnd: string | null
}

interface ImportEmployee {
  id: string
  fullName: string
  linkedEmployeeId: string | null
}

export function NewPayrollRun() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [imports, setImports] = useState<PayrollImport[]>([])
  const [loadingImports, setLoadingImports] = useState(true)
  const [selectedImportId, setSelectedImportId] = useState<string>('')
  const [availableEmployees, setAvailableEmployees] = useState<ImportEmployee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set())

  // Form state
  const [name, setName] = useState('')

  useEffect(() => {
    fetchImports()
  }, [])

  useEffect(() => {
    if (selectedImportId) {
      fetchEmployeesForImport(selectedImportId)
    } else {
      setAvailableEmployees([])
      setSelectedEmployeeIds(new Set())
    }
  }, [selectedImportId])

  const fetchImports = async () => {
    try {
      const response = await fetch('/api/payroll/imports')
      if (response.ok) {
        const data = await response.json()
        // Show all imports (not just finalized)
        setImports(data.imports || [])
      }
    } catch (error) {
      console.error('Failed to fetch imports:', error)
      toast.error('Failed to load imports')
    } finally {
      setLoadingImports(false)
    }
  }

  const fetchEmployeesForImport = async (importId: string) => {
    setLoadingEmployees(true)
    try {
      const response = await fetch(`/api/payroll/imports/${importId}`)
      if (response.ok) {
        const data = await response.json()
        const importData = data.import
        
        console.log('[PAYROLL RUN] Import data:', {
          importId,
          totalRows: importData.rows?.length || 0,
          firstRow: importData.rows?.[0],
        })
        
        // Get unique employees from linked rows
        const employeeMap = new Map<string, ImportEmployee>()
        let linkedCount = 0
        let unlinkedCount = 0
        
        if (importData.rows && Array.isArray(importData.rows)) {
          importData.rows.forEach((row: any) => {
            if (row.linkedEmployeeId && row.linkedEmployee) {
              linkedCount++
              const empId = row.linkedEmployeeId
              if (!employeeMap.has(empId)) {
                employeeMap.set(empId, {
                  id: empId,
                  fullName: row.linkedEmployee.fullName,
                  linkedEmployeeId: empId,
                })
              }
            } else {
              unlinkedCount++
            }
          })
        }
        
        console.log('[PAYROLL RUN] Employee extraction:', {
          totalRows: importData.rows?.length || 0,
          linkedRows: linkedCount,
          unlinkedRows: unlinkedCount,
          uniqueEmployees: employeeMap.size,
        })
        
        const employees = Array.from(employeeMap.values())
        setAvailableEmployees(employees)
        
        // Auto-select all employees by default
        setSelectedEmployeeIds(new Set(employees.map(e => e.id)))
        
        if (employees.length === 0) {
          if (importData.rows && importData.rows.length > 0) {
            toast.error(`No employees linked. Found ${importData.rows.length} rows, but none are linked to employees. Please link employees in the import edit page.`, { duration: 6000 })
          } else {
            toast.error('No rows found in this import.', { duration: 4000 })
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch import data')
      }
    } catch (error: any) {
      console.error('Failed to fetch employees:', error)
      toast.error(error.message || 'Failed to load employees from import')
      setAvailableEmployees([])
    } finally {
      setLoadingEmployees(false)
    }
  }

  const handleToggleEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedEmployeeIds)
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId)
    } else {
      newSelected.add(employeeId)
    }
    setSelectedEmployeeIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedEmployeeIds.size === availableEmployees.length) {
      setSelectedEmployeeIds(new Set())
    } else {
      setSelectedEmployeeIds(new Set(availableEmployees.map(e => e.id)))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Run name is required')
      return
    }

    if (!selectedImportId) {
      toast.error('Please select an import')
      return
    }

    if (selectedEmployeeIds.size === 0) {
      toast.error('Please select at least one employee')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sourceImportId: selectedImportId,
          selectedEmployeeIds: Array.from(selectedEmployeeIds),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        const error = new Error(errorData.error || 'Failed to create payroll run') as any
        error.errorData = errorData
        throw error
      }

      const data = await response.json()
      toast.success('Payroll run created successfully!')
      router.push('/payroll')
    } catch (error: any) {
      console.error('Error creating payroll run:', error)
      const errorData = error.errorData || error.response?.data || {}
      let errorMessage = errorData.error || error.message || 'Failed to create payroll run'
      
      if (errorData.details) {
        errorMessage += `\n\n${errorData.details}`
      }
      
      toast.error(errorMessage, { duration: 8000 })
    } finally {
      setLoading(false)
    }
  }

  const selectedImport = imports.find(imp => imp.id === selectedImportId)

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/payroll/runs"
          className="flex items-center text-white hover:text-gray-100 mb-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Payroll Runs
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create Payroll Run</h1>
        <p className="mt-2 text-sm text-gray-600">
          Select an import and employees to create a payroll run. Only imports with linked employees will show employees.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Run Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Run Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., November 2025 Payroll"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Import Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Import <span className="text-red-500">*</span>
            </label>
            {loadingImports ? (
              <p className="text-sm text-gray-500">Loading imports...</p>
            ) : imports.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-800">
                      No imports available. Please upload and process an import first.
                    </p>
                    <Link
                      href="/payroll/imports"
                      className="text-sm text-yellow-900 underline mt-1 inline-block"
                    >
                      Go to Imports
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <select
                value={selectedImportId}
                onChange={(e) => setSelectedImportId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                  <option value="">Select an import...</option>
                  {imports.map((imp) => (
                    <option key={imp.id} value={imp.id}>
                      {imp.originalFileName}
                      {imp.status === 'DRAFT' && ' (DRAFT)'}
                      {imp.status === 'FINALIZED' && ' (FINALIZED)'}
                      {imp.periodStart && imp.periodEnd && (
                        ` - ${new Date(imp.periodStart).toLocaleDateString()} to ${new Date(imp.periodEnd).toLocaleDateString()}`
                      )}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* Employee Selection */}
          {selectedImportId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Select Employees <span className="text-red-500">*</span>
                </label>
                {availableEmployees.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sm text-primary-600 hover:text-primary-900 flex items-center"
                  >
                    {selectedEmployeeIds.size === availableEmployees.length ? (
                      <>
                        <CheckSquare className="w-4 h-4 mr-1" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4 mr-1" />
                        Select All
                      </>
                    )}
                  </button>
                )}
              </div>
              
              {loadingEmployees ? (
                <p className="text-sm text-gray-500">Loading employees...</p>
              ) : availableEmployees.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm text-yellow-800">
                        No employees found in this import. Please link employees to import rows first.
                      </p>
                      <Link
                        href={`/payroll/imports/${selectedImportId}`}
                        className="text-sm text-yellow-900 underline mt-1 inline-block"
                      >
                        Go to Import Details
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-300 rounded-md max-h-64 overflow-y-auto">
                  <div className="divide-y divide-gray-200">
                    {availableEmployees.map((employee) => (
                      <label
                        key={employee.id}
                        className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployeeIds.has(employee.id)}
                          onChange={() => handleToggleEmployee(employee.id)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <User className="w-4 h-4 text-gray-400 ml-3 mr-2" />
                        <span className="text-sm text-gray-900">{employee.fullName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {availableEmployees.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {selectedEmployeeIds.size} of {availableEmployees.length} employees selected
                </p>
              )}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> The system will automatically aggregate time logs for selected employees,
              calculate totals (hours/minutes), and compute gross pay based on each employee's
              default hourly rate. You can override hourly rates per employee after creation.
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4 pt-4 border-t">
            <Link
              href="/payroll/runs"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !selectedImportId || selectedEmployeeIds.size === 0 || imports.length === 0}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Creating...' : 'Create Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
