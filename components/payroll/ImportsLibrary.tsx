'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Upload, FileSpreadsheet, Calendar, User, AlertCircle, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface PayrollImport {
  id: string
  originalFileName: string
  uploadedAt: string
  status: 'DRAFT' | 'FINALIZED'
  periodStart: string | null
  periodEnd: string | null
  uploadedBy: {
    id: string
    username: string | null
    email: string | null
  }
  _count: {
    rows: number
  }
}

export function ImportsLibrary({
  permissions,
  userRole,
  canView,
}: {
  permissions: any
  userRole: string
  canView?: boolean
}) {
  const [imports, setImports] = useState<PayrollImport[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const canDelete = canView === true ||
    permissions['PAYROLL_IMPORT_EDIT']?.canView === true ||
    permissions['PAYROLL_VIEW']?.canView === true ||
    userRole === 'ADMIN' ||
    userRole === 'SUPER_ADMIN'

  useEffect(() => {
    fetchImports()
  }, [])

  const fetchImports = async () => {
    try {
      const response = await fetch('/api/payroll/imports')
      if (response.ok) {
        const data = await response.json()
        setImports(data.imports || [])
      }
    } catch (error) {
      console.error('Failed to fetch imports:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (importId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This will also delete all associated import rows. This action cannot be undone.`)) {
      return
    }

    setDeletingId(importId)
    try {
      const response = await fetch(`/api/payroll/imports/${importId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete import')
      }

      toast.success('Import deleted successfully')
      // Refresh the list
      await fetchImports()
    } catch (error: any) {
      console.error('Error deleting import:', error)
      toast.error(error.message || 'Failed to delete import')
    } finally {
      setDeletingId(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINALIZED':
        return 'bg-green-100 text-green-800'
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/payroll"
            className="flex items-center text-white hover:text-gray-100 mb-2"
          >
            ← Back to Payroll
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Imports Library</h1>
          <p className="mt-2 text-sm text-gray-600">
            View and manage imported time log files
          </p>
        </div>
        <Link
          href="/payroll/imports/new"
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center"
        >
          <Upload className="w-4 h-4 mr-2" />
          New Import
        </Link>
      </div>

      {/* Imports List */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">Loading imports...</p>
        </div>
      ) : imports.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No imports yet</h3>
          <p className="text-gray-600 mb-6">Get started by uploading your first time log file</p>
          <Link
            href="/payroll/imports/new"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            New Import
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">File Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Rows</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Period</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Uploaded By</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Uploaded At</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {imports.map((importItem) => (
                <tr key={importItem.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <FileSpreadsheet className="w-5 h-5 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-900">{importItem.originalFileName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(importItem.status)}`}>
                      {importItem.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                    {importItem._count.rows}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500">
                    {importItem.periodStart && importItem.periodEnd ? (
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {format(new Date(importItem.periodStart), 'MM/dd/yyyy')} - {format(new Date(importItem.periodEnd), 'MM/dd/yyyy')}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500">
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-1" />
                      {importItem.uploadedBy.username || importItem.uploadedBy.email || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(importItem.uploadedAt), 'MM/dd/yyyy HH:mm')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm">
                    <div className="flex items-center space-x-3">
                      <Link
                        href={`/payroll/imports/${importItem.id}`}
                        className="text-primary-600 hover:text-primary-900 flex items-center"
                        title="View/Edit"
                      >
                        <span className="text-sm">View/Edit</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(importItem.id, importItem.originalFileName)}
                          disabled={deletingId === importItem.id}
                          className="text-red-600 hover:text-red-900 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete import"
                        >
                        <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
