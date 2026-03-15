'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { 
  Home, Users, Upload, Calculator, FileText, BarChart3 
} from 'lucide-react'
import { subMonths } from 'date-fns'

interface PayrollDashboardProps {
  permissions: Record<string, {
    canView: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
    canApprove: boolean
    canExport: boolean
  }>
  userRole: string
}

export function PayrollDashboard({ permissions, userRole }: PayrollDashboardProps) {
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  const canView = permissions['PAYROLL_VIEW']?.canView === true || isAdmin
  const canManageEmployees = permissions['PAYROLL_MANAGE_EMPLOYEES']?.canView === true || isAdmin
  const canImportEdit = permissions['PAYROLL_IMPORT_EDIT']?.canView === true || isAdmin
  const canRunCreate = permissions['PAYROLL_RUN_CREATE']?.canView === true || isAdmin
  const canPaymentsEdit = permissions['PAYROLL_PAYMENTS_EDIT']?.canView === true || isAdmin
  const canAnalytics = permissions['PAYROLL_ANALYTICS_VIEW']?.canView === true || isAdmin
  const canReportsExport = permissions['PAYROLL_REPORTS_EXPORT']?.canView === true || isAdmin

  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [dateStart, setDateStart] = useState<Date | null>(subMonths(new Date(), 3))
  const [dateEnd, setDateEnd] = useState<Date | null>(new Date())
  const [runId, setRunId] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [paidStatus, setPaidStatus] = useState<string>('')
  const [runs, setRuns] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])

  useEffect(() => {
    if (canAnalytics) {
      // PERFORMANCE FIX: Load lightweight data first, defer analytics
      fetchRuns()
      fetchEmployees()
      // Defer analytics loading - load after initial render
      setTimeout(() => {
        fetchAnalytics()
      }, 100)
    } else {
      setLoading(false)
    }
  }, [canAnalytics])

  useEffect(() => {
    if (canAnalytics) {
      fetchAnalytics()
    }
  }, [dateStart, dateEnd, runId, employeeId, paidStatus])

  const fetchRuns = async () => {
    try {
      const response = await fetch('/api/payroll/runs')
      if (response.ok) {
        const data = await response.json()
        setRuns(data.runs || [])
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error)
    }
  }

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/payroll/employees')
      if (response.ok) {
        const data = await response.json()
        setEmployees(data.employees || [])
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const params = new URLSearchParams()
      if (dateStart) params.append('dateStart', dateStart.toISOString())
      if (dateEnd) params.append('dateEnd', dateEnd.toISOString())
      if (runId) params.append('runId', runId)
      if (employeeId) params.append('employeeId', employeeId)
      if (paidStatus) params.append('paidStatus', paidStatus)

      const response = await fetch(`/api/payroll/analytics?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data)
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* 1. Page Title + Subtitle */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Payroll Management</h1>
        <p className="mt-2 text-sm text-gray-600">
          Import time logs, manage employees, and process payroll
        </p>
      </div>

      {/* 2. 6 Feature tiles */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {canManageEmployees && (
          <Link
            href="/payroll/employees"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <div className="bg-green-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Employees</h3>
            </div>
            <p className="text-sm text-gray-600">Manage employee directory and pay rates</p>
          </Link>
        )}

        {canImportEdit && (
          <Link
            href="/payroll/imports"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <div className="bg-blue-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Imports</h3>
            </div>
            <p className="text-sm text-gray-600">View and manage imported time logs</p>
          </Link>
        )}

        {canRunCreate && (
          <>
            <Link
              href="/payroll/runs"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center mb-4">
                <div className="bg-purple-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
                  <Calculator className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Payroll Runs</h3>
              </div>
              <p className="text-sm text-gray-600">View and manage payroll runs</p>
            </Link>

            <Link
              href="/payroll/runs/new"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center mb-4">
                <div className="bg-orange-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
                  <Calculator className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Create Run</h3>
              </div>
              <p className="text-sm text-gray-600">Create a new payroll run</p>
            </Link>
          </>
        )}

        {canReportsExport && (
          <Link
            href="/payroll/reports"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center mb-4">
              <div className="bg-teal-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reports</h3>
            </div>
            <p className="text-sm text-gray-600">Generate and export payroll reports</p>
          </Link>
        )}
      </div>

      {/* 3. Filters section */}
      {canAnalytics && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <DatePicker
                selected={dateStart}
                onChange={(date) => setDateStart(date)}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <DatePicker
                selected={dateEnd}
                onChange={(date) => setDateEnd(date)}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payroll Run</label>
              <select
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Runs</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>{run.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid Status</label>
              <select
                value={paidStatus}
                onChange={(e) => setPaidStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">All Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 4. KPI tiles (MOVED HERE - directly under Filters, directly above Financial Waterfall) */}
      {canAnalytics && !loading && analytics && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Gross</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(analytics.totalGross || 0)}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Paid</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {formatCurrency(analytics.totalPaid || 0)}
                </p>
              </div>
              <Calculator className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Owed</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  {formatCurrency(analytics.totalOwed || 0)}
                </p>
              </div>
              <FileText className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Employees</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {analytics.employeeCount?.total || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Unpaid: {analytics.employeeCount?.unpaid || 0} | 
                  Partial: {analytics.employeeCount?.partial || 0} | 
                  Paid: {analytics.employeeCount?.paid || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* 5. Financial Waterfall (below KPI tiles) */}
      {canAnalytics && !loading && analytics && analytics.waterfallData && analytics.waterfallData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Waterfall</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={analytics.waterfallData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" name="Amount" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Additional Charts (if needed, below waterfall) */}
      {canAnalytics && !loading && analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Payments Over Time Line Chart */}
          {analytics.paymentsOverTime && analytics.paymentsOverTime.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Payments Over Time</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={analytics.paymentsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#10b981"
                    name="Payment Amount"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Owed vs Paid by Employee Bar Chart */}
          {analytics.owedVsPaidByEmployee && analytics.owedVsPaidByEmployee.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Owed vs Paid by Employee (Top 10)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.owedVsPaidByEmployee}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="owed" fill="#f59e0b" name="Owed" />
                  <Bar dataKey="paid" fill="#10b981" name="Paid" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
