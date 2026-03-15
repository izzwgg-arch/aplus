'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface EmployeeMonthlyReportProps {
  employeeId: string
  month?: string
}

interface ReportData {
  employee: {
    id: string
    fullName: string
    email?: string | null
    phone?: string | null
    defaultHourlyRate: number
  }
  period: {
    year: number
    month: number
    monthName: string
  }
  summary: {
    totalHours: number
    hourlyRate: number
    grossPay: number
    totalPaid: number
    totalOwed: number
  }
  breakdown: Array<{
    date: string
    sourceImport?: string | null
    hours: number
    rate: number
    gross: number
  }>
  payments: Array<{
    date: string
    amount: number
    method: string
    reference?: string | null
  }>
}

export function EmployeeMonthlyReport({ employeeId, month }: EmployeeMonthlyReportProps) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (employeeId && month) {
      fetchReportData()
    }
  }, [employeeId, month])

  const fetchReportData = async () => {
    setLoading(true)
    try {
      // For now, we'll just display a summary - the API route will generate the full report
      // In a real implementation, we might want an API endpoint to fetch report data for display
      // For now, we'll show a placeholder with PDF export
      
      // Fetch employee data
      const empResponse = await fetch(`/api/payroll/employees/${employeeId}`)
      if (empResponse.ok) {
        const empData = await empResponse.json()
        
        // Parse month
        const [year, monthNum] = month!.split('-').map(Number)
        const periodStart = new Date(year, monthNum - 1, 1)
        
        setData({
          employee: {
            id: empData.employee.id,
            fullName: empData.employee.fullName,
            email: empData.employee.email,
            phone: empData.employee.phone,
            defaultHourlyRate: parseFloat(empData.employee.defaultHourlyRate.toString()),
          },
          period: {
            year,
            month: monthNum,
            monthName: format(periodStart, 'MMMM'),
          },
          summary: {
            totalHours: 0,
            hourlyRate: parseFloat(empData.employee.defaultHourlyRate.toString()),
            grossPay: 0,
            totalPaid: 0,
            totalOwed: 0,
          },
          breakdown: [],
          payments: [],
        })
      }
    } catch (error) {
      console.error('Failed to fetch report data:', error)
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    if (!employeeId || !month) {
      toast.error('Missing required parameters')
      return
    }

    setExporting(true)
    try {
      const response = await fetch(`/api/payroll/reports/employee/${employeeId}/pdf?month=${month}`)
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `employee-monthly-${data?.employee.fullName.replace(/\s+/g, '-')}-${month}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success('PDF exported successfully')
    } catch (error: any) {
      console.error('Failed to export PDF:', error)
      toast.error(error.message || 'Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <p className="text-gray-600">Unable to load report data. Please check the employee ID and month.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/payroll/reports/employee"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Employee Reports
        </Link>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </>
          )}
        </button>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Monthly Report</h1>
      <p className="text-gray-600 mb-8">
        {data.employee.fullName} - {data.period.monthName} {data.period.year}
      </p>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Employee Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-gray-700">Name:</span>
            <span className="ml-2 text-sm text-gray-900">{data.employee.fullName}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Period:</span>
            <span className="ml-2 text-sm text-gray-900">{data.period.monthName} {data.period.year}</span>
          </div>
          {data.employee.email && (
            <div>
              <span className="text-sm font-medium text-gray-700">Email:</span>
              <span className="ml-2 text-sm text-gray-900">{data.employee.email}</span>
            </div>
          )}
          {data.employee.phone && (
            <div>
              <span className="text-sm font-medium text-gray-700">Phone:</span>
              <span className="ml-2 text-sm text-gray-900">{data.employee.phone}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Hours</div>
            <div className="text-xl font-bold text-gray-900">{data.summary.totalHours.toFixed(2)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Hourly Rate</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(data.summary.hourlyRate)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Gross Pay</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(data.summary.grossPay)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Paid</div>
            <div className="text-xl font-bold text-green-600">{formatCurrency(data.summary.totalPaid)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Amount Owed</div>
            <div className="text-xl font-bold text-orange-600">{formatCurrency(data.summary.totalOwed)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Preview</h2>
        <p className="text-sm text-gray-600 mb-4">
          Click "Export PDF" above to generate a detailed report with breakdown and payment history.
        </p>
        <p className="text-xs text-gray-500 italic">
          Note: Full report data will be calculated and included in the exported PDF.
        </p>
      </div>
    </div>
  )
}
