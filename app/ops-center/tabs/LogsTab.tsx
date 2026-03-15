'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warning' | 'error' | 'critical'
  category: string
  source: string
  eventType: string
  message: string
  actorUserId?: string
  actorEmail?: string
  actorRole?: string
  route?: string
  ipAddress?: string
  targetType?: string
  targetId?: string
  correlationId?: string
  status?: string
  metadata?: string
}

interface LogsResponse {
  logs: LogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const LEVEL_STYLES: Record<string, { badge: string; row: string }> = {
  info: { badge: 'bg-blue-100 text-blue-700', row: '' },
  warning: { badge: 'bg-yellow-100 text-yellow-700', row: 'bg-yellow-50/30' },
  error: { badge: 'bg-red-100 text-red-700', row: 'bg-red-50/30' },
  critical: { badge: 'bg-red-600 text-white', row: 'bg-red-50/50' },
}

const CATEGORY_STYLES: Record<string, string> = {
  APP_ACTIVITY: 'bg-indigo-100 text-indigo-700',
  ERROR: 'bg-red-100 text-red-700',
  SECURITY: 'bg-orange-100 text-orange-700',
  AUTH: 'bg-purple-100 text-purple-700',
  OPS_ACTION: 'bg-teal-100 text-teal-700',
  SYSTEM: 'bg-gray-100 text-gray-700',
  BREACH: 'bg-red-200 text-red-800',
  API: 'bg-cyan-100 text-cyan-700',
  BACKUP: 'bg-green-100 text-green-700',
  HEALTH: 'bg-pink-100 text-pink-700',
  ALERT: 'bg-yellow-100 text-yellow-700',
  AUDIT: 'bg-blue-100 text-blue-700',
}

const CATEGORIES = ['APP_ACTIVITY','ERROR','SECURITY','AUTH','OPS_ACTION','SYSTEM','BREACH','API','BACKUP','HEALTH','ALERT','AUDIT']
const LEVELS = ['info','warning','error','critical']

function formatTS(ts: string) {
  try { return new Date(ts).toLocaleString() } catch { return ts }
}

function LogDetail({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const [full, setFull] = useState<LogEntry & { metadata?: string } | null>(null)
  useEffect(() => {
    fetch(`/api/ops/logs/${log.id}`)
      .then(r => r.json())
      .then(d => setFull(d))
      .catch(() => {})
  }, [log.id])

  const item = full || log
  let meta: any = null
  if (item.metadata) {
    try { meta = JSON.parse(item.metadata) } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${LEVEL_STYLES[log.level]?.badge}`}>
              {log.level.toUpperCase()}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_STYLES[log.category] || 'bg-gray-100 text-gray-600'}`}>
              {log.category}
            </span>
            <span className="text-sm font-semibold text-gray-900">{log.eventType}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Message</p>
            <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{item.message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Timestamp" value={formatTS(item.timestamp)} />
            <Field label="Source" value={item.source} mono />
            {item.actorEmail && <Field label="Actor" value={`${item.actorEmail} (${item.actorRole || 'unknown'})`} />}
            {item.actorUserId && <Field label="Actor ID" value={item.actorUserId} mono />}
            {item.route && <Field label="Route" value={item.route} mono />}
            {item.ipAddress && <Field label="IP Address" value={item.ipAddress} mono />}
            {item.targetType && <Field label="Target" value={`${item.targetType} ${item.targetId || ''}`} />}
            {item.correlationId && <Field label="Correlation ID" value={item.correlationId} mono />}
            {item.status && <Field label="Status" value={item.status} />}
          </div>

          {meta && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Metadata</p>
              <pre className="bg-gray-900 text-green-300 text-xs p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>
          )}

          {meta?.stack && (
            <div>
              <p className="text-sm font-medium text-red-600 mb-1">Stack Trace (Admin)</p>
              <pre className="bg-red-950 text-red-300 text-xs p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                {meta.stack}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-sm text-gray-800 mt-0.5 break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

export function LogsTab() {
  const [data, setData] = useState<LogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    if (search) p.set('search', search)
    if (level) p.set('level', level)
    if (category) p.set('category', category)
    if (source) p.set('source', source)
    if (fromDate) p.set('from', fromDate)
    if (toDate) p.set('to', toDate)
    return p.toString()
  }, [page, search, level, category, source, fromDate, toDate])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ops/logs?${buildQuery()}`)
      if (!res.ok) throw new Error('Failed to fetch logs')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchLogs, 30000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, fetchLogs])

  const resetFilters = () => {
    setSearch('')
    setLevel('')
    setCategory('')
    setSource('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const quickFilter = (l: string) => { setLevel(l); setCategory(''); setPage(1) }
  const quickCat = (c: string) => { setCategory(c); setLevel(''); setPage(1) }

  const setLast = (hours: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000)
    setFromDate(from.toISOString().slice(0, 16))
    setToDate('')
    setPage(1)
  }

  return (
    <div>
      {selectedLog && <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Event Logs</h2>
          {data && <p className="text-sm text-gray-500 mt-0.5">{data.total.toLocaleString()} total entries</p>}
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span>Auto-refresh (30s)</span>
          </label>
          <button onClick={fetchLogs} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-gray-400 self-center">Quick:</span>
        {[
          { label: '🚨 Critical', action: () => quickFilter('critical') },
          { label: '❌ Errors', action: () => quickFilter('error') },
          { label: '🛡️ Security', action: () => quickCat('SECURITY') },
          { label: '⚠️ Breach', action: () => quickCat('BREACH') },
          { label: '🔑 Auth', action: () => quickCat('AUTH') },
          { label: '⚙️ Ops', action: () => quickCat('OPS_ACTION') },
          { label: '1h', action: () => setLast(1) },
          { label: '24h', action: () => setLast(24) },
          { label: '7d', action: () => setLast(168) },
          { label: '↺ Reset', action: resetFilters },
        ].map(q => (
          <button
            key={q.label}
            onClick={q.action}
            className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full font-medium text-gray-700 transition-colors"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-2">
          <input
            type="text"
            placeholder="Search messages, routes, actors..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <select
          value={level}
          onChange={e => { setLevel(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">All Levels</option>
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          placeholder="Source filter..."
          value={source}
          onChange={e => { setSource(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="flex items-center space-x-2">
          <input
            type="datetime-local"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(1) }}
            className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="datetime-local"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(1) }}
            className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {/* Log Table */}
      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : data && data.logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>No log entries found</p>
          <p className="text-sm mt-1">Try adjusting your filters or trigger an action in the Ops Center</p>
        </div>
      ) : data ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Level</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Source</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Event</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Actor</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Message</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.logs.map(log => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`cursor-pointer hover:bg-purple-50/30 transition-colors ${LEVEL_STYLES[log.level]?.row || ''}`}
                  >
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap font-mono">
                      {new Date(log.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${LEVEL_STYLES[log.level]?.badge || 'bg-gray-100 text-gray-600'}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_STYLES[log.category] || 'bg-gray-100 text-gray-600'}`}>
                        {log.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">{log.source}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 whitespace-nowrap">{log.eventType}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {log.actorEmail ? log.actorEmail.split('@')[0] : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate">{log.message}</td>
                    <td className="px-3 py-2">
                      {log.status && (
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          log.status === 'success' ? 'bg-green-100 text-green-700'
                          : log.status === 'failure' ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {log.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Page {data.page} of {data.totalPages} ({data.total.toLocaleString()} entries)
              </p>
              <div className="flex space-x-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(data.totalPages - 4, page - 2)) + i
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 text-sm border rounded ${p === page ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 hover:bg-gray-50'}`}
                    >
                      {p}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
