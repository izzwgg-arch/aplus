'use client'

import { useState, useEffect } from 'react'

interface OpsSettings {
  alertEmail: string
  diskThreshold: number
  memThreshold: number
  refreshInterval: number
  anomalySensitivity: 'low' | 'medium' | 'high'
}

export function SettingsTab() {
  const [settings, setSettings] = useState<OpsSettings>({
    alertEmail: '',
    diskThreshold: 85,
    memThreshold: 90,
    refreshInterval: 30,
    anomalySensitivity: 'medium',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/settings')
      if (res.ok) setSettings(await res.json())
    } catch (e) {
      // use defaults
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/ops/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save settings')
      setSuccess('Settings saved successfully')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { fetchSettings() }, [])

  const Field = ({ label, children, hint = '' }: { label: string; children: React.ReactNode; hint?: string }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )

  if (loading) return <div className="h-48 bg-gray-100 rounded animate-pulse" />

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Ops Center Settings</h2>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">✓ {success}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5 max-w-lg">
        <Field label="Alert Email" hint="Email address for critical alerts (not yet connected to SMTP)">
          <input
            type="email"
            value={settings.alertEmail}
            onChange={e => setSettings(s => ({ ...s, alertEmail: e.target.value }))}
            placeholder="admin@example.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>

        <Field label="Disk Usage Alert Threshold (%)" hint="Alert when disk usage exceeds this percentage">
          <input
            type="number"
            min={50}
            max={99}
            value={settings.diskThreshold}
            onChange={e => setSettings(s => ({ ...s, diskThreshold: parseInt(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>

        <Field label="Memory Usage Alert Threshold (%)" hint="Alert when memory usage exceeds this percentage">
          <input
            type="number"
            min={50}
            max={99}
            value={settings.memThreshold}
            onChange={e => setSettings(s => ({ ...s, memThreshold: parseInt(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>

        <Field label="Auto-Refresh Interval (seconds)" hint="How often the dashboard auto-refreshes metrics">
          <input
            type="number"
            min={10}
            max={300}
            value={settings.refreshInterval}
            onChange={e => setSettings(s => ({ ...s, refreshInterval: parseInt(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>

        <Field label="Anomaly Detection Sensitivity">
          <select
            value={settings.anomalySensitivity}
            onChange={e => setSettings(s => ({ ...s, anomalySensitivity: e.target.value as any }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="low">Low (fewer alerts)</option>
            <option value="medium">Medium (balanced)</option>
            <option value="high">High (more alerts)</option>
          </select>
        </Field>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? '⟳ Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  )
}
