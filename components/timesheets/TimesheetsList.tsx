'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Download, Search, Printer, Edit, Trash2, Send, Check, X, FileText, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDate } from '@/lib/utils'
import { TimesheetPrintPreview } from './TimesheetPrintPreview'
import { handlePrintTimesheet } from '@/lib/utils/printTimesheet'
import { exportToCSV, exportToExcel, formatTimesheetsForExport, formatTimesheetForDetailedExport } from '@/lib/exportUtils'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'
import { ConfirmDeleteModal } from '@/components/shared/ConfirmDeleteModal'
import { formatInvoiceNumberForDisplay } from '@/lib/timesheet-ids'

interface Timesheet {
  id: string
  timesheetNumber?: string | null
  userId: string
  status: string
  startDate: string
  endDate: string
  invoiceId?: string | null
  invoice?: {
    invoiceNumber: string
  } | null
  client: { name: string; phone?: string | null; id?: string }
  provider: { name: string; phone?: string | null; signature?: string | null }
  bcba: { name: string }
  entries: Array<{ 
    date: string
    startTime: string
    endTime: string
    minutes: number
    notes: string | null
  }>
}

export function TimesheetsList({ isArchive = false }: { isArchive?: boolean }) {
  const router = useRouter()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [printTimesheet, setPrintTimesheet] = useState<Timesheet | null>(null)
  const [userRole, setUserRole] = useState<string>('USER')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [canViewAllTimesheets, setCanViewAllTimesheets] = useState(false)
  const [hasViewSelectedUsers, setHasViewSelectedUsers] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; username: string; email: string }>>([])
  const [canDeleteTimesheets, setCanDeleteTimesheets] = useState(false)
  const [canApproveTimesheets, setCanApproveTimesheets] = useState(false)
  const [canRejectTimesheets, setCanRejectTimesheets] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingTimesheetId, setDeletingTimesheetId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedTimesheets, setSelectedTimesheets] = useState<Set<string>>(new Set())
  const [canCreateInvoice, setCanCreateInvoice] = useState(false)
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)

  useEffect(() => {
    fetchTimesheets()
    // Get user role and permissions from session
    Promise.all([
      fetch('/api/auth/session').then(res => res.json()),
      fetch('/api/user/permissions').then(res => res.json())
    ]).then(([sessionData, permissionsData]) => {
      // Set role and admin status
      const userRole = sessionData?.user?.role || ''
      const isUserAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
      
      if (userRole) {
        setUserRole(userRole)
        setIsAdmin(isUserAdmin)
      }
      if (sessionData?.user?.id) {
        setCurrentUserId(sessionData.user.id)
      }
      
      // ADMIN and SUPER_ADMIN always have full access
      if (isUserAdmin) {
        setCanViewAllTimesheets(true)
        setCanDeleteTimesheets(true)
        setCanApproveTimesheets(true)
        setCanRejectTimesheets(true)
        setCanCreateInvoice(true) // Admins always can create invoices
        return
      }
      
      // Check permissions for non-admin users
      if (permissionsData?.permissions) {
        const hasViewAll = permissionsData.permissions['timesheets.viewAll']?.canView === true
        const hasViewSelected = permissionsData.permissions['timesheets.viewSelectedUsers']?.canView === true
        const hasDelete = permissionsData.permissions['timesheets.delete']?.canDelete === true
        const hasApprove = permissionsData.permissions['timesheets.approve']?.canApprove === true
        const hasReject = permissionsData.permissions['timesheets.reject']?.canApprove === true // Reject uses canApprove
        const hasViewTimesheets = permissionsData.permissions['timesheets.view']?.canView === true || hasViewAll || hasViewSelected
        const hasCreateInvoice = permissionsData.permissions['invoices.create']?.canCreate === true
        
        setCanViewAllTimesheets(hasViewAll || hasViewSelected)
        setHasViewSelectedUsers(hasViewSelected)
        setCanDeleteTimesheets(hasDelete)
        setCanApproveTimesheets(hasApprove)
        setCanRejectTimesheets(hasReject)
        // User needs both view timesheets AND create invoice permissions
        setCanCreateInvoice(hasViewTimesheets && hasCreateInvoice)
        
        // If user can view others, fetch available users
        if (hasViewAll || hasViewSelected) {
          // First get the visibility scope to know which users to show
          Promise.all([
            fetch('/api/user/timesheet-scope').then(res => res.json()),
            fetch('/api/users?limit=1000&active=true').then(res => res.json())
          ]).then(([scopeData, userData]) => {
            if (userData?.users) {
              let usersToShow = userData.users.map((u: any) => ({
                id: u.id,
                username: u.username || u.email,
                email: u.email,
              }))
              
              // If user has viewSelectedUsers (not viewAll), filter to only allowed users
              if (hasViewSelected && scopeData?.scope && !scopeData.scope.viewAll) {
                const allowedIds = scopeData.scope.allowedUserIds
                usersToShow = usersToShow.filter((u: any) => allowedIds.includes(u.id))
              }
              
              setAvailableUsers(usersToShow)
            }
          }).catch(err => {
            console.error('Failed to fetch users or scope:', err)
            // Fallback: fetch all users if scope fetch fails
            fetch('/api/users?limit=1000&active=true').then(res => res.json()).then(userData => {
              if (userData?.users) {
                setAvailableUsers(userData.users.map((u: any) => ({
                  id: u.id,
                  username: u.username || u.email,
                  email: u.email,
                })))
              }
            })
          })
        }
      }
    }).catch(err => {
      console.error('Failed to fetch permissions:', err)
    })
  }, [page, rowsPerPage])

  const fetchTimesheets = async () => {
    try {
      let url = `/api/timesheets?page=${page}&limit=${rowsPerPage}&search=${searchTerm}&isBCBA=false`
      if (isArchive) {
        url += `&archived=true`
      }
      if (selectedUserId) {
        url += `&userId=${selectedUserId}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setTimesheets(data.timesheets)
        setTotalPages(data.totalPages)
      }
    } catch (error) {
      toast.error('Failed to load timesheets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (page === 1) {
        fetchTimesheets()
      } else {
        setPage(1)
      }
    }, 500)

    return () => clearTimeout(delayDebounce)
  }, [searchTerm, selectedUserId])

  useEffect(() => {
    if (page === 1) {
      fetchTimesheets()
    } else {
      setPage(1)
    }
  }, [selectedUserId])

  // Submit button removed - replaced with Approve/Reject workflow

  const handleApprove = async (id: string) => {
    try {
      const url = `/api/timesheets/${id}/approve`
      console.log('[APPROVE] Request:', { url, method: 'POST' })
      
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()
      
      console.log('[APPROVE] Response:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        data,
      })
      
      if (res.ok && data.ok !== false) {
        toast.success('Timesheet approved and queued for email')
        fetchTimesheets()
      } else {
        const errorMsg = data.message || data.error || `Failed to approve timesheet (${res.status})`
        console.error('[APPROVE] Error:', { status: res.status, code: data.code, message: data.message, details: data.details })
        toast.error(errorMsg)
      }
    } catch (error: any) {
      console.error('[APPROVE] Request failed:', {
        url: `/api/timesheets/${id}/approve`,
        error: error.message,
        stack: error.stack,
      })
      toast.error(`Network error: ${error.message || 'Failed to approve timesheet'}`)
    }
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason || !reason.trim()) return

    try {
      const url = `/api/timesheets/${id}/reject`
      console.log('[REJECT] Request:', { url, method: 'POST', reason })
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      
      console.log('[REJECT] Response:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        data,
      })
      
      if (res.ok && data.ok !== false) {
        toast.success('Timesheet rejected')
        fetchTimesheets()
      } else {
        const errorMsg = data.message || data.error || `Failed to reject timesheet (${res.status})`
        console.error('[REJECT] Error:', { status: res.status, code: data.code, message: data.message, details: data.details })
        toast.error(errorMsg)
      }
    } catch (error: any) {
      console.error('[REJECT] Request failed:', {
        url: `/api/timesheets/${id}/reject`,
        error: error.message,
        stack: error.stack,
      })
      toast.error(`Network error: ${error.message || 'Failed to reject timesheet'}`)
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingTimesheetId(id)
    setDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingTimesheetId) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/timesheets/${deletingTimesheetId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Timesheet deleted')
        setDeleteModalOpen(false)
        setDeletingTimesheetId(null)
        fetchTimesheets()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete timesheet')
      }
    } catch (error) {
      toast.error('Failed to delete timesheet')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false)
    setDeletingTimesheetId(null)
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
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const calculateTotalHours = (timesheet: Timesheet) => {
    const totalMinutes = timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0)
    return (totalMinutes / 60).toFixed(1)
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
    const data = formatTimesheetsForExport(timesheets)
    exportToCSV(data, `timesheets-${new Date().toISOString().split('T')[0]}`)
    setShowExportMenu(false)
    toast.success('Timesheets exported to CSV')
  }

  const handleExportExcel = () => {
    const data = formatTimesheetsForExport(timesheets)
    exportToExcel(data, `timesheets-${new Date().toISOString().split('T')[0]}`, 'Timesheets')
    setShowExportMenu(false)
    toast.success('Timesheets exported to Excel')
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTimesheets(new Set(timesheets.map(ts => ts.id)))
    } else {
      setSelectedTimesheets(new Set())
    }
  }

  const handleSelectTimesheet = (timesheetId: string, checked: boolean) => {
    const newSelected = new Set(selectedTimesheets)
    if (checked) {
      newSelected.add(timesheetId)
    } else {
      newSelected.delete(timesheetId)
    }
    setSelectedTimesheets(newSelected)
  }

  const handleMoveToArchive = async () => {
    if (selectedTimesheets.size === 0) {
      toast.error('Please select at least one timesheet')
      return
    }

    try {
      const res = await fetch('/api/timesheets/batch/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedTimesheets), archived: true }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || `Moved ${data.count} timesheet(s) to archive`)
        setSelectedTimesheets(new Set())
        fetchTimesheets()
      } else {
        toast.error(data.error || 'Failed to move timesheets to archive')
      }
    } catch (error: any) {
      toast.error(`Failed to move timesheets: ${error.message}`)
    }
  }

  const handleMoveOutOfArchive = async () => {
    if (selectedTimesheets.size === 0) {
      toast.error('Please select at least one timesheet')
      return
    }

    try {
      const res = await fetch('/api/timesheets/batch/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedTimesheets), archived: false }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || `Moved ${data.count} timesheet(s) out of archive`)
        setSelectedTimesheets(new Set())
        fetchTimesheets()
      } else {
        toast.error(data.error || 'Failed to move timesheets out of archive')
      }
    } catch (error: any) {
      toast.error(`Failed to move timesheets: ${error.message}`)
    }
  }

  const handleGenerateInvoiceFromArchive = async () => {
    if (selectedTimesheets.size === 0) {
      toast.error('Please select at least one timesheet')
      return
    }

    setIsGeneratingInvoice(true)
    try {
      const res = await fetch('/api/timesheets/batch/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetIds: Array.from(selectedTimesheets) }),
      })

      // Check if response is JSON
      const contentType = res.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text()
        console.error('[BATCH INVOICE FRONTEND] Non-JSON response:', text.substring(0, 500))
        toast.error('Server returned an error page. Please check the console for details.')
        return
      }

      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Invoices generated successfully')
        setSelectedTimesheets(new Set())
        fetchTimesheets()
      } else {
        toast.error(data.error || 'Failed to generate invoices')
        if (data.details) {
          console.error('[BATCH INVOICE FRONTEND] Error details:', data.details)
        }
      }
    } catch (error: any) {
      console.error('[BATCH INVOICE FRONTEND] Fetch error:', error)
      toast.error('Failed to generate invoices: ' + (error.message || 'Unknown error'))
    } finally {
      setIsGeneratingInvoice(false)
    }
  }

  const handleClearSelection = () => {
    setSelectedTimesheets(new Set())
  }

  const handleGenerateInvoice = async () => {
    if (selectedTimesheets.size === 0) {
      toast.error('Please select at least one timesheet')
      return
    }

    setIsGeneratingInvoice(true)
    try {
      const response = await fetch('/api/timesheets/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timesheetIds: Array.from(selectedTimesheets),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(data.message || 'Invoices generated successfully')
        setSelectedTimesheets(new Set())
        fetchTimesheets() // Refresh to show updated status
      } else {
        // Display error with skipped details if available
        let errorMsg = data.error || 'Failed to generate invoices'
        if (data.skipped && Array.isArray(data.skipped) && data.skipped.length > 0) {
          // Show first few skipped items in the error
          const skippedPreview = data.skipped.slice(0, 3).join('; ')
          const moreCount = data.skipped.length > 3 ? ` (and ${data.skipped.length - 3} more)` : ''
          errorMsg += `. Details: ${skippedPreview}${moreCount}`
        }
        toast.error(errorMsg)
      }
    } catch (error: any) {
      console.error('Error generating invoices:', error)
      toast.error('An error occurred while generating invoices')
    } finally {
      setIsGeneratingInvoice(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading timesheets...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0 w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{isArchive ? 'Regular Timesheet Archive' : 'Timesheets'}</h1>
          </div>
        </div>
        <div className="flex space-x-3">
          {/* Batch action buttons - shown when items are selected */}
          {selectedTimesheets.size > 0 && (
            <div className="flex space-x-2 border-r pr-3 mr-3">
              {isArchive ? (
                <>
                  <button
                    onClick={handleMoveOutOfArchive}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
                  >
                    <span>Move out of archive ({selectedTimesheets.size})</span>
                  </button>
                  <button
                    onClick={handleGenerateInvoiceFromArchive}
                    disabled={isGeneratingInvoice || !canCreateInvoice}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>
                      {isGeneratingInvoice 
                        ? 'Generating...' 
                        : `Generate Invoice (${selectedTimesheets.size})`
                      }
                    </span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleMoveToArchive}
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center space-x-2"
                >
                  <span>Move to archive ({selectedTimesheets.size})</span>
                </button>
              )}
              <button
                onClick={handleClearSelection}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Clear selection
              </button>
            </div>
          )}
          {!isArchive && (
            <button
              onClick={handleGenerateInvoice}
              disabled={selectedTimesheets.size === 0 || isGeneratingInvoice || !canCreateInvoice}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              title={
                !canCreateInvoice 
                  ? 'Requires invoice creation permission' 
                  : selectedTimesheets.size === 0 
                    ? 'Please select at least one timesheet' 
                    : ''
              }
            >
              <FileText className="w-4 h-4" />
              <span>
                {isGeneratingInvoice 
                  ? 'Generating...' 
                  : `Generate Invoice${selectedTimesheets.size > 0 ? ` (${selectedTimesheets.size} selected)` : ''}`
                }
              </span>
            </button>
          )}
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
            href="/timesheets/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Timesheet</span>
          </Link>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by client or provider..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-md overflow-x-auto">
        <table className="w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                <input
                  type="checkbox"
                  checked={timesheets.length > 0 && timesheets.every(ts => selectedTimesheets.has(ts.id))}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CLIENT
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                PROVIDER
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                BCBA
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                START
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                END
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                HOURS
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                STATUS
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                ID / INVOICE
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[80px] flex-shrink-0">
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {timesheets.map((timesheet) => (
              <tr key={timesheet.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedTimesheets.has(timesheet.id)}
                    onChange={(e) => handleSelectTimesheet(timesheet.id, e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900 overflow-hidden text-ellipsis max-w-[150px]">
                  {timesheet.client.name}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 overflow-hidden text-ellipsis max-w-[150px]">
                  {timesheet.provider.name}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 overflow-hidden text-ellipsis max-w-[150px]">
                  {timesheet.bcba.name}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {formatDate(timesheet.startDate)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {formatDate(timesheet.endDate)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {calculateTotalHours(timesheet)}H
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                      timesheet.status
                    )}`}
                  >
                    {timesheet.status}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  <div className="flex flex-col gap-1">
                    {timesheet.timesheetNumber && (
                      <span className="font-mono text-xs">{timesheet.timesheetNumber}</span>
                    )}
                    {timesheet.invoice?.invoiceNumber ? (
                      <Link
                        href={`/invoices/${timesheet.invoiceId}`}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        {formatInvoiceNumberForDisplay(timesheet.invoice.invoiceNumber)}
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-xs">Unbilled</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs font-medium w-[80px] flex-shrink-0">
                  <RowActionsMenu>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/timesheets/${timesheet.id}`)
                          if (res.ok) {
                            const data = await res.json()
                            setPrintTimesheet(data)
                          }
                        } catch (error) {
                          toast.error('Failed to load timesheet')
                        }
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View
                    </button>
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        await handlePrintTimesheet(timesheet.id, 'regular')
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/timesheets/${timesheet.id}`)
                          if (res.ok) {
                            const data = await res.json()
                            const exportData = formatTimesheetForDetailedExport(data)
                            exportToCSV(exportData, `timesheet-${new Date().toISOString().split('T')[0]}`)
                            toast.success('Timesheet exported to CSV')
                          }
                        } catch (error) {
                          toast.error('Failed to export timesheet')
                        }
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Export CSV
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/timesheets/${timesheet.id}`)
                          if (res.ok) {
                            const data = await res.json()
                            const exportData = formatTimesheetForDetailedExport(data)
                            exportToExcel(exportData, `timesheet-${new Date().toISOString().split('T')[0]}`, 'Timesheet')
                            toast.success('Timesheet exported to Excel')
                          }
                        } catch (error) {
                          toast.error('Failed to export timesheet')
                        }
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Export Excel
                    </button>
                    {timesheet.status === 'DRAFT' && (
                      <Link
                        href={`/timesheets/${timesheet.id}/edit`}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px] no-underline"
                        style={{ color: '#374151' }}
                      >
                        <Edit className="w-4 h-4 mr-2" style={{ color: '#374151' }} />
                        <span style={{ color: '#374151' }}>Edit</span>
                      </Link>
                    )}
                    {timesheet.status === 'DRAFT' && (canApproveTimesheets || isAdmin) && (
                      <>
                        <button
                          onClick={() => handleApprove(timesheet.id)}
                          className="flex items-center w-full px-4 py-2 text-sm text-green-700 hover:bg-gray-100"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Approve
                        </button>
                        {(canRejectTimesheets || isAdmin) && (
                          <button
                            onClick={() => handleReject(timesheet.id)}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Reject
                          </button>
                        )}
                      </>
                    )}
                    {((canDeleteTimesheets || isAdmin) || (timesheet.status === 'DRAFT' && currentUserId && timesheet.userId === currentUserId)) && (
                      <button
                        onClick={() => handleDeleteClick(timesheet.id)}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 min-h-[44px]"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </button>
                    )}
                  </RowActionsMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {timesheets.length === 0 && (
          <div className="text-center py-12 text-gray-500">No timesheets found</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Rows per page:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value))
              setPage(1) // Reset to first page when changing rows per page
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {printTimesheet && (
        <TimesheetPrintPreview
          timesheet={printTimesheet}
          onClose={() => setPrintTimesheet(null)}
        />
      )}

      <ConfirmDeleteModal
        isOpen={deleteModalOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete timesheet?"
        message="This will permanently delete this timesheet. This action cannot be undone."
        isLoading={isDeleting}
      />
    </div>
  )
}
