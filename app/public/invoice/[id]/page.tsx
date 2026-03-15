'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { Download } from 'lucide-react'

interface RegularInvoiceData {
  id: string
  invoiceNumber: string
  status: string
  startDate: string
  endDate: string
  totalAmount: number
  paidAmount: number
  outstanding: number
  notes: string | null
  createdAt: string
  client: {
    name: string
    address: string | null
    city: string | null
    state: string | null
    zipCode: string | null
    idNumber: string | null
  }
  entries: Array<{
    id: string
    date: string
    description: string
    units: number
    amount: number
  }>
}

export default function PublicRegularInvoicePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const invoiceId = params.id as string
  const token = searchParams.get('token')
  const [invoice, setInvoice] = useState<RegularInvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchInvoice() {
      if (!invoiceId || !token) {
        setError('Invoice ID or token is missing.')
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/public/invoice/${invoiceId}?token=${token}`)
        const data = await res.json()

        if (res.ok) {
          setInvoice(data)
        } else {
          setError(data.error || 'Failed to load invoice.')
        }
      } catch (err) {
        setError('Network error or failed to connect to server.')
        console.error('Error fetching public invoice:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchInvoice()
  }, [invoiceId, token])

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading invoice...</div>
  }

  if (error) {
    return <div className="flex justify-center items-center min-h-screen text-red-600">{error}</div>
  }

  if (!invoice) {
    return <div className="flex justify-center items-center min-h-screen">Invoice not found.</div>
  }

  const serviceDate = invoice.startDate ? new Date(invoice.startDate) : new Date(invoice.createdAt)
  const monthYear = format(serviceDate, 'MMMM yyyy')
  const startDateStr = format(new Date(invoice.startDate), 'M/dd')
  const endDateStr = format(new Date(invoice.endDate), 'M/dd')

  const handleDownloadPdf = () => {
    window.open(`/api/public/invoice/${invoice.id}/pdf?token=${token}`, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h1 className="text-3xl font-bold" style={{ color: '#000000' }}>Invoice #{invoice.invoiceNumber}</h1>
          <button
            onClick={handleDownloadPdf}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Smart Steps ABA</h2>
          </div>
          <div className="text-right">
            <p className="text-gray-700"><strong>Date:</strong> {monthYear}</p>
            <p className="text-gray-700"><strong>Medicaid ID:</strong> {invoice.client.idNumber || 'N/A'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 border-t pt-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Bill To:</h3>
            <p className="text-gray-800 font-medium">{invoice.client.name}</p>
            {invoice.client.address && (
              <>
                <p className="text-gray-600">{invoice.client.address}</p>
                <p className="text-gray-600">
                  {invoice.client.city}, {invoice.client.state} {invoice.client.zipCode}
                </p>
              </>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Invoice Period:</h3>
            <p className="text-gray-800 font-medium">{startDateStr} - {endDateStr}</p>
          </div>
        </div>

        <div className="overflow-x-auto mb-8">
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 border-b">Date</th>
                <th className="px-4 py-3 border-b">Description</th>
                <th className="px-4 py-3 border-b">Units</th>
                <th className="px-4 py-3 border-b text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 border-b">
                    {format(new Date(entry.date), 'M/dd')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 border-b">
                    {entry.description}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 border-b">
                    {entry.units.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 border-b text-right">
                    ${entry.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-8">
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-800">Total: ${invoice.totalAmount.toFixed(2)}</p>
            {invoice.paidAmount > 0 && (
              <p className="text-sm text-gray-600">Paid: ${invoice.paidAmount.toFixed(2)}</p>
            )}
            {invoice.outstanding > 0 && (
              <p className="text-sm text-gray-600">Outstanding: ${invoice.outstanding.toFixed(2)}</p>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes:</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
