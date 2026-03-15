'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, FileArchive, CheckCircle, XCircle, AlertCircle, RefreshCw, Search, Filter } from 'lucide-react'
import toast from 'react-hot-toast'

interface DryRunResult {
  rowIndex: number
  detectedName: string
  normalizedName: string
  roleGuess: 'CLIENT' | 'PROVIDER' | 'UNKNOWN'
  matchedProfile: {
    type: 'CLIENT' | 'PROVIDER'
    id: string
    name: string
  } | null
  imageFound: boolean
  imageFilename: string | null
  status: 'READY' | 'NO_PROFILE' | 'AMBIGUOUS' | 'MISSING_IMAGE' | 'CONFLICT_EXISTING_SIGNATURE'
  canAttach: boolean
}

interface ImportBatch {
  id: string
  createdAt: string
  itemsCount: number
}

export function SignatureImport() {
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [dryRunResults, setDryRunResults] = useState<DryRunResult[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [createAuditLog, setCreateAuditLog] = useState(true)
  const [lastBatch, setLastBatch] = useState<ImportBatch | null>(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  const handleDryRun = async () => {
    if (!excelFile || !zipFile) {
      toast.error('Please upload both Excel and ZIP files')
      return
    }

    setDryRunLoading(true)
    try {
      const formData = new FormData()
      formData.append('excel', excelFile)
      formData.append('zip', zipFile)

      const response = await fetch('/api/admin/signatures/dry-run', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Dry-run failed')
        return
      }

      setDryRunResults(data.results || [])
      toast.success(`Dry-run completed: ${data.results?.length || 0} rows processed`)
    } catch (error: any) {
      console.error('Dry-run error:', error)
      toast.error('Failed to run dry-run preview')
    } finally {
      setDryRunLoading(false)
    }
  }

  const handleImport = async () => {
    if (selectedRows.size === 0) {
      toast.error('Please select at least one row to import')
      return
    }

    if (!excelFile || !zipFile) {
      toast.error('Please upload both Excel and ZIP files')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('excel', excelFile)
      formData.append('zip', zipFile)
      formData.append('selectedRows', JSON.stringify(Array.from(selectedRows)))
      formData.append('overwriteExisting', overwriteExisting.toString())
      formData.append('createAuditLog', createAuditLog.toString())

      const response = await fetch('/api/admin/signatures/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Import failed')
        return
      }

      toast.success(`Import completed: ${data.successCount} signatures imported, ${data.failedCount} failed`)
      setLastBatch({
        id: data.batchId,
        createdAt: new Date().toISOString(),
        itemsCount: data.successCount + data.failedCount,
      })
      
      // Refresh dry-run results to show updated status
      await handleDryRun()
    } catch (error: any) {
      console.error('Import error:', error)
      toast.error('Failed to import signatures')
    } finally {
      setLoading(false)
    }
  }

  const handleRollback = async () => {
    if (!lastBatch) {
      toast.error('No batch to rollback')
      return
    }

    if (!confirm('Are you sure you want to rollback the last import batch? This will restore all signatures to their previous state.')) {
      return
    }

    setRollbackLoading(true)
    try {
      const response = await fetch('/api/admin/signatures/rollback-last', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Rollback failed')
        return
      }

      toast.success(`Rollback completed: ${data.restoredCount} signatures restored`)
      setLastBatch(null)
      
      // Refresh dry-run results
      await handleDryRun()
    } catch (error: any) {
      console.error('Rollback error:', error)
      toast.error('Failed to rollback')
    } finally {
      setRollbackLoading(false)
    }
  }

  const toggleRowSelection = (rowIndex: number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(rowIndex)) {
      newSelected.delete(rowIndex)
    } else {
      newSelected.add(rowIndex)
    }
    setSelectedRows(newSelected)
  }

  const selectAllReady = () => {
    const readyRows = dryRunResults
      .filter((r, idx) => r.status === 'READY')
      .map((_, idx) => dryRunResults.findIndex((r, i) => r.status === 'READY' && i === idx))
      .filter(idx => idx !== -1)
    
    setSelectedRows(new Set(readyRows))
  }

  const filteredResults = dryRunResults.filter(result => {
    const matchesStatus = !statusFilter || result.status === statusFilter
    const matchesSearch = !searchTerm || 
      result.detectedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      result.normalizedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (result.matchedProfile?.name.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    return matchesStatus && matchesSearch
  })

  const getStatusBadge = (status: string) => {
    const styles = {
      READY: 'bg-green-100 text-green-800',
      NO_PROFILE: 'bg-red-100 text-red-800',
      AMBIGUOUS: 'bg-yellow-100 text-yellow-800',
      MISSING_IMAGE: 'bg-orange-100 text-orange-800',
      CONFLICT_EXISTING_SIGNATURE: 'bg-purple-100 text-purple-800',
    }
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace(/_/g, ' ')}
      </span>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Signature Import</h1>
        <p className="mt-2 text-sm text-gray-600">
          Import signature images from a ZIP file and assign them to existing Clients or Providers by matching names.
        </p>
      </div>

      {/* Card 1: Upload Files */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Files</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Excel File (.xlsx) *
            </label>
            <div className="flex items-center space-x-4">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
              {excelFile && (
                <div className="flex items-center text-sm text-green-600">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {excelFile.name}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ZIP File of Images (.zip) *
            </label>
            <div className="flex items-center space-x-4">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
              {zipFile && (
                <div className="flex items-center text-sm text-green-600">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {zipFile.name}
                </div>
              )}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Matching is by First + Last Name. Profiles must already exist in the system.
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Dry Run Preview */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Dry Run Preview</h2>
        <div className="mb-4">
          <button
            onClick={handleDryRun}
            disabled={!excelFile || !zipFile || dryRunLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {dryRunLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Run Dry-Run (Preview)
              </>
            )}
          </button>
        </div>

        {dryRunResults.length > 0 && (
          <>
            {/* Filters */}
            <div className="mb-4 flex space-x-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
              <div className="w-48">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">All Statuses</option>
                  <option value="READY">Ready</option>
                  <option value="NO_PROFILE">No Profile</option>
                  <option value="AMBIGUOUS">Ambiguous</option>
                  <option value="MISSING_IMAGE">Missing Image</option>
                  <option value="CONFLICT_EXISTING_SIGNATURE">Conflict</option>
                </select>
              </div>
              <button
                onClick={selectAllReady}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Select All Ready
              </button>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                      <input
                        type="checkbox"
                        checked={filteredResults.every((r, idx) => !r.canAttach || selectedRows.has(dryRunResults.indexOf(r)))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            selectAllReady()
                          } else {
                            setSelectedRows(new Set())
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detected Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Normalized Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matched Profile</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredResults.map((result, idx) => {
                    const originalIdx = dryRunResults.indexOf(result)
                    return (
                      <tr key={originalIdx} className={selectedRows.has(originalIdx) ? 'bg-blue-50' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(originalIdx)}
                            onChange={() => toggleRowSelection(originalIdx)}
                            disabled={!result.canAttach}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900">{result.detectedName}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{result.normalizedName}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{result.roleGuess}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {result.matchedProfile ? (
                            <span>
                              {result.matchedProfile.type}: {result.matchedProfile.name} ({result.matchedProfile.id.substring(0, 8)}...)
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {result.imageFound ? (
                            <span className="text-green-600 flex items-center">
                              <CheckCircle className="w-4 h-4 mr-1" />
                              {result.imageFilename}
                            </span>
                          ) : (
                            <span className="text-red-600 flex items-center">
                              <XCircle className="w-4 h-4 mr-1" />
                              Not found
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {getStatusBadge(result.status)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              Showing {filteredResults.length} of {dryRunResults.length} results
            </div>
          </>
        )}
      </div>

      {/* Card 3: Import */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Import</h2>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="overwrite"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="overwrite" className="ml-2 text-sm text-gray-700">
              Overwrite existing signature if present
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="audit"
              checked={createAuditLog}
              onChange={(e) => setCreateAuditLog(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="audit" className="ml-2 text-sm text-gray-700">
              Create audit log entry per update
            </label>
          </div>
          <button
            onClick={handleImport}
            disabled={selectedRows.size === 0 || loading || !excelFile || !zipFile}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import Selected ({selectedRows.size})
              </>
            )}
          </button>
        </div>
      </div>

      {/* Card 4: Rollback */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rollback</h2>
        {lastBatch ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <strong>Last Import Batch:</strong> {new Date(lastBatch.createdAt).toLocaleString()}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Items:</strong> {lastBatch.itemsCount}
              </p>
            </div>
            <button
              onClick={handleRollback}
              disabled={rollbackLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {rollbackLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Rolling back...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rollback Last Import Batch
                </>
              )}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No import batches available for rollback</p>
        )}
      </div>
    </div>
  )
}
