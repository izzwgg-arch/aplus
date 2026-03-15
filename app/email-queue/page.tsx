'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Check, X, Mail, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { DashboardNav } from '@/components/DashboardNav'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'

interface QueuedItem {
  id: string
  entityType: 'REGULAR' | 'BCBA'
  entityId: string
  queuedAt: string
  sentAt: string | null
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED'
  errorMessage: string | null
  batchId: string | null
  toEmail: string | null
  subject: string | null
  attempts: number
  lastError: string | null
  queuedBy: {
    id: string
    username: string
    email: string
  }
  timesheet?: {
    id: string
    client: { name: string }
    provider: { name: string }
    bcba: { name: string }
    startDate: string
    endDate: string
    totalHours: number
    serviceType?: string
    sessionData?: string
  } | null
}

export default function EmailQueuePage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [queueItems, setQueueItems] = useState<QueuedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [canViewQueue, setCanViewQueue] = useState(false)
  const [canSendBatch, setCanSendBatch] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (sessionStatus === 'loading') return

    if (sessionStatus === 'unauthenticated') {
      router.replace('/login')
      return
    }

    if (session) {
      fetchPermissions()
      fetchQueueItems()
    }
  }, [sessionStatus, session, router])

  const fetchPermissions = async () => {
    try {
      const res = await fetch('/api/user/permissions')
      const data = await res.json()
      if (data?.permissions) {
        setCanViewQueue(
          data.permissions['emailQueue.view']?.canView === true ||
            session?.user?.role === 'SUPER_ADMIN' ||
            session?.user?.role === 'ADMIN'
        )
        setCanSendBatch(
          data.permissions['emailQueue.sendBatch']?.canCreate === true ||
            session?.user?.role === 'SUPER_ADMIN' ||
            session?.user?.role === 'ADMIN'
        )
        setCanDelete(
          data.permissions['emailQueue.delete']?.canDelete === true ||
            session?.user?.role === 'SUPER_ADMIN' ||
            session?.user?.role === 'ADMIN'
        )
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
      toast.error('Failed to load permissions')
    }
  }

  const fetchQueueItems = async () => {
    setLoading(true)
    try {
      const url = '/api/email-queue'
      console.log('[EMAIL QUEUE] Request:', { url, method: 'GET' })
      
      const res = await fetch(url)
      const data = await res.json()
      
      console.log('[EMAIL QUEUE] Response:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        data,
      })
      
      if (res.ok && data.ok !== false) {
        setQueueItems(data.items || [])
      } else {
        const errorMsg = data.message || data.error || `Failed to load email queue (${res.status})`
        console.error('[EMAIL QUEUE] Error:', { status: res.status, code: data.code, message: data.message, details: data.details })
        toast.error(errorMsg)
        setQueueItems([]) // Set empty array on error to prevent UI issues
      }
    } catch (error: any) {
      console.error('[EMAIL QUEUE] Request failed:', {
        url: '/api/email-queue',
        error: error.message,
        stack: error.stack,
      })
      toast.error(`Network error: ${error.message || 'Failed to load email queue'}`)
      setQueueItems([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSelect = (itemId: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  const handleSelectAll = () => {
    const visibleItemIds = queueItems.map((item) => item.id)
    if (visibleItemIds.every((id) => selectedItems.has(id))) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(visibleItemIds))
    }
  }

  const handleSendBatch = async () => {
    if (!canSendBatch) {
      toast.error('You do not have permission to send batch emails')
      return
    }

    const queuedCount = queueItems.filter((item) => item.status === 'QUEUED').length
    if (queuedCount === 0) {
      toast.error('No items in the queue to send')
      return
    }

    if (!confirm(`Are you sure you want to send all ${queuedCount} queued timesheet(s) in a single batch email?`)) {
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/email-queue/send-batch', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        toast.success(
          `Batch email sent successfully! ${data.sentCount || 0} timesheet(s) sent.`
        )
        fetchQueueItems() // Refresh the list
        setSelectedItems(new Set())
      } else {
        toast.error(data.error || 'Failed to send batch email')
      }
    } catch (error) {
      console.error('Error sending batch email:', error)
      toast.error('An unexpected error occurred while sending batch email')
    } finally {
      setSending(false)
    }
  }

  const handleSendSelected = async () => {
    if (!canSendBatch) {
      toast.error('You do not have permission to send batch emails')
      return
    }

    if (selectedItems.size === 0) {
      toast.error('Please select items to send')
      return
    }

    const selectedQueued = queueItems.filter(
      (item) => selectedItems.has(item.id) && item.status === 'QUEUED'
    )
    const selectedNonQueued = queueItems.filter(
      (item) => selectedItems.has(item.id) && item.status !== 'QUEUED'
    )

    if (selectedNonQueued.length > 0) {
      toast.error('Only queued items can be sent. Please deselect non-queued items.')
      return
    }

    if (selectedQueued.length === 0) {
      toast.error('No queued items selected to send')
      return
    }

    if (!confirm(`Are you sure you want to send ${selectedQueued.length} selected timesheet(s) in a batch email?`)) {
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/email-queue/send-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(
          `Batch email sent successfully! ${data.sentCount || 0} timesheet(s) sent.`
        )
        fetchQueueItems() // Refresh the list
        setSelectedItems(new Set())
      } else {
        toast.error(data.error || 'Failed to send batch email')
      }
    } catch (error) {
      console.error('Error sending batch email:', error)
      toast.error('An unexpected error occurred while sending batch email')
    } finally {
      setSending(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!canDelete) {
      toast.error('You do not have permission to delete queue items')
      return
    }

    if (!confirm('Remove this item from the email queue? This does not delete the invoice/timesheet.')) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/email-queue/${itemId}`, { method: 'DELETE' })
      const data = await res.json()

      if (res.ok) {
        toast.success('Item removed from queue')
        fetchQueueItems() // Refresh the list
        setSelectedItems((prev) => {
          const newSet = new Set(prev)
          newSet.delete(itemId)
          return newSet
        })
      } else {
        toast.error(data.error || 'Failed to delete item')
      }
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!canDelete) {
      toast.error('You do not have permission to delete queue items')
      return
    }

    if (selectedItems.size === 0) {
      toast.error('Please select items to delete')
      return
    }

    if (!confirm(`Remove ${selectedItems.size} selected item(s) from the email queue? This does not delete invoices/timesheets.`)) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch('/api/email-queue/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(`${data.deletedCount || selectedItems.size} item(s) removed from queue`)
        fetchQueueItems() // Refresh the list
        setSelectedItems(new Set())
      } else {
        toast.error(data.error || 'Failed to delete items')
      }
    } catch (error) {
      console.error('Error deleting items:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setDeleting(false)
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session || !canViewQueue) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav userRole={session?.user?.role || 'USER'} />
        <div className="p-6">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">You do not have permission to view the email queue.</p>
          </div>
        </div>
      </div>
    )
  }

  const queuedCount = queueItems.filter((item) => item.status === 'QUEUED').length
  const sendingCount = queueItems.filter((item) => item.status === 'SENDING').length
  const sentCount = queueItems.filter((item) => item.status === 'SENT').length
  const failedCount = queueItems.filter((item) => item.status === 'FAILED').length

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav userRole={session.user.role} />
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#000000' }}>Email Queue</h1>
            <p className="mt-2 text-sm email-queue-subheader" style={{ color: '#000000' }}>
              Manage timesheets queued for email approval
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchQueueItems}
              disabled={loading || sending}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {queuedCount > 0 && canSendBatch && (
              <>
                <button
                  onClick={handleSendBatch}
                  disabled={sending || loading}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send All Queued ({queuedCount})
                    </>
                  )}
                </button>
                {selectedItems.size > 0 && (
                  <button
                    onClick={handleSendSelected}
                    disabled={sending || loading}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Send Selected ({selectedItems.size})
                  </button>
                )}
              </>
            )}
            {canDelete && selectedItems.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleting || loading}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Selected ({selectedItems.size})
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-sm font-medium text-blue-700">Queued</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{queuedCount}</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-sm font-medium text-yellow-700">Sending</div>
            <div className="text-2xl font-bold text-yellow-900 mt-1">{sendingCount}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-sm font-medium text-green-700">Sent</div>
            <div className="text-2xl font-bold text-green-900 mt-1">{sentCount}</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="text-sm font-medium text-red-700">Failed</div>
            <div className="text-2xl font-bold text-red-900 mt-1">{failedCount}</div>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {selectedItems.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              {canSendBatch && (
                <button
                  onClick={handleSendSelected}
                  disabled={sending || loading}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  Send Selected
                </button>
              )}
              {canDelete && (
                <button
                  onClick={handleBulkDelete}
                  disabled={deleting || loading}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  Delete Selected
                </button>
              )}
              <button
                onClick={() => setSelectedItems(new Set())}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Queue Items Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={queueItems.length > 0 && queueItems.every((item) => selectedItems.has(item.id))}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hours
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Queued At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Batch ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    <p className="mt-2">Loading queue...</p>
                  </td>
                </tr>
              ) : queueItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-gray-500">
                    No items in queue
                  </td>
                </tr>
              ) : (
                queueItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          item.entityType === 'BCBA'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.entityType === 'BCBA' ? 'BCBA' : 'Regular'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.timesheet?.client?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.timesheet?.provider?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.timesheet ? (
                        <>
                          {new Date(item.timesheet.startDate).toLocaleDateString()} -{' '}
                          {new Date(item.timesheet.endDate).toLocaleDateString()}
                        </>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.timesheet?.totalHours?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" title={formatDateTime(item.queuedAt)}>
                      {formatRelativeTime(item.queuedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          item.status === 'SENT'
                            ? 'bg-green-100 text-green-800'
                            : item.status === 'FAILED'
                            ? 'bg-red-100 text-red-800'
                            : item.status === 'SENDING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-xs truncate" title={item.toEmail || undefined}>
                      {item.toEmail ? (
                        <span className="text-xs">{item.toEmail.split(',').map((email, idx) => (
                          <span key={idx}>
                            {email.trim()}
                            {idx < item.toEmail!.split(',').length - 1 && <br />}
                          </span>
                        ))}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500 max-w-xs truncate" title={item.errorMessage || item.lastError || undefined}>
                      {item.errorMessage || item.lastError || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs">
                      {item.batchId || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deleting}
                          className="text-red-600 hover:text-red-800 flex items-center space-x-1 disabled:opacity-50"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
