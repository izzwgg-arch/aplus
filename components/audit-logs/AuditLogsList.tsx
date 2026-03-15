'use client'

import { useState, useEffect, useCallback } from 'react'
import { subDays } from 'date-fns'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditLogUser {
  id: string
  email: string
  username: string
  role: string
}

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  userId: string
  createdAt: string
  oldValues: Record<string, any> | null
  newValues: Record<string, any> | null
  metadata: Record<string, any> | null
  summary: string
  user: AuditLogUser
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  LOGIN:                   { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Login' },
  USER_LOGIN:              { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Login' },
  CREATE:                  { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Create' },
  UPDATE:                  { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Update' },
  DELETE:                  { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Delete' },
  APPROVE:                 { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Approve' },
  REJECT:                  { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Reject' },
  GENERATE:                { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Generate' },
  PAYMENT:                 { bg: 'bg-teal-100',   text: 'text-teal-800',   label: 'Payment' },
  ADJUSTMENT:              { bg: 'bg-pink-100',   text: 'text-pink-800',   label: 'Adjustment' },
  QUEUE:                   { bg: 'bg-gray-100',   text: 'text-gray-800',   label: 'Queue' },
  EMAIL_SENT:              { bg: 'bg-cyan-100',   text: 'text-cyan-800',   label: 'Email Sent' },
  EMAIL_FAILED:            { bg: 'bg-red-200',    text: 'text-red-900',    label: 'Email Failed' },
  TIMESHEET_APPROVED:      { bg: 'bg-purple-100', text: 'text-purple-800', label: 'TS Approved' },
  TIMESHEET_REJECTED:      { bg: 'bg-orange-100', text: 'text-orange-800', label: 'TS Rejected' },
  BCBA_TIMESHEET_APPROVED: { bg: 'bg-purple-200', text: 'text-purple-900', label: 'BCBA Approved' },
  BCBA_TIMESHEET_REJECTED: { bg: 'bg-orange-200', text: 'text-orange-900', label: 'BCBA Rejected' },
  USER_PASSWORD_SET:       { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Password Set' },
}

const ENTITY_ICONS: Record<string, string> = {
  User: '👤',
  Timesheet: '📋',
  BCBATimesheet: '📄',
  Invoice: '💳',
  CommunityInvoice: '🏘️',
  EmailQueue: '📧',
  Role: '🔑',
  CLIENT: '👥',
  PROVIDER: '🩺',
}

function fmt(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  })
}

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_STYLES[action] || { bg: 'bg-gray-100', text: 'text-gray-700', label: action }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    SUPER_ADMIN: 'bg-red-100 text-red-800',
    ADMIN: 'bg-purple-100 text-purple-800',
    MANAGER: 'bg-blue-100 text-blue-800',
    USER: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[role] || 'bg-gray-100 text-gray-600'}`}>
      {role}
    </span>
  )
}

// ─── Value diff viewer ───────────────────────────────────────────────────────

function ValueDiff({ old: oldV, next: newV }: { old: any; next: any }) {
  if (!oldV && !newV) return null

  const allKeys = Array.from(new Set([
    ...Object.keys(oldV || {}),
    ...Object.keys(newV || {}),
  ])).filter(k => !['password', 'hash', 'salt', 'token', 'secret'].includes(k.toLowerCase()))

  if (allKeys.length === 0) return null

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-xs border border-gray-200 rounded">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-1/4">Field</th>
            {oldV && <th className="px-3 py-1.5 text-left font-medium text-red-600 w-2/5">Before</th>}
            {newV && <th className="px-3 py-1.5 text-left font-medium text-green-700 w-2/5">After</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {allKeys.map(key => {
            const before = oldV?.[key]
            const after  = newV?.[key]
            const changed = JSON.stringify(before) !== JSON.stringify(after)
            return (
              <tr key={key} className={changed ? 'bg-amber-50' : ''}>
                <td className="px-3 py-1.5 font-mono text-gray-700">{key}</td>
                {oldV && (
                  <td className="px-3 py-1.5 text-red-700 font-mono break-all max-w-xs">
                    {before === undefined ? '—' : typeof before === 'object'
                      ? JSON.stringify(before).substring(0, 100)
                      : String(before).substring(0, 100)}
                  </td>
                )}
                {newV && (
                  <td className="px-3 py-1.5 text-green-800 font-mono break-all max-w-xs">
                    {after === undefined ? '—' : typeof after === 'object'
                      ? JSON.stringify(after).substring(0, 100)
                      : String(after).substring(0, 100)}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Expanded row ────────────────────────────────────────────────────────────

function ExpandedRow({ log }: { log: AuditLog }) {
  const ipAddress = log.metadata?.ipAddress || log.metadata?.ip
  const userAgent = log.metadata?.userAgent
  const reason    = log.metadata?.reason || log.metadata?.action
  const usingTemp = log.metadata?.usingTempPassword

  return (
    <tr className="bg-indigo-50/30">
      <td colSpan={7} className="px-6 py-4 border-b border-indigo-100">
        <div className="max-w-4xl">
          {/* Identity strip */}
          <div className="flex flex-wrap gap-4 mb-3 text-sm">
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Record ID</span>
              <p className="font-mono text-gray-800 text-xs mt-0.5">{log.id}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Entity ID</span>
              <p className="font-mono text-gray-800 text-xs mt-0.5">{log.entityId}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">User ID</span>
              <p className="font-mono text-gray-800 text-xs mt-0.5">{log.userId}</p>
            </div>
            {ipAddress && (
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wide">IP Address</span>
                <p className="font-mono text-gray-800 text-xs mt-0.5">{ipAddress}</p>
              </div>
            )}
            {usingTemp && (
              <div className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium self-end">
                ⚠️ Used Temporary Password
              </div>
            )}
            {reason && (
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wide">Reason</span>
                <p className="text-gray-800 text-xs mt-0.5">{String(reason)}</p>
              </div>
            )}
          </div>

          {/* Value diff */}
          {(log.oldValues || log.newValues) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Changes</p>
              <ValueDiff old={log.oldValues} next={log.newValues} />
            </div>
          )}

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Metadata</p>
              <div className="bg-gray-900 text-green-300 text-xs rounded p-3 overflow-auto max-h-32 font-mono whitespace-pre-wrap">
                {JSON.stringify(log.metadata, null, 2)}
              </div>
            </div>
          )}

          {/* User agent */}
          {userAgent && (
            <p className="mt-2 text-xs text-gray-400 truncate">
              <span className="font-medium">Browser/Agent:</span> {userAgent}
            </p>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AuditLogsList() {
  const [logs, setLogs]         = useState<AuditLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [page, setPage]         = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal]       = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [actionFilter, setActionFilter]   = useState('')
  const [entityFilter, setEntityFilter]   = useState('')
  const [entityIdFilter, setEntityIdFilter] = useState('')
  const [userEmailFilter, setUserEmailFilter] = useState('')
  const [startDate, setStartDate] = useState<string>(
    subDays(new Date(), 30).toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10))

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const p = new URLSearchParams()
      p.set('page', String(page))
      p.set('limit', '50')
      if (actionFilter)    p.set('action', actionFilter)
      if (entityFilter)    p.set('entity', entityFilter)
      if (entityIdFilter)  p.set('entityId', entityIdFilter)
      if (userEmailFilter) p.set('userEmail', userEmailFilter)
      if (startDate) p.set('startDate', new Date(startDate).toISOString())
      if (endDate)   p.set('endDate', new Date(endDate).toISOString())

      const res = await fetch(`/api/audit-logs?${p.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setLogs(data.auditLogs)
      setTotalPages(data.totalPages)
      setTotal(data.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, entityFilter, entityIdFilter, userEmailFilter, startDate, endDate])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const resetFilters = () => {
    setActionFilter(''); setEntityFilter(''); setEntityIdFilter('')
    setUserEmailFilter('')
    setStartDate(subDays(new Date(), 30).toISOString().slice(0, 10))
    setEndDate(new Date().toISOString().slice(0, 10))
    setPage(1)
  }

  const toggleRow = (id: string) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="px-4 py-6 sm:px-0">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Complete activity record — logins, changes, approvals, and system events.
            {total > 0 && <span className="ml-2 font-medium text-gray-700">{total.toLocaleString()} entries</span>}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={fetchLogs}
            className="flex items-center space-x-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            <span>↻</span><span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick-filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: '🔐 Logins', action: 'LOGIN' },
          { label: '✅ Approvals', action: 'APPROVE' },
          { label: '❌ Rejections', action: 'REJECT' },
          { label: '🆕 Created', action: 'CREATE' },
          { label: '✏️ Updated', action: 'UPDATE' },
          { label: '🗑️ Deleted', action: 'DELETE' },
          { label: '💳 Payments', action: 'PAYMENT' },
          { label: '📧 Emails', action: 'EMAIL_SENT' },
        ].map(q => (
          <button
            key={q.action}
            onClick={() => { setActionFilter(q.action); setPage(1) }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              actionFilter === q.action
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {q.label}
          </button>
        ))}
        <button
          onClick={resetFilters}
          className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-500"
        >
          ↺ Reset
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">🔍 Filter Logs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Action</label>
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
              <option value="GENERATE">Generate</option>
              <option value="PAYMENT">Payment</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="QUEUE">Queue</option>
              <option value="EMAIL_SENT">Email Sent</option>
              <option value="EMAIL_FAILED">Email Failed</option>
              <option value="TIMESHEET_APPROVED">TS Approved</option>
              <option value="TIMESHEET_REJECTED">TS Rejected</option>
              <option value="BCBA_TIMESHEET_APPROVED">BCBA Approved</option>
              <option value="USER_PASSWORD_SET">Password Set</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Record Type</label>
            <select
              value={entityFilter}
              onChange={e => { setEntityFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="User">User</option>
              <option value="Timesheet">Timesheet</option>
              <option value="BCBATimesheet">BCBA Timesheet</option>
              <option value="Invoice">Invoice</option>
              <option value="CommunityInvoice">Community Invoice</option>
              <option value="EmailQueue">Email Queue</option>
              <option value="Role">Role</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">User / Email</label>
            <input
              type="text"
              placeholder="Search by email..."
              value={userEmailFilter}
              onChange={e => { setUserEmailFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Record ID</label>
            <input
              type="text"
              placeholder="Entity ID..."
              value={entityIdFilter}
              onChange={e => { setEntityIdFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 font-medium">No audit logs found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Record Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Record ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Summary
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id
                    const hasDetail = log.oldValues || log.newValues || log.metadata
                    const isLogin = log.action === 'LOGIN' || log.action === 'USER_LOGIN'
                    const icon = ENTITY_ICONS[log.entityType] || '📁'

                    return (
                      <>
                        <tr
                          key={log.id}
                          className={`transition-colors ${
                            isLogin ? 'bg-blue-50/20' :
                            log.action === 'DELETE' ? 'bg-red-50/20' :
                            log.action.includes('FAIL') ? 'bg-red-50/30' :
                            isExpanded ? 'bg-indigo-50/30' : 'hover:bg-gray-50'
                          }`}
                        >
                          {/* Timestamp */}
                          <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                            {fmt(log.createdAt)}
                          </td>

                          {/* Action */}
                          <td className="px-6 py-3 whitespace-nowrap">
                            <ActionBadge action={log.action} />
                          </td>

                          {/* Entity Type */}
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                            <span className="mr-1">{icon}</span>
                            {log.entityType}
                          </td>

                          {/* Entity ID */}
                          <td className="px-6 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                            <span title={log.entityId}>{log.entityId.substring(0, 12)}…</span>
                          </td>

                          {/* User */}
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div>
                              <p className="text-sm text-gray-900 font-medium">{log.user?.email || 'system'}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {log.user?.username && (
                                  <span className="text-xs text-gray-400">@{log.user.username}</span>
                                )}
                                {log.user?.role && <RoleBadge role={log.user.role} />}
                              </div>
                            </div>
                          </td>

                          {/* Summary */}
                          <td className="px-6 py-3 text-sm text-gray-600 max-w-xs">
                            <p className="truncate" title={log.summary}>{log.summary || '—'}</p>
                            {isLogin && log.metadata?.usingTempPassword && (
                              <span className="text-xs text-yellow-600 font-medium">⚠️ Temp password</span>
                            )}
                            {log.action === 'EMAIL_FAILED' && (
                              <span className="text-xs text-red-600 font-medium">⚠️ Delivery failed</span>
                            )}
                          </td>

                          {/* Expand */}
                          <td className="px-6 py-3 whitespace-nowrap">
                            {hasDetail ? (
                              <button
                                onClick={() => toggleRow(log.id)}
                                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                  isExpanded
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                }`}
                              >
                                <span>{isExpanded ? '▲' : '▼'}</span>
                                <span>{isExpanded ? 'Hide' : 'View'}</span>
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && <ExpandedRow key={`${log.id}-detail`} log={log} />}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                Page <span className="font-semibold">{page}</span> of{' '}
                <span className="font-semibold">{totalPages}</span>{' '}
                <span className="text-gray-400">({total.toLocaleString()} total entries)</span>
              </p>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-40"
                >
                  «
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-40"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 text-sm border rounded ${
                        p === page
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-300 hover:bg-white'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-40"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-40"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400 text-center">
        This log is visible to Admin users only. Click "View" on any row to see full change details.
      </p>
    </div>
  )
}
