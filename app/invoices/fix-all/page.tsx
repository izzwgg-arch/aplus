'use client'

import { useState } from 'react'
import { DashboardNav } from '@/components/DashboardNav'

export default function FixAllInvoicesPage() {
  const [loading, setLoading] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRunFix = async () => {
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch(`/api/invoices/fix-all?dryRun=${dryRun}`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fix invoices')
      }

      setResults(data)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0066cc' }}>
      <DashboardNav userRole="ADMIN" />
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-4" style={{ color: '#000000' }}>
            Fix All Existing Invoices
          </h1>
          <p className="text-gray-600 mb-6">
            Recalculate all existing invoices using the new ceil() rounding logic (rounds UP to next whole unit).
          </p>

          <div className="mb-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700">Dry run (preview only, no changes)</span>
            </label>
          </div>

          <button
            onClick={handleRunFix}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Running...' : dryRun ? 'Preview Changes' : 'Apply Fixes'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {results && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4" style={{ color: '#000000' }}>
                Results
              </h2>
              <div className="bg-gray-50 p-4 rounded mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold">Total Invoices:</span> {results.summary.total}
                  </div>
                  <div>
                    <span className="font-semibold">{results.dryRun ? 'Would Fix' : 'Fixed'}:</span>{' '}
                    {results.summary.fixed}
                  </div>
                  <div>
                    <span className="font-semibold">Skipped:</span> {results.summary.skipped}
                  </div>
                  <div>
                    <span className="font-semibold">Errors:</span> {results.summary.errors}
                  </div>
                </div>
              </div>

              {results.results && results.results.length > 0 && (
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Invoice</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Old Total</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">New Total</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Entries</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.results.map((result: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm">{result.invoiceNumber}</td>
                          <td className="px-4 py-2 text-sm">
                            {result.fixed ? (
                              <span className="text-green-600">Fixed</span>
                            ) : result.error ? (
                              <span className="text-red-600">{result.error}</span>
                            ) : (
                              <span className="text-gray-500">Skipped</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm">${result.oldTotal.toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm">${result.newTotal.toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm">{result.entriesUpdated}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
