'use client'

import { useState, useEffect } from 'react'

interface HealthEntry {
  timestamp: string
  check: string
  result: 'OK' | 'FAIL' | string
  raw: string
}

export function HealthTab() {
  const [history, setHistory] = useState<HealthEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [runOutput, setRunOutput] = useState('')

  const fetchHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/health-history')
      if (!res.ok) throw new Error('Failed to load health history')
      const d = await res.json()
      setHistory(d.entries || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const runCheck = async () => {
    setRunning(true)
    setRunOutput('')
    try {
      const res = await fetch('/api/ops/health-check', { method: 'POST' })
      const d = await res.json()
      setRunOutput(d.output || 'Check completed')
      await fetchHistory()
    } catch (e: any) {
      setRunOutput('Error: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Health Check History</h2>
        <div className="flex space-x-2">
          <button onClick={fetchHistory} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            ↻ Refresh
          </button>
          <button
            onClick={runCheck}
            disabled={running}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {running ? '⟳ Running...' : '▶ Run Check Now'}
          </button>
        </div>
      </div>

      {runOutput && (
        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto mb-4 max-h-48 whitespace-pre-wrap">
          {runOutput}
        </pre>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Check</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Result</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No health check history found</td></tr>
              ) : history.map((entry, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{entry.timestamp}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{entry.check}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      entry.result === 'OK' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {entry.result}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 max-w-xs truncate">{entry.raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
