'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import toast from 'react-hot-toast'

interface CommunityClassFormProps {
  classItem?: {
    id: string
    name: string
    ratePerUnit: number
    isActive: boolean
  }
}

export function CommunityClassForm({ classItem }: CommunityClassFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(classItem?.name || '')
  const [ratePerUnit, setRatePerUnit] = useState(classItem?.ratePerUnit.toString() || '')
  const [isActive, setIsActive] = useState(classItem?.isActive ?? true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Class name is required')
      return
    }

    if (!ratePerUnit || parseFloat(ratePerUnit) <= 0) {
      toast.error('Rate per unit must be a positive number')
      return
    }

    setLoading(true)

    try {
      const url = classItem 
        ? `/api/community/classes/${classItem.id}`
        : '/api/community/classes'
      
      const method = classItem ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ratePerUnit: parseFloat(ratePerUnit),
          isActive,
        }),
      })

      if (res.ok) {
        toast.success(`Community class ${classItem ? 'updated' : 'created'} successfully`)
        router.push('/community/classes')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save community class')
      }
    } catch (error) {
      toast.error('Failed to save community class')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/community/classes"
          className="inline-flex items-center text-sm text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Community Classes
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {classItem ? 'Edit Community Class' : 'New Community Class'}
        </h1>
        <p className="text-gray-600 mt-1">
          {classItem ? 'Update class information' : 'Create a new community class. Rate is per 30-minute unit.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Class Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Yoga, Pilates, Art Class"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rate Per Unit (30 min) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ratePerUnit}
                onChange={(e) => setRatePerUnit(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="25.00"
                required
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Rate charged per 30-minute unit
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={isActive ? 'true' : 'false'}
              onChange={(e) => setIsActive(e.target.value === 'true')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Link
            href="/community/classes"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
