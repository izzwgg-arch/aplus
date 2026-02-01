'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Plus, Download, Search, Edit, Trash2, Eye, FileText, FileSpreadsheet, Zap, Calendar, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportToCSV, exportToExcel, formatInvoicesForExport } from '@/lib/exportUtils'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'
import { formatInvoiceNumberForDisplay } from '@/lib/timesheet-ids'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  startDate: string
  endDate: string
  totalAmount: number | string
  paidAmount: number | string
  outstanding: number | string
  checkNumber: string | null
  client: {
    name: string
    insurance: {
      name: string
    }
  }
  entries?: Array<{
    timesheet?: {
      isBCBA: boolean
    }
  }>
  timesheets?: Array<{
    isBCBA: boolean
  }>
}

export function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [userRole, setUserRole] = useState<string>('USER')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<{
    current: { startDate: string; endDate: string; label: string }
    next: { startDate: string; endDate: string; label: string }
  } | null>(null)
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null)
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null)
  const [useCustomPeriod, setUseCustomPeriod] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<{
    status: string
    schedule?: string
    lastRun: string | null
    nextRun: string | null
    lastRunResult: any
    scheduleDescription: string
  } | null>(null)

  useEffect(() => {
    fetchInvoices()
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.role) {
          setUserRole(data.user.role)
          // Load billing period info for admins
          if (data.user.role === 'ADMIN') {
            fetchBillingPeriodInfo()
            fetchGenerationStatus()
          }
        }
      })
  }, [page, statusFilter])

  const fetchBillingPeriodInfo = async () => {
    try {
      const res = await fetch('/api/invoices/generate')
      if (res.ok) {
        const data = await res.json()
        setBillingPeriod(data)
      }
    } catch (error) {
      console.error('Failed to fetch billing period info:', error)
    }
  }

  const fetchGenerationStatus = async () => {
    try {
      const res = await fetch('/api/invoices/generation-status')
      if (res.ok) {
        const data = await res.json()
        setGenerationStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch generation status:', error)
    }
  }

  const handleGenerateInvoices = async () => {
    if (useCustomPeriod && (!customStartDate || !customEndDate)) {
      toast.error('Please select both start and end dates for custom period')
      return
    }

    setGenerating(true)
    try {
      const body: any = {}
      if (useCustomPeriod && customStartDate && customEndDate) {
        body.startDate = customStartDate.toISOString()
        body.endDate = customEndDate.toISOString()
      }

      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success(
          `Generated ${data.invoicesCreated} invoice(s) for ${data.clientsProcessed} client(s)`
        )
        setShowGenerateModal(false)
        fetchInvoices() // Refresh list
        if (data.errors && data.errors.length > 0) {
          console.warn('Invoice generation warnings:', data.errors)
        }
      } else {
        toast.error(data.message || 'Failed to generate invoices')
        if (data.errors && data.errors.length > 0) {
          console.error('Invoice generation errors:', data.errors)
        }
      }
    } catch (error) {
      toast.error('Failed to generate invoices')
      console.error('Error generating invoices:', error)
    } finally {
      setGenerating(false)
    }
  }

  // Debounce search term (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  // Trigger fetch when debounced search term or status filter changes (reset to page 1)
  useEffect(() => {
    if (page === 1) {
      fetchInvoices()
    } else {
      setPage(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, statusFilter])

  // Trigger fetch when page changes (for pagination)
  useEffect(() => {
    fetchInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // Maintain focus on search input
  useEffect(() => {
    if (searchInputRef.current && document.activeElement === searchInputRef.current) {
      // Focus is already on the input, keep it there
      searchInputRef.current.focus()
    }
  }, [debouncedSearchTerm])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
        ...(statusFilter && { status: statusFilter }),
      })

      const res = await fetch(`/api/invoices?${params}`)
      if (res.ok) {
        const data = await res.json()
        console.log('[INVOICES FRONTEND] Received data:', {
          invoicesCount: data.invoices?.length || 0,
          total: data.total,
          totalPages: data.totalPages,
          firstInvoice: data.invoices?.[0]?.invoiceNumber
        })
        if (data.invoices && Array.isArray(data.invoices)) {
          setInvoices(data.invoices)
          setTotalPages(data.totalPages || 1)
        } else {
          console.error('[INVOICES FRONTEND] Invalid data structure:', data)
          setInvoices([])
          setTotalPages(1)
        }
      } else {
        const errorData = await res.json().catch(() => ({}))
        console.error('[INVOICES FRONTEND] API error:', res.status, errorData)
        toast.error(errorData.error || 'Failed to load invoices')
        setInvoices([])
      }
    } catch (error) {
      console.error('[INVOICES FRONTEND] Fetch error:', error)
      toast.error('Failed to load invoices')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return

    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Invoice deleted')
        fetchInvoices()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete invoice')
      }
    } catch (error) {
      toast.error('Failed to delete invoice')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800'
      case 'READY':
        return 'bg-blue-100 text-blue-800'
      case 'SENT':
        return 'bg-purple-100 text-purple-800'
      case 'PARTIALLY_PAID':
        return 'bg-yellow-100 text-yellow-800'
      case 'PAID':
        return 'bg-green-100 text-green-800'
      case 'VOID':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExportCSV = () => {
    const data = formatInvoicesForExport(invoices)
    exportToCSV(data, `invoices-${new Date().toISOString().split('T')[0]}`)
    setShowExportMenu(false)
    toast.success('Invoices exported to CSV')
  }

  const handleExportExcel = () => {
    const data = formatInvoicesForExport(invoices)
    exportToExcel(data, `invoices-${new Date().toISOString().split('T')[0]}`, 'Invoices')
    setShowExportMenu(false)
    toast.success('Invoices exported to Excel')
  }

  if (loading) {
    return <div className="text-center py-12">Loading invoices...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Auto-Invoice Generation Status Panel (Admin Only) */}
      {userRole === 'ADMIN' && generationStatus && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                Last Auto-Invoice Run
              </h3>
              {generationStatus.lastRunResult ? (
                <div className="space-y-1 text-sm text-blue-800">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Period:</span>
                    <span>{generationStatus.lastRunResult.periodLabel || 'N/A'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">Status:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        generationStatus.lastRunResult.success
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {generationStatus.lastRunResult.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span>
                      <span className="font-medium">Created:</span>{' '}
                      {generationStatus.lastRunResult.invoicesCreated || 0}
                    </span>
                    <span>
                      <span className="font-medium">Skipped:</span>{' '}
                      {generationStatus.lastRunResult.invoicesSkipped || 0}
                    </span>
                    {generationStatus.lastRunResult.errorsCount > 0 && (
                      <span className="text-red-600">
                        <span className="font-medium">Errors:</span>{' '}
                        {generationStatus.lastRunResult.errorsCount}
                      </span>
                    )}
                  </div>
                  {generationStatus.lastRun && (
                    <div className="text-xs text-blue-600 mt-2">
                      Last run: {new Date(generationStatus.lastRun).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-blue-700">
                  No runs recorded yet. Next scheduled run:{' '}
                  {generationStatus.nextRun
                    ? new Date(generationStatus.nextRun).toLocaleString()
                    : 'Not scheduled'}
                </div>
              )}
              <div className="text-xs text-blue-600 mt-2">
                Schedule: {generationStatus.scheduleDescription || generationStatus.schedule}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
        </div>
        <div className="flex space-x-3">
          {userRole === 'ADMIN' && (
            <>
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                    <div className="py-1">
                      <button
                        onClick={handleExportCSV}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Export as CSV
                      </button>
                      <button
                        onClick={handleExportExcel}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Export as Excel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
              >
                <Zap className="w-4 h-4" />
                <span>Generate Invoices</span>
              </button>
              <Link
                href="/invoices/new"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Invoice</span>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="mb-6 flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search invoices..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="READY">Ready</option>
          <option value="SENT">Sent</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAID">Paid</option>
          <option value="VOID">Void</option>
        </select>
      </div>

      <div className="bg-white shadow sm:rounded-md overflow-x-auto">
        <table className="w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                INVOICE #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                TYPE
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CLIENT
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                AMOUNT
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                FROM
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                TO
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                CHECK #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                STATUS
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px] flex-shrink-0">
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.map((invoice) => {
              // Determine if invoice is BCBA by checking timesheets or entries
              const isBCBA = invoice.timesheets?.some(ts => ts.isBCBA === true) ||
                            invoice.entries?.some(e => e.timesheet?.isBCBA === true) ||
                            false
              
              return (
              <tr key={invoice.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium" style={{ color: '#000000' }}>
                  {formatInvoiceNumberForDisplay(invoice.invoiceNumber)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      isBCBA
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {isBCBA ? 'BCBA' : 'Regular'}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 overflow-hidden text-ellipsis max-w-[200px]">
                  {invoice.client.name}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {formatCurrency(invoice.totalAmount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {formatDate(invoice.startDate)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {formatDate(invoice.endDate)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {invoice.checkNumber || '-'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                      invoice.status
                    )}`}
                  >
                    {invoice.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium w-[80px] flex-shrink-0">
                  <RowActionsMenu>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View
                    </Link>
                    {userRole === 'ADMIN' && invoice.status === 'DRAFT' && (
                      <>
                        <Link
                          href={`/invoices/${invoice.id}/edit`}
                          className="flex items-center px-4 py-2 text-sm hover:bg-gray-100 min-h-[44px]"
                          style={{ color: '#000000' }}
                        >
                          <Edit className="w-4 h-4 mr-2" style={{ color: '#000000' }} />
                          <span style={{ color: '#000000' }}>Edit</span>
                        </Link>
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 min-h-[44px]"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </button>
                      </>
                    )}
                  </RowActionsMenu>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <div className="text-center py-12 text-gray-500">No invoices found</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Manual Invoice Generation Modal */}
      {showGenerateModal && userRole === 'ADMIN' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">Generate Invoices</h2>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Billing Period Info */}
              {billingPeriod && !useCustomPeriod && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                    <div>
                      <h3 className="text-sm font-medium text-blue-800">Current Billing Period</h3>
                      <p className="mt-1 text-sm text-blue-700">
                        {billingPeriod.current.label}
                      </p>
                      <p className="mt-1 text-xs text-blue-600">
                        {new Date(billingPeriod.current.startDate).toLocaleDateString()} - {new Date(billingPeriod.current.endDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Period Toggle */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={useCustomPeriod}
                    onChange={(e) => setUseCustomPeriod(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Use custom date range</span>
                </label>
              </div>

              {/* Custom Date Range */}
              {useCustomPeriod && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      selected={customStartDate}
                      onChange={(date) => setCustomStartDate(date)}
                      dateFormat="MM/dd/yyyy"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholderText="mm/dd/yyyy"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Date <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      selected={customEndDate}
                      onChange={(date) => setCustomEndDate(date)}
                      dateFormat="MM/dd/yyyy"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholderText="mm/dd/yyyy"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-yellow-800 mb-2">Invoice Generation Rules</h3>
                <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                  <li>Only APPROVED timesheets are included</li>
                  <li>Entries already marked as invoiced are excluded</li>
                  <li>One invoice per Client (aggregates all timesheets for the client)</li>
                  <li>Billing period: Monday to Monday (whole week)</li>
                  <li>1 unit = 15 minutes (rounded UP to nearest 15 minutes)</li>
                  <li>Rate: Insurance rate per unit (snapshotted at generation time)</li>
                  <li>This operation is idempotent (safe to run multiple times)</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  disabled={generating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateInvoices}
                  disabled={generating}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Generate Invoices</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
