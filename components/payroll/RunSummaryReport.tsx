'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface RunSummaryReportProps {
  runId: string
}

interface ReportData {
  run: {
    id: string
    name: string
    periodStart: string
    periodEnd: string
    status: string
    createdAt: string
  }
  summary: {
    totalGross: number
    totalPaid: number
    totalOwed: number
    employeeCount: number
  }
  employees: Array<{
    employeeName: string
    totalHours: number
    hourlyRate: number
    grossPay: number
    amountPaid: number
    amountOwed: number
  }>
}

export function RunSummaryReport({ runId }: RunSummaryReportProps) {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (runId) {
      fetchReportData()
    }
  }, [runId])

  const fetchReportData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/payroll/runs/${runId}`)
      if (response.ok) {
        const result = await response.json()
        const run = result.run

        // Calculate summary
        const totalGross = run.lines.reduce((sum: number, line: any) => sum + parseFloat(line.grossPay.toString()), 0)
        const totalPaid = run.lines.reduce((sum: number, line: any) => sum + parseFloat(line.amountPaid.toString()), 0)
        const totalOwed = run.lines.reduce((sum: number, line: any) => sum + parseFloat(line.amountOwed.toString()), 0)

        // Build employee data
        const employees = run.lines.map((line: any) => ({
          employeeName: line.employee.fullName,
          totalHours: parseFloat(line.totalHours.toString()),
          hourlyRate: parseFloat(line.hourlyRateUsed.toString()),
          grossPay: parseFloat(line.grossPay.toString()),
          amountPaid: parseFloat(line.amountPaid.toString()),
          amountOwed: parseFloat(line.amountOwed.toString()),
        }))

        setData({
          run: {
            id: run.id,
            name: run.name,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            status: run.status,
            createdAt: run.createdAt,
          },
          summary: {
            totalGross,
            totalPaid,
            totalOwed,
            employeeCount: run.lines.length,
          },
          employees,
        })
      } else {
        throw new Error('Failed to fetch run data')
      }
    } catch (error) {
      console.error('Failed to fetch report data:', error)
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  const handleExportPDF = async () => {
    if (!runId) {
      toast.error('Missing run ID')
      return
    }

    setExporting(true)
    try {
      const response = await fetch(`/api/payroll/reports/run/${runId}/pdf`)
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const periodStart = data ? format(new Date(data.run.periodStart), 'yyyy-MM-dd') : 'report'
      a.download = `payroll-run-${data?.run.name.replace(/\s+/g, '-')}-${periodStart}.pdf`
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
        <p className="text-gray-600">Unable to load report data. Please check the run ID.</p>
      </div>
    )
  }

  const periodStart = new Date(data.run.periodStart)
  const periodEnd = new Date(data.run.periodEnd)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/payroll/reports/run"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Run Reports
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

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Payroll Run Summary Report</h1>
      <p className="text-gray-600 mb-8">{data.run.name}</p>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Run Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm font-medium text-gray-700">Run Name:</span>
            <span className="ml-2 text-sm text-gray-900">{data.run.name}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Status:</span>
            <span className="ml-2 text-sm text-gray-900">{data.run.status}</span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Period:</span>
            <span className="ml-2 text-sm text-gray-900">
              {format(periodStart, 'MMM d, yyyy')} - {format(periodEnd, 'MMM d, yyyy')}
            </span>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Created:</span>
            <span className="ml-2 text-sm text-gray-900">
              {format(new Date(data.run.createdAt), 'MMM d, yyyy')}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Gross</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(data.summary.totalGross)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Paid</div>
            <div className="text-xl font-bold text-green-600">{formatCurrency(data.summary.totalPaid)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Owed</div>
            <div className="text-xl font-bold text-orange-600">{formatCurrency(data.summary.totalOwed)}</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Employees</div>
            <div className="text-xl font-bold text-gray-900">{data.summary.employeeCount}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Employee Totals</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee Name
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hours
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gross Pay
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount Paid
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount Owed
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.employees.map((emp, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.employeeName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {emp.totalHours.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(emp.hourlyRate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(emp.grossPay)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                    {formatCurrency(emp.amountPaid)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 text-right">
                    {formatCurrency(emp.amountOwed)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Totals</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {data.employees.reduce((sum, e) => sum + e.totalHours, 0).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">-</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatCurrency(data.summary.totalGross)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right">
                  {formatCurrency(data.summary.totalPaid)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 text-right">
                  {formatCurrency(data.summary.totalOwed)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
