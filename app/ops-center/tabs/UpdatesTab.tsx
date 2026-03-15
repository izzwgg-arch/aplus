'use client'

import { useState, useEffect } from 'react'

interface UpdatesData {
  securityUpdatesCount: number
  nodeVersion: string
  npmVersion: string
  prismaVersion: string
  postgresVersion: string
  nginxVersion: string
  pm2Version: string
  osName: string
  kernelVersion: string
}

export function UpdatesTab() {
  const [data, setData] = useState<UpdatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchUpdates = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/updates')
      if (!res.ok) throw new Error('Failed to fetch updates')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUpdates() }, [])

  const VersionRow = ({ label, value, note = '' }: { label: string; value: string; note?: string }) => (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm font-medium text-gray-700">{label}</td>
      <td className="px-4 py-3 text-sm font-mono text-gray-900">{value || '—'}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{note}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 font-medium">READ-ONLY</span>
      </td>
    </tr>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Update Status</h2>
          <p className="text-sm text-gray-500 mt-1">Advisory only — no automatic upgrades applied</p>
        </div>
        <button onClick={fetchUpdates} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {data && data.securityUpdatesCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-center space-x-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-yellow-800">{data.securityUpdatesCount} security updates available</p>
            <p className="text-sm text-yellow-700">Run <code className="bg-yellow-100 px-1 rounded">sudo apt-get upgrade</code> manually after reviewing</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Component</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Current Version</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              <VersionRow label="OS" value={data.osName} />
              <VersionRow label="Kernel" value={data.kernelVersion} />
              <VersionRow label="Node.js" value={data.nodeVersion} note="Do not auto-upgrade major versions" />
              <VersionRow label="npm" value={data.npmVersion} />
              <VersionRow label="Prisma" value={data.prismaVersion} note="Do not auto-upgrade major versions" />
              <VersionRow label="PostgreSQL" value={data.postgresVersion} note="Do not auto-upgrade major versions" />
              <VersionRow label="Nginx" value={data.nginxVersion} />
              <VersionRow label="PM2" value={data.pm2Version} />
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 mb-2">⚠️ Upgrade Policy Reminders</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Node.js major upgrades require testing — do NOT auto-upgrade</li>
          <li>PostgreSQL major upgrades require a full DB migration plan</li>
          <li>Prisma major upgrades may require schema changes</li>
          <li>OS security patches (apt) are handled automatically via unattended-upgrades</li>
          <li>App dependencies (npm) must be tested before updating</li>
        </ul>
      </div>
    </div>
  )
}
