'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import SignatureCanvas from 'react-signature-canvas'

interface Client {
  id: string
  name: string
}

interface FormRow {
  id?: string
  serviceDate: Date | null
  signature: string | null
  signatureRef?: React.RefObject<SignatureCanvas>
}

interface ParentTrainingSignInFormProps {
  clients: Client[]
  formData?: {
    id: string
    clientId: string
    month: number
    year: number
    rows: Array<{
      id: string
      serviceDate: string
      parentName: string
      signature: string | null
    }>
  }
  readOnly?: boolean
}

export function ParentTrainingSignInForm({ clients, formData, readOnly }: ParentTrainingSignInFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState(formData?.clientId || '')
  const [month, setMonth] = useState<number>(formData?.month || new Date().getMonth() + 1)
  const [rows, setRows] = useState<FormRow[]>(() => {
    if (formData?.rows) {
      return formData.rows.map(row => ({
        id: row.id,
        serviceDate: new Date(row.serviceDate),
        signature: row.signature,
      }))
    }
    return []
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const signatureRefs = useRef<Map<number, React.RefObject<SignatureCanvas>>>(new Map())

  // Prevent navigation with unsaved changes
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

  const getSignatureRef = (index: number): React.RefObject<SignatureCanvas> => {
    if (!signatureRefs.current.has(index)) {
      signatureRefs.current.set(index, { current: null } as React.RefObject<SignatureCanvas>)
    }
    return signatureRefs.current.get(index)!
  }

  const addRow = () => {
    const newRow: FormRow = {
      serviceDate: null,
      signature: null,
    }
    setRows([...rows, newRow])
    setHasUnsavedChanges(true)
  }

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index))
    setHasUnsavedChanges(true)
  }

  const updateRow = (index: number, field: keyof FormRow, value: any) => {
    const updated = [...rows]
    updated[index] = { ...updated[index], [field]: value }
    setRows(updated)
    setHasUnsavedChanges(true)
  }

  const handleSaveSignature = (index: number, signatureRef: React.RefObject<SignatureCanvas>) => {
    if (signatureRef.current) {
      const dataURL = signatureRef.current.toDataURL()
      updateRow(index, 'signature', dataURL)
      toast.success('Signature saved')
    }
  }

  const handleClearSignature = (index: number, signatureRef: React.RefObject<SignatureCanvas>) => {
    if (signatureRef.current) {
      signatureRef.current.clear()
      updateRow(index, 'signature', null)
    }
  }

  const handleFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        updateRow(index, 'signature', result)
        toast.success('Image uploaded successfully')
      }
      reader.readAsDataURL(file)
    }
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

    // Build payload rows (auto-capture drawn signatures if present)
    const payloadRows = rows.map((row, index) => {
      let signature = row.signature
      const ref = getSignatureRef(index)
      if (!signature && ref.current && !ref.current.isEmpty()) {
        signature = ref.current.toDataURL()
      }
      return {
        id: row.id,
        serviceDate: row.serviceDate,
        signature,
      }
    })

    // Validate rows (must be savable with ONE row)
    for (let i = 0; i < payloadRows.length; i++) {
      const row = payloadRows[i]
      if (!row.serviceDate) {
        toast.error(`Row ${i + 1}: Service Date is required`)
        return
      }
      if (!row.signature) {
        toast.error(`Row ${i + 1}: Signature is required`)
        return
      }
    }

    if (payloadRows.length === 0) {
      toast.error('Please add at least one row')
      return
    }

    setLoading(true)

    try {
      const year = new Date().getFullYear()
      const url = formData ? `/api/bcbas/forms/parent-training-sign-in/${formData.id}` : '/api/bcbas/forms/parent-training-sign-in'
      const method = formData ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          month,
          year,
          rows: payloadRows.map(row => ({
            id: row.id,
            serviceDate: row.serviceDate?.toISOString(),
            signature: row.signature,
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

  const selectedClientName =
    clients.find((c) => c.id === clientId)?.name || (formData ? '' : '')

  return (
    <div className="max-w-7xl mx-auto">
      {/* Print-only layout: plain text, no app chrome, no lines */}
      <div className="hidden print:block text-black">
        <div className="text-xl font-semibold mb-2">Parent Training Sign-In Sheet</div>
        <div className="text-sm mb-1">
          Client: {selectedClientName}
        </div>
        <div className="text-sm mb-4">
          Month: {monthNames[month - 1] || month}
        </div>
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={idx} className="text-sm">
              <div>Date: {row.serviceDate ? row.serviceDate.toLocaleDateString() : ''}</div>
              {row.signature ? (
                <div>
                  Signature:
                  <div>
                    <img src={row.signature} alt="Signature" style={{ height: 60 }} />
                  </div>
                </div>
              ) : null}
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
          Parent Training Sign-In Sheet
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 print:hidden">
        {/* Top-level fields */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Form Information</h2>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
        </div>

        {/* Rows */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Sign-In Entries</h2>
            <button
              type="button"
              onClick={addRow}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
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
              {rows.map((row, index) => {
                const signatureRef = getSignatureRef(index)
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-medium text-gray-700">Entry {index + 1}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          signatureRefs.current.delete(index)
                          removeRow(index)
                        }}
                        className="text-red-600 hover:text-red-800"
                        disabled={!!readOnly}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Service Date <span className="text-red-500">*</span>
                        </label>
                        <DatePicker
                          selected={row.serviceDate}
                          onChange={(date: Date | null) => updateRow(index, 'serviceDate', date)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                          disabled={!!readOnly}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Parent / Guardian Signature <span className="text-red-500">*</span>
                      </label>
                      {row.signature ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                          <img src={row.signature} alt="Signature" className="max-h-32 border border-gray-200 rounded mb-2" />
                          <button
                            type="button"
                            onClick={() => updateRow(index, 'signature', null)}
                            className="text-sm text-red-600 hover:text-red-800"
                            disabled={!!readOnly}
                          >
                            Remove signature
                          </button>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                          <SignatureCanvas
                            ref={signatureRef}
                            canvasProps={{
                              className: 'border border-gray-300 rounded bg-white w-full',
                              style: { width: '100%', height: '200px', touchAction: 'none' },
                            }}
                            backgroundColor="white"
                          />
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => handleSaveSignature(index, signatureRef)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2 min-h-[44px]"
                              disabled={!!readOnly}
                            >
                              <Save className="w-4 h-4" />
                              <span>Save Signature</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearSignature(index, signatureRef)}
                              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center space-x-2 min-h-[44px]"
                              disabled={!!readOnly}
                            >
                              <X className="w-4 h-4" />
                              <span>Clear</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.accept = 'image/*'
                                input.onchange = (e) => handleFileUpload(index, e as any)
                                input.click()
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2 min-h-[44px]"
                              disabled={!!readOnly}
                            >
                              <Upload className="w-4 h-4" />
                              <span>Upload JPG</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end space-x-3">
          <Link
            href="/bcbas/forms"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {readOnly ? 'View Only' : (loading ? 'Saving...' : 'Save Form')}
          </button>
        </div>
      </form>
    </div>
  )
}
