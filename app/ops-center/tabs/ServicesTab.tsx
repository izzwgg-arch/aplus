'use client'

import { useState, useEffect } from 'react'

interface ServiceStatus {
  name: string
  displayName: string
  active: boolean
  status: string
  type: string
}

export function ServicesTab() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchServices = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ops/services')
      if (!res.ok) throw new Error('Failed to fetch services')
      const d = await res.json()
      setServices(d.services || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchServices() }, [])

  const activeCount = services.filter(s => s.active).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Service Status</h2>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {activeCount}/{services.length} services active
            </p>
          )}
        </div>
        <button onClick={fetchServices} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((svc, i) => (
            <div key={i} className={`flex items-center justify-between p-4 rounded-lg border ${
              svc.active ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{
                  svc.type === 'app' ? '⚡' :
                  svc.type === 'web' ? '🌐' :
                  svc.type === 'db' ? '🗄️' :
                  svc.type === 'security' ? '🛡️' :
                  svc.type === 'timer' ? '⏱️' :
                  '⚙️'
                }</span>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{svc.displayName}</p>
                  <p className="text-xs text-gray-500 font-mono">{svc.name}</p>
                </div>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                svc.active ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${svc.active ? 'bg-green-600' : 'bg-red-600'}`} />
                {svc.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
