'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  checkNumber: string | null
  notes: string | null
  regularRatePerUnit: number | null
  bcbaRatePerUnit: number | null
}

interface InvoiceEditFormProps {
  invoice: Invoice
}

export function InvoiceEditForm({ invoice }: InvoiceEditFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(invoice.status)
  const [checkNumber, setCheckNumber] = useState(invoice.checkNumber || '')
  const [notes, setNotes] = useState(invoice.notes || '')
  const [regularRatePerUnit, setRegularRatePerUnit] = useState(
    invoice.regularRatePerUnit !== null ? invoice.regularRatePerUnit.toString() : ''
  )
  const [bcbaRatePerUnit, setBcbaRatePerUnit] = useState(
    invoice.bcbaRatePerUnit !== null ? invoice.bcbaRatePerUnit.toString() : ''
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setLoading(true)

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          checkNumber: checkNumber.trim() || null,
          notes: notes.trim() || null,
          regularRatePerUnit: regularRatePerUnit ? Number(regularRatePerUnit) : null,
          bcbaRatePerUnit: bcbaRatePerUnit ? Number(bcbaRatePerUnit) : null,
        }),
      })

      if (res.ok) {
        toast.success('Invoice updated successfully')
        router.push(`/invoices/${invoice.id}`)
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update invoice')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const statusOptions = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'READY', label: 'Ready' },
    { value: 'SENT', label: 'Sent' },
    { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
    { value: 'PAID', label: 'Paid' },
    { value: 'VOID', label: 'Void' },
  ]

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href={`/invoices/${invoice.id}`}
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Invoice
        </Link>
        <h1 className="text-3xl font-bold" style={{ color: '#ffffff' }}>
          Edit Invoice {invoice.invoiceNumber}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Invoice Details</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check Number
              </label>
              <input
                type="text"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter check number (optional)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter notes (optional)"
              />
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Rate Per Unit</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Regular Rate Per Unit
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={regularRatePerUnit}
                onChange={(e) => setRegularRatePerUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter regular rate"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                BCBA Rate Per Unit
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={bcbaRatePerUnit}
                onChange={(e) => setBcbaRatePerUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter BCBA rate"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <Link
            href={`/invoices/${invoice.id}`}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
