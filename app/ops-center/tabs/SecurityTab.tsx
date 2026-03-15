'use client'

import { useState, useEffect } from 'react'

interface SecurityData {
  ufwRules: string[]
  sshHardening: Record<string, string>
  recentDetections: { timestamp: string; scenario: string; ip: string }[]
}

export function SecurityTab() {
  const [data, setData] = useState<SecurityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSecurity = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/security')
      if (!res.ok) throw new Error('Failed to fetch security data')
      setData(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSecurity() }, [])

  const CheckRow = ({ label, value, good }: { label: string; value: string; good: boolean }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-500">{value}</span>
        <span className={`text-lg ${good ? 'text-green-500' : 'text-red-500'}`}>{good ? '✓' : '✗'}</span>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Security Status</h2>
        <button onClick={fetchSecurity} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SSH Hardening */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <span>🔑</span><span>SSH Hardening</span>
            </h3>
            {data.sshHardening ? (
              <div>
                <CheckRow
                  label="Password Auth Disabled"
                  value={data.sshHardening.PasswordAuthentication || 'unknown'}
                  good={data.sshHardening.PasswordAuthentication === 'no'}
                />
                <CheckRow
                  label="Root Login"
                  value={data.sshHardening.PermitRootLogin || 'unknown'}
                  good={data.sshHardening.PermitRootLogin === 'no' || data.sshHardening.PermitRootLogin === 'prohibit-password'}
                />
                <CheckRow
                  label="Pubkey Auth"
                  value={data.sshHardening.PubkeyAuthentication || 'unknown'}
                  good={data.sshHardening.PubkeyAuthentication === 'yes'}
                />
                <CheckRow
                  label="Max Auth Tries"
                  value={data.sshHardening.MaxAuthTries || 'default'}
                  good={parseInt(data.sshHardening.MaxAuthTries || '6') <= 5}
                />
                <CheckRow
                  label="X11 Forwarding"
                  value={data.sshHardening.X11Forwarding || 'unknown'}
                  good={data.sshHardening.X11Forwarding === 'no'}
                />
              </div>
            ) : <p className="text-gray-400 text-sm">No data</p>}
          </div>

          {/* Firewall Rules */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <span>🔥</span><span>Firewall (UFW)</span>
            </h3>
            <div className="space-y-1">
              {data.ufwRules?.length > 0 ? data.ufwRules.map((rule, i) => (
                <div key={i} className="text-sm font-mono text-gray-700 bg-gray-50 px-2 py-1 rounded">{rule}</div>
              )) : <p className="text-gray-400 text-sm">No rules found</p>}
            </div>
          </div>

          {/* CrowdSec Detections */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 lg:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <span>🛡️</span><span>Recent CrowdSec Detections</span>
            </h3>
            {data.recentDetections?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Time</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Scenario</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.recentDetections.map((d, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-xs text-gray-400">{d.timestamp}</td>
                        <td className="px-3 py-1.5">{d.scenario}</td>
                        <td className="px-3 py-1.5 font-mono text-orange-600">{d.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-gray-400 text-sm">No recent detections</p>}
          </div>
        </div>
      ) : null}
    </div>
  )
}
