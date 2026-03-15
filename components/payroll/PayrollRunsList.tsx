'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ArrowRight, Calendar, User, DollarSign, AlertCircle, Edit, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface PayrollRun {
  id: string
  name: string
  periodStart: string
  periodEnd: string
  status: 'DRAFT' | 'APPROVED' | 'PAID_PARTIAL' | 'PAID_FULL'
  createdAt: string
  createdBy: {
    id: string
    username: string | null
    email: string | null
  }
  _count: {
    lines: number
  }
}

export function PayrollRunsList({ permissions, userRole }: { permissions: any, userRole: string }) {
  const router = useRouter()
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  const canEdit = permissions['PAYROLL_RUN_CREATE']?.canView === true || isAdmin
  const canDelete = isAdmin || permissions['PAYROLL_RUN_CREATE']?.canView === true

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID_FULL':
        return 'bg-green-100 text-green-800'
      case 'PAID_PARTIAL':
        return 'bg-yellow-100 text-yellow-800'
      case 'APPROVED':
        return 'bg-blue-100 text-blue-800'
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDelete = async (runId: string, runName: string) => {
    if (!confirm(`Are you sure you want to delete the payroll run "${runName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(runId)
    try {
      const response = await fetch(`/api/payroll/runs/${runId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete payroll run')
      }

      toast.success('Payroll run deleted successfully')
      fetchRuns() // Refresh list
    } catch (error: any) {
      console.error('Error deleting run:', error)
      toast.error(error.message || 'Failed to delete payroll run')
    } finally {
      setDeletingId(null)
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
          <h1 className="text-3xl font-bold text-gray-900">Payroll Runs</h1>
          <p className="mt-2 text-sm text-gray-600">
            View and manage payroll runs
          </p>
        </div>
        <Link
          href="/payroll/runs/new"
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Run
        </Link>
      </div>

      {/* Runs List */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">Loading runs...</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No payroll runs yet</h3>
          <p className="text-gray-600 mb-6">Create your first payroll run to get started</p>
          <Link
            href="/payroll/runs/new"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Run
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{run.name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {format(new Date(run.periodStart), 'MM/dd/yyyy')} - {format(new Date(run.periodEnd), 'MM/dd/yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(run.status)}`}>
                      {run.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {run._count.lines} employee{run._count.lines !== 1 ? 's' : ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-1" />
                      {run.createdBy.username || run.createdBy.email || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(run.createdAt), 'MM/dd/yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/payroll/runs/${run.id}`}
                        className="text-primary-600 hover:text-primary-900 flex items-center"
                      >
                        View <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                      {canEdit && (
                        <Link
                          href={`/payroll/runs/${run.id}/edit`}
                          className="text-gray-600 hover:text-gray-900 flex items-center"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(run.id, run.name)}
                          disabled={deletingId === run.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
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
