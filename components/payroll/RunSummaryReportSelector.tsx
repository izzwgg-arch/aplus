'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function RunSummaryReportSelector() {
  const router = useRouter()
  const [runs, setRuns] = useState<any[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRuns()
  }, [])

  const fetchRuns = async () => {
    try {
      const response = await fetch('/api/payroll/runs')
      if (response.ok) {
        const data = await response.json()
        setRuns(data.runs || [])
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = () => {
    if (!selectedRunId) {
      alert('Please select a payroll run')
      return
    }

    router.push(`/payroll/reports/run/${selectedRunId}`)
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <Link
        href="/payroll/reports"
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Reports
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Payroll Run Summary Report</h1>
      <p className="text-gray-600 mb-8">
        Select a payroll run to generate a summary report with all employees and totals.
      </p>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payroll Run *
            </label>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              disabled={loading}
            >
              <option value="">Select a payroll run...</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} ({new Date(run.periodStart).toLocaleDateString()} - {new Date(run.periodEnd).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Link
              href="/payroll/reports"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              onClick={handleGenerate}
              disabled={!selectedRunId || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
