'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface CommunityInvoice {
  id: string
  units: number
  ratePerUnit: number
  totalAmount: number
  status: string
  serviceDate: string | null
  notes: string | null
  createdAt: string
  client: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zipCode: string | null
    medicaidId: string | null
  }
  class: {
    id: string
    name: string
    ratePerUnit: number
  }
}

export default function PublicCommunityInvoicePage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const [invoice, setInvoice] = useState<CommunityInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    // Resolve params (Next.js 14+ async params support)
    Promise.resolve(params).then(setResolvedParams)
  }, [params])

  useEffect(() => {
    if (!resolvedParams) return

    const fetchInvoice = async () => {
      try {
        const token = searchParams.get('token')
        if (!token) {
          setError('Invoice link is missing token. Please use the link provided in your email.')
          setLoading(false)
          return
        }

        const response = await fetch(`/api/public/community/invoice/${resolvedParams.id}?token=${encodeURIComponent(token)}`)
        
        if (!response.ok) {
          if (response.status === 404 || response.status === 403) {
            setError('Invoice link expired or invalid. Please contact support for a new link.')
          } else {
            setError('Failed to load invoice. Please try again later.')
          }
          setLoading(false)
          return
        }

        const data = await response.json()
        setInvoice(data)
        setLoading(false)
      } catch (err) {
        console.error('Error fetching invoice:', err)
        setError('Failed to load invoice. Please try again later.')
        setLoading(false)
      }
    }

    fetchInvoice()
  }, [resolvedParams, searchParams])

  const handleDownloadPDF = () => {
    if (!resolvedParams) return
    const token = searchParams.get('token')
    window.open(`/api/public/community/invoice/${resolvedParams.id}/pdf?token=${encodeURIComponent(token || '')}`, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Invoice Not Available</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">
            If you believe this is an error, please contact support.
          </p>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">KJ Play Center</h1>
              <p className="text-gray-600">Community Invoice</p>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Bill To</h2>
              <div className="text-gray-700">
                <p className="font-medium">{invoice.client.firstName} {invoice.client.lastName}</p>
                {invoice.client.address && <p>{invoice.client.address}</p>}
                {(invoice.client.city || invoice.client.state || invoice.client.zipCode) && (
                  <p>
                    {invoice.client.city && invoice.client.city}
                    {invoice.client.city && invoice.client.state && ', '}
                    {invoice.client.state && invoice.client.state}
                    {invoice.client.zipCode && ` ${invoice.client.zipCode}`}
                  </p>
                )}
                {invoice.client.phone && <p>Phone: {invoice.client.phone}</p>}
                {invoice.client.email && <p>Email: {invoice.client.email}</p>}
                {invoice.client.medicaidId && <p>Medicaid ID: {invoice.client.medicaidId}</p>}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Invoice Information</h2>
              <div className="text-gray-700 space-y-2">
                <p><span className="font-medium" style={{ color: '#000000' }}>Invoice ID:</span> <span style={{ color: '#000000' }}>{invoice.id}</span></p>
                <p><span className="font-medium">Date:</span> {formatDate(invoice.createdAt)}</p>
                {invoice.serviceDate && (
                  <p><span className="font-medium">Service Date:</span> {formatDate(invoice.serviceDate)}</p>
                )}
                <p><span className="font-medium">Status:</span> {invoice.status}</p>
              </div>
            </div>
          </div>

          {/* Class and Units */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Class Information</h2>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700">
                <span className="font-medium">Class Name:</span> {invoice.class.name}
              </p>
              <p className="text-gray-700 mt-2">
                <span className="font-medium">Units:</span> {invoice.units} (30 minutes each)
              </p>
              <p className="text-gray-700 mt-2">
                <span className="font-medium">Rate per Unit:</span> {formatCurrency(invoice.ratePerUnit)}
              </p>
            </div>
          </div>

          {/* Total */}
          <div className="border-t-2 border-gray-300 pt-4 mb-8">
            <div className="flex justify-end">
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900 mb-2">Total Amount</p>
                <p className="text-3xl font-bold text-blue-600">{formatCurrency(invoice.totalAmount)}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
