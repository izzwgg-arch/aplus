'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

interface PreviewRow {
  rowIndex: number
  raw: Record<string, any>
  issues: string[]
}

export function NewImport() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [fileBuffer, setFileBuffer] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [columns, setColumns] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [totalRows, setTotalRows] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Mapping state
  const [mapping, setMapping] = useState({
    workDate: '',
    employeeName: '',
    employeeExternalId: '',
    eventType: '', // For event-based files (Clock-in/Clock-out)
    inTime: '',
    outTime: '',
    minutesWorked: '',
    hoursWorked: '',
  })

  // Period state
  const [periodStart, setPeriodStart] = useState<string>('')
  const [periodEnd, setPeriodEnd] = useState<string>('')

  // Auto-detect column mappings based on common patterns
  const autoDetectColumns = (columns: string[]): typeof mapping => {
    const detected: typeof mapping = {
      workDate: '',
      employeeName: '',
      employeeExternalId: '',
      eventType: '',
      inTime: '',
      outTime: '',
      minutesWorked: '',
      hoursWorked: '',
    }

    // Normalize column names for matching (case-insensitive, trim whitespace)
    const normalizedColumns = columns.map(col => ({
      original: col,
      normalized: col.trim().toLowerCase(),
    }))

    // Work Date patterns
    const datePatterns = ['date', 'work date', 'workdate', 'day', 'workday', 'd']
    for (const pattern of datePatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.workDate = match.original
        break
      }
    }

    // Employee Name patterns
    const namePatterns = ['name', 'employee name', 'employeename', 'employee', 'emp name', 'full name', 'fullname']
    for (const pattern of namePatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.employeeName = match.original
        break
      }
    }

    // Employee External ID / Scanner ID patterns
    const idPatterns = ['user id', 'userid', 'user_id', 'scanner id', 'scannerid', 'employee id', 'employeeid', 'emp id', 'empid', 'external id', 'externalid', 'id']
    for (const pattern of idPatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.employeeExternalId = match.original
        break
      }
    }

    // In Time patterns
    const inTimePatterns = ['time', 'in time', 'intime', 'in_time', 'clock in', 'clockin', 'punch in', 'punchin', 'start time', 'starttime']
    for (const pattern of inTimePatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.inTime = match.original
        break
      }
    }

    // Out Time patterns
    const outTimePatterns = ['att type', 'atttype', 'out time', 'outtime', 'out_time', 'clock out', 'clockout', 'punch out', 'punchout', 'end time', 'endtime']
    for (const pattern of outTimePatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.outTime = match.original
        break
      }
    }

    // Event Type patterns (for event-based files)
    const eventTypePatterns = ['event type', 'eventtype', 'event', 'type', 'att type', 'atttype', 'action']
    for (const pattern of eventTypePatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.eventType = match.original
        break
      }
    }

    // Minutes Worked patterns
    const minutesPatterns = ['minutes', 'minutes worked', 'minutesworked', 'mins', 'total minutes', 'totalminutes']
    for (const pattern of minutesPatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.minutesWorked = match.original
        break
      }
    }

    // Hours Worked patterns
    const hoursPatterns = ['hours', 'hours worked', 'hoursworked', 'hrs', 'total hours', 'totalhours']
    for (const pattern of hoursPatterns) {
      const match = normalizedColumns.find(c => c.normalized === pattern || c.normalized.includes(pattern))
      if (match) {
        detected.hoursWorked = match.original
        break
      }
    }

    return detected
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    const fileName = selectedFile.name.toLowerCase()
    const isValid = fileName.endsWith('.csv') || fileName.endsWith('.xls') || fileName.endsWith('.xlsx')
    
    if (!isValid) {
      toast.error('Please select a valid file (.csv, .xls, or .xlsx)')
      return
    }

    setFile(selectedFile)
    setFileName(selectedFile.name)
    setLoading(true)

    try {
      // Convert file to base64 for storage
      const arrayBuffer = await selectedFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const base64 = buffer.toString('base64')

      // Determine file type
      const fileType = fileName.endsWith('.csv') ? 'csv' : 'excel'

      // Create FormData and upload to preview endpoint
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/payroll/import/preview', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to preview file')
      }

      const data = await response.json()
      setColumns(data.columns)
      setPreviewRows(data.previewRows)
      setTotalRows(data.totalRows)
      setFileBuffer(JSON.stringify({ type: fileType, buffer: base64 }))
      
      // Auto-detect column mappings based on common patterns
      const autoMapping = autoDetectColumns(data.columns)
      setMapping(autoMapping)
      
      setStep('mapping')
    } catch (error: any) {
      console.error('Error previewing file:', error)
      toast.error(error.message || 'Failed to preview file')
    } finally {
      setLoading(false)
    }
  }

  const handleMappingNext = () => {
    // Validate required mappings
    if (!mapping.workDate) {
      toast.error('Work Date mapping is required')
      return
    }

    if (!mapping.employeeName && !mapping.employeeExternalId) {
      toast.error('Either Employee Name or Employee External ID mapping is required')
      return
    }

    const hasTimeMapping = 
      mapping.minutesWorked ||
      mapping.hoursWorked ||
      (mapping.inTime && mapping.outTime) ||
      mapping.eventType || // Event-based files
      (mapping.inTime && mapping.outTime && mapping.inTime === mapping.outTime) // Fingerprint scanner files (same column)

    if (!hasTimeMapping) {
      toast.error('At least one time field must be mapped')
      return
    }

    // FINGERPRINT SCANNER: Allow IN and OUT to be mapped to the same column (will pair sequentially)
    // No validation error needed - backend will handle fingerprint scanner files

    setStep('preview')
  }

  const handleSave = async () => {
    if (!fileBuffer || !file) {
      toast.error('File data is missing')
      return
    }

    setSaving(true)

    try {
      const fileData = JSON.parse(fileBuffer)

      const response = await fetch('/api/payroll/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileData,
          mapping,
          fileName,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save import')
      }

      const data = await response.json()
      toast.success(`Import saved successfully! ${data.rowCount} rows imported.`)
      // Redirect to the Edit Import page for the newly created import
      router.push(`/payroll/imports/${data.importId}`)
    } catch (error: any) {
      console.error('Error saving import:', error)
      toast.error(error.message || 'Failed to save import')
    } finally {
      setSaving(false)
    }
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
          <h1 className="text-3xl font-bold text-gray-900">New Import</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload and map Excel/CSV time log files from your fingerprint scanner
          </p>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 1: Upload File</h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              Click to upload or drag and drop
            </p>
            <p className="text-sm text-gray-500 mb-4">
              CSV, XLS, or XLSX files only
            </p>
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Select File'}
            </button>
            
            {file && (
              <div className="mt-4 text-sm text-green-600 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                {file.name}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 2: Map Columns</h2>
          <p className="text-sm text-gray-600 mb-6">
            Map your file columns to the required fields
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Work Date <span className="text-red-500">*</span>
              </label>
              <select
                value={mapping.workDate}
                onChange={(e) => setMapping({ ...mapping, workDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select column...</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee Name
              </label>
              <select
                value={mapping.employeeName}
                onChange={(e) => setMapping({ ...mapping, employeeName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select column...</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Employee External ID (Scanner ID)
              </label>
              <select
                value={mapping.employeeExternalId}
                onChange={(e) => setMapping({ ...mapping, employeeExternalId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select column...</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Time Fields (at least one required):
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    In Time
                  </label>
                  <select
                    value={mapping.inTime}
                    onChange={(e) => setMapping({ ...mapping, inTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select column...</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Out Time
                  </label>
                  <select
                    value={mapping.outTime}
                    onChange={(e) => setMapping({ ...mapping, outTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select column...</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minutes Worked
                  </label>
                  <select
                    value={mapping.minutesWorked}
                    onChange={(e) => setMapping({ ...mapping, minutesWorked: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select column...</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hours Worked
                  </label>
                  <select
                    value={mapping.hoursWorked}
                    onChange={(e) => setMapping({ ...mapping, hoursWorked: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select column...</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleMappingNext}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Next: Preview
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 3: Preview & Save</h2>
          <p className="text-sm text-gray-600 mb-6">
            Preview showing first {previewRows.length} rows. <strong>All {totalRows} rows will be imported.</strong>
          </p>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Period Start (optional)
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Period End (optional)
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="mb-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Row</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Work Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Employee</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">In Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Out Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Hours</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewRows.map((previewRow) => {
                  const workDate = previewRow.raw[mapping.workDate]
                  const employee = previewRow.raw[mapping.employeeName] || previewRow.raw[mapping.employeeExternalId]
                  const inTime = previewRow.raw[mapping.inTime]
                  const outTime = previewRow.raw[mapping.outTime]
                  const hours = previewRow.raw[mapping.hoursWorked] || (previewRow.raw[mapping.minutesWorked] ? (previewRow.raw[mapping.minutesWorked] / 60).toFixed(2) : '')

                  return (
                    <tr key={previewRow.rowIndex}>
                      <td className="px-3 py-2 text-sm text-gray-900">{previewRow.rowIndex}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{workDate || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{employee || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{inTime || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{outTime || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{hours || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Import'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
