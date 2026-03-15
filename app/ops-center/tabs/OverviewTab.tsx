'use client'

import { useState, useEffect, useCallback } from 'react'

interface StatusData {
  systemStatus: string
  appStatus: string
  dbStatus: string
  nginxStatus: string
  crowdsecStatus: string
  lastBackup: string
  activeAlerts: number
  blockedIPs: number
  cpuLoad: string
  memUsage: string
  diskUsage: string
  swapStatus: string
}

function StatusBadge({ value, okValues = ['active', 'ok', 'online'] }: { value: string; okValues?: string[] }) {
  const isOk = okValues.some(v => value?.toLowerCase().includes(v))
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
      isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOk ? 'bg-green-500' : 'bg-red-500'}`} />
      {value || 'unknown'}
    </span>
  )
}

function MetricCard({ icon, label, value, color = 'blue', isStatus = false }: {
  icon: string; label: string; value: string; color?: string; isStatus?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200',
  }
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || colorMap.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {isStatus && <StatusBadge value={value} />}
      </div>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      {!isStatus && <p className="text-lg font-bold text-gray-900 mt-1 truncate">{value || '—'}</p>}
    </div>
  )
}

export function OverviewTab() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/status')
      if (!res.ok) throw new Error('Failed to fetch status')
      const d = await res.json()
      setData(d)
      setLastRefreshed(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">System Overview</h2>
        <div className="flex items-center space-x-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            <span>{loading ? '⟳' : '↻'}</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-gray-100 p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Service Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard icon="🖥️" label="System" value={data.systemStatus} color="green" isStatus />
            <MetricCard icon="⚡" label="App (PM2)" value={data.appStatus} color="blue" isStatus />
            <MetricCard icon="🗄️" label="Database" value={data.dbStatus} color="blue" isStatus />
            <MetricCard icon="🌐" label="Nginx" value={data.nginxStatus} color="blue" isStatus />
            <MetricCard icon="🛡️" label="CrowdSec" value={data.crowdsecStatus} color="purple" isStatus />
          </div>

          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Operations</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <MetricCard icon="💾" label="Last Backup" value={data.lastBackup} color="gray" />
            <MetricCard icon="🚨" label="Active Alerts" value={String(data.activeAlerts ?? 0)} color={data.activeAlerts > 0 ? 'red' : 'green'} />
            <MetricCard icon="🚫" label="Blocked IPs" value={String(data.blockedIPs ?? 0)} color={data.blockedIPs > 0 ? 'orange' : 'green'} />
          </div>

          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Resources</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon="🔥" label="CPU Load (1m)" value={data.cpuLoad} color="orange" />
            <MetricCard icon="💭" label="Memory Usage" value={data.memUsage} color="blue" />
            <MetricCard icon="💿" label="Disk Usage" value={data.diskUsage} color="purple" />
            <MetricCard icon="🔄" label="Swap" value={data.swapStatus} color="gray" />
          </div>
        </>
      ) : null}
    </div>
  )
}
