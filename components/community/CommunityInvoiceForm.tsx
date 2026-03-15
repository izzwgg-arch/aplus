'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import toast from 'react-hot-toast'

interface CommunityClient {
  id: string
  firstName: string
  lastName: string
  deletedAt?: string | null
}

interface CommunityClass {
  id: string
  name: string
  ratePerUnit: number
  deletedAt?: string | null
  isActive?: boolean
}

interface CommunityInvoiceFormProps {
  invoice?: {
    id: string
    clientId: string
    classId: string
    units: number
    serviceDate: string | null
    notes: string | null
  }
}

export function CommunityInvoiceForm({ invoice }: CommunityInvoiceFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<CommunityClient[]>([])
  const [classes, setClasses] = useState<CommunityClass[]>([])
  const [clientId, setClientId] = useState(invoice?.clientId || '')
  const [classId, setClassId] = useState(invoice?.classId || '')
  const [units, setUnits] = useState(invoice?.units?.toString() || '')
  const [serviceDate, setServiceDate] = useState(invoice?.serviceDate ? invoice.serviceDate.split('T')[0] : '')
  const [notes, setNotes] = useState(invoice?.notes || '')
  const [calculatedTotal, setCalculatedTotal] = useState(0)

  useEffect(() => {
    fetchClients()
    fetchClasses()
  }, [])

  useEffect(() => {
    if (classId && units) {
      const selectedClass = classes.find(c => c.id === classId)
      if (selectedClass) {
        const total = parseFloat(units) * selectedClass.ratePerUnit
        setCalculatedTotal(total)
      }
    } else {
      setCalculatedTotal(0)
    }
  }, [classId, units, classes])

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/community/clients')
      if (res.ok) {
        const data = await res.json()
        setClients(data.filter((c: CommunityClient) => !c.deletedAt))
      }
    } catch (error) {
      toast.error('Failed to load clients')
    }
  }

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/community/classes')
      if (res.ok) {
        const data = await res.json()
        setClasses(data.filter((c: CommunityClass) => !c.deletedAt && (c.isActive !== false)))
      }
    } catch (error) {
      toast.error('Failed to load classes')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!clientId || !classId || !units || parseFloat(units) <= 0) {
      toast.error('Client, class, and units (positive number) are required')
      return
    }

    setLoading(true)

    try {
      const url = invoice 
        ? `/api/community/invoices/${invoice.id}`
        : '/api/community/invoices'
      
      const method = invoice ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          classId,
          units: parseInt(units),
          serviceDate: serviceDate || null,
          notes: notes.trim() || null,
        }),
      })

      if (res.ok) {
        toast.success(`Community invoice ${invoice ? 'updated' : 'created'} successfully`)
        router.push('/community/invoices')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save community invoice')
      }
    } catch (error) {
      toast.error('Failed to save community invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/community/invoices"
          className="inline-flex items-center text-sm text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Community Invoices
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {invoice ? 'Edit Community Invoice' : 'New Community Invoice'}
        </h1>
        <p className="text-gray-600 mt-1">
          {invoice ? 'Update invoice information' : 'Create a new community invoice'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={!!invoice}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.firstName} {client.lastName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Class <span className="text-red-500">*</span>
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              disabled={!!invoice}
            >
              <option value="">Select a class</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} (${classItem.ratePerUnit.toFixed(2)}/unit)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Units (30-min units) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="2"
              required
              disabled={!!invoice}
            />
            <p className="mt-1 text-xs text-gray-500">
              Number of 30-minute units
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Amount
            </label>
            <div className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-semibold">
              {calculatedTotal > 0 ? `$${calculatedTotal.toFixed(2)}` : '-'}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Calculated: {units || 0} units × {classId ? (classes.find(c => c.id === classId)?.ratePerUnit.toFixed(2) || '0.00') : '0.00'} = ${calculatedTotal.toFixed(2)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Date
            </label>
            <input
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional notes about this invoice..."
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Link
            href="/community/invoices"
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
