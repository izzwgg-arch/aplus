'use client'

import { useState, useEffect } from 'react'

interface AuditEvent {
  timestamp: string
  type: 'backup' | 'alert' | 'ip-ban' | 'ip-unban' | 'health' | 'settings' | 'service' | 'other'
  description: string
  user?: string
  raw?: string
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  backup: { icon: '💾', color: 'bg-blue-100 text-blue-700' },
  alert: { icon: '🚨', color: 'bg-red-100 text-red-700' },
  'ip-ban': { icon: '🚫', color: 'bg-orange-100 text-orange-700' },
  'ip-unban': { icon: '✅', color: 'bg-green-100 text-green-700' },
  health: { icon: '❤️', color: 'bg-pink-100 text-pink-700' },
  settings: { icon: '🔧', color: 'bg-purple-100 text-purple-700' },
  service: { icon: '⚙️', color: 'bg-gray-100 text-gray-700' },
  other: { icon: '📋', color: 'bg-gray-100 text-gray-600' },
}

export function AuditHistoryTab() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  const fetchAudit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/audit')
      if (!res.ok) throw new Error('Failed to fetch audit history')
      const d = await res.json()
      setEvents(d.events || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAudit() }, [])

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Audit History</h2>
        <div className="flex space-x-2">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Events</option>
            <option value="backup">Backups</option>
            <option value="alert">Alerts</option>
            <option value="ip-ban">IP Bans</option>
            <option value="ip-unban">IP Unbans</option>
            <option value="health">Health Checks</option>
          </select>
          <button onClick={fetchAudit} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>No audit events found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((event, i) => {
            const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.other
            return (
              <div key={i} className="flex items-start space-x-3 p-3 bg-white border border-gray-100 rounded-lg hover:border-gray-200">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-lg ${config.color}`}>
                    {config.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{event.description}</p>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-xs text-gray-400">{event.timestamp}</span>
                    {event.user && <span className="text-xs text-gray-400">· {event.user}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${config.color}`}>{event.type}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
