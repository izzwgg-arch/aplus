'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Edit, Trash2, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'

interface BcbaInsurance {
  id: string
  name: string
  ratePerUnit: number
  unitMinutes: number
  active: boolean
  notes?: string | null
  createdAt: string
}

export function BcbaInsuranceList() {
  const [insurances, setInsurances] = useState<BcbaInsurance[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchInsurances()
  }, [])

  const fetchInsurances = async () => {
    try {
      const res = await fetch('/api/bcba-insurance')
      if (res.ok) {
        const data = await res.json()
        setInsurances(data)
      } else {
        toast.error('Failed to load BCBA insurance')
      }
    } catch (error) {
      toast.error('Failed to load BCBA insurance')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this BCBA insurance?')) return

    try {
      const res = await fetch(`/api/bcba-insurance/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('BCBA Insurance deleted')
        fetchInsurances()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete BCBA insurance')
      }
    } catch (error) {
      toast.error('Failed to delete BCBA insurance')
    }
  }

  const filteredInsurances = insurances.filter((insurance) =>
    insurance.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return <div className="text-center py-12">Loading BCBA insurance...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BCBA Insurance</h1>
          <p className="text-sm text-gray-600 mt-1">Manage BCBA insurance rates and billing units</p>
        </div>
        <Link
          href="/bcba-insurance/new"
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add BCBA Insurance</span>
        </Link>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search BCBA insurance..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {filteredInsurances.map((insurance) => (
            <li key={insurance.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center text-white">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {insurance.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      Rate: ${parseFloat(insurance.ratePerUnit.toString()).toFixed(2)} per {insurance.unitMinutes || 15} min unit
                    </div>
                    {insurance.notes && (
                      <div className="text-xs text-gray-400 mt-1">
                        {insurance.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      insurance.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {insurance.active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  <RowActionsMenu>
                    <Link
                      href={`/bcba-insurance/${insurance.id}/edit`}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(insurance.id)}
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
        {filteredInsurances.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No BCBA insurance found
          </div>
        )}
      </div>
    </div>
  )
}
