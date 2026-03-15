'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Save, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { SignatureCapture } from './SignatureCapture'
import { format } from 'date-fns'

interface Client {
  id: string
  name: string
}

interface ParentTrainingFormProps {
  clients: Client[]
}

interface FormRow {
  id: string
  serviceDate: Date | null
  signature: string | null
}

export function ParentTrainingForm({ clients }: ParentTrainingFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = (searchParams.get('mode') || 'edit').toLowerCase()
  const forceReadOnly = mode === 'view' || mode === 'print'
  const [clientId, setClientId] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<FormRow[]>([{ id: '1', serviceDate: null, signature: null }])
  const [loading, setLoading] = useState(false)
  const [clientSignature, setClientSignature] = useState<string | null>(null)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [canEdit, setCanEdit] = useState(true) // Default to true, will be updated by permission check

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const res = await fetch('/api/user/permissions')
        if (res.ok) {
          const data = await res.json()
          const hasEdit = data.permissions?.some((p: any) => p.name === 'FORMS_EDIT') ||
                         data.role === 'ADMIN' || data.role === 'SUPER_ADMIN'
          setCanEdit(hasEdit)
        } else {
          // If API fails, default to true for ADMIN/SUPER_ADMIN
          setCanEdit(true)
        }
      } catch (error) {
        console.error('Error checking permissions:', error)
        // Default to true on error for ADMIN users
        setCanEdit(true)
      }
    }
    checkPermissions()
  }, [])

  // Allow linking from the Saved Forms list (preselect client/month/year)
  useEffect(() => {
    const qpClientId = searchParams.get('clientId')
    const qpMonth = searchParams.get('month')
    if (qpClientId) setClientId(qpClientId)
    if (qpMonth) {
      const m = parseInt(qpMonth, 10)
      if (!isNaN(m) && m >= 1 && m <= 12) setMonth(m)
    }
  }, [searchParams])

  // Auto-open print dialog when opening in print mode
  useEffect(() => {
    if (mode === 'print') {
      setTimeout(() => window.print(), 250)
    }
  }, [mode])

  useEffect(() => {
    if (clientId && month) {
      loadForm()
    } else {
      setRows([{ id: '1', serviceDate: null, signature: null }])
    }
  }, [clientId, month])

  useEffect(() => {
    let isActive = true

    const fetchClientSignature = async () => {
      if (!clientId) {
        setClientSignature(null)
        setSignatureLoading(false)
        setRows((prev) => prev.map((row) => ({ ...row, signature: null })))
        return
      }

      setSignatureLoading(true)
      try {
        const res = await fetch(`/api/clients/${clientId}`)
        if (!res.ok) {
          throw new Error('Failed to fetch client')
        }
        const client = await res.json()
        if (!isActive) return
        const signature = client?.signature || null
        setClientSignature(signature)
        setRows((prev) =>
          prev.map((row) =>
            row.signature ? row : { ...row, signature }
          )
        )
      } catch (error) {
        console.error('Error fetching client signature:', error)
        if (!isActive) return
        setClientSignature(null)
      } finally {
        if (isActive) setSignatureLoading(false)
      }
    }

    fetchClientSignature()

    return () => {
      isActive = false
    }
  }, [clientId])

  const loadForm = async () => {
    try {
      const currentYear = new Date().getFullYear()
      const res = await fetch(
        `/api/forms?type=PARENT_TRAINING&clientId=${clientId}&month=${month}&year=${currentYear}`
      )
      if (res.ok) {
        const form = await res.json()
        if (form && form.payload && Array.isArray(form.payload.rows)) {
          setRows(
            form.payload.rows.map((row: any, idx: number) => ({
              id: `row-${idx}`,
              serviceDate: row.serviceDate ? new Date(row.serviceDate) : null,
              signature: row.signature || clientSignature || null,
            }))
          )
          if (form.payload.rows.length === 0) {
            setRows([
              { id: '1', serviceDate: null, signature: clientSignature || null },
            ])
          }
        } else {
          setRows([{ id: '1', serviceDate: null, signature: clientSignature || null }])
        }
      } else {
        setRows([{ id: '1', serviceDate: null, signature: clientSignature || null }])
      }
    } catch (error) {
      console.error('Error loading form:', error)
      setRows([{ id: '1', serviceDate: null, signature: clientSignature || null }])
    }
  }

  const handleAddRow = () => {
    if (!canEdit || forceReadOnly) {
      toast.error('You do not have permission to edit forms')
      return
    }
    setRows([
      ...rows,
      {
        id: Date.now().toString(),
        serviceDate: null,
        signature: clientSignature,
      },
    ])
  }

  const handleRemoveRow = (id: string) => {
    if (!canEdit || forceReadOnly) {
      toast.error('You do not have permission to edit forms')
      return
    }
    if (rows.length === 1) {
      toast.error('At least one row is required')
      return
    }
    setRows(rows.filter((r) => r.id !== id))
  }

  const handleRowChange = (id: string, field: keyof FormRow, value: any) => {
    if (!canEdit || forceReadOnly) return
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const handleSave = async () => {
    if (!canEdit || forceReadOnly) {
      toast.error('You do not have permission to edit forms')
      return
    }

    if (!clientId) {
      toast.error('Please select a client')
      return
    }

    const validRows = rows.filter((r) => r.serviceDate && r.signature)
    if (validRows.length === 0) {
      toast.error('Please add at least one row with date and signature')
      return
    }

    setLoading(true)
    try {
      const currentYear = new Date().getFullYear()
      const payload = {
        rows: validRows.map((r) => ({
          serviceDate: r.serviceDate!.toISOString(),
          signature: r.signature,
        })),
      }

      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PARENT_TRAINING',
          clientId,
          month,
          year: currentYear,
          payload,
        }),
      })

      if (res.ok) {
        toast.success('Form saved successfully')
        loadForm()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save form')
      }
    } catch (error) {
      toast.error('Failed to save form')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    if (!clientId) {
      toast.error('Please select a client')
      return
    }
    window.print()
  }

  const selectedClient = clients.find((c) => c.id === clientId)

  return (
    <>
      <style jsx global>{`
        .print-only {
          display: none;
        }
        @media print {
          @page {
            margin: 0 !important;
            size: auto;
          }
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: visible !important;
          }
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          .print-only {
            display: block !important;
            visibility: visible !important;
          }
          nav,
          header,
          footer,
          .bg-gray-900,
          .bg-gray-800,
          [class*="bg-gray"],
          [class*="shadow"],
          [style*="background"][style*="gray"],
          [style*="background-color"][style*="gray"],
          a[href],
          button,
          .no-print,
          [class*="SmartSteps"],
          [class*="Management"],
          [class*="Platform"],
          [id*="nav"],
          [id*="header"],
          [id*="footer"] {
            display: none !important;
            visibility: hidden !important;
            background: transparent !important;
          }
          main,
          .min-h-screen,
          .max-w-7xl,
          .px-4,
          .py-6,
          .sm\\:px-0,
          div[class*="bg-"],
          div[style*="background"] {
            background: white !important;
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .print-form {
            max-width: 100% !important;
            padding: 20pt !important;
            box-shadow: none !important;
            background: white !important;
            background-color: white !important;
            margin: 0 !important;
            display: block !important;
            visibility: visible !important;
            border: none !important;
          }
          .print-form h1 {
            font-size: 24pt !important;
            font-weight: bold !important;
            margin-bottom: 20pt !important;
            text-align: center !important;
            display: block !important;
            visibility: visible !important;
          }
          .print-form label,
          .print-form div {
            display: block !important;
            visibility: visible !important;
          }
          .print-form label,
          .print-form .print-only,
          .print-form div {
            border: none !important;
            border-bottom: none !important;
            border-top: none !important;
            text-decoration: none !important;
            outline: none !important;
            box-shadow: none !important;
          }
          .print-form span.print-only {
            border: none !important;
            border-bottom: none !important;
            text-decoration: none !important;
            background: transparent !important;
          }
          .print-form table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-top: 20pt !important;
            display: table !important;
            visibility: visible !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-form .print-only table {
            display: table !important;
            visibility: visible !important;
            width: 100% !important;
            margin-bottom: 20pt !important;
          }
          .print-form .print-only {
            display: block !important;
            visibility: visible !important;
          }
          .print-form table th,
          .print-form table td {
            border: none !important;
            padding: 8pt !important;
            text-align: left !important;
            display: table-cell !important;
            visibility: visible !important;
          }
          .print-form table {
            border: none !important;
          }
          .print-form table thead {
            display: table-header-group !important;
          }
          .print-form table thead tr th {
            border: none !important;
            border-bottom: 1px solid #000 !important;
            padding: 8pt !important;
            font-weight: bold !important;
          }
          .print-form table tbody tr td {
            border: none !important;
            padding: 8pt !important;
          }
          .print-form label[class*="no-print"],
          .print-form .no-print label {
            display: none !important;
            visibility: hidden !important;
          }
          .print-form tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-form table {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 20pt !important;
          }
          .print-form .space-y-4 > table {
            margin-bottom: 16pt !important;
          }
          .print-form .signature-img {
            max-width: 200pt !important;
            max-height: 60pt !important;
            object-fit: contain !important;
            display: block !important;
            visibility: visible !important;
          }
          
          /* Modern Form Styling */
          .modern-form-header {
            margin-bottom: 24pt !important;
          }
          
          .header-gradient {
            background: linear-gradient(135deg, #0066cc 0%, #004499 100%) !important;
            padding: 16pt 24pt !important;
            border-radius: 10pt !important;
            box-shadow: 0 3pt 8pt rgba(0, 102, 204, 0.3) !important;
            position: relative !important;
            overflow: hidden !important;
          }
          
          .header-gradient::before {
            content: '' !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: 3pt !important;
            background: linear-gradient(90deg, #00aaff 0%, #0066cc 50%, #004499 100%) !important;
          }
          
          .header-gradient h1 {
            color: #ffffff !important;
            font-size: 22pt !important;
            font-weight: 700 !important;
            margin: 0 !important;
            text-align: center !important;
            letter-spacing: 0.5pt !important;
            text-shadow: 0 2pt 4pt rgba(0, 0, 0, 0.2) !important;
          }
          
          .header-accent-line {
            height: 2pt !important;
            background: rgba(255, 255, 255, 0.3) !important;
            margin-top: 8pt !important;
            border-radius: 2pt !important;
          }
          
          .info-card {
            background: #f8fafc !important;
            border: 2pt solid #e2e8f0 !important;
            border-radius: 10pt !important;
            padding: 16pt !important;
            transition: all 0.3s ease !important;
          }
          
          .info-label {
            font-size: 10pt !important;
            font-weight: 600 !important;
            color: #475569 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5pt !important;
            margin-bottom: 8pt !important;
          }
          
          .info-value {
            font-size: 14pt !important;
            font-weight: 600 !important;
            color: #1e293b !important;
            padding-top: 4pt !important;
          }
          
          .modern-table-container {
            background: #ffffff !important;
            border-radius: 12pt !important;
            overflow: hidden !important;
            box-shadow: 0 2pt 8pt rgba(0, 0, 0, 0.08) !important;
            border: 1pt solid #e2e8f0 !important;
          }
          
          .modern-table {
            border-collapse: separate !important;
            border-spacing: 0 !important;
            width: 100% !important;
          }
          
          .table-header {
            background: linear-gradient(135deg, #0066cc 0%, #004499 100%) !important;
            color: #ffffff !important;
            font-size: 12pt !important;
            font-weight: 700 !important;
            padding: 14pt 16pt !important;
            text-align: left !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5pt !important;
            border: none !important;
          }
          
          .table-header:first-child {
            border-top-left-radius: 12pt !important;
          }
          
          .table-header:last-child {
            border-top-right-radius: 12pt !important;
          }
          
          .table-row-even {
            background: #ffffff !important;
          }
          
          .table-row-odd {
            background: #f8fafc !important;
          }
          
          .table-cell {
            padding: 16pt !important;
            border-bottom: 1pt solid #e2e8f0 !important;
            vertical-align: middle !important;
          }
          
          .table-row-even .table-cell,
          .table-row-odd .table-cell {
            border-bottom: 1pt solid #e2e8f0 !important;
          }
          
          .date-badge {
            display: inline-block !important;
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%) !important;
            color: #0369a1 !important;
            padding: 8pt 14pt !important;
            border-radius: 8pt !important;
            font-weight: 600 !important;
            font-size: 11pt !important;
            border: 1pt solid #7dd3fc !important;
            box-shadow: 0 2pt 4pt rgba(3, 105, 161, 0.1) !important;
          }
          
          .signature-container {
            display: inline-block !important;
            padding: 8pt !important;
            background: #ffffff !important;
            border: 2pt solid #e2e8f0 !important;
            border-radius: 8pt !important;
            box-shadow: 0 2pt 4pt rgba(0, 0, 0, 0.05) !important;
          }
          
          .signature-container .signature-img {
            max-width: 180pt !important;
            max-height: 50pt !important;
            object-fit: contain !important;
            display: block !important;
          }
          
          .empty-state {
            text-align: center !important;
            padding: 40pt !important;
            color: #94a3b8 !important;
            font-size: 12pt !important;
          }
        }
      `}</style>
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6 no-print">
          <button
            type="button"
            onClick={() => {
              // Always navigate back - direct method that always works
              window.location.href = '/forms'
            }}
            className="flex items-center text-white hover:text-gray-200 cursor-pointer bg-transparent border-none p-0"
            style={{ background: 'transparent', border: 'none', padding: 0, color: '#ffffff' }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" style={{ color: '#ffffff' }} />
            Back to Forms
          </button>
        </div>

        <div className="bg-white shadow rounded-lg p-6 print-form" style={{ boxShadow: 'none' }}>
          {/* Modern Header with Gradient */}
          <div className="modern-form-header mb-8">
            <div className="header-gradient">
              <h1 className="text-3xl font-bold mb-2 text-white">PARENT TRAINING SIGN-IN SHEET</h1>
              <div className="header-accent-line"></div>
            </div>
          </div>

          {/* Header Section */}
          <div className="mb-8">
            <div className="info-card">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="info-label">Client Name</div>
                  <div className="no-print">
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      disabled={!canEdit || forceReadOnly}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 disabled:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    >
                      <option value="">Select Client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="print-only info-value">{selectedClient ? selectedClient.name : 'N/A'}</div>
                </div>
                <div>
                  <div className="info-label">Month</div>
                  <div className="no-print">
                    <select
                      value={month}
                      onChange={(e) => setMonth(parseInt(e.target.value))}
                      disabled={!canEdit || forceReadOnly}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 disabled:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    >
                      {months.map((m, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="print-only info-value">{months[month - 1]}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Regular View - Single Table with all rows */}
          <div className="no-print mt-6">
            <table className="w-full border border-gray-300" style={{ display: 'table' }}>
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Service Date</th>
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Parent/Guardian Signature</th>
                  {canEdit && <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? (
                  rows.map((row, idx) => (
                    <tr key={row.id} className="border-b border-gray-200">
                      <td className="px-4 py-2">
                        <DatePicker
                          selected={row.serviceDate}
                          onChange={(date) => handleRowChange(row.id, 'serviceDate', date)}
                          disabled={!canEdit}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                          dateFormat="MM/dd/yyyy"
                        />
                      </td>
                      <td className="px-4 py-2">
                        {signatureLoading && !row.signature && (
                          <div className="text-xs text-gray-500 mb-2">Loading signature...</div>
                        )}
                        <SignatureCapture
                          value={row.signature}
                          onChange={(sig) => handleRowChange(row.id, 'signature', sig)}
                          disabled={!canEdit}
                        />
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canEdit ? 3 : 2} className="px-4 py-8 text-center text-gray-500">
                      No entries yet. Click "Add Row" to add an entry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Print View - Modern Table Design */}
          <div className="print-only mt-6">
            {rows.filter((r) => r.serviceDate && r.signature).length > 0 ? (
              <div className="modern-table-container">
                <table className="modern-table w-full">
                  <thead>
                    <tr>
                      <th className="table-header">Service Date</th>
                      <th className="table-header">Parent/Guardian Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((r) => r.serviceDate && r.signature)
                      .map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'table-row-even' : 'table-row-odd'}>
                          <td className="table-cell">
                            <div className="date-badge">
                              {row.serviceDate ? format(row.serviceDate, 'MM/dd/yyyy') : ''}
                            </div>
                          </td>
                          <td className="table-cell">
                            {row.signature && (
                              <div className="signature-container">
                                <img src={row.signature} alt="Signature" className="signature-img" />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <p>No entries to display</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-6 no-print flex gap-3">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                  style={{ color: '#ffffff' }}
                >
                  <Plus className="w-4 h-4" style={{ color: '#ffffff' }} />
                  Add Row
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
                  style={{ color: '#ffffff' }}
                >
                  <Save className="w-4 h-4" style={{ color: '#ffffff' }} />
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center gap-2"
              style={{ color: '#ffffff' }}
            >
              <Printer className="w-4 h-4" style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>Print</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
