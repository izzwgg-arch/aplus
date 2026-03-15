'use client'

import { useState, useEffect } from 'react'

interface BlockedIP {
  ip: string
  reason: string
  duration: string
  expiresAt: string
  source: string
}

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/

export function IPControlTab() {
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banIP, setBanIP] = useState('')
  const [banDuration, setBanDuration] = useState('24h')
  const [banReason, setBanReason] = useState('')
  const [banError, setBanError] = useState('')
  const [banSuccess, setBanSuccess] = useState('')
  const [banning, setBanning] = useState(false)

  const fetchIPs = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/ip-control')
      if (!res.ok) throw new Error('Failed to fetch blocked IPs')
      const d = await res.json()
      setBlockedIPs(d.decisions || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBan = async () => {
    setBanError('')
    setBanSuccess('')
    if (!IP_REGEX.test(banIP)) {
      setBanError('Invalid IP format. Example: 1.2.3.4')
      return
    }
    setBanning(true)
    try {
      const res = await fetch('/api/ops/ip-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ban', ip: banIP, duration: banDuration, reason: banReason || 'manual-admin-ban' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Ban failed')
      setBanSuccess(`${banIP} banned for ${banDuration}`)
      setBanIP('')
      setBanReason('')
      await fetchIPs()
    } catch (e: any) {
      setBanError(e.message)
    } finally {
      setBanning(false)
    }
  }

  const handleUnban = async (ip: string) => {
    if (!confirm(`Unban ${ip}?`)) return
    try {
      const res = await fetch('/api/ops/ip-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unban', ip }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Unban failed')
      await fetchIPs()
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => { fetchIPs() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">IP Access Control</h2>
        <button onClick={fetchIPs} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ban IP Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <span>🚫</span><span>Ban IP Address</span>
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
              <input
                type="text"
                value={banIP}
                onChange={e => setBanIP(e.target.value)}
                placeholder="1.2.3.4"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <select
                value={banDuration}
                onChange={e => setBanDuration(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="1h">1 Hour</option>
                <option value="6h">6 Hours</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input
                type="text"
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                placeholder="manual-admin-ban"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            {banError && <p className="text-red-600 text-sm">{banError}</p>}
            {banSuccess && <p className="text-green-600 text-sm">✓ {banSuccess}</p>}
            <button
              onClick={handleBan}
              disabled={banning || !banIP}
              className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {banning ? '⟳ Banning...' : '🚫 Ban IP'}
            </button>
          </div>
        </div>

        {/* Blocked IPs List */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <span>🛡️</span><span>Blocked IPs ({blockedIPs.length})</span>
          </h3>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : blockedIPs.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No blocked IPs</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {blockedIPs.map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <div>
                    <p className="font-mono text-sm font-medium text-red-900">{item.ip}</p>
                    <p className="text-xs text-gray-500">{item.reason} · {item.duration}</p>
                  </div>
                  <button
                    onClick={() => handleUnban(item.ip)}
                    className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium"
                  >
                    Unban
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
