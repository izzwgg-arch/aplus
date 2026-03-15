'use client'

import { X, Printer } from 'lucide-react'
import { format } from 'date-fns'

interface CommunityInvoice {
  id: string
  units: number
  ratePerUnit: number
  totalAmount: number
  serviceDate: string | null
  notes: string | null
  createdAt: string
  client: {
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
    name: string
    ratePerUnit: number
  }
}

interface CommunityInvoicePrintPreviewProps {
  invoice: CommunityInvoice
  onClose: () => void
}

export function CommunityInvoicePrintPreview({ invoice, onClose }: CommunityInvoicePrintPreviewProps) {
  try {
    // Validate invoice data
    if (!invoice) {
      console.error('[COMMUNITY PRINT INVOICE] Error: Invoice is null or undefined')
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-700 mb-4">Invoice data is missing. Please try again.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )
    }

    console.log('[COMMUNITY PRINT INVOICE] Rendering print preview', { 
      invoiceId: invoice?.id, 
      hasClient: !!invoice?.client, 
      hasClass: !!invoice?.class,
      clientKeys: invoice?.client ? Object.keys(invoice.client) : [],
      classKeys: invoice?.class ? Object.keys(invoice.class) : []
    })

    if (!invoice.client) {
      console.error('[COMMUNITY PRINT INVOICE] Error: Invoice client is missing', { invoiceId: invoice.id })
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-700 mb-4">Client information is missing from this invoice.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )
    }

    if (!invoice.class) {
      console.error('[COMMUNITY PRINT INVOICE] Error: Invoice class is missing', { invoiceId: invoice.id })
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-700 mb-4">Class information is missing from this invoice.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )
    }

    // Ensure totalAmount is a number
    const totalAmount = typeof invoice.totalAmount === 'number' 
      ? invoice.totalAmount 
      : (invoice.totalAmount != null ? Number(invoice.totalAmount) : 0) || 0
    const units = typeof invoice.units === 'number' 
      ? invoice.units 
      : (invoice.units != null ? Number(invoice.units) : 0) || 0

    const handlePrint = () => {
      console.log('[COMMUNITY PRINT INVOICE] Print requested', { invoiceId: invoice.id })
      window.print()
    }

    let serviceDate: Date
    try {
      serviceDate = invoice.serviceDate ? new Date(invoice.serviceDate) : new Date(invoice.createdAt || Date.now())
    } catch (error) {
      console.error('[COMMUNITY PRINT INVOICE] Error parsing date', { error, invoiceId: invoice.id })
      serviceDate = new Date()
    }

    let monthYear: string
    let dateStr: string
    try {
      monthYear = format(serviceDate, 'MMMM yyyy')
      dateStr = format(serviceDate, 'M/dd')
    } catch (error) {
      console.error('[COMMUNITY PRINT INVOICE] Error formatting date', { error, invoiceId: invoice.id })
      monthYear = format(new Date(), 'MMMM yyyy')
      dateStr = format(new Date(), 'M/dd')
    }

    return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 no-print" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b no-print">
            <h2 className="text-xl font-bold">Invoice Print Preview</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 print-preview-content" style={{ border: '2px solid #0066CC' }}>
            {/* KJ PLAY CENTER Header */}
            <div className="text-center mb-4">
              <h1 className="text-4xl font-bold text-blue-600 mb-2" style={{ color: '#0066CC' }}>KJ PLAY CENTER</h1>
              <p className="text-sm text-gray-700 mb-2">Where you Discover Intelligence Creativity, Excitement and Fun.</p>
              <p className="text-xs text-gray-600">Address 68 Jefferson St. Highland Mills N.Y.10930 / P.845-827-9585 / E.kjplaycanter@gmail.com</p>
            </div>

            {/* Top Right: Date and Medicaid ID */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1"></div>
              <div className="text-right">
                <div className="mb-2">
                  <span className="font-semibold">Date:</span> {monthYear}
                </div>
                <div>
                  <span className="font-semibold">Medicaid ID:</span> {invoice.client?.medicaidId || 'DS36509H'}
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-6">
              <div className="font-semibold mb-2">Bill To:</div>
              <div>{invoice.client?.firstName || ''} {invoice.client?.lastName || ''}</div>
              {invoice.client?.address && (
                <div>{invoice.client.address}</div>
              )}
              {(invoice.client?.city || invoice.client?.state || invoice.client?.zipCode) && (
                <div>
                  {invoice.client?.city || ''}
                  {invoice.client?.city && invoice.client?.state ? ', ' : ''}
                  {invoice.client?.state || ''}
                  {invoice.client?.zipCode ? ` ${invoice.client.zipCode}` : ''}
                </div>
              )}
              {invoice.client?.phone && (
                <div>Phone: {invoice.client.phone}</div>
              )}
              {invoice.client?.email && (
                <div>Email: {invoice.client.email}</div>
              )}
            </div>

            {/* Class Name */}
            <div className="mb-6">
              <span className="font-semibold">Class Name:</span> {invoice.class?.name || 'N/A'}
            </div>

            {/* Table */}
            <div className="mb-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="text-left py-2 px-2 font-semibold">Date</th>
                    <th className="text-left py-2 px-2 font-semibold">Description</th>
                    <th className="text-left py-2 px-2 font-semibold">Units</th>
                    <th className="text-left py-2 px-2 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-300">
                    <td className="py-2 px-2">{dateStr}</td>
                      <td className="py-2 px-2">{invoice.class?.name || 'N/A'}</td>
                    <td className="py-2 px-2">{units}</td>
                    <td className="py-2 px-2">${totalAmount.toFixed(2)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-800">
                    <td colSpan={2} className="py-2 px-2"></td>
                    <td className="py-2 px-2 font-semibold">Total</td>
                    <td className="py-2 px-2 font-semibold">${totalAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mb-6">
                <div className="font-semibold mb-2">Notes:</div>
                <div className="text-gray-700 whitespace-pre-wrap">{invoice.notes}</div>
              </div>
            )}

            {/* Action Buttons - Hidden when printing */}
            <div className="mt-8 flex justify-end space-x-3 no-print">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
    )
  } catch (error: any) {
    console.error('[COMMUNITY PRINT INVOICE] Fatal error rendering component', {
      error: error?.message,
      stack: error?.stack,
      invoiceId: invoice?.id,
    })
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">
            An error occurred while rendering the invoice preview. Please try again or contact support.
          </p>
          {process.env.NODE_ENV === 'development' && error?.message && (
            <p className="text-xs text-gray-500 mt-2 mb-4">{error.message}</p>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    )
  }
}
