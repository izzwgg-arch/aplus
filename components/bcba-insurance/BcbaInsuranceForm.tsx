'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

interface BcbaInsuranceFormProps {
  insurance?: {
    id: string
    name: string
    ratePerUnit: number
    unitMinutes: number
    active: boolean
    notes?: string | null
  }
}

export function BcbaInsuranceForm({ insurance }: BcbaInsuranceFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(insurance?.name || '')
  const [ratePerUnit, setRatePerUnit] = useState(insurance?.ratePerUnit?.toString() || '0.00')
  const [unitMinutes, setUnitMinutes] = useState(insurance?.unitMinutes?.toString() || '15')
  const [active, setActive] = useState(insurance?.active ?? true)
  const [notes, setNotes] = useState(insurance?.notes || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    const rate = parseFloat(ratePerUnit)
    if (isNaN(rate) || rate < 0) {
      toast.error('Rate must be a valid positive number')
      return
    }

    const unitMins = parseInt(unitMinutes)
    if (isNaN(unitMins) || unitMins <= 0) {
      toast.error('Unit minutes must be a positive number')
      return
    }

    setLoading(true)

    try {
      const url = insurance 
        ? `/api/bcba-insurance/${insurance.id}`
        : '/api/bcba-insurance'
      
      const method = insurance ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ratePerUnit: rate,
          unitMinutes: unitMins,
          active,
          notes: notes.trim() || null,
        }),
      })

      if (res.ok) {
        toast.success(`BCBA Insurance ${insurance ? 'updated' : 'created'} successfully`)
        if (insurance) {
          toast('Rate changes will not affect existing invoices')
        }
        router.push('/bcba-insurance')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save BCBA insurance')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/bcba-insurance"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to BCBA Insurance
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {insurance ? 'Edit BCBA Insurance' : 'Create New BCBA Insurance'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              BCBA Insurance Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="ratePerUnit" className="block text-sm font-medium text-gray-700 mb-1">
              Rate per Unit <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                type="number"
                id="ratePerUnit"
                required
                step="0.01"
                min="0"
                value={ratePerUnit}
                onChange={(e) => setRatePerUnit(e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              1 unit = {unitMinutes || 15} minutes
            </p>
            {insurance && (
              <p className="mt-1 text-sm text-amber-600">
                ⚠️ Rate changes will not affect existing invoices
              </p>
            )}
          </div>

          <div>
            <label htmlFor="unitMinutes" className="block text-sm font-medium text-gray-700 mb-1">
              Unit Minutes <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="unitMinutes"
              required
              min="1"
              value={unitMinutes}
              onChange={(e) => setUnitMinutes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Number of minutes per unit (default: 15 minutes)
            </p>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              placeholder="Additional notes about this BCBA insurance..."
            />
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Link
              href="/bcba-insurance"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : insurance ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
