'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { formatDate } from '@/lib/utils'
import { format } from 'date-fns'

interface Client {
  id: string
  name: string
  insurance: {
    id: string
    name: string
  }
}

interface Timesheet {
  id: string
  startDate: string
  endDate: string
  provider: { name: string }
  entries: Array<{
    minutes: number
    units: number
  }>
}

interface InvoiceFormProps {
  clients: Client[]
}

export function InvoiceForm({ clients }: InvoiceFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState('')
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [availableTimesheets, setAvailableTimesheets] = useState<Timesheet[]>([])
  const [selectedTimesheets, setSelectedTimesheets] = useState<Set<string>>(
    new Set()
  )
  const [loadingTimesheets, setLoadingTimesheets] = useState(false)

  useEffect(() => {
    if (clientId && startDate && endDate) {
      fetchAvailableTimesheets()
    } else {
      setAvailableTimesheets([])
      setSelectedTimesheets(new Set())
    }
  }, [clientId, startDate, endDate])

  const fetchAvailableTimesheets = async () => {
    if (!clientId || !startDate || !endDate) return

    setLoadingTimesheets(true)
    try {
      const res = await fetch(
        `/api/timesheets?clientId=${clientId}&status=APPROVED&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        // Filter out locked timesheets
        const unlocked = data.timesheets.filter(
          (ts: any) => !ts.lockedAt
        )
        setAvailableTimesheets(unlocked)
      }
    } catch (error) {
      toast.error('Failed to load timesheets')
    } finally {
      setLoadingTimesheets(false)
    }
  }

  const toggleTimesheet = (id: string) => {
    const newSelected = new Set(selectedTimesheets)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedTimesheets(newSelected)
  }

  const selectAll = () => {
    const allIds = new Set(availableTimesheets.map((ts) => ts.id))
    setSelectedTimesheets(allIds)
  }

  const deselectAll = () => {
    setSelectedTimesheets(new Set())
  }

  const calculateTotalHours = (timesheets: Timesheet[]) => {
    return timesheets.reduce((sum, ts) => {
      const minutes = ts.entries.reduce((s, e) => s + e.minutes, 0)
      return sum + minutes / 60
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!clientId || !startDate || !endDate) {
      toast.error('Please fill all required fields')
      return
    }

    if (selectedTimesheets.size === 0) {
      toast.error('Please select at least one timesheet')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          timesheetIds: Array.from(selectedTimesheets),
        }),
      })

      if (res.ok) {
        toast.success('Invoice created successfully')
        router.push('/invoices')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create invoice')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const selectedTimesheetsList = availableTimesheets.filter((ts) =>
    selectedTimesheets.has(ts.id)
  )

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/invoices"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Invoices
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create New Invoice</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.insurance.name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                selected={startDate}
                onChange={(date) => setStartDate(date)}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholderText="mm/dd/yyyy"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                selected={endDate}
                onChange={(date) => setEndDate(date)}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholderText="mm/dd/yyyy"
                required
              />
            </div>
          </div>
        </div>

        {loadingTimesheets && (
          <div className="bg-white shadow rounded-lg p-6 text-center">
            Loading available timesheets...
          </div>
        )}

        {!loadingTimesheets && availableTimesheets.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Available Timesheets</h2>
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-sm text-gray-600 hover:text-gray-700"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availableTimesheets.map((timesheet) => (
                <label
                  key={timesheet.id}
                  className="flex items-center space-x-3 p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTimesheets.has(timesheet.id)}
                    onChange={() => toggleTimesheet(timesheet.id)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {timesheet.provider.name} -{' '}
                      {format(new Date(timesheet.startDate), 'MMM d')} to{' '}
                      {format(new Date(timesheet.endDate), 'MMM d')}
                    </div>
                    <div className="text-sm text-gray-500">
                      {calculateTotalHours([timesheet]).toFixed(2)} hours
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {selectedTimesheets.size > 0 && (
              <div className="mt-4 p-4 bg-primary-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">
                    {selectedTimesheets.size} timesheet(s) selected
                  </span>
                  <span className="font-bold text-primary-700">
                    Total: {calculateTotalHours(selectedTimesheetsList).toFixed(2)} hours
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {!loadingTimesheets &&
          clientId &&
          startDate &&
          endDate &&
          availableTimesheets.length === 0 && (
            <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
              No approved, unlocked timesheets found for the selected client and date
              range.
            </div>
          )}

        <div className="flex justify-end space-x-3">
          <Link
            href="/invoices"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || selectedTimesheets.size === 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  )
}
