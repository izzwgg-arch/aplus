'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, ClipboardList, CheckSquare, Eye, Pencil, Printer, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export function FormsDashboard() {
  const forms = [
    {
      id: 'parent-training-sign-in',
      title: 'Parent Training Sign-In Sheet',
      description: 'Track parent training attendance with signatures',
      icon: FileText,
      href: '/forms/parent-training',
      color: 'bg-blue-500',
    },
    {
      id: 'parent-abc-data',
      title: 'Parent ABC Data Sheet',
      description: 'Record Antecedent, Behavior, and Consequences data',
      icon: ClipboardList,
      href: '/forms/parent-abc',
      color: 'bg-green-500',
    },
    {
      id: 'visit-attestation',
      title: 'Visit Attestation Form',
      description: 'Document provider visits with parent signatures',
      icon: CheckSquare,
      href: '/forms/visit-attestation',
      color: 'bg-purple-500',
    },
  ]

  const [loadingList, setLoadingList] = useState(true)
  const [items, setItems] = useState<
    Array<{
      id: string
      type: 'PARENT_TRAINING' | 'PARENT_ABC' | 'VISIT_ATTESTATION'
      clientId: string
      clientName: string
      providerId: string | null
      providerName: string | null
      month: number
      year: number | null
      updatedAt: string
    }>
  >([])

  const monthNames = useMemo(
    () => [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    []
  )

  const typeLabel = (type: string) => {
    if (type === 'PARENT_TRAINING') return 'Parent Training Sign-In Sheet'
    if (type === 'PARENT_ABC') return 'Parent ABC Data Sheet'
    if (type === 'VISIT_ATTESTATION') return 'Visit Attestation Form'
    return type
  }

  const typeHref = (item: {
    type: string
    clientId: string
    providerId: string | null
    month: number
    year: number | null
  }, mode: 'view' | 'edit' | 'print') => {
    const year = item.year ?? new Date().getFullYear()
    const base =
      item.type === 'PARENT_TRAINING'
        ? '/forms/parent-training'
        : item.type === 'PARENT_ABC'
          ? '/forms/parent-abc'
          : '/forms/visit-attestation'

    const qs = new URLSearchParams()
    qs.set('clientId', item.clientId)
    qs.set('month', String(item.month))
    qs.set('year', String(year))
    if (item.type === 'VISIT_ATTESTATION' && item.providerId) {
      qs.set('providerId', item.providerId)
    }
    qs.set('mode', mode)
    return `${base}?${qs.toString()}`
  }

  const refreshList = async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/forms/list', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load saved forms')
      setItems(data.items || [])
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load saved forms')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    refreshList()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this form?')) return
    try {
      const res = await fetch(`/api/forms/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to delete form')
      toast.success('Form deleted')
      refreshList()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete form')
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Forms</h1>
        <p className="mt-2 text-sm text-gray-600">Select a form to view or create entries</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {forms.map((form) => {
          const Icon = form.icon
          return (
            <Link
              key={form.id}
              href={form.href}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border border-gray-200"
            >
              <div className={`${form.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{form.title}</h2>
              <p className="text-sm text-gray-600">{form.description}</p>
            </Link>
          )
        })}
      </div>

      <div className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Saved Forms</h2>
        <p className="text-sm text-gray-600 mb-4">View, edit, print, or delete previously saved forms.</p>

        {loadingList ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-gray-600">Loading...</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-gray-600">No saved forms yet.</div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Provider</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Month</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Updated</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const updatedAt = new Date(item.updatedAt)
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-3">{typeLabel(item.type)}</td>
                      <td className="px-4 py-3">{item.clientName}</td>
                      <td className="px-4 py-3">{item.providerName || ''}</td>
                      <td className="px-4 py-3">
                        {monthNames[item.month - 1] || `Month ${item.month}`}
                      </td>
                      <td className="px-4 py-3">
                        {isNaN(updatedAt.getTime()) ? '' : updatedAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={typeHref(item, 'view')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View</span>
                          </Link>
                          <Link
                            href={typeHref(item, 'edit')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                            <span>Edit</span>
                          </Link>
                          <Link
                            href={typeHref(item, 'print')}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                            title="Print"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Printer className="w-4 h-4" />
                            <span>Print</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
