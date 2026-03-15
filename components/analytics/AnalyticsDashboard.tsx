'use client'

import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
} from 'recharts'
import { format } from 'date-fns'
import { subMonths } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface AnalyticsData {
  summary: {
    totalTimesheets: number
    approvedTimesheets: number
    rejectedTimesheets: number
    totalInvoices: number
    totalBilled: number
    totalPaid: number
    totalOutstanding: number
  }
  revenueTrends: Array<{
    month: string
    label: string
    billed: number
    paid: number
  }>
  timesheetTrends: Array<{
    month: string
    label: string
    created: number
    approved: number
    rejected: number
  }>
  providerProductivity: Array<{
    name: string
    units: number
    hours: number
    timesheetCount: number
  }>
  clientBilling: Array<{
    name: string
    totalBilled: number
    totalPaid: number
    outstanding: number
    invoiceCount: number
  }>
  invoiceStatusDistribution: Array<{
    status: string
    label: string
    count: number
  }>
  financialWaterfall: Array<{
    label: string
    value: number
  }>
  insuranceComparisons: Array<{
    name: string
    totalBilled: number
    totalPaid: number
  }>
  timesheetStatusBreakdown: Array<{
    status: string
    label: string
    count: number
  }>
  filters: {
    providers: Array<{ id: string; name: string }>
    clients: Array<{ id: string; name: string }>
    bcbas: Array<{ id: string; name: string }>
    insurances: Array<{ id: string; name: string }>
  }
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')

  // Date filters
  const [startDate, setStartDate] = useState<Date>(subMonths(new Date(), 12))
  const [endDate, setEndDate] = useState<Date>(new Date())

  // Entity filters
  const [providerId, setProviderId] = useState('')
  const [clientId, setClientId] = useState('')
  const [bcbaId, setBcbaId] = useState('')
  const [insuranceId, setInsuranceId] = useState('')

  useEffect(() => {
    fetchAnalytics()
  }, [startDate, endDate, providerId, clientId, bcbaId, insuranceId])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('startDate', startDate.toISOString())
      params.append('endDate', endDate.toISOString())
      if (providerId) params.append('providerId', providerId)
      if (clientId) params.append('clientId', clientId)
      if (bcbaId) params.append('bcbaId', bcbaId)
      if (insuranceId) params.append('insuranceId', insuranceId)

      const res = await fetch(`/api/analytics?${params.toString()}`)
      if (res.ok) {
        const analyticsData = await res.json()
        setData(analyticsData)
      } else {
        toast.error('Failed to load analytics data')
      }
    } catch (error) {
      toast.error('An error occurred while loading analytics')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading analytics...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">No data available</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
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
              End Date
            </label>
            <DatePicker
              selected={endDate}
              onChange={(date) => date && setEndDate(date)}
              dateFormat="MM/dd/yyyy"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider
            </label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Providers</option>
              {data.filters.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Clients</option>
              {data.filters.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              BCBA
            </label>
            <select
              value={bcbaId}
              onChange={(e) => setBcbaId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All BCBAs</option>
              {data.filters.bcbas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Insurance
            </label>
            <select
              value={insuranceId}
              onChange={(e) => setInsuranceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Insurance</option>
              {data.filters.insurances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Timesheets</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {data.summary.totalTimesheets}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {data.summary.approvedTimesheets} approved, {data.summary.rejectedTimesheets}{' '}
            rejected
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Invoices</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {data.summary.totalInvoices}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Billed</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {formatCurrency(data.summary.totalBilled)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Outstanding</h3>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {formatCurrency(data.summary.totalOutstanding)}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {formatCurrency(data.summary.totalPaid)} paid
          </p>
        </div>
      </div>

      {/* Revenue Trends Line Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Revenue Trends</h2>
          <button
            onClick={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {viewMode === 'chart' ? 'View Table' : 'View Chart'}
          </button>
        </div>
        {viewMode === 'chart' ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.revenueTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Line
                type="monotone"
                dataKey="billed"
                stroke="#3b82f6"
                name="Billed"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="paid"
                stroke="#10b981"
                name="Paid"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Month
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Billed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Paid
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.revenueTrends.map((item) => (
                  <tr key={item.month}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.label}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.billed)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.paid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timesheet Creation Trends */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Timesheet Creation Trends</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.timesheetTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="created"
              stroke="#3b82f6"
              name="Created"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="approved"
              stroke="#10b981"
              name="Approved"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="rejected"
              stroke="#ef4444"
              name="Rejected"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Provider Productivity & Client Billing - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Provider Productivity (Top 10)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.providerProductivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="hours" fill="#3b82f6" name="Hours" />
              <Bar dataKey="units" fill="#10b981" name="Units" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Client Billing</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.clientBilling.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="totalBilled" fill="#3b82f6" name="Billed" />
              <Bar dataKey="totalPaid" fill="#10b981" name="Paid" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Invoice Status & Timesheet Status - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Invoice Status Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.invoiceStatusDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ label, percent }) =>
                  `${label}: ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {data.invoiceStatusDistribution.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Timesheet Status Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.timesheetStatusBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ label, percent }) =>
                  `${label}: ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {data.timesheetStatusBreakdown.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Financial Waterfall */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Financial Overview</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data.financialWaterfall}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Bar dataKey="value" fill="#3b82f6" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Insurance Comparisons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Insurance Payout Comparisons</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.insuranceComparisons}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="totalBilled" fill="#3b82f6" name="Billed" />
            <Bar dataKey="totalPaid" fill="#10b981" name="Paid" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
