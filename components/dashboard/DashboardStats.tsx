'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency, formatDate, formatDateTime, formatRelativeTime } from '@/lib/utils'
import { formatInvoiceNumberForDisplay } from '@/lib/timesheet-ids'

interface DashboardStats {
  stats: {
    timesheets: {
      total: number
      draft: number
      submitted: number
      approved: number
    }
    invoices: {
      total: number
      draft: number
    }
    financial: {
      totalBilled: number
      totalPaid: number
      totalOutstanding: number
    }
  }
  pendingTimesheets: Array<{
    id: string
    client: { name: string }
    provider: { name: string }
    user: { email: string }
    submittedAt: string | null
  }>
  recentActivity: Array<{
    id: string
    action: string
    entity: string
    userEmail: string
    createdAt: string
  }>
  recentInvoices: Array<{
    id: string
    invoiceNumber: string
    clientName: string
    status: string
    totalAmount: number
    createdAt: string
  }>
  unreadNotificationsCount: number
  unreadActivityCount?: number
}

interface DashboardStatsProps {
  showPendingApprovals?: boolean
  showRecentActivity?: boolean
  showRecentInvoices?: boolean
  showOutstanding?: boolean
}

export function DashboardStats({ 
  showPendingApprovals = true,
  showRecentActivity = true,
  showRecentInvoices = true,
  showOutstanding = true,
}: DashboardStatsProps = {}) {
  const [data, setData] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  // Mark activities as seen when component mounts (for admins)
  useEffect(() => {
    if (data?.unreadActivityCount && data.unreadActivityCount > 0) {
      // Mark activities as seen when dashboard loads
      fetch('/api/admin/activity/mark-seen', {
        method: 'POST',
      }).catch(err => {
        console.error('Failed to mark activities as seen:', err)
      })
    }
  }, [data?.unreadActivityCount])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats')
      if (res.ok) {
        const stats = await res.json()
        setData(stats)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading dashboard stats...</div>
  }

  if (!data) {
    return null
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'text-green-600'
      case 'UPDATE':
        return 'text-blue-600'
      case 'DELETE':
        return 'text-red-600'
      case 'APPROVE':
        return 'text-purple-600'
      case 'REJECT':
        return 'text-orange-600'
      case 'SUBMIT':
        return 'text-yellow-600'
      case 'LOGIN':
        return 'text-cyan-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Timesheets</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.stats.timesheets.total}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {data.stats.timesheets.approved} approved
              </p>
            </div>
            <Calendar className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Approval</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.stats.timesheets.submitted}
              </p>
              <Link
                href="/timesheets?status=SUBMITTED"
                className="text-xs text-primary-600 hover:text-primary-700 mt-1 inline-block"
              >
                View all →
              </Link>
            </div>
            <Clock className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.stats.invoices.total}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {data.stats.invoices.draft} draft
              </p>
            </div>
            <FileText className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        {showOutstanding && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Outstanding</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(data.stats.financial.totalOutstanding)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatCurrency(data.stats.financial.totalPaid)} paid
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        {showPendingApprovals && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
            <Link
              href="/timesheets?status=SUBMITTED"
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              View all →
            </Link>
          </div>
          {data.pendingTimesheets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.pendingTimesheets.slice(0, 5).map((timesheet) => (
                <Link
                  key={timesheet.id}
                  href={`/timesheets`}
                  className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {timesheet.client.name} - {timesheet.provider.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        Submitted by {timesheet.user.email}
                      </p>
                      {timesheet.submittedAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(timesheet.submittedAt)}
                        </p>
                      )}
                    </div>
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Recent Activity */}
        {showRecentActivity && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              {data?.unreadActivityCount && data.unreadActivityCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                  {data.unreadActivityCount}
                </span>
              )}
            </div>
            <Link
              href="/audit-logs"
              className="text-sm text-primary-600 hover:text-primary-700"
              onClick={() => {
                // Mark activities as seen when clicking "View all"
                if (data?.unreadActivityCount && data.unreadActivityCount > 0) {
                  fetch('/api/admin/activity/mark-seen', {
                    method: 'POST',
                  }).catch(err => {
                    console.error('Failed to mark activities as seen:', err)
                  })
                }
              }}
            >
              View all →
            </Link>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="p-3 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        <span className={getActionColor(activity.action)}>
                          {activity.action === 'LOGIN' ? 'LOGIN' : activity.action}
                        </span>{' '}
                        {activity.action === 'LOGIN' ? 'User' : activity.entity}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        by {activity.userEmail}
                      </p>
                      <p className="text-xs text-gray-400 mt-1" title={activity.createdAt ? formatDateTime(activity.createdAt) : '—'}>
                        {activity.createdAt ? formatDateTime(activity.createdAt) : '—'}
                      </p>
                      {activity.createdAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatRelativeTime(activity.createdAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Recent Invoices */}
      {showRecentInvoices && (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
          <Link
            href="/invoices"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View all →
          </Link>
        </div>
        {data.recentInvoices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No recent invoices</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        {formatInvoiceNumberForDisplay(invoice.invoiceNumber)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {invoice.clientName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(invoice.totalAmount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          invoice.status === 'PAID'
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'DRAFT'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invoice.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
