'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

interface Client {
  id: string
  name: string
}

interface FormRow {
  id?: string
  date: Date | null
  startTime: string
  endTime: string
  antecedent: string
  consequences: string
  notes: string
}

interface ParentABCDataFormProps {
  clients: Client[]
  formData?: {
    id: string
    clientId: string
    month: number
    year: number
    behaviorText?: string | null
    rows: Array<{
      id: string
      date: string
      startTime: string
      endTime: string
      antecedent: string
      consequences: string
      notes: string | null
    }>
  }
  readOnly?: boolean
}

const ANTECEDENT_OPTIONS = [
  'Task',
  'Told No',
  'Diverted',
  'Attention Removed',
  'Transition',
  'Demand Placed',
  'Peer Interaction',
]

const CONSEQUENCES_OPTIONS = [
  'Ignored',
  'Redirected to Activity',
  'Reprimand',
  'Change Activity',
  'Moved Away',
  'Given a Break',
]

function formatTime12(time24: string): string {
  if (!time24) return ''
  const [hStr, mStr] = time24.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr || '0', 10)
  if (isNaN(h) || isNaN(m)) return time24
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = ((h + 11) % 12) + 1
  return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`
}

export function ParentABCDataForm({ clients, formData, readOnly }: ParentABCDataFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState(formData?.clientId || '')
  const [month, setMonth] = useState<number>(formData?.month || new Date().getMonth() + 1)
  const [behaviorText, setBehaviorText] = useState(formData?.behaviorText || '')
  const [rows, setRows] = useState<FormRow[]>(() => {
    if (formData?.rows) {
      return formData.rows.map(row => ({
        id: row.id,
        date: new Date(row.date),
        startTime: row.startTime,
        endTime: row.endTime,
        antecedent: row.antecedent,
        consequences: row.consequences,
        notes: row.notes || '',
      }))
    }
    return []
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const addRow = () => {
    if (readOnly) return
    const newRow: FormRow = {
      date: null,
      startTime: '',
      endTime: '',
      antecedent: '',
      consequences: '',
      notes: '',
    }
    setRows([...rows, newRow])
    setHasUnsavedChanges(true)
  }

  const removeRow = (index: number) => {
    if (readOnly) return
    setRows(rows.filter((_, i) => i !== index))
    setHasUnsavedChanges(true)
  }

  const updateRow = (index: number, field: keyof FormRow, value: any) => {
    if (readOnly) return
    const updated = [...rows]
    updated[index] = { ...updated[index], [field]: value }
    setRows(updated)
    setHasUnsavedChanges(true)
  }

  const validateTime = (startTime: string, endTime: string): boolean => {
    if (!startTime || !endTime) return false
    const [startH, startM] = startTime.split(':').map(Number)
    const [endH, endM] = endTime.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM
    return endMinutes > startMinutes
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return

    if (!clientId) {
      toast.error('Please select a client')
      return
    }

    if (month < 1 || month > 12) {
      toast.error('Please select a valid month')
      return
    }

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.date) {
        toast.error(`Row ${i + 1}: Date is required`)
        return
      }
      if (!row.startTime) {
        toast.error(`Row ${i + 1}: Start Time is required`)
        return
      }
      if (!row.endTime) {
        toast.error(`Row ${i + 1}: End Time is required`)
        return
      }
      if (!validateTime(row.startTime, row.endTime)) {
        toast.error(`Row ${i + 1}: End Time must be after Start Time`)
        return
      }
      if (!row.antecedent) {
        toast.error(`Row ${i + 1}: Antecedent is required`)
        return
      }
      if (!row.consequences) {
        toast.error(`Row ${i + 1}: Consequences is required`)
        return
      }
    }

    if (rows.length === 0) {
      toast.error('Please add at least one row')
      return
    }

    setLoading(true)

    try {
      const year = new Date().getFullYear()
      const url = formData ? `/api/bcbas/forms/parent-abc-data/${formData.id}` : '/api/bcbas/forms/parent-abc-data'
      const method = formData ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          month,
          year,
          behaviorText,
          rows: rows.map(row => ({
            id: row.id,
            date: row.date?.toISOString(),
            startTime: row.startTime,
            endTime: row.endTime,
            antecedent: row.antecedent,
            // Stored in DB row model; for UI it's a top-level text field.
            behavior: behaviorText,
            consequences: row.consequences,
            notes: row.notes || null,
          })),
        }),
      })

      if (res.ok) {
        toast.success('Form saved successfully')
        setHasUnsavedChanges(false)
        router.push('/bcbas/forms')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save form')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  return (
    <div className="max-w-7xl mx-auto">
      {/* Print-only layout: plain text, no app chrome, no lines. Keep rows from splitting across pages. */}
      <div className="hidden print:block text-black">
        <div className="text-xl font-semibold mb-2">Parent ABC Data Sheet</div>
        <div className="text-sm mb-1">
          Client: {clients.find((c) => c.id === clientId)?.name || ''}
        </div>
        <div className="text-sm mb-1">
          Month: {monthNames[month - 1] || month}
        </div>
        <div className="text-sm mb-4">
          Behavior: {behaviorText || ''}
        </div>

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="text-sm"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <div>Date: {row.date ? row.date.toLocaleDateString() : ''}</div>
              <div>Start Time: {formatTime12(row.startTime)}</div>
              <div>End Time: {formatTime12(row.endTime)}</div>
              <div>Antecedent: {row.antecedent}</div>
              <div>Consequence: {row.consequences}</div>
              {row.notes ? <div>Notes: {row.notes}</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <Link
          href="/bcbas/forms"
          className="inline-flex items-center text-sm text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Forms
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          Parent ABC Data Sheet
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 print:hidden">
        {/* Top-level fields */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Form Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Name <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value)
                  setHasUnsavedChanges(true)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={!!readOnly}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Month <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={month}
                onChange={(e) => {
                  setMonth(parseInt(e.target.value))
                  setHasUnsavedChanges(true)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={!!readOnly}
              >
                {monthNames.map((name, index) => (
                  <option key={index + 1} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Behavior
              </label>
              <input
                type="text"
                value={behaviorText}
                onChange={(e) => {
                  setBehaviorText(e.target.value)
                  setHasUnsavedChanges(true)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px]"
                disabled={!!readOnly}
              />
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">ABC Data Entries</h2>
            <button
              type="button"
              onClick={addRow}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2 min-h-[44px]"
              disabled={!!readOnly}
            >
              <Plus className="w-4 h-4" />
              <span>Add Row</span>
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Click "Add Row" to add entries
            </div>
          ) : (
            <div className="space-y-6">
              {rows.map((row, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-gray-700">Entry {index + 1}</h3>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-red-600 hover:text-red-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      disabled={!!readOnly}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        selected={row.date}
                        onChange={(date: Date | null) => updateRow(index, 'date', date)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                        disabled={!!readOnly}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => updateRow(index, 'startTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px]"
                        required
                        disabled={!!readOnly}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => updateRow(index, 'endTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px]"
                        required
                        disabled={!!readOnly}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Antecedent <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={row.antecedent}
                        onChange={(e) => updateRow(index, 'antecedent', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px]"
                        required
                        disabled={!!readOnly}
                      >
                        <option value="">Select</option>
                        {ANTECEDENT_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Consequences <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={row.consequences}
                        onChange={(e) => updateRow(index, 'consequences', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px]"
                        required
                        disabled={!!readOnly}
                      >
                        <option value="">Select</option>
                        {CONSEQUENCES_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={row.notes}
                      onChange={(e) => updateRow(index, 'notes', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      rows={2}
                      disabled={!!readOnly}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end space-x-3">
          <Link
            href="/bcbas/forms"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 min-h-[44px] flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center"
          >
            {readOnly ? 'View Only' : (loading ? 'Saving...' : 'Save Form')}
          </button>
        </div>
      </form>
    </div>
  )
}
