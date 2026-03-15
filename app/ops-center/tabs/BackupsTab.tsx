'use client'

import { useState, useEffect } from 'react'

interface BackupEntry {
  name: string
  size: string
  created: string
  type: 'baseline' | 'timestamped'
}

interface BackupsData {
  jupiter2Exists: boolean
  jupiter2Path: string
  jupiter2Size: string
  timestampedBackups: BackupEntry[]
  lastSuccess: string
  recentLogs: string[]
  retentionPolicy: string
}

export function BackupsTab() {
  const [data, setData] = useState<BackupsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState('')

  const fetchBackups = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/backups')
      if (!res.ok) throw new Error('Failed to fetch backup info')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const runBackup = async () => {
    setRunning(true)
    setRunMsg('')
    try {
      const res = await fetch('/api/ops/backup-now', { method: 'POST' })
      const d = await res.json()
      setRunMsg(d.message || 'Backup started')
      setTimeout(fetchBackups, 5000)
    } catch (e: any) {
      setRunMsg('Error: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { fetchBackups() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Backup Status</h2>
        <div className="flex space-x-2">
          <button onClick={fetchBackups} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            ↻ Refresh
          </button>
          <button
            onClick={runBackup}
            disabled={running}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {running ? '⟳ Starting...' : '💾 Run Backup Now'}
          </button>
        </div>
      </div>

      {runMsg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4">{runMsg}</div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : data ? (
        <div className="space-y-6">
          {/* Jupiter2 Baseline */}
          <div className={`border-2 rounded-lg p-4 ${data.jupiter2Exists ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">{data.jupiter2Exists ? '✅' : '❌'}</span>
              <div>
                <h3 className="font-bold text-gray-900">Jupiter2 Baseline Backup</h3>
                <p className="text-sm text-gray-600">{data.jupiter2Path}</p>
                {data.jupiter2Exists && (
                  <p className="text-xs text-gray-500 mt-0.5">Size: {data.jupiter2Size} · Protected — will never be deleted automatically</p>
                )}
              </div>
            </div>
          </div>

          {/* Last Success */}
          {data.lastSuccess && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Last successful backup:</span> {data.lastSuccess}
              </p>
            </div>
          )}

          {/* Timestamped Backups */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Timestamped Backups ({data.timestampedBackups.length})</h3>
            {data.timestampedBackups.length === 0 ? (
              <p className="text-gray-400 text-sm">No timestamped backups yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Created</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {data.timestampedBackups.map((b, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs">{b.name}</td>
                        <td className="px-4 py-2 text-gray-500">{b.created}</td>
                        <td className="px-4 py-2 text-gray-500">{b.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Retention Policy */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-700 mb-2">📋 Retention Policy</h3>
            <p className="text-sm text-gray-600">{data.retentionPolicy || 'Keep last 7 daily backups. Jupiter2 is permanent and never deleted.'}</p>
          </div>

          {/* Recent Logs */}
          {data.recentLogs?.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">Recent Backup Logs</h3>
              <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs overflow-auto max-h-40">
                {data.recentLogs.join('\n')}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
