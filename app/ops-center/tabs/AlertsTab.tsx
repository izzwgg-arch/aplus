'use client'

import { useState, useEffect } from 'react'

interface Alert {
  id: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  type: string
  message: string
  timestamp: string
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  WARNING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  INFO: 'bg-blue-100 text-blue-800 border-blue-200',
}

const SEVERITY_ICONS: Record<string, string> = {
  CRITICAL: '🚨',
  WARNING: '⚠️',
  INFO: 'ℹ️',
}

export function AlertsTab() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAlerts = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/alerts')
      if (!res.ok) throw new Error('Failed to fetch alerts')
      const d = await res.json()
      setAlerts(d.alerts || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const dismissAlert = async (id: string) => {
    try {
      await fetch(`/api/ops/alerts?id=${id}`, { method: 'DELETE' })
      setAlerts(prev => prev.filter(a => a.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => { fetchAlerts() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Active Alerts</h2>
        <button onClick={fetchAlerts} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-5xl">✅</span>
          <p className="text-gray-500 mt-3">No active alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className={`flex items-start justify-between p-4 rounded-lg border ${SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.INFO}`}>
              <div className="flex items-start space-x-3">
                <span className="text-xl mt-0.5">{SEVERITY_ICONS[alert.severity] || 'ℹ️'}</span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-sm">{alert.type}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEVERITY_STYLES[alert.severity]}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5">{alert.message}</p>
                  <p className="text-xs opacity-70 mt-1">{alert.timestamp}</p>
                </div>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5 text-lg leading-none"
                title="Dismiss alert"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
