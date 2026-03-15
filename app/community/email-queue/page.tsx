'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Check, X, Mail, Loader2, RefreshCw, Trash2, Paperclip, XCircle } from 'lucide-react'
import { DashboardNav } from '@/components/DashboardNav'
import { formatDateTime, formatRelativeTime, formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface QueuedItem {
  id: string
  entityType: 'COMMUNITY_INVOICE'
  entityId: string
  queuedAt: string
  sentAt: string | null
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED'
  errorMessage: string | null
  batchId: string | null
  toEmail: string | null // Recipient email(s) for Community Classes
  scheduledSendAt: string | null // Scheduled send time
  queuedBy: {
    id: string
    username: string
    email: string
  }
  invoice?: {
    id: string
    client: {
      firstName: string
      lastName: string
      medicaidId: string | null
    }
    class: {
      name: string
    }
    units: number
    totalAmount: number
    serviceDate: string | null
  } | null
}

export default function CommunityEmailQueuePage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [queueItems, setQueueItems] = useState<QueuedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [canViewQueue, setCanViewQueue] = useState(false)
  const [canSendBatch, setCanSendBatch] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [canAttachPdf, setCanAttachPdf] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [customEmail, setCustomEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [resending, setResending] = useState(false)
  const [showResendModal, setShowResendModal] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendingItemId, setResendingItemId] = useState<string | null>(null)
  const [scheduleSend, setScheduleSend] = useState(false)
  const [scheduledDateTime, setScheduledDateTime] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null)
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)

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
          data.permissions['community.invoices.emailqueue.view']?.canView === true ||
            session?.user?.role === 'SUPER_ADMIN' ||
            session?.user?.role === 'ADMIN'
        )
        setCanSendBatch(
          data.permissions['community.invoices.emailqueue.send']?.canCreate === true ||
            session?.user?.role === 'SUPER_ADMIN' ||
            session?.user?.role === 'ADMIN'
        )
        setCanDelete(
          data.permissions['community.invoices.emailqueue.delete']?.canDelete === true ||
            session?.user?.role === 'SUPER_ADMIN' ||
            session?.user?.role === 'ADMIN'
        )
        setCanAttachPdf(
          data.permissions['community.invoices.emailqueue.attachPdf']?.canCreate === true ||
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
      const res = await fetch('/api/community/email-queue')
      const data = await res.json()

      if (res.ok && data.ok !== false) {
        setQueueItems(data.items || [])
      } else {
        const errorMsg = data.message || data.error || `Failed to load email queue (${res.status})`
        toast.error(errorMsg)
        setQueueItems([])
      }
    } catch (error: any) {
      toast.error(`Network error: ${error.message || 'Failed to load email queue'}`)
      setQueueItems([])
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

  const handleDeleteItem = async (itemId: string) => {
    if (!canDelete) {
      toast.error('You do not have permission to delete queue items')
      return
    }

    if (!confirm('Remove this item from the email queue? This does not delete the invoice.')) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/community/email-queue/${itemId}/remove`, { method: 'DELETE' })
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
        toast.error(data.error || 'Failed to remove item from queue')
      }
    } catch (error) {
      console.error('Error removing from queue:', error)
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

    if (!confirm(`Remove ${selectedItems.size} selected item(s) from the email queue? This does not delete invoices.`)) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch('/api/community/email-queue/bulk-delete', {
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

  const handleResendItem = (itemId: string) => {
    if (!canSendBatch) {
      toast.error('You do not have permission to resend emails')
      return
    }

    // Find the item to get its current email
    const item = queueItems.find((i) => i.id === itemId)
    if (item) {
      setResendEmail(item.toEmail || '')
      setResendingItemId(itemId)
      setShowResendModal(true)
    }
  }

  const handleConfirmResend = async () => {
    if (!resendingItemId) {
      return
    }

    if (!resendEmail.trim()) {
      toast.error('Please enter an email address')
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const emails = resendEmail.split(',').map((e) => e.trim()).filter(Boolean)
    const invalidEmails = emails.filter((email) => !emailRegex.test(email))
    
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email address(es): ${invalidEmails.join(', ')}`)
      return
    }

    setShowResendModal(false)
    setResending(true)
    try {
      const res = await fetch('/api/community/email-queue/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          itemIds: [resendingItemId],
          recipients: emails.join(',')
        }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success('Email resent successfully')
        fetchQueueItems() // Refresh the list
        setResendEmail('')
        setResendingItemId(null)
      } else {
        toast.error(data.error || 'Failed to resend email')
      }
    } catch (error) {
      console.error('Error resending email:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setResending(false)
    }
  }

  const handleBulkResend = async () => {
    if (!canSendBatch) {
      toast.error('You do not have permission to resend emails')
      return
    }

    if (selectedItems.size === 0) {
      toast.error('Please select items to resend')
      return
    }

    const selectedFailed = queueItems.filter(
      (item) => selectedItems.has(item.id) && item.status === 'FAILED'
    )
    const selectedNonFailed = queueItems.filter(
      (item) => selectedItems.has(item.id) && item.status !== 'FAILED'
    )

    if (selectedNonFailed.length > 0) {
      toast.error('Only failed items can be resent. Please deselect non-failed items.')
      return
    }

    if (selectedFailed.length === 0) {
      toast.error('No failed items selected to resend')
      return
    }

    setResending(true)
    try {
      const res = await fetch('/api/community/email-queue/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: selectedFailed.map((item) => item.id) }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(`Successfully resent ${data.resentCount || selectedFailed.length} email(s)`)
        fetchQueueItems() // Refresh the list
        setSelectedItems(new Set())
      } else {
        toast.error(data.error || 'Failed to resend emails')
      }
    } catch (error) {
      console.error('Error resending emails:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setResending(false)
    }
  }

  const handleSendBatch = async () => {
    if (!canSendBatch) {
      toast.error('You do not have permission to send batch emails')
      return
    }

    const queuedItems = queueItems.filter((item) => item.status === 'QUEUED')
    if (queuedItems.length === 0) {
      toast.error('No items in the queue to send')
      return
    }

    // Show email modal (will send all queued items)
    setShowEmailModal(true)
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

    // Show email modal (will send only selected items)
    setShowEmailModal(true)
  }

  const handleAttachmentUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB')
      return
    }

    setUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/community/email-queue/attachment-upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (res.ok) {
        setAttachmentFile(file)
        setAttachmentKey(data.attachmentKey)
        setAttachmentFilename(data.attachmentFilename)
        toast.success('PDF attachment uploaded successfully')
      } else {
        toast.error(data.error || 'Failed to upload attachment')
      }
    } catch (error) {
      console.error('Error uploading attachment:', error)
      toast.error('An unexpected error occurred while uploading attachment')
    } finally {
      setUploadingAttachment(false)
    }
  }

  const handleRemoveAttachment = () => {
    setAttachmentFile(null)
    setAttachmentKey(null)
    setAttachmentFilename(null)
  }

  const handleConfirmSendBatch = async () => {
    // Validate recipients are required
    if (!customEmail.trim()) {
      toast.error('Recipient email address(es) are required')
      return
    }

    // Normalize recipients: allow comma/semicolon separated; trim; lowercase
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const emails = customEmail
      .split(/[,;]/) // Split by comma or semicolon
      .map((e) => e.trim().toLowerCase()) // Trim and lowercase
      .filter(Boolean)
    
    if (emails.length === 0) {
      toast.error('Please enter at least one valid email address')
      return
    }

    const invalidEmails = emails.filter((e) => !emailRegex.test(e))
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email address(es): ${invalidEmails.join(', ')}`)
      return
    }

    // Validate scheduled date-time if scheduling is enabled
    if (scheduleSend) {
      if (!scheduledDateTime) {
        toast.error('Please select a date and time for scheduled send')
        return
      }
      // datetime-local gives us a string like "2026-01-13T14:30" in local time
      // Create a Date object from it (will be interpreted as local time)
      const scheduledDate = new Date(scheduledDateTime)
      const now = new Date()
      // Allow scheduling at least 1 minute in the future to account for timezone differences
      const oneMinuteFromNow = new Date(now.getTime() + 60000)
      if (scheduledDate <= oneMinuteFromNow) {
        toast.error('Scheduled date and time must be at least 1 minute in the future')
        return
      }
    }

    setShowEmailModal(false)
    setSending(true)
    try {
      const requestBody: any = {
        recipients: emails, // User-entered recipients (required for Community)
        itemIds: selectedItems.size > 0 ? Array.from(selectedItems) : undefined,
      }
      
      if (scheduleSend && scheduledDateTime) {
        requestBody.scheduledSendAt = scheduledDateTime
      }

      // Include attachment if uploaded
      if (attachmentKey && attachmentFilename) {
        requestBody.attachmentKey = attachmentKey
        requestBody.attachmentFilename = attachmentFilename
      }

      const res = await fetch('/api/community/email-queue/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = await res.json()

      if (res.ok) {
        if (scheduleSend) {
          toast.success(
            `Email scheduled successfully! ${data.scheduledCount || 0} invoice(s) will be sent at ${new Date(scheduledDateTime).toLocaleString()}.`
          )
        } else {
          toast.success(
            `Batch email sent successfully! ${data.sentCount || 0} invoice(s) sent.`
          )
        }
        fetchQueueItems() // Refresh the list
        setSelectedItems(new Set())
        setCustomEmail('')
        setScheduleSend(false)
        setScheduledDateTime('')
        setAttachmentFile(null)
        setAttachmentKey(null)
        setAttachmentFilename(null)
      } else {
        toast.error(data.error || 'Failed to send/schedule batch email')
      }
    } catch (error) {
      console.error('Error sending batch email:', error)
      toast.error('An unexpected error occurred while sending batch email')
    } finally {
      setSending(false)
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
            <p className="text-gray-500">You do not have permission to view the community email queue.</p>
          </div>
        </div>
      </div>
    )
  }

  const queuedCount = queueItems.filter((item) => item.status === 'QUEUED').length
  const sendingCount = queueItems.filter((item) => item.status === 'SENDING').length
  const sentCount = queueItems.filter((item) => item.status === 'SENT').length
  const failedCount = queueItems.filter((item) => item.status === 'FAILED').length
  const selectedFailedCount = queueItems.filter(
    (item) => selectedItems.has(item.id) && item.status === 'FAILED'
  ).length

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav userRole={session.user.role} />
      <div className="p-6">
        <div className="mb-4">
          <Link
            href="/community"
            className="inline-flex items-center text-white hover:text-gray-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Community Classes
          </Link>
        </div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#000000' }}>Community Invoice Email Queue</h1>
            <p className="mt-2 text-sm email-queue-subheader" style={{ color: '#000000' }}>
              Manage community invoices queued for email approval
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchQueueItems}
              disabled={loading || sending}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            {canSendBatch && queuedCount > 0 && (
              <>
                <button
                  onClick={handleSendBatch}
                  disabled={sending || queuedCount === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>Send All Queued ({queuedCount})</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Queued</div>
            <div className="text-2xl font-bold text-cyan-600">{queuedCount}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Sending</div>
            <div className="text-2xl font-bold text-blue-600">{sendingCount}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Sent</div>
            <div className="text-2xl font-bold text-green-600">{sentCount}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-2xl font-bold text-red-600">{failedCount}</div>
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
                <>
                  {canAttachPdf && (
                    <>
                      <label className="px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 cursor-pointer disabled:opacity-50">
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          disabled={uploadingAttachment || sending || loading}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              handleAttachmentUpload(file)
                            }
                          }}
                        />
                        {uploadingAttachment ? (
                          <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                        ) : (
                          <Paperclip className="w-3 h-3 inline mr-1" />
                        )}
                        Attach PDF
                      </label>
                      {attachmentFile && (
                        <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded text-xs">
                          <span className="text-gray-700">{attachmentFilename}</span>
                          <button
                            onClick={handleRemoveAttachment}
                            className="text-red-600 hover:text-red-700"
                            type="button"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  <button
                    onClick={handleSendSelected}
                    disabled={sending || loading}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    Send Selected
                  </button>
                </>
              )}
              {canSendBatch && selectedFailedCount > 0 && (
                <button
                  onClick={handleBulkResend}
                  disabled={resending || loading}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-1"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Resending...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      <span>Resend Selected ({selectedFailedCount})</span>
                    </>
                  )}
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
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipient(s)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Queued At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sent At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                  </td>
                </tr>
              ) : queueItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                    No items in the queue
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.invoice
                        ? `${item.invoice.client.firstName} ${item.invoice.client.lastName}`
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.invoice?.class.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.invoice?.units || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.invoice ? formatCurrency(item.invoice.totalAmount) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {item.status === 'QUEUED' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-cyan-100 text-cyan-800">
                          Queued
                        </span>
                      )}
                      {item.status === 'SENDING' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Sending</span>
                        </span>
                      )}
                      {item.status === 'SENT' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 flex items-center space-x-1">
                          <Check className="w-3 h-3" />
                          <span>Sent</span>
                        </span>
                      )}
                      {item.status === 'FAILED' && (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 flex items-center space-x-1">
                          <X className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      )}
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatRelativeTime(item.queuedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.sentAt ? formatRelativeTime(item.sentAt) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate">
                      {item.errorMessage || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-2">
                        {item.status === 'FAILED' && canSendBatch && (
                          <button
                            onClick={() => handleResendItem(item.id)}
                            disabled={resending}
                            className="text-blue-600 hover:text-blue-800 flex items-center space-x-1 disabled:opacity-50"
                            title="Resend failed email"
                          >
                            {resending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                            <span>Resend</span>
                          </button>
                        )}
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Resend Modal */}
        {showResendModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Resend Email</h3>
                <div className="mb-4">
                  <label htmlFor="resend-email" className="block text-sm font-medium text-gray-700 mb-2">
                    Recipient Email Address(es) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="resend-email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="email@example.com (comma-separated for multiple)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Enter email address(es) separated by commas
                  </p>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowResendModal(false)
                      setResendEmail('')
                      setResendingItemId(null)
                    }}
                    disabled={resending}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmResend}
                    disabled={resending || !resendEmail.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Resending...</span>
                      </>
                    ) : (
                      <span>Resend</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Modal */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: '#000000' }}>
                {scheduleSend ? 'Schedule Email Send' : 'Send Email'}
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Enter one or more recipient email addresses separated by commas or semicolons.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient(s) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="email@example.com, another@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                required
                autoFocus
              />
              
              {/* Schedule Send Checkbox */}
              <div className="mb-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleSend}
                    onChange={(e) => {
                      setScheduleSend(e.target.checked)
                      if (!e.target.checked) {
                        setScheduledDateTime('')
                      }
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Schedule Send</span>
                </label>
              </div>

              {/* Date-Time Picker (shown when Schedule Send is checked) */}
              {scheduleSend && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scheduled Send Date & Time (Eastern Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    min={(() => {
                      // Get current local time in the format datetime-local expects (YYYY-MM-DDTHH:mm)
                      const now = new Date()
                      const year = now.getFullYear()
                      const month = String(now.getMonth() + 1).padStart(2, '0')
                      const day = String(now.getDate()).padStart(2, '0')
                      const hours = String(now.getHours()).padStart(2, '0')
                      const minutes = String(now.getMinutes()).padStart(2, '0')
                      return `${year}-${month}-${day}T${hours}:${minutes}`
                    })()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Select a date and time in Eastern Time to schedule the email send (minimum: current time)
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowEmailModal(false)
                    setCustomEmail('')
                    setScheduleSend(false)
                    setScheduledDateTime('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSendBatch}
                  disabled={sending || !customEmail.trim() || (scheduleSend && !scheduledDateTime)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : scheduleSend ? 'Schedule Email' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
