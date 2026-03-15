'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Plus, Download, Search, Edit, Trash2, Eye, FileText, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportToCSV, exportToExcel, formatInvoicesForExport } from '@/lib/exportUtils'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'
import { formatInvoiceNumberForDisplay } from '@/lib/timesheet-ids'

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
  const [searching, setSearching] = useState(false) // Separate state for search loading
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [userRole, setUserRole] = useState<string>('USER')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchInvoices()
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.role) {
          setUserRole(data.user.role)
        }
      })
  }, [page, statusFilter])


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

  // Maintain focus on search input - use requestAnimationFrame to ensure DOM is ready
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (searchInputRef.current) {
        // Only refocus if the input was previously focused
        const wasFocused = document.activeElement === searchInputRef.current || 
                          searchInputRef.current === document.activeElement?.closest('input')
        if (wasFocused || searchTerm.length > 0) {
          searchInputRef.current.focus()
          // Restore cursor position if possible
          const cursorPos = searchInputRef.current.selectionStart || searchTerm.length
          searchInputRef.current.setSelectionRange(cursorPos, cursorPos)
        }
      }
    })
    return () => cancelAnimationFrame(timer)
  }, [debouncedSearchTerm, searchTerm])

  const fetchInvoices = async () => {
    try {
      // Only show full page loading on initial load, not during search
      const isInitialLoad = invoices.length === 0 && !debouncedSearchTerm
      if (isInitialLoad) {
        setLoading(true)
      } else {
        setSearching(true) // Use searching state for search operations
      }
      
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
          firstInvoice: data.invoices?.[0]?.invoiceNumber,
          searchTerm: debouncedSearchTerm
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
      setSearching(false)
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

  // Only show full page loading on initial load (no invoices yet)
  if (loading && invoices.length === 0) {
    return <div className="text-center py-12">Loading invoices...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">

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
            placeholder="Search invoices by number, client, or timesheet ID..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              // Maintain focus immediately
              if (searchInputRef.current) {
                requestAnimationFrame(() => {
                  searchInputRef.current?.focus()
                })
              }
            }}
            onBlur={(e) => {
              // Only blur if clicking outside, not during state updates
              const relatedTarget = e.relatedTarget as HTMLElement
              if (!relatedTarget || !relatedTarget.closest('input, button, select')) {
                // Allow blur only if clicking on non-interactive elements
              }
            }}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
            </div>
          )}
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
    </div>
  )
}
