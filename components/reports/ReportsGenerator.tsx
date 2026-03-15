'use client'

import { useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { subMonths } from 'date-fns'
import toast from 'react-hot-toast'
import { FileText, Download, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { exportToCSV, exportToExcel } from '@/lib/exportUtils'

interface ReportsGeneratorProps {
  providers: Array<{ id: string; name: string }>
  clients: Array<{ id: string; name: string }>
  insurances: Array<{ id: string; name: string }>
  bcbas: Array<{ id: string; name: string }>
}

interface DetailedReportRow {
  date: Date
  clientName: string
  clientId?: string
  providerName: string
  bcbaName?: string
  insuranceName: string
  type: 'DR' | 'SV' | ''
  inTime: string
  outTime: string
  hours: number
  units: number
  location?: string
  status: string
  timesheetId?: string
  entryId?: string
}

interface ReportSummary {
  totalHoursDR: number
  totalHoursSV: number
  totalHours: number
  totalUnits: number
  totalUnitsDR: number
  totalUnitsSV: number
  sessionCount: number
  timesheetCount: number
}

interface DetailedReportData {
  meta: {
    generatedAt: Date
    filtersApplied: any
    correlationId: string
  }
  summary: ReportSummary
  rows: DetailedReportRow[]
  groups?: Array<{
    key: string
    label: string
    summary: ReportSummary
    rows: DetailedReportRow[]
  }>
}

export function ReportsGenerator({
  providers,
  clients,
  insurances,
  bcbas,
}: ReportsGeneratorProps) {
  const [loading, setLoading] = useState(false)
  const [loadingDetailed, setLoadingDetailed] = useState(false)
  const [reportType, setReportType] = useState<
    'timesheets' | 'invoices' | 'insurance' | 'providers'
  >('timesheets')
  const [format, setFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf')
  const [startDate, setStartDate] = useState<Date>(subMonths(new Date(), 1))
  const [endDate, setEndDate] = useState<Date>(new Date())
  const [providerId, setProviderId] = useState('')
  const [clientId, setClientId] = useState('')
  const [insuranceId, setInsuranceId] = useState('')
  const [bcbaId, setBcbaId] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [serviceTypeFilter, setServiceTypeFilter] = useState<('DR' | 'SV')[]>([])
  const [grouping, setGrouping] = useState<'client' | 'provider' | 'insurance' | 'week' | 'timesheet' | ''>('')
  const [detailedReport, setDetailedReport] = useState<DetailedReportData | null>(null)
  const [showDetailedReport, setShowDetailedReport] = useState(false)
  const [errorDetails, setErrorDetails] = useState<{ message: string; correlationId?: string } | null>(null)
  const [showErrorDetails, setShowErrorDetails] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    setErrorDetails(null)
    try {
      console.log('[REPORT GENERATION] Frontend - Generating report with params:', {
        reportType,
        format,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        providerId: providerId || 'all',
        clientId: clientId || 'all',
        insuranceId: insuranceId || 'all',
      })

      const params = new URLSearchParams()
      params.append('type', reportType)
      params.append('format', format)
      params.append('startDate', startDate.toISOString())
      params.append('endDate', endDate.toISOString())
      if (providerId) params.append('providerId', providerId)
      if (clientId) params.append('clientId', clientId)
      if (insuranceId) params.append('insuranceId', insuranceId)

      const res = await fetch(`/api/reports?${params.toString()}`)

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url

        const contentDisposition = res.headers.get('Content-Disposition')
        const filename = contentDisposition
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') ||
            `report.${format}`
          : `report.${format}`

        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        toast.success('Report generated successfully')
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to generate report' }))
        const errorMsg = data.error || 'Failed to generate report'
        const shortReason = data.message || errorMsg
        setErrorDetails({ message: shortReason, correlationId: data.correlationId })
        toast.error(`Failed to generate report: ${shortReason}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An error occurred while generating the report'
      console.error('[REPORT GENERATION] Frontend error:', error)
      setErrorDetails({ message: errorMsg })
      toast.error('An error occurred while generating the report')
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetailedReport = async () => {
    if (reportType !== 'timesheets') {
      toast.error('Detailed reports are only available for timesheets')
      return
    }

    setLoadingDetailed(true)
    setErrorDetails(null)
    setDetailedReport(null)
    
    try {
      const params = new URLSearchParams()
      params.append('startDate', startDate.toISOString())
      params.append('endDate', endDate.toISOString())
      if (providerId) params.append('providerId', providerId)
      if (clientId) params.append('clientId', clientId)
      if (insuranceId) params.append('insuranceId', insuranceId)
      if (bcbaId) params.append('bcbaId', bcbaId)
      if (statusFilter.length > 0) params.append('status', statusFilter.join(','))
      if (serviceTypeFilter.length > 0) params.append('serviceType', serviceTypeFilter.join(','))
      if (grouping) params.append('grouping', grouping)

      console.log('[DETAILED REPORT] Frontend - Fetching detailed report:', params.toString())

      const res = await fetch(`/api/reports/detailed?${params.toString()}`)

      if (res.ok) {
        const data: DetailedReportData = await res.json()
        // Convert date strings to Date objects
        data.rows = data.rows.map(row => ({
          ...row,
          date: new Date(row.date),
        }))
        if (data.groups) {
          data.groups = data.groups.map(group => ({
            ...group,
            rows: group.rows.map(row => ({
              ...row,
              date: new Date(row.date),
            })),
          }))
        }
        setDetailedReport(data)
        setShowDetailedReport(true)
        toast.success('Detailed report loaded successfully')
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to load detailed report' }))
        const errorMsg = data.error || 'Failed to load detailed report'
        const shortReason = data.message || errorMsg
        setErrorDetails({ message: shortReason, correlationId: data.correlationId })
        toast.error(`Failed to load detailed report: ${shortReason}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An error occurred while loading the detailed report'
      console.error('[DETAILED REPORT] Frontend error:', error)
      setErrorDetails({ message: errorMsg })
      toast.error('An error occurred while loading the detailed report')
    } finally {
      setLoadingDetailed(false)
    }
  }

  const handleExportDetailed = (format: 'pdf' | 'csv' | 'xlsx') => {
    if (!detailedReport) {
      toast.error('No detailed report data available')
      return
    }

    try {
      if (format === 'csv' || format === 'xlsx') {
        const exportData = detailedReport.rows.map(row => ({
          Date: formatDate(row.date),
          'Client Name': row.clientName,
          'Client ID': row.clientId || '',
          'Provider Name': row.providerName,
          'BCBA Name': row.bcbaName || '',
          'Insurance Name': row.insuranceName,
          Type: row.type,
          'In Time': row.inTime,
          'Out Time': row.outTime,
          Hours: row.hours.toFixed(2),
          Units: row.units.toFixed(2),
          Location: row.location || '',
          Status: row.status,
        }))

        const filename = `detailed-report-${formatDate(startDate)}-${formatDate(endDate)}`
        
        if (format === 'csv') {
          exportToCSV(exportData, filename)
        } else {
          exportToExcel(exportData, filename, 'Detailed Report')
        }
        
        toast.success(`${format.toUpperCase()} export started`)
      } else {
        // PDF export - redirect to API
        const params = new URLSearchParams()
        params.append('type', 'timesheets')
        params.append('format', 'pdf')
        params.append('startDate', startDate.toISOString())
        params.append('endDate', endDate.toISOString())
        if (providerId) params.append('providerId', providerId)
        if (clientId) params.append('clientId', clientId)
        if (insuranceId) params.append('insuranceId', insuranceId)
        if (bcbaId) params.append('bcbaId', bcbaId)
        if (statusFilter.length > 0) params.append('status', statusFilter.join(','))
        if (serviceTypeFilter.length > 0) params.append('serviceType', serviceTypeFilter.join(','))

        window.open(`/api/reports?${params.toString()}`, '_blank')
        toast.success('PDF export started')
      }
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export report')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          Generate Report
        </h2>

        <div className="space-y-6">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type <span className="text-red-500">*</span>
            </label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as any)
                setDetailedReport(null)
                setShowDetailedReport(false)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="timesheets">Timesheet Summary</option>
              <option value="invoices">Invoice Summary</option>
              <option value="insurance">Insurance Billing</option>
              <option value="providers">Provider Performance</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                selected={startDate}
                onChange={(date) => date && setStartDate(date)}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                selected={endDate}
                onChange={(date) => date && setEndDate(date)}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-4">
              Filters (Optional)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {reportType !== 'invoices' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Provider
                  </label>
                  <select
                    value={providerId}
                    onChange={(e) => setProviderId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">All Providers</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {reportType !== 'providers' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Client
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">All Clients</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {reportType !== 'providers' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Insurance
                  </label>
                  <select
                    value={insuranceId}
                    onChange={(e) => setInsuranceId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">All Insurance</option>
                    {insurances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Additional filters for detailed reports (timesheets only) */}
            {reportType === 'timesheets' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    BCBA
                  </label>
                  <select
                    value={bcbaId}
                    onChange={(e) => setBcbaId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">All BCBAs</option>
                    {bcbas.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-4">
                    {['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED'].map((status) => (
                      <label key={status} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={statusFilter.includes(status)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setStatusFilter([...statusFilter, status])
                            } else {
                              setStatusFilter(statusFilter.filter(s => s !== status))
                            }
                          }}
                          className="mr-2"
                        />
                        {status}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Type
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={serviceTypeFilter.includes('DR')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setServiceTypeFilter([...serviceTypeFilter, 'DR'])
                          } else {
                            setServiceTypeFilter(serviceTypeFilter.filter(t => t !== 'DR'))
                          }
                        }}
                        className="mr-2"
                      />
                      DR
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={serviceTypeFilter.includes('SV')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setServiceTypeFilter([...serviceTypeFilter, 'SV'])
                          } else {
                            setServiceTypeFilter(serviceTypeFilter.filter(t => t !== 'SV'))
                          }
                        }}
                        className="mr-2"
                      />
                      SV
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group By
                  </label>
                  <select
                    value={grouping}
                    onChange={(e) => setGrouping(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">No Grouping</option>
                    <option value="client">By Client</option>
                    <option value="provider">By Provider</option>
                    <option value="insurance">By Insurance</option>
                    <option value="week">By Week</option>
                    <option value="timesheet">By Timesheet</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Error Details (dev mode) */}
          {errorDetails && (
            <div className="border border-red-200 bg-red-50 rounded-md p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-800">Error: {errorDetails.message}</span>
                <button
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  {showErrorDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              {showErrorDetails && errorDetails.correlationId && (
                <div className="mt-2 text-xs text-red-600">
                  Correlation ID: {errorDetails.correlationId}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 pt-4">
            {reportType === 'timesheets' && (
              <button
                onClick={handleViewDetailedReport}
                disabled={loadingDetailed}
                className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loadingDetailed ? (
                  'Loading...'
                ) : (
                  <>
                    <Eye className="w-5 h-5 mr-2" />
                    View Detailed Report
                  </>
                )}
              </button>
            )}
            
            <div className="flex items-center gap-2">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                disabled={loading}
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel</option>
              </select>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? (
                  'Generating...'
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Export Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Report View */}
      {showDetailedReport && detailedReport && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Detailed Report</h2>
            <div className="flex gap-2">
              <button
                onClick={() => handleExportDetailed('pdf')}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                Export PDF
              </button>
              <button
                onClick={() => handleExportDetailed('csv')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
              >
                Export CSV
              </button>
              <button
                onClick={() => handleExportDetailed('xlsx')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Export Excel
              </button>
            </div>
          </div>

          {/* Summary Section */}
          <div className="mb-6 p-4 bg-gray-50 rounded-md">
            <h3 className="font-semibold mb-4">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Total Hours (DR)</div>
                <div className="text-lg font-semibold">{detailedReport.summary.totalHoursDR.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Hours (SV)</div>
                <div className="text-lg font-semibold">{detailedReport.summary.totalHoursSV.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Hours</div>
                <div className="text-lg font-semibold">{detailedReport.summary.totalHours.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Total Units</div>
                <div className="text-lg font-semibold">{detailedReport.summary.totalUnits.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Sessions</div>
                <div className="text-lg font-semibold">{detailedReport.summary.sessionCount}</div>
              </div>
              <div>
                <div className="text-gray-600">Timesheets</div>
                <div className="text-lg font-semibold">{detailedReport.summary.timesheetCount}</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Generated: {new Date(detailedReport.meta.generatedAt).toLocaleString()}
            </div>
          </div>

          {/* Detailed Rows Table */}
          {detailedReport.groups ? (
            <div className="space-y-6">
              {detailedReport.groups.map((group) => (
                <div key={group.key} className="border rounded-md">
                  <div className="bg-gray-100 px-4 py-2 font-semibold">
                    {group.label} - Hours: {group.summary.totalHours.toFixed(2)}, Units: {group.summary.totalUnits.toFixed(2)}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">BCBA</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insurance</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">In</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Out</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {group.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{formatDate(row.date)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.clientName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.providerName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.bcbaName || '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.insuranceName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.type}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.inTime}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.outTime}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.hours.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.units.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">{row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">BCBA</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Insurance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">In</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Out</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {detailedReport.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.clientName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.providerName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.bcbaName || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.insuranceName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.type}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.inTime}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.outTime}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.hours.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.units.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {detailedReport.rows.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No data found for the selected filters
            </div>
          )}
        </div>
      )}
    </div>
  )
}
