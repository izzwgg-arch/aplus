'use client'

import { useState, useEffect } from 'react'

interface IntrusionEvent {
  timestamp: string
  type: 'ssh-fail' | 'crowdsec-block' | 'crowdsec-alert' | 'other'
  description: string
  ip?: string
  scenario?: string
}

const EVENT_CONFIG: Record<string, { icon: string; dotColor: string; labelColor: string }> = {
  'ssh-fail': { icon: '🔑', dotColor: 'bg-yellow-400', labelColor: 'text-yellow-700' },
  'crowdsec-block': { icon: '🚫', dotColor: 'bg-red-500', labelColor: 'text-red-700' },
  'crowdsec-alert': { icon: '⚠️', dotColor: 'bg-orange-400', labelColor: 'text-orange-700' },
  'other': { icon: '📌', dotColor: 'bg-gray-400', labelColor: 'text-gray-600' },
}

export function IntrusionTimelineTab() {
  const [events, setEvents] = useState<IntrusionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchIntrusion = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/intrusion')
      if (!res.ok) throw new Error('Failed to fetch intrusion data')
      const d = await res.json()
      setEvents(d.events || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchIntrusion() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Intrusion Timeline</h2>
          <p className="text-sm text-gray-500 mt-0.5">SSH failures + CrowdSec blocks and detections</p>
        </div>
        <button onClick={fetchIntrusion} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {/* Legend */}
      <div className="flex items-center space-x-4 mb-4 text-xs text-gray-600">
        {Object.entries(EVENT_CONFIG).map(([type, conf]) => (
          <div key={type} className="flex items-center space-x-1">
            <span className={`w-2.5 h-2.5 rounded-full ${conf.dotColor}`} />
            <span>{type}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p>No intrusion events detected</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-3 pl-10">
            {events.map((event, i) => {
              const conf = EVENT_CONFIG[event.type] || EVENT_CONFIG.other
              return (
                <div key={i} className="relative">
                  {/* Dot */}
                  <div className={`absolute -left-6 top-3 w-3 h-3 rounded-full border-2 border-white ${conf.dotColor}`} />
                  <div className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span>{conf.icon}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded bg-opacity-20 ${conf.labelColor}`}>
                          {event.type}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{event.timestamp}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{event.description}</p>
                    {event.ip && (
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">IP: {event.ip}</p>
                    )}
                    {event.scenario && (
                      <p className="text-xs text-gray-500 mt-0.5">Scenario: {event.scenario}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
