'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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

// ─── Styling maps ───────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  LOGIN:                   { bg: 'bg-blue-100',    text: 'text-blue-800',    label: '🔐 Login' },
  USER_LOGIN:              { bg: 'bg-blue-100',    text: 'text-blue-800',    label: '🔐 Login' },
  CREATE:                  { bg: 'bg-green-100',   text: 'text-green-800',   label: '🆕 Create' },
  UPDATE:                  { bg: 'bg-indigo-100',  text: 'text-indigo-800',  label: '✏️ Update' },
  DELETE:                  { bg: 'bg-red-100',     text: 'text-red-800',     label: '🗑️ Delete' },
  APPROVE:                 { bg: 'bg-purple-100',  text: 'text-purple-800',  label: '✅ Approve' },
  REJECT:                  { bg: 'bg-orange-100',  text: 'text-orange-800',  label: '❌ Reject' },
  GENERATE:                { bg: 'bg-yellow-100',  text: 'text-yellow-800',  label: '📄 Generate' },
  PAYMENT:                 { bg: 'bg-teal-100',    text: 'text-teal-800',    label: '💳 Payment' },
  ADJUSTMENT:              { bg: 'bg-pink-100',    text: 'text-pink-800',    label: '⚖️ Adjust' },
  QUEUE:                   { bg: 'bg-gray-100',    text: 'text-gray-700',    label: '📬 Queue' },
  EMAIL_SENT:              { bg: 'bg-cyan-100',    text: 'text-cyan-800',    label: '📧 Email Sent' },
  EMAIL_FAILED:            { bg: 'bg-red-200',     text: 'text-red-900',     label: '⚠️ Email Failed' },
  TIMESHEET_APPROVED:      { bg: 'bg-purple-100',  text: 'text-purple-800',  label: '✅ TS Approved' },
  TIMESHEET_REJECTED:      { bg: 'bg-orange-100',  text: 'text-orange-800',  label: '❌ TS Rejected' },
  BCBA_TIMESHEET_APPROVED: { bg: 'bg-purple-200',  text: 'text-purple-900',  label: '✅ BCBA Approved' },
  BCBA_TIMESHEET_REJECTED: { bg: 'bg-orange-200',  text: 'text-orange-900',  label: '❌ BCBA Rejected' },
  USER_PASSWORD_SET:       { bg: 'bg-yellow-100',  text: 'text-yellow-800',  label: '🔑 Password Set' },
}

const ENTITY_ICONS: Record<string, string> = {
  User: '👤', Timesheet: '📋', BCBATimesheet: '📄',
  Invoice: '💳', CommunityInvoice: '🏘️', EmailQueue: '📧',
  Role: '🔑', CLIENT: '👥', PROVIDER: '🩺',
}

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-800',
  ADMIN:       'bg-purple-100 text-purple-800',
  MANAGER:     'bg-blue-100 text-blue-800',
  CUSTOM:      'bg-orange-100 text-orange-700',
  USER:        'bg-gray-100 text-gray-600',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })
}

/** Build a human-readable summary from audit log fields */
function buildSummary(log: AuditLog): string {
  const m = log.metadata || {}
  const n = log.newValues || {}
  const o = log.oldValues || {}

  switch (log.action) {
    case 'LOGIN':
    case 'USER_LOGIN':
      return `Logged in${m.usingTempPassword ? ' using temporary password' : ''}`

    case 'EMAIL_SENT': {
      const subj = m.subject || ''
      const recip = m.recipients ? ` to ${m.recipients} recipient${m.recipients !== 1 ? 's' : ''}` : ''
      const client = m.clientName ? ` — ${m.clientName}` : ''
      const batch = m.sentCount ? ` (batch: ${m.sentCount} sent)` : ''
      return `Email sent${recip}${client}${batch}${subj ? ` | "${subj}"` : ''}`
    }

    case 'EMAIL_FAILED':
      return `Email delivery failed${m.error ? `: ${String(m.error).substring(0, 60)}` : ''}`

    case 'QUEUE': {
      const client = n.clientName || m.clientName || ''
      const provider = n.providerName || m.providerName || ''
      if (client && provider) return `Queued for email — ${client} (${provider})`
      if (client) return `Queued for email — ${client}`
      return `Queued ${log.entityType} for email`
    }

    case 'TIMESHEET_APPROVED':
    case 'APPROVE': {
      const client = n.clientName || m.clientName || ''
      const provider = n.providerName || m.providerName || ''
      if (client && provider) return `Approved — ${client} (${provider})`
      if (client) return `Approved — ${client}`
      return `Approved ${log.entityType}`
    }

    case 'TIMESHEET_REJECTED':
    case 'BCBA_TIMESHEET_REJECTED':
    case 'REJECT':
      return `Rejected${n.reason ? `: ${n.reason}` : ` ${log.entityType}`}`

    case 'BCBA_TIMESHEET_APPROVED': {
      const client = n.clientName || m.clientName || ''
      return `BCBA timesheet approved${client ? ` — ${client}` : ''}`
    }

    case 'CREATE':
      return `Created ${log.entityType}${n.email ? ` (${n.email})` : n.name ? ` (${n.name})` : ''}`

    case 'UPDATE': {
      const changed = Object.keys(n).filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && !['updatedAt'].includes(k))
      return changed.length ? `Updated: ${changed.slice(0, 4).join(', ')}` : `Updated ${log.entityType}`
    }

    case 'DELETE':
      return `Deleted ${log.entityType}${o.email ? ` (${o.email})` : ''}`

    case 'PAYMENT': {
      const amt = n.amount || m.amount
      return `Payment recorded${amt ? ` — $${amt}` : ''}`
    }

    case 'ADJUSTMENT':
      return `Adjustment recorded${n.reason ? `: ${n.reason}` : ''}`

    case 'GENERATE':
      return `Generated ${log.entityType}${n.type ? ` (${n.type})` : ''}`

    case 'USER_PASSWORD_SET':
      return `Password set/reset for user`

    default:
      if (Object.keys(m).length) {
        const keys = Object.keys(m).filter(k => !['timestamp'].includes(k))
        return keys.slice(0, 2).map(k => `${k}: ${String(m[k]).substring(0, 40)}`).join(' | ')
      }
      return `${log.action} on ${log.entityType}`
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const s = ACTION_STYLES[action] || { bg: 'bg-gray-100', text: 'text-gray-700', label: action }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function ValueDiff({ old: o, next: n }: { old: any; next: any }) {
  const HIDDEN = new Set(['password','hash','salt','token','secret','tempPasswordHash'])
  const keys = Array.from(new Set([...Object.keys(o || {}), ...Object.keys(n || {})]))
    .filter(k => !HIDDEN.has(k.toLowerCase()))
  if (!keys.length) return null
  return (
    <table className="min-w-full text-xs border border-gray-200 rounded mt-2">
      <thead>
        <tr className="bg-gray-50">
          <th className="px-3 py-1.5 text-left text-gray-500 w-1/4">Field</th>
          {o && <th className="px-3 py-1.5 text-left text-red-600">Before</th>}
          {n && <th className="px-3 py-1.5 text-left text-green-700">After</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {keys.map(k => {
          const before = o?.[k], after = n?.[k]
          const changed = JSON.stringify(before) !== JSON.stringify(after)
          const fmt = (v: any) => v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0,120) : String(v).slice(0,120)
          return (
            <tr key={k} className={changed ? 'bg-amber-50' : ''}>
              <td className="px-3 py-1 font-mono text-gray-700">{k}</td>
              {o && <td className="px-3 py-1 text-red-700 font-mono break-all">{fmt(before)}</td>}
              {n && <td className="px-3 py-1 text-green-800 font-mono break-all">{fmt(after)}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ExpandedRow({ log }: { log: AuditLog }) {
  const m = log.metadata || {}
  return (
    <tr className="bg-indigo-50/30">
      <td colSpan={7} className="px-6 py-4 border-b border-indigo-100">
        <div className="max-w-4xl space-y-3">

          {/* IDs strip */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div><p className="text-gray-400 uppercase tracking-wide mb-0.5">Log ID</p><p className="font-mono text-gray-700">{log.id}</p></div>
            <div><p className="text-gray-400 uppercase tracking-wide mb-0.5">Entity ID</p><p className="font-mono text-gray-700">{log.entityId}</p></div>
            <div><p className="text-gray-400 uppercase tracking-wide mb-0.5">User ID</p><p className="font-mono text-gray-700">{log.userId}</p></div>
            {m.ipAddress && <div><p className="text-gray-400 uppercase tracking-wide mb-0.5">IP Address</p><p className="font-mono text-blue-700">{m.ipAddress}</p></div>}
            {m.usingTempPassword && (
              <div className="self-end bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                ⚠️ Used temporary password
              </div>
            )}
          </div>

          {/* Email details */}
          {(log.action === 'EMAIL_SENT' || log.action === 'EMAIL_FAILED') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold text-blue-800 mb-1">📧 Email Details</p>
              {m.subject    && <p><span className="text-gray-500">Subject:</span> <span className="text-gray-900">{m.subject}</span></p>}
              {m.recipients && <p><span className="text-gray-500">Recipients:</span> <span className="text-gray-900">{m.recipients}</span></p>}
              {m.clientName && <p><span className="text-gray-500">Client:</span> <span className="text-gray-900">{m.clientName}</span></p>}
              {m.messageId  && <p><span className="text-gray-500">Message ID:</span> <span className="font-mono text-gray-700">{m.messageId}</span></p>}
              {m.sentCount  && <p><span className="text-gray-500">Batch total sent:</span> <span className="text-gray-900">{m.sentCount}</span></p>}
              {m.batchDate  && <p><span className="text-gray-500">Batch date:</span> <span className="text-gray-900">{m.batchDate}</span></p>}
              {m.error      && <p><span className="text-gray-500">Error:</span> <span className="text-red-700">{m.error}</span></p>}
            </div>
          )}

          {/* Change diff */}
          {(log.oldValues || log.newValues) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Changes</p>
              <ValueDiff old={log.oldValues} next={log.newValues} />
            </div>
          )}

          {/* Queue / approval detail */}
          {log.action === 'QUEUE' && log.newValues && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs">
              <p className="font-semibold text-gray-700 mb-1">Queued Item Details</p>
              {Object.entries(log.newValues).map(([k, v]) => (
                <p key={k}><span className="text-gray-400">{k}:</span> <span className="text-gray-800">{String(v)}</span></p>
              ))}
            </div>
          )}

          {/* Full metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Metadata</p>
              <pre className="bg-gray-900 text-green-300 text-xs rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AuditLogsList() {
  const [logs, setLogs]             = useState<AuditLog[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [page, setPage]             = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal]           = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters — no default date restriction so everything shows
  const [actionFilter, setActionFilter]     = useState('')
  const [entityFilter, setEntityFilter]     = useState('')
  const [entityIdFilter, setEntityIdFilter] = useState('')
  const [userEmailFilter, setUserEmailFilter] = useState('')
  const [startDate, setStartDate]           = useState('')
  const [endDate, setEndDate]               = useState('')

  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const p = new URLSearchParams()
      p.set('page', String(page))
      p.set('limit', '100')
      if (actionFilter)    p.set('action', actionFilter)
      if (entityFilter)    p.set('entity', entityFilter)
      if (entityIdFilter)  p.set('entityId', entityIdFilter)
      if (userEmailFilter) p.set('userEmail', userEmailFilter)
      if (startDate) p.set('startDate', startDate)
      if (endDate)   p.set('endDate', endDate)

      const res = await fetch(`/api/audit-logs?${p.toString()}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
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

  // Debounced user email input
  const handleEmailInput = (v: string) => {
    setUserEmailFilter(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPage(1), 400)
  }

  const resetAll = () => {
    setActionFilter(''); setEntityFilter(''); setEntityIdFilter('')
    setUserEmailFilter(''); setStartDate(''); setEndDate('')
    setPage(1)
  }

  const toggleRow = (id: string) => setExpandedId(p => p === id ? null : id)

  const setQuickAction = (a: string) => {
    setActionFilter(a); setPage(1)
  }

  const setLast = (days: number) => {
    const from = new Date(Date.now() - days * 86400000)
    setStartDate(from.toISOString().split('T')[0])
    setEndDate('')
    setPage(1)
  }

  return (
    <div className="px-4 py-6 sm:px-0">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every login, action, change, and system event — admin eyes only.
            {total > 0 && (
              <span className="ml-2 font-semibold text-indigo-700">{total.toLocaleString()} entries found</span>
            )}
          </p>
        </div>
        <button onClick={fetchLogs}
          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm">
          ↻ Refresh
        </button>
      </div>

      {/* Quick-action pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: '🔐 Logins',     action: 'LOGIN' },
          { label: '✅ Approvals',  action: 'APPROVE' },
          { label: '❌ Rejections', action: 'REJECT' },
          { label: '🆕 Created',    action: 'CREATE' },
          { label: '✏️ Updated',    action: 'UPDATE' },
          { label: '🗑️ Deleted',   action: 'DELETE' },
          { label: '💳 Payments',   action: 'PAYMENT' },
          { label: '📧 Emails',     action: 'EMAIL_SENT' },
          { label: '📬 Queued',     action: 'QUEUE' },
          { label: '⚠️ Failed',     action: 'EMAIL_FAILED' },
        ].map(q => (
          <button key={q.action}
            onClick={() => setQuickAction(q.action)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              actionFilter === q.action
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}>
            {q.label}
          </button>
        ))}
        {/* Date shortcuts */}
        {['1d','7d','30d','90d'].map(d => (
          <button key={d}
            onClick={() => setLast(parseInt(d))}
            className="px-3 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 hover:bg-gray-50 text-gray-500">
            Last {d}
          </button>
        ))}
        <button onClick={resetAll}
          className="px-3 py-1 rounded-full text-xs font-medium bg-red-50 border border-red-200 hover:bg-red-100 text-red-600">
          ↺ Clear All
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-5 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Action</label>
            <select value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
              <option value="">All Actions</option>
              <option value="LOGIN">🔐 Login</option>
              <option value="CREATE">🆕 Create</option>
              <option value="UPDATE">✏️ Update</option>
              <option value="DELETE">🗑️ Delete</option>
              <option value="APPROVE">✅ Approve</option>
              <option value="REJECT">❌ Reject</option>
              <option value="TIMESHEET_APPROVED">✅ TS Approved</option>
              <option value="TIMESHEET_REJECTED">❌ TS Rejected</option>
              <option value="BCBA_TIMESHEET_APPROVED">✅ BCBA Approved</option>
              <option value="GENERATE">📄 Generate</option>
              <option value="PAYMENT">💳 Payment</option>
              <option value="ADJUSTMENT">⚖️ Adjustment</option>
              <option value="QUEUE">📬 Queue</option>
              <option value="EMAIL_SENT">📧 Email Sent</option>
              <option value="EMAIL_FAILED">⚠️ Email Failed</option>
              <option value="USER_PASSWORD_SET">🔑 Password Set</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Record Type</label>
            <select value={entityFilter}
              onChange={e => { setEntityFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
              <option value="">All Types</option>
              <option value="User">👤 User</option>
              <option value="Timesheet">📋 Timesheet</option>
              <option value="BCBATimesheet">📄 BCBA Timesheet</option>
              <option value="Invoice">💳 Invoice</option>
              <option value="CommunityInvoice">🏘️ Community Invoice</option>
              <option value="EmailQueue">📧 Email Queue</option>
              <option value="Role">🔑 Role</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Search by User / Email</label>
            <input type="text" placeholder="e.g. esti, jacobw, admin..."
              value={userEmailFilter}
              onChange={e => handleEmailInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">Record ID</label>
            <input type="text" placeholder="Paste entity ID..."
              value={entityIdFilter}
              onChange={e => { setEntityIdFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">From Date</label>
            <input type="date" value={startDate}
              onChange={e => { setStartDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">To Date</label>
            <input type="date" value={endDate}
              onChange={e => { setEndDate(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Active filter indicators */}
        {(actionFilter || entityFilter || userEmailFilter || entityIdFilter || startDate || endDate) && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Active filters:</span>
            {actionFilter    && <Chip label={`Action: ${actionFilter}`}    onRemove={() => setActionFilter('')} />}
            {entityFilter    && <Chip label={`Type: ${entityFilter}`}      onRemove={() => setEntityFilter('')} />}
            {userEmailFilter && <Chip label={`User: ${userEmailFilter}`}   onRemove={() => setUserEmailFilter('')} />}
            {entityIdFilter  && <Chip label={`ID: ${entityIdFilter.slice(0,12)}…`} onRemove={() => setEntityIdFilter('')} />}
            {startDate       && <Chip label={`From: ${startDate}`}         onRemove={() => setStartDate('')} />}
            {endDate         && <Chip label={`To: ${endDate}`}             onRemove={() => setEndDate('')} />}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-11 bg-gray-100 rounded animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-14 text-center">
            <p className="text-5xl mb-3">📋</p>
            <p className="text-gray-600 font-semibold text-lg">No records found</p>
            <p className="text-sm text-gray-400 mt-1">Try clearing the date filters or checking a different action type</p>
            <button onClick={resetAll} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
              ↺ Clear all filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Timestamp</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Summary</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Record ID</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Detail</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id
                    const hasDetail  = !!(log.oldValues || log.newValues || log.metadata)
                    const isLogin    = log.action === 'LOGIN' || log.action === 'USER_LOGIN'
                    const isDelete   = log.action === 'DELETE'
                    const isFailure  = log.action === 'EMAIL_FAILED'
                    const icon       = ENTITY_ICONS[log.entityType] || '📁'
                    const summary    = buildSummary(log)

                    return (
                      <>
                        <tr key={log.id}
                          className={`transition-colors ${
                            isLogin   ? 'bg-blue-50/30' :
                            isFailure ? 'bg-red-50/40' :
                            isDelete  ? 'bg-red-50/20' :
                            isExpanded ? 'bg-indigo-50/30' :
                            'hover:bg-gray-50/60'
                          }`}>

                          {/* Timestamp */}
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                            {fmt(log.createdAt)}
                          </td>

                          {/* Action */}
                          <td className="px-5 py-3 whitespace-nowrap">
                            <ActionBadge action={log.action} />
                          </td>

                          {/* Entity type */}
                          <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-800">
                            {icon} {log.entityType}
                          </td>

                          {/* User */}
                          <td className="px-5 py-3 whitespace-nowrap">
                            <p className="text-sm font-medium text-gray-900">{log.user?.email || 'system'}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              {log.user?.username && (
                                <span className="text-xs text-gray-400">@{log.user.username}</span>
                              )}
                              {log.user?.role && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_STYLES[log.user.role] || 'bg-gray-100 text-gray-600'}`}>
                                  {log.user.role}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Summary */}
                          <td className="px-5 py-3 text-sm text-gray-700 max-w-sm">
                            <p className="line-clamp-2" title={summary}>{summary}</p>
                          </td>

                          {/* Entity ID */}
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                            <span title={log.entityId}>{log.entityId.substring(0, 10)}…</span>
                          </td>

                          {/* View button */}
                          <td className="px-5 py-3 text-center">
                            {hasDetail ? (
                              <button onClick={() => toggleRow(log.id)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                  isExpanded
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700'
                                }`}>
                                {isExpanded ? '▲ Hide' : '▼ View'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>

                        {isExpanded && <ExpandedRow key={`${log.id}-exp`} log={log} />}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gray-50 border-t border-gray-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Showing page <span className="font-semibold text-gray-700">{page}</span> of{' '}
                <span className="font-semibold text-gray-700">{totalPages}</span> •{' '}
                <span className="font-semibold text-indigo-700">{total.toLocaleString()} total records</span>
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1}
                  className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-40">«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1 text-sm border rounded hover:bg-white disabled:opacity-40">‹ Prev</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`px-3 py-1 text-sm border rounded ${p === page ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-white'}`}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1 text-sm border rounded hover:bg-white disabled:opacity-40">Next ›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-40">»</button>
              </div>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-center text-gray-400">
        Admin-only view. All records shown newest first. Click "▼ View" on any row to see full details.
      </p>
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-indigo-900 font-bold">×</button>
    </span>
  )
}
