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

interface Provider {
  id: string
  name: string
}

interface FormRow {
  id?: string
  date: Date | null
  parentSignature: string | null
  signatureRef?: React.RefObject<SignatureCanvas>
}

interface VisitAttestationFormProps {
  clients: Client[]
  providers: Provider[]
  formData?: {
    id: string
    clientId: string
    month: number
    year: number
    providerId?: string | null
    rows: Array<{
      id: string
      date: string
      providerId: string
      parentSignature: string | null
    }>
  }
  readOnly?: boolean
}

export function VisitAttestationForm({ clients, providers, formData, readOnly }: VisitAttestationFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState(formData?.clientId || '')
  const [month, setMonth] = useState<number>(formData?.month || new Date().getMonth() + 1)
  const [providerId, setProviderId] = useState<string>(formData?.providerId || formData?.rows?.[0]?.providerId || '')
  const [rows, setRows] = useState<FormRow[]>(() => {
    if (formData?.rows) {
      return formData.rows.map(row => ({
        id: row.id,
        date: new Date(row.date),
        parentSignature: row.parentSignature,
      }))
    }
    return []
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const signatureRefs = useRef<Map<number, React.RefObject<SignatureCanvas>>>(new Map())

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
    if (readOnly) return
    const newRow: FormRow = {
      date: null,
      parentSignature: null,
    }
    setRows([...rows, newRow])
    setHasUnsavedChanges(true)
  }

  const removeRow = (index: number) => {
    if (readOnly) return
    signatureRefs.current.delete(index)
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

  const handleSaveSignature = (index: number, signatureRef: React.RefObject<SignatureCanvas>) => {
    if (signatureRef.current) {
      const dataURL = signatureRef.current.toDataURL()
      updateRow(index, 'parentSignature', dataURL)
      toast.success('Signature saved')
    }
  }

  const handleClearSignature = (index: number, signatureRef: React.RefObject<SignatureCanvas>) => {
    if (signatureRef.current) {
      signatureRef.current.clear()
      updateRow(index, 'parentSignature', null)
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
        updateRow(index, 'parentSignature', result)
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

    if (!providerId) {
      toast.error('Please select a provider')
      return
    }

    // Auto-capture drawn signatures if present
    const payloadRows = rows.map((row, index) => {
      let sig = row.parentSignature
      const ref = getSignatureRef(index)
      if (!sig && ref.current && !ref.current.isEmpty()) {
        sig = ref.current.toDataURL()
      }
      return {
        id: row.id,
        date: row.date,
        parentSignature: sig,
      }
    })

    // Validate rows
    for (let i = 0; i < payloadRows.length; i++) {
      const row = payloadRows[i]
      if (!row.date) {
        toast.error(`Row ${i + 1}: Date is required`)
        return
      }
      if (!row.parentSignature) {
        toast.error(`Row ${i + 1}: Parent Signature is required`)
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
      const url = formData ? `/api/bcbas/forms/visit-attestation/${formData.id}` : '/api/bcbas/forms/visit-attestation'
      const method = formData ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          month,
          year,
          providerId,
          rows: payloadRows.map(row => ({
            id: row.id,
            date: row.date?.toISOString(),
            providerId,
            parentSignature: row.parentSignature,
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
        <div className="text-xl font-semibold mb-2">Visit Attestation Form</div>
        <div className="text-sm mb-1">
          Client: {clients.find((c) => c.id === clientId)?.name || ''}
        </div>
        <div className="text-sm mb-1">
          Month: {monthNames[month - 1] || month}
        </div>
        <div className="text-sm mb-4">
          Provider: {providers.find((p) => p.id === providerId)?.name || ''}
        </div>
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="text-sm"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <div>Date: {row.date ? row.date.toLocaleDateString() : ''}</div>
              {row.parentSignature ? (
                <div>
                  Parent Signature:
                  <div>
                    <img src={row.parentSignature} alt="Signature" style={{ height: 60 }} />
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
          Visit Attestation Form
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
                Provider <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value)
                  setHasUnsavedChanges(true)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                disabled={!!readOnly}
              >
                <option value="">Select provider</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Visit Entries</h2>
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
              {rows.map((row, index) => {
                const signatureRef = getSignatureRef(index)
                return (
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Parent Signature <span className="text-red-500">*</span>
                      </label>
                      {row.parentSignature ? (
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                          <img src={row.parentSignature} alt="Signature" className="max-h-32 border border-gray-200 rounded mb-2" />
                          <button
                            type="button"
                            onClick={() => updateRow(index, 'parentSignature', null)}
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
