'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, ClipboardList, CheckSquare, Eye, Printer, Trash2, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

export function FormsDashboard() {
  const forms = [
    {
      id: 'parent-training-sign-in',
      title: 'Parent Training Sign-In Sheet',
      description: 'Track parent training attendance with signatures',
      icon: FileText,
      href: '/bcbas/forms/parent-training-sign-in',
      color: 'bg-blue-500',
    },
    {
      id: 'parent-abc-data',
      title: 'Parent ABC Data Sheet',
      description: 'Record Antecedent, Behavior, and Consequences data',
      icon: ClipboardList,
      href: '/bcbas/forms/parent-abc-data',
      color: 'bg-green-500',
    },
    {
      id: 'visit-attestation',
      title: 'Visit Attestation Form',
      description: 'Document provider visits with parent signatures',
      icon: CheckSquare,
      href: '/bcbas/forms/visit-attestation',
      color: 'bg-purple-500',
    },
  ]

  const [loadingList, setLoadingList] = useState(true)
  const [items, setItems] = useState<
    Array<{
      id: string
      type: 'parent-training-sign-in' | 'parent-abc-data' | 'visit-attestation'
      clientName: string
      month: number
      year: number
      createdAt: string
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
    if (type === 'parent-training-sign-in') return 'Parent Training Sign-In Sheet'
    if (type === 'parent-abc-data') return 'Parent ABC Data Sheet'
    if (type === 'visit-attestation') return 'Visit Attestation Form'
    return type
  }

  const typeHref = (type: string, id: string, print?: boolean) => {
    const base =
      type === 'parent-training-sign-in'
        ? `/bcbas/forms/parent-training-sign-in/${id}`
        : type === 'parent-abc-data'
          ? `/bcbas/forms/parent-abc-data/${id}`
          : `/bcbas/forms/visit-attestation/${id}`
    return print ? `${base}?print=1` : base
  }

  const typeEditHref = (type: string, id: string) => `${typeHref(type, id)}?edit=1`

  const refreshList = async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/bcbas/forms/list', { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to load saved forms')
      }
      const data = await res.json()
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

  const handleDelete = async (item: { id: string; type: string }) => {
    if (!confirm('Delete this form?')) return
    try {
      const apiPath =
        item.type === 'parent-training-sign-in'
          ? `/api/bcbas/forms/parent-training-sign-in/${item.id}`
          : item.type === 'parent-abc-data'
            ? `/api/bcbas/forms/parent-abc-data/${item.id}`
            : `/api/bcbas/forms/visit-attestation/${item.id}`

      const res = await fetch(apiPath, { method: 'DELETE' })
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
        <h1 className="text-3xl font-bold text-gray-900">BCBA Forms</h1>
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
        <p className="text-sm text-gray-600 mb-4">View, print, or delete previously saved forms.</p>

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
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Month</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Saved</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const savedAt = new Date(item.createdAt)
                  return (
                    <tr key={`${item.type}:${item.id}`} className="border-t">
                      <td className="px-4 py-3">{typeLabel(item.type)}</td>
                      <td className="px-4 py-3">{item.clientName}</td>
                      <td className="px-4 py-3">
                        {monthNames[item.month - 1] || `Month ${item.month}`}
                      </td>
                      <td className="px-4 py-3">
                        {isNaN(savedAt.getTime()) ? '' : savedAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={typeHref(item.type, item.id)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View</span>
                          </Link>
                          <Link
                            href={typeEditHref(item.type, item.id)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                            <span>Edit</span>
                          </Link>
                          <Link
                            href={typeHref(item.type, item.id, true)}
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
                            onClick={() => handleDelete(item)}
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
