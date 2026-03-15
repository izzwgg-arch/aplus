'use client'

import Link from 'next/link'
import { FileText, User, Calendar } from 'lucide-react'

interface ReportsHubProps {
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

export function ReportsHub({ permissions, userRole }: ReportsHubProps) {
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  const canExport = permissions['PAYROLL_REPORTS_EXPORT']?.canView === true || isAdmin

  if (!canExport) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Reports Hub</h1>
        <p className="text-gray-600">You do not have permission to export reports.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Payroll Reports</h1>
      <p className="text-gray-600 mb-8">
        Generate and export professional payroll reports in PDF format.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Employee Monthly Report */}
        <Link
          href="/payroll/reports/employee"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center mb-4">
            <div className="bg-blue-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
              <User className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Employee Monthly Report</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Generate a detailed monthly report for a specific employee, including hours worked, pay calculations, and payment history.
          </p>
          <div className="flex items-center text-sm text-blue-600">
            <Calendar className="w-4 h-4 mr-2" />
            <span>Select employee and month</span>
          </div>
        </Link>

        {/* Payroll Run Summary Report */}
        <Link
          href="/payroll/reports/run"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center mb-4">
            <div className="bg-green-500 w-12 h-12 rounded-lg flex items-center justify-center mr-4">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Payroll Run Summary</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Generate a summary report for a payroll run, showing all employees, totals, and payment status.
          </p>
          <div className="flex items-center text-sm text-green-600">
            <Calendar className="w-4 h-4 mr-2" />
            <span>Select payroll run</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
