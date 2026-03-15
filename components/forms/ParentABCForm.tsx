'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Save, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { format } from 'date-fns'

interface Client {
  id: string
  name: string
}

interface ParentABCFormProps {
  clients: Client[]
}

interface FormRow {
  id: string
  date: Date | null
  startTime: string
  endTime: string
  antecedent: string
  consequence: string
  notes: string
}

const ANTECEDENT_OPTIONS = [
  'Task',
  'Told No',
  'Diverted Attention',
  'Denied Access',
  'Error Correction',
  'Waiting',
  'Down Time',
]

const CONSEQUENCE_OPTIONS = [
  'Ignored',
  'Redirected to Activity',
  'Reprimand',
  'Changed Activity',
  'Moved Away',
  'Given a Break',
]

export function ParentABCForm({ clients }: ParentABCFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = (searchParams.get('mode') || 'edit').toLowerCase()
  // Only force read-only for view mode, not print mode (print mode can still allow editing)
  const forceReadOnly = mode === 'view'
  const [clientId, setClientId] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [behavior, setBehavior] = useState('')
  const [rows, setRows] = useState<FormRow[]>([
    {
      id: '1',
      date: null,
      startTime: '',
      endTime: '',
      antecedent: '',
      consequence: '',
      notes: '',
    },
  ])
  const [loading, setLoading] = useState(false)
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
          // Check if user has FORMS_EDIT permission or is ADMIN/SUPER_ADMIN
          const hasEdit = data.permissions?.['FORMS_EDIT']?.canView === true ||
                         data.permissions?.['FORMS_EDIT']?.canCreate === true ||
                         data.permissions?.['FORMS_EDIT']?.canUpdate === true ||
                         data.role === 'ADMIN' || 
                         data.role === 'SUPER_ADMIN'
          setCanEdit(hasEdit)
          // Log for debugging
          if (!hasEdit) {
            console.log('Permission check failed:', {
              permissions: data.permissions,
              role: data.role,
              FORMS_EDIT: data.permissions?.['FORMS_EDIT']
            })
          }
        } else {
          // If API fails, default to true (allow editing)
          console.warn('Permission API failed, defaulting to allow edit')
          setCanEdit(true)
        }
      } catch (error) {
        console.error('Error checking permissions:', error)
        // Default to true on error (allow editing)
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
      setBehavior('')
      setRows([
        {
          id: '1',
          date: null,
          startTime: '',
          endTime: '',
          antecedent: '',
          consequence: '',
          notes: '',
        },
      ])
    }
  }, [clientId, month])

  const loadForm = async () => {
    try {
      const currentYear = new Date().getFullYear()
      const res = await fetch(
        `/api/forms?type=PARENT_ABC&clientId=${clientId}&month=${month}&year=${currentYear}`
      )
      if (res.ok) {
        const form = await res.json()
        if (form) {
          setBehavior(form.behavior || '')
          if (form.payload && Array.isArray(form.payload.rows)) {
            setRows(
              form.payload.rows.map((row: any, idx: number) => ({
                id: `row-${idx}`,
                date: row.date ? new Date(row.date) : null,
                startTime: row.startTime || '',
                endTime: row.endTime || '',
                antecedent: row.antecedent || '',
                consequence: row.consequence || '',
                notes: row.notes || '',
              }))
            )
            if (form.payload.rows.length === 0) {
              setRows([
                {
                  id: '1',
                  date: null,
                  startTime: '',
                  endTime: '',
                  antecedent: '',
                  consequence: '',
                  notes: '',
                },
              ])
            }
          } else {
            setRows([
              {
                id: '1',
                date: null,
                startTime: '',
                endTime: '',
                antecedent: '',
                consequence: '',
                notes: '',
              },
            ])
          }
        } else {
          setBehavior('')
          setRows([
            {
              id: '1',
              date: null,
              startTime: '',
              endTime: '',
              antecedent: '',
              consequence: '',
              notes: '',
            },
          ])
        }
      } else {
        setBehavior('')
        setRows([
          {
            id: '1',
            date: null,
            startTime: '',
            endTime: '',
            antecedent: '',
            consequence: '',
            notes: '',
          },
        ])
      }
    } catch (error) {
      console.error('Error loading form:', error)
      setBehavior('')
      setRows([
        {
          id: '1',
          date: null,
          startTime: '',
          endTime: '',
          antecedent: '',
          consequence: '',
          notes: '',
        },
      ])
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
        date: null,
        startTime: '',
        endTime: '',
        antecedent: '',
        consequence: '',
        notes: '',
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

  const formatTime12 = (time24: string): string => {
    if (!time24) return ''
    const [hStr, mStr] = time24.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr || '0', 10)
    if (isNaN(h) || isNaN(m)) return time24
    const suffix = h >= 12 ? 'PM' : 'AM'
    const hour12 = ((h + 11) % 12) + 1
    return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`
  }

  const validateTime = (time: string): boolean => {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
    return timeRegex.test(time)
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

    // Allow saving with ONE complete row (ignore extra incomplete rows)
    // Start and end times are optional, but if provided, both must be valid and end > start
    const validRows = rows.filter((r) => {
      if (!r.date || !r.antecedent || !r.consequence) {
        return false
      }
      // If start time is provided, validate it
      if (r.startTime && !validateTime(r.startTime)) {
        return false
      }
      // If end time is provided, validate it
      if (r.endTime && !validateTime(r.endTime)) {
        return false
      }
      // If both times are provided, validate that end > start
      if (r.startTime && r.endTime && r.startTime >= r.endTime) {
        return false
      }
      return true
    })
    if (validRows.length === 0) {
      toast.error('Please add at least one complete row (Date, Antecedent, Consequence)')
      return
    }

    setLoading(true)
    try {
      const currentYear = new Date().getFullYear()
      const payload = {
        header: { behavior },
        rows: validRows.map((r) => ({
          date: r.date!.toISOString(),
          startTime: r.startTime || '',
          endTime: r.endTime || '',
          antecedent: r.antecedent,
          consequence: r.consequence,
          notes: r.notes || undefined,
        })),
      }

      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PARENT_ABC',
          clientId,
          month,
          year: currentYear,
          behavior,
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
          
          /* Repeat header and info card on each page */
          @media print {
            /* Ensure header and info card don't break across pages */
            .print-header-wrapper {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
              margin-bottom: 20pt !important;
            }
            
            /* Ensure table header repeats */
            .modern-table thead {
              display: table-header-group !important;
            }
            
            /* Duplicate header will appear on page 2+ */
            .print-header-duplicate {
              display: none !important;
            }
            
            /* Show duplicate header only after first page break */
            .modern-table-container ~ .print-header-duplicate,
            .print-header-duplicate:first-of-type {
              display: none !important;
            }
            
            /* Show duplicate header when it comes after table content */
            .print-header-duplicate {
              display: block !important;
              visibility: visible !important;
              page-break-before: always !important;
              break-before: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-top: 0 !important;
              margin-bottom: 20pt !important;
              padding-top: 0 !important;
            }
            
            /* Ensure duplicate header content is visible */
            .print-header-duplicate * {
              display: block !important;
              visibility: visible !important;
            }
            
            .print-header-duplicate .modern-form-header,
            .print-header-duplicate .info-card {
              display: block !important;
              visibility: visible !important;
            }
            
            .print-header-duplicate .grid {
              display: grid !important;
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 24pt !important;
            }
            
            .print-header-duplicate .header-gradient,
            .print-header-duplicate .header-gradient h1,
            .print-header-duplicate .header-accent-line {
              display: block !important;
              visibility: visible !important;
            }
            
            /* Force duplicate header values to be visible */
            .print-header-duplicate .duplicate-header-value {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
              color: #1e293b !important;
              font-size: 14pt !important;
              font-weight: 600 !important;
              line-height: 1.5 !important;
            }
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
          }
          .print-form label {
            display: block !important;
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
          }
          .print-form table th,
          .print-form table td {
            border: none !important;
            padding: 8pt !important;
            text-align: left !important;
            font-size: 10pt !important;
            display: table-cell !important;
          }
          .print-form table {
            border: none !important;
          }
          .print-form tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-form tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print-form .signature-img {
            max-width: 200pt !important;
            max-height: 60pt !important;
            object-fit: contain !important;
            display: block !important;
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
          
          .info-card .grid {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 24pt !important;
          }
          
          @media print {
            .info-card .grid {
              display: grid !important;
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 24pt !important;
            }
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
            overflow: visible !important;
            box-shadow: 0 2pt 8pt rgba(0, 0, 0, 0.08) !important;
            border: 1pt solid #e2e8f0 !important;
            display: block !important;
            visibility: visible !important;
          }
          
          .modern-table {
            border-collapse: separate !important;
            border-spacing: 0 !important;
            width: 100% !important;
            display: table !important;
            visibility: visible !important;
          }
          
          .modern-table thead {
            display: table-header-group !important;
            visibility: visible !important;
          }
          
          .modern-table tbody {
            display: table-row-group !important;
            visibility: visible !important;
          }
          
          .modern-table tbody tr {
            display: table-row !important;
            visibility: visible !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          
          .modern-table tbody tr:first-child {
            display: table-row !important;
            visibility: visible !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          
          .table-header {
            background: linear-gradient(135deg, #0066cc 0%, #004499 100%) !important;
            color: #ffffff !important;
            font-size: 11pt !important;
            font-weight: 700 !important;
            padding: 12pt 14pt !important;
            text-align: left !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5pt !important;
            border: none !important;
            display: table-cell !important;
            visibility: visible !important;
          }
          
          .table-header:first-child {
            border-top-left-radius: 12pt !important;
          }
          
          .table-header:last-child {
            border-top-right-radius: 12pt !important;
          }
          
          .table-row-even {
            background: #ffffff !important;
            display: table-row !important;
            visibility: visible !important;
          }
          
          .table-row-odd {
            background: #f8fafc !important;
            display: table-row !important;
            visibility: visible !important;
          }
          
          .table-cell {
            padding: 12pt 14pt !important;
            border-bottom: 1pt solid #e2e8f0 !important;
            vertical-align: middle !important;
            font-size: 10pt !important;
            display: table-cell !important;
            visibility: visible !important;
          }
          
          .table-row-even .table-cell,
          .table-row-odd .table-cell {
            border-bottom: 1pt solid #e2e8f0 !important;
            display: table-cell !important;
            visibility: visible !important;
          }
          
          .modern-table tbody tr:first-child td {
            display: table-cell !important;
            visibility: visible !important;
          }
          
          .modern-table tbody tr td {
            display: table-cell !important;
            visibility: visible !important;
          }
          
          .date-badge {
            display: inline-block !important;
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%) !important;
            color: #0369a1 !important;
            padding: 6pt 12pt !important;
            border-radius: 8pt !important;
            font-weight: 600 !important;
            font-size: 10pt !important;
            border: 1pt solid #7dd3fc !important;
            box-shadow: 0 2pt 4pt rgba(3, 105, 161, 0.1) !important;
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
          {/* Header wrapper that will repeat on each page */}
          <div className="print-header-wrapper">
            {/* Modern Header with Gradient */}
            <div className="modern-form-header mb-8">
              <div className="header-gradient">
                <h1 className="text-3xl font-bold mb-2 text-white">PARENT ABC DATA SHEET</h1>
                <div className="header-accent-line"></div>
              </div>
            </div>

            {/* Header Section */}
            <div className="mb-8">
              <div className="info-card">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <div>
                  <div className="info-label">Behavior</div>
                  <div className="no-print">
                    <input
                      type="text"
                      value={behavior}
                      onChange={(e) => setBehavior(e.target.value)}
                      disabled={!canEdit || forceReadOnly}
                      className="w-full border-2 border-gray-300 rounded-lg px-4 py-2.5 disabled:bg-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                      placeholder="Enter behavior description"
                    />
                  </div>
                  <div className="print-only info-value">{behavior || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>
          </div>
          {/* End of print-header-wrapper */}

          {/* Regular View - Single Table with all rows */}
          <div className="no-print mt-6">
            <table className="w-full border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Date</th>
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Start Time</th>
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">End Time</th>
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Antecedent</th>
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Consequence</th>
                  <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Notes</th>
                  {canEdit && <th className="px-4 py-2 text-left font-semibold border-b border-gray-300">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="border-b border-gray-200">
                    <td className="px-4 py-2">
                      <DatePicker
                        selected={row.date}
                        onChange={(date) => handleRowChange(row.id, 'date', date)}
                        disabled={!canEdit}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                        dateFormat="MM/dd/yyyy"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => handleRowChange(row.id, 'startTime', e.target.value)}
                        disabled={!canEdit}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => handleRowChange(row.id, 'endTime', e.target.value)}
                        disabled={!canEdit}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.antecedent}
                        onChange={(e) => handleRowChange(row.id, 'antecedent', e.target.value)}
                        disabled={!canEdit}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                      >
                        <option value="">Select...</option>
                        {ANTECEDENT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={row.consequence}
                        onChange={(e) => handleRowChange(row.id, 'consequence', e.target.value)}
                        disabled={!canEdit}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                      >
                        <option value="">Select...</option>
                        {CONSEQUENCE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => handleRowChange(row.id, 'notes', e.target.value)}
                        disabled={!canEdit}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                        placeholder="Optional"
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Print View - Modern Table Design */}
          <div className="print-only mt-6">
            {rows.length > 0 && rows.some((r) => r.date || r.antecedent || r.consequence) ? (
              <>
                {/* Duplicate header for page 2+ - placed BEFORE table */}
                <div className="print-header-duplicate print-only" style={{ pageBreakBefore: 'always', breakBefore: 'page', marginBottom: '20pt' }}>
                  <div className="modern-form-header mb-8">
                    <div className="header-gradient">
                      <h1 className="text-3xl font-bold mb-2 text-white">PARENT ABC DATA SHEET</h1>
                      <div className="header-accent-line"></div>
                    </div>
                  </div>
                  <div className="mb-8">
                    <div className="info-card">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <div className="info-label">Client Name</div>
                          <div className="print-only info-value">{selectedClient ? selectedClient.name : 'N/A'}</div>
                        </div>
                        <div>
                          <div className="info-label">Month</div>
                          <div className="print-only info-value">{months[month - 1]}</div>
                        </div>
                        <div>
                          <div className="info-label">Behavior</div>
                          <div className="print-only info-value">{behavior || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modern-table-container">
                  <table className="modern-table w-full">
                    <thead>
                      <tr>
                        <th className="table-header">Date</th>
                        <th className="table-header">Start Time</th>
                        <th className="table-header">End Time</th>
                        <th className="table-header">Antecedent</th>
                        <th className="table-header">Consequence</th>
                        <th className="table-header">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .filter((r) => r.date || r.antecedent || r.consequence)
                        .map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'table-row-even' : 'table-row-odd'}>
                            <td className="table-cell">
                              <div className="date-badge">
                                {row.date ? format(row.date, 'MM/dd/yyyy') : '—'}
                              </div>
                            </td>
                            <td className="table-cell">{row.startTime ? formatTime12(row.startTime) : '—'}</td>
                            <td className="table-cell">{row.endTime ? formatTime12(row.endTime) : '—'}</td>
                            <td className="table-cell">{row.antecedent || '—'}</td>
                            <td className="table-cell">{row.consequence || '—'}</td>
                            <td className="table-cell">{row.notes || '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
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
