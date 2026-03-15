'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

interface InsuranceFormProps {
  insurance?: {
    id: string
    name: string
    ratePerUnit: number
    regularRatePerUnit?: number | null
    regularUnitMinutes?: number | null
    bcbaRatePerUnit?: number | null
    bcbaUnitMinutes?: number | null
    active: boolean
  }
}

export function InsuranceForm({ insurance }: InsuranceFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(insurance?.name || '')
  // Regular Timesheet fields
  const [regularRatePerUnit, setRegularRatePerUnit] = useState(
    insurance?.regularRatePerUnit?.toString() || insurance?.ratePerUnit?.toString() || '0.00'
  )
  const [regularUnitMinutes, setRegularUnitMinutes] = useState(
    insurance?.regularUnitMinutes?.toString() || '15'
  )
  // BCBA Timesheet fields
  const [bcbaRatePerUnit, setBcbaRatePerUnit] = useState(
    insurance?.bcbaRatePerUnit?.toString() || insurance?.regularRatePerUnit?.toString() || insurance?.ratePerUnit?.toString() || '0.00'
  )
  const [bcbaUnitMinutes, setBcbaUnitMinutes] = useState(
    insurance?.bcbaUnitMinutes?.toString() || insurance?.regularUnitMinutes?.toString() || '15'
  )
  const [useSameAsRegular, setUseSameAsRegular] = useState(
    !insurance?.bcbaRatePerUnit && !insurance?.bcbaUnitMinutes
  )
  const [active, setActive] = useState(insurance?.active ?? true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    // Validate regular fields
    const regularRate = parseFloat(regularRatePerUnit)
    if (isNaN(regularRate) || regularRate < 0) {
      toast.error('Regular rate must be a valid positive number')
      return
    }
    const regularMins = parseInt(regularUnitMinutes)
    if (isNaN(regularMins) || regularMins <= 0) {
      toast.error('Regular unit minutes must be a positive number')
      return
    }

    // Validate BCBA fields
    const bcbaRate = parseFloat(bcbaRatePerUnit)
    if (isNaN(bcbaRate) || bcbaRate < 0) {
      toast.error('BCBA rate must be a valid positive number')
      return
    }
    const bcbaMins = parseInt(bcbaUnitMinutes)
    if (isNaN(bcbaMins) || bcbaMins <= 0) {
      toast.error('BCBA unit minutes must be a positive number')
      return
    }

    setLoading(true)

    try {
      const url = insurance 
        ? `/api/insurance/${insurance.id}`
        : '/api/insurance'
      
      const method = insurance ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ratePerUnit: regularRate, // Keep for backward compatibility
          regularRatePerUnit: regularRate,
          regularUnitMinutes: regularMins,
          bcbaRatePerUnit: useSameAsRegular ? regularRate : bcbaRate,
          bcbaUnitMinutes: useSameAsRegular ? regularMins : bcbaMins,
          active,
        }),
      })

      if (res.ok) {
        toast.success(`Insurance ${insurance ? 'updated' : 'created'} successfully`)
        if (insurance) {
          toast('Rate changes will not affect existing invoices')
          router.push(`/insurance/${insurance.id}/edit`)
          router.refresh() // Force refresh to show updated values
        } else {
          router.push('/insurance')
          router.refresh()
        }
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save insurance')
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
          href="/insurance"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Insurance
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {insurance ? 'Edit Insurance' : 'Create New Insurance'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Insurance Name <span className="text-red-500">*</span>
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

          {/* Regular Timesheets Section */}
          <div className="border-b pb-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Regular Timesheets</h3>
            <div>
              <label htmlFor="regularRatePerUnit" className="block text-sm font-medium text-gray-700 mb-1">
                Regular Rate per Unit <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  id="regularRatePerUnit"
                  required
                  step="0.01"
                  min="0"
                  value={regularRatePerUnit}
                  onChange={(e) => setRegularRatePerUnit(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="regularUnitMinutes" className="block text-sm font-medium text-gray-700 mb-1">
                Regular Minutes per Unit <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="regularUnitMinutes"
                required
                min="1"
                value={regularUnitMinutes}
                onChange={(e) => setRegularUnitMinutes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                1 unit = {regularUnitMinutes || 15} minutes
              </p>
            </div>
          </div>

          {/* BCBA Timesheets Section */}
          <div className="border-b pb-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">BCBA Timesheets</h3>
            <div className="mb-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={useSameAsRegular}
                  onChange={(e) => {
                    setUseSameAsRegular(e.target.checked)
                    if (e.target.checked) {
                      setBcbaRatePerUnit(regularRatePerUnit)
                      setBcbaUnitMinutes(regularUnitMinutes)
                    }
                  }}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">Use same as regular</span>
              </label>
            </div>
            <div>
              <label htmlFor="bcbaRatePerUnit" className="block text-sm font-medium text-gray-700 mb-1">
                BCBA Rate per Unit <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  id="bcbaRatePerUnit"
                  required
                  step="0.01"
                  min="0"
                  value={bcbaRatePerUnit}
                  onChange={(e) => {
                    setBcbaRatePerUnit(e.target.value)
                    setUseSameAsRegular(false)
                  }}
                  disabled={useSameAsRegular}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="bcbaUnitMinutes" className="block text-sm font-medium text-gray-700 mb-1">
                BCBA Minutes per Unit <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="bcbaUnitMinutes"
                required
                min="1"
                value={bcbaUnitMinutes}
                onChange={(e) => {
                  setBcbaUnitMinutes(e.target.value)
                  setUseSameAsRegular(false)
                }}
                disabled={useSameAsRegular}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="mt-1 text-sm text-gray-500">
                1 unit = {bcbaUnitMinutes || 15} minutes
              </p>
            </div>
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
              href="/insurance"
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
