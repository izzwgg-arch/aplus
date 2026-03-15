'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Plus, Download, Search, Edit, Trash2, FileText, FileSpreadsheet, Upload, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { exportToCSV, exportToExcel, formatProvidersForExport } from '@/lib/exportUtils'
import { ImportModal } from '@/components/shared/ImportModal'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'

interface Provider {
  id: string
  name: string
  email: string | null
  phone: string | null
  active: boolean
  createdAt: string
}

export function ProvidersList() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers')
      if (res.ok) {
        const data = await res.json()
        setProviders(data)
      }
    } catch (error) {
      toast.error('Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return

    try {
      const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Provider deleted')
        fetchProviders()
      } else {
        toast.error('Failed to delete provider')
      }
    } catch (error) {
      toast.error('Failed to delete provider')
    }
  }

  const handleSendSignature = async (provider: Provider) => {
    if (!provider.email) {
      toast.error('Provider email is missing')
      return
    }

    setSendingId(provider.id)
    try {
      const res = await fetch('/api/signature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'PROVIDER',
          entityId: provider.id,
        }),
      })

      if (res.ok) {
        toast.success('Signature link sent')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to send signature link')
      }
    } catch (error) {
      toast.error('Failed to send signature link')
    } finally {
      setSendingId(null)
    }
  }

  const filteredProviders = providers.filter((provider) =>
    provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    provider.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleExportCSV = () => {
    const data = formatProvidersForExport(filteredProviders)
    exportToCSV(data, `providers-${new Date().toISOString().split('T')[0]}`)
    setShowExportMenu(false)
    toast.success('Providers exported to CSV')
  }

  const handleExportExcel = () => {
    const data = formatProvidersForExport(filteredProviders)
    exportToExcel(data, `providers-${new Date().toISOString().split('T')[0]}`, 'Providers')
    setShowExportMenu(false)
    toast.success('Providers exported to Excel')
  }

  const handleImport = async (file: File): Promise<{ success: number; errors: string[] }> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/providers/import', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to import providers')
    }

    const result = await res.json()
    
    // Refresh the list
    if (result.success > 0) {
      fetchProviders()
    }

    return result
  }

  if (loading) {
    return <div className="text-center py-12">Loading providers...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Providers</h1>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                <div className="py-1">
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </button>
                </div>
              </div>
            )}
          </div>
          <Link
            href="/providers/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Provider</span>
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search providers..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {filteredProviders.map((provider) => (
            <li key={provider.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-semibold">
                      {provider.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {provider.name}
                    </div>
                    {provider.email && (
                      <div className="text-sm text-gray-500">{provider.email}</div>
                    )}
                    {provider.phone && (
                      <div className="text-sm text-gray-500">{provider.phone}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      provider.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {provider.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  <RowActionsMenu>
                    <button
                      onClick={() => handleSendSignature(provider)}
                      disabled={sendingId === provider.id}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px] disabled:opacity-50"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingId === provider.id ? 'Sending...' : 'Send Signature Link'}
                    </button>
                    <Link
                      href={`/providers/${provider.id}/edit`}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(provider.id)}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </button>
                  </RowActionsMenu>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {filteredProviders.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No providers found
          </div>
        )}
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        title="Import Providers from Excel"
        description="Upload an Excel file (.xlsx or .xls) to import multiple providers at once. The first row should contain column headers."
        exampleHeaders={['Name', 'Email', 'Phone', 'Active']}
      />
    </div>
  )
}
