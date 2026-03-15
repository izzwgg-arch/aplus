'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Edit, Trash2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'

interface BCBA {
  id: string
  name: string
  email: string | null
  phone: string | null
  createdAt: string
}

export function BCBAsList() {
  const [bcbas, setBcbas] = useState<BCBA[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchBCBAs()
  }, [])

  const fetchBCBAs = async () => {
    try {
      const res = await fetch('/api/bcbas')
      if (res.ok) {
        const data = await res.json()
        setBcbas(data)
      }
    } catch (error) {
      toast.error('Failed to load BCBAs')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this BCBA?')) return

    try {
      const res = await fetch(`/api/bcbas/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('BCBA deleted')
        fetchBCBAs()
      } else {
        toast.error('Failed to delete BCBA')
      }
    } catch (error) {
      toast.error('Failed to delete BCBA')
    }
  }

  const filteredBCBAs = bcbas.filter(
    (bcba) =>
      bcba.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bcba.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return <div className="text-center py-12">Loading BCBAs...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BCBAs</h1>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/bcbas/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add BCBA</span>
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search BCBAs..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {filteredBCBAs.map((bcba) => (
            <li key={bcba.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-semibold">
                      {bcba.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {bcba.name}
                    </div>
                    {bcba.email && (
                      <div className="text-sm text-gray-500">{bcba.email}</div>
                    )}
                    {bcba.phone && (
                      <div className="text-sm text-gray-500">{bcba.phone}</div>
                    )}
                  </div>
                </div>
                <RowActionsMenu>
                  <Link
                    href={`/bcbas/${bcba.id}/edit`}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(bcba.id)}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 min-h-[44px]"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </button>
                </RowActionsMenu>
              </div>
            </li>
          ))}
        </ul>
        {filteredBCBAs.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No BCBAs found
          </div>
        )}
      </div>
    </div>
  )
}
