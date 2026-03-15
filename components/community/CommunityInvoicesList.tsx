'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Plus, Download, Search, Edit, Trash2, Eye, FileText, FileSpreadsheet, CheckCircle, XCircle, Printer, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportToCSV, exportToExcel } from '@/lib/exportUtils'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'

interface CommunityInvoice {
  id: string
  units: number
  ratePerUnit: number
  totalAmount: number
  status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'QUEUED' | 'EMAILED' | 'FAILED'
  serviceDate: string | null
  notes: string | null
  createdAt: string
  client: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zipCode: string | null
    medicaidId: string | null
  }
  class: {
    id: string
    name: string
    ratePerUnit: number
  }
}

export function CommunityInvoicesList() {
  const [invoices, setInvoices] = useState<CommunityInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [canApprove, setCanApprove] = useState(false)
  const [canReject, setCanReject] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchInvoices()
    fetchPermissions()
  }, [])

  const fetchPermissions = async () => {
    try {
      const res = await fetch('/api/user/permissions')
      if (res.ok) {
        const data = await res.json()
        console.log('[CommunityInvoices] Permissions data:', data)
        console.log('[CommunityInvoices] Approve permission:', data.permissions?.['community.invoices.approve'])
        console.log('[CommunityInvoices] Reject permission:', data.permissions?.['community.invoices.reject'])
        const approvePerm = data.permissions?.['community.invoices.approve']
        const rejectPerm = data.permissions?.['community.invoices.reject']
        setCanApprove(approvePerm?.canApprove === true)
        setCanReject(rejectPerm?.canApprove === true)
        console.log('[CommunityInvoices] canApprove:', approvePerm?.canApprove === true, 'canReject:', rejectPerm?.canApprove === true)
      } else {
        console.error('[CommunityInvoices] Failed to fetch permissions:', res.status, res.statusText)
      }
      const sessionRes = await fetch('/api/auth/session')
      if (sessionRes.ok) {
        const session = await sessionRes.json()
        const isAdminUser = session.user?.role === 'ADMIN' || session.user?.role === 'SUPER_ADMIN'
        setIsAdmin(isAdminUser)
        console.log('[CommunityInvoices] User role:', session.user?.role, 'isAdmin:', isAdminUser)
      }
    } catch (error) {
      console.error('[CommunityInvoices] Failed to fetch permissions:', error)
    }
  }

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/community/invoices')
      const data = await res.json()
      if (res.ok) {
        setInvoices(data)
      } else {
        console.error('Failed to load community invoices:', data)
        toast.error(data.error || `Failed to load community invoices (${res.status})`)
      }
    } catch (error: any) {
      console.error('Error fetching community invoices:', error)
      toast.error(`Failed to load community invoices: ${error.message || 'Network error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      const url = `/api/community/invoices/${id}/approve`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()

      if (res.ok && data.ok !== false) {
        toast.success('Invoice approved and queued for email')
        fetchInvoices()
      } else {
        const errorMsg = data.message || data.error || `Failed to approve invoice (${res.status})`
        toast.error(errorMsg)
      }
    } catch (error: any) {
      toast.error(`Network error: ${error.message || 'Failed to approve invoice'}`)
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return

    try {
      const url = `/api/community/invoices/${id}/reject`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()

      if (res.ok && data.ok !== false) {
        toast.success('Invoice rejected')
        fetchInvoices()
      } else {
        const errorMsg = data.message || data.error || `Failed to reject invoice (${res.status})`
        toast.error(errorMsg)
      }
    } catch (error: any) {
      toast.error(`Network error: ${error.message || 'Failed to reject invoice'}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return

    try {
      const res = await fetch(`/api/community/invoices/${id}`, { method: 'DELETE' })
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

  const handlePrint = (invoice: CommunityInvoice) => {
    // Open PDF route in new window/tab
    window.open(`/api/community/invoices/${invoice.id}/pdf`, '_blank')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800'
      case 'APPROVED':
        return 'bg-green-100 text-green-800'
      case 'REJECTED':
        return 'bg-red-100 text-red-800'
      case 'QUEUED':
        return 'bg-cyan-100 text-cyan-800'
      case 'EMAILED':
        return 'bg-purple-100 text-purple-800'
      case 'FAILED':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      `${invoice.client.firstName} ${invoice.client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.class.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !statusFilter || invoice.status === statusFilter
    return matchesSearch && matchesStatus
  })

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

  const formatInvoicesForExport = (invoices: CommunityInvoice[]) => {
    return invoices.map(invoice => ({
      'Client': `${invoice.client.firstName} ${invoice.client.lastName}`,
      'Class': invoice.class.name,
      'Units': invoice.units,
      'Rate Per Unit': formatCurrency(invoice.ratePerUnit),
      'Total Amount': formatCurrency(invoice.totalAmount),
      'Status': invoice.status,
      'Service Date': invoice.serviceDate ? formatDate(invoice.serviceDate) : '',
      'Created At': formatDate(invoice.createdAt),
    }))
  }

  const handleExportCSV = () => {
    const data = formatInvoicesForExport(filteredInvoices)
    exportToCSV(data, `community-invoices-${new Date().toISOString().split('T')[0]}`)
    setShowExportMenu(false)
    toast.success('Community invoices exported to CSV')
  }

  const handleExportExcel = () => {
    const data = formatInvoicesForExport(filteredInvoices)
    exportToExcel(data, `community-invoices-${new Date().toISOString().split('T')[0]}`, 'Community Invoices')
    setShowExportMenu(false)
    toast.success('Community invoices exported to Excel')
  }

  if (loading) {
    return <div className="text-center py-12">Loading community invoices...</div>
  }

  return (
    <>
      <div className="px-4 py-6 sm:px-0">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Community Invoices</h1>
            <p className="text-gray-600 mt-1">Manage community class invoices</p>
          </div>
          <div className="flex space-x-3">
            <Link
              href="/community/email-queue"
              className="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 flex items-center space-x-2"
            >
              <Mail className="w-4 h-4" />
              <span>Email Queue</span>
            </Link>
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
              href="/community/invoices/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Invoice</span>
            </Link>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by client or class..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="QUEUED">Queued</option>
            <option value="EMAILED">Emailed</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Class
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Units
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Service Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || statusFilter ? 'No invoices found matching your filters' : 'No community invoices yet'}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.client.firstName} {invoice.client.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.class.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.units} units (30 min each)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.serviceDate ? formatDate(invoice.serviceDate) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.status === 'DRAFT' && (canApprove || isAdmin) && (
                          <button
                            onClick={() => handleApprove(invoice.id)}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 flex items-center space-x-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                        )}
                        {invoice.status === 'DRAFT' && (canReject || isAdmin) && (
                          <button
                            onClick={() => handleReject(invoice.id)}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 flex items-center space-x-1"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        )}
                        <RowActionsMenu>
                          <button
                            onClick={() => handlePrint(invoice)}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                          </button>
                          {invoice.status === 'DRAFT' && (
                            <button
                              onClick={() => {
                                window.location.href = `/community/invoices/${invoice.id}/edit`
                              }}
                              className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-100 min-h-[44px]"
                              style={{ color: '#000000' }}
                            >
                              <Edit className="w-4 h-4 mr-2" style={{ color: '#000000' }} />
                              <span style={{ color: '#000000' }}>Edit</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 min-h-[44px]"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </button>
                        </RowActionsMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </>
  )
}
