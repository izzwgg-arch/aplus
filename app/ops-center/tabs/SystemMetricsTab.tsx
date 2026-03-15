'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface MetricsPoint {
  time: string
  cpu: number
  memory: number
}

interface MetricsData {
  history: MetricsPoint[]
  diskPercent: number
  swapPercent: number
  blockedCount: number
  currentCpu: number
  currentMem: number
}

export function SystemMetricsTab() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/metrics')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      const d = await res.json()
      setData(d)
      setLastUpdate(new Date())
      setError('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  const diskBarData = data ? [
    { name: 'Used', value: data.diskPercent },
    { name: 'Free', value: 100 - data.diskPercent },
  ] : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">System Metrics</h2>
          <p className="text-sm text-gray-500 mt-0.5">Auto-refreshes every 30 seconds</p>
        </div>
        <div className="flex items-center space-x-3">
          {lastUpdate && (
            <span className="text-xs text-gray-400">Updated: {lastUpdate.toLocaleTimeString()}</span>
          )}
          <button onClick={fetchMetrics} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-48 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : data ? (
        <>
          {/* Current stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'CPU Load', value: `${data.currentCpu?.toFixed(2)}`, unit: '', color: 'text-orange-600' },
              { label: 'Memory', value: `${data.currentMem?.toFixed(0)}`, unit: '%', color: 'text-blue-600' },
              { label: 'Disk', value: `${data.diskPercent?.toFixed(0)}`, unit: '%', color: 'text-purple-600' },
              { label: 'Blocked IPs', value: `${data.blockedCount ?? 0}`, unit: '', color: 'text-red-600' },
            ].map((stat, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}<span className="text-lg">{stat.unit}</span></p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU chart */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-4">CPU Load (1-min avg)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cpu" stroke="#f97316" strokeWidth={2} dot={false} name="CPU Load" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Memory chart */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Memory Usage (%)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="memory" stroke="#3b82f6" strokeWidth={2} dot={false} name="Memory %" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Disk usage bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Disk Usage (%)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[{ name: 'Disk /', percent: data.diskPercent }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Bar
                    dataKey="percent"
                    fill={data.diskPercent > 85 ? '#ef4444' : data.diskPercent > 70 ? '#f59e0b' : '#8b5cf6'}
                    name="Used %"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Swap usage bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Swap Usage (%)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[{ name: 'Swap', percent: data.swapPercent ?? 0 }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Bar
                    dataKey="percent"
                    fill="#10b981"
                    name="Swap Used %"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
