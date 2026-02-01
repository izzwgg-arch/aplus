'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, DollarSign, User, Calendar, CheckCircle, AlertCircle, X, Edit, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

interface PayrollRunLine {
  id: string
  employeeId: string
  employee: {
    id: string
    fullName: string
  }
  hourlyRateUsed: number
  totalMinutes: number
  totalHours: number
  regularMinutes: number
  overtimeMinutes: number
  regularPay: number
  overtimePay: number
  overtimeRateUsed: number | null
  grossPay: number
  amountPaid: number
  amountOwed: number
  notes: string | null
}

interface PayrollPayment {
  id: string
  employeeId: string
  employee: {
    id: string
    fullName: string
  }
  paidAt: string
  amount: number
  method: 'CASH' | 'CHECK' | 'ZELLE' | 'ACH' | 'OTHER'
  reference: string | null
  notes: string | null
  createdBy: {
    id: string
    username: string | null
    email: string | null
  }
}

interface PayrollRun {
  id: string
  name: string
  periodStart: string
  periodEnd: string
  status: 'DRAFT' | 'APPROVED' | 'PAID_PARTIAL' | 'PAID_FULL'
  createdAt: string
  createdBy: {
    id: string
    username: string | null
    email: string | null
  }
  lines: PayrollRunLine[]
  payments: PayrollPayment[]
}

export function PayrollRunDetail({
  runId,
  permissions,
  userRole,
}: {
  runId: string
  permissions: any
  userRole: string
}) {
  const router = useRouter()
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [savingPayment, setSavingPayment] = useState(false)

  // Payment form state
  const [paidAt, setPaidAt] = useState<Date | null>(new Date())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'CASH' | 'CHECK' | 'ZELLE' | 'ACH' | 'OTHER'>('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  const canEditPayments = permissions['PAYROLL_PAYMENTS_EDIT']?.canView === true || isAdmin
  const canEditRun = permissions['PAYROLL_RUN_CREATE']?.canView === true || isAdmin
  const canDeleteRun = isAdmin || permissions['PAYROLL_RUN_CREATE']?.canView === true
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingRun, setEditingRun] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPeriodStart, setEditPeriodStart] = useState<Date | null>(null)
  const [editPeriodEnd, setEditPeriodEnd] = useState<Date | null>(null)

  useEffect(() => {
    fetchRun()
  }, [runId])

  useEffect(() => {
    if (run && showEditForm) {
      setEditName(run.name)
      setEditPeriodStart(new Date(run.periodStart))
      setEditPeriodEnd(new Date(run.periodEnd))
    }
  }, [run, showEditForm])

  const fetchRun = async () => {
    try {
      const response = await fetch(`/api/payroll/runs/${runId}`)
      if (response.ok) {
        const data = await response.json()
        setRun(data.run)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to load payroll run')
      }
    } catch (error: any) {
      console.error('Failed to fetch run:', error)
      toast.error('Failed to load payroll run')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPayment = (lineId: string) => {
    const line = run?.lines.find(l => l.id === lineId)
    if (line) {
      setSelectedLineId(lineId)
      setAmount('')
      setMethod('CASH')
      setReference('')
      setNotes('')
      setPaidAt(new Date())
      setShowPaymentForm(true)
    }
  }

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedLineId || !run) {
      toast.error('Invalid payment data')
      return
    }

    const line = run.lines.find(l => l.id === selectedLineId)
    if (!line) {
      toast.error('Payroll line not found')
      return
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast.error('Valid payment amount is required')
      return
    }

    if (!paidAt) {
      toast.error('Payment date is required')
      return
    }

    const paymentAmount = parseFloat(amount)
    if (paymentAmount > line.amountOwed) {
      toast.error(`Payment amount cannot exceed amount owed ($${line.amountOwed.toFixed(2)})`)
      return
    }

    setSavingPayment(true)

    try {
      const response = await fetch(`/api/payroll/runs/${runId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: line.employeeId,
          paidAt: paidAt.toISOString(),
          amount: paymentAmount,
          method,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          payrollRunLineId: selectedLineId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save payment')
      }

      toast.success('Payment recorded successfully!')
      setShowPaymentForm(false)
      setSelectedLineId(null)
      fetchRun() // Refresh run data
    } catch (error: any) {
      console.error('Error saving payment:', error)
      toast.error(error.message || 'Failed to save payment')
    } finally {
      setSavingPayment(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value)
  }

  const handleEdit = () => {
    if (run) {
      setShowEditForm(true)
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!editName.trim()) {
      toast.error('Run name is required')
      return
    }

    if (!editPeriodStart || !editPeriodEnd) {
      toast.error('Period start and end dates are required')
      return
    }

    if (editPeriodStart > editPeriodEnd) {
      toast.error('Period start date must be before end date')
      return
    }

    setEditingRun(true)

    try {
      const response = await fetch(`/api/payroll/runs/${runId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          periodStart: editPeriodStart.toISOString(),
          periodEnd: editPeriodEnd.toISOString(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update payroll run')
      }

      toast.success('Payroll run updated successfully!')
      setShowEditForm(false)
      fetchRun() // Refresh run data
    } catch (error: any) {
      console.error('Error updating run:', error)
      toast.error(error.message || 'Failed to update payroll run')
    } finally {
      setEditingRun(false)
    }
  }

  const handleDelete = async () => {
    if (!run) return

    if (!confirm(`Are you sure you want to delete the payroll run "${run.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/payroll/runs/${runId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete payroll run')
      }

      toast.success('Payroll run deleted successfully')
      router.push('/payroll/runs')
    } catch (error: any) {
      console.error('Error deleting run:', error)
      toast.error(error.message || 'Failed to delete payroll run')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID_FULL':
        return 'bg-green-100 text-green-800'
      case 'PAID_PARTIAL':
        return 'bg-yellow-100 text-yellow-800'
      case 'APPROVED':
        return 'bg-blue-100 text-blue-800'
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">Loading payroll run...</p>
        </div>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Payroll run not found</h3>
          <Link
            href="/payroll/runs"
            className="text-primary-600 hover:text-primary-900"
          >
            Back to Payroll Runs
          </Link>
        </div>
      </div>
    )
  }

  const totalGross = run.lines.reduce((sum, line) => sum + parseFloat(line.grossPay.toString()), 0)
  const totalPaid = run.lines.reduce((sum, line) => sum + parseFloat(line.amountPaid.toString()), 0)
  const totalOwed = run.lines.reduce((sum, line) => sum + parseFloat(line.amountOwed.toString()), 0)

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/payroll/runs"
            className="flex items-center text-white hover:text-gray-100 mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Payroll Runs
          </Link>
          {showEditForm ? (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Run Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period Start <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={editPeriodStart}
                    onChange={(date) => setEditPeriodStart(date)}
                    dateFormat="MM/dd/yyyy"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period End <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={editPeriodEnd}
                    onChange={(date) => setEditPeriodEnd(date)}
                    dateFormat="MM/dd/yyyy"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editingRun}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {editingRun ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-900">{run.name}</h1>
              <p className="mt-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4 inline mr-1" />
                {format(new Date(run.periodStart), 'MM/dd/yyyy')} - {format(new Date(run.periodEnd), 'MM/dd/yyyy')}
              </p>
              <div className="mt-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(run.status)}`}>
                  {run.status.replace('_', ' ')}
                </span>
              </div>
            </>
          )}
        </div>
        {!showEditForm && (
          <div className="flex gap-2">
            {canEditRun && (
              <button
                onClick={handleEdit}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </button>
            )}
            {canDeleteRun && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 border border-red-300 rounded-md text-red-700 hover:bg-red-50 flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Gross Pay</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(totalGross)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Paid</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {formatCurrency(totalPaid)}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Owed</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">
                {formatCurrency(totalOwed)}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Employee Lines Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Employee Payroll Lines</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Breakdown</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rates</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pay Breakdown</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Pay</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owed</th>
                {canEditPayments && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {run.lines && run.lines.length > 0 ? (
                run.lines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="w-5 h-5 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-900">{line.employee.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="space-y-1">
                      <div>
                        <span className="font-medium">Regular:</span>{' '}
                        {(() => {
                          const regMins = line.regularMinutes || 0
                          const regHours = Math.floor(regMins / 60)
                          const regMinsRem = regMins % 60
                          return `${regHours} hours${regMinsRem > 0 ? ` ${regMinsRem} minutes` : ''}`
                        })()}
                      </div>
                      {(line.overtimeMinutes || 0) > 0 && (
                        <div>
                          <span className="font-medium">Overtime:</span>{' '}
                          {(() => {
                            const otMins = line.overtimeMinutes || 0
                            const otHours = Math.floor(otMins / 60)
                            const otMinsRem = otMins % 60
                            return `${otHours} hours${otMinsRem > 0 ? ` ${otMinsRem} minutes` : ''}`
                          })()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="space-y-1">
                      <div>
                        <span className="font-medium">Regular:</span> {formatCurrency(parseFloat(line.hourlyRateUsed.toString()))}/hr
                      </div>
                      {line.overtimeRateUsed && (line.overtimeMinutes || 0) > 0 && (
                        <div>
                          <span className="font-medium">OT:</span> {formatCurrency(parseFloat(line.overtimeRateUsed.toString()))}/hr
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="space-y-1">
                      <div>
                        <span className="font-medium">Regular:</span> {formatCurrency(parseFloat((line.regularPay || 0).toString()))}
                      </div>
                      {(line.overtimePay || 0) > 0 && (
                        <div>
                          <span className="font-medium">Overtime:</span> {formatCurrency(parseFloat((line.overtimePay || 0).toString()))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(parseFloat(line.grossPay.toString()))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {formatCurrency(parseFloat(line.amountPaid.toString()))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600">
                    {formatCurrency(parseFloat(line.amountOwed.toString()))}
                  </td>
                  {canEditPayments && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {parseFloat(line.amountOwed.toString()) > 0 && (
                        <button
                          onClick={() => handleAddPayment(line.id)}
                          className="text-primary-600 hover:text-primary-900 flex items-center"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Payment
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
              ) : (
                <tr>
                  <td colSpan={canEditPayments ? 7 : 6} className="px-6 py-8 text-center text-gray-500">
                    No employee data found for this payroll run. Please ensure import rows are linked to employees and contain hours/minutes data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Add Payment</h2>
                <button
                  onClick={() => {
                    setShowPaymentForm(false)
                    setSelectedLineId(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedLineId && run && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Employee:</strong> {run.lines.find(l => l.id === selectedLineId)?.employee.fullName}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>Amount Owed:</strong> {formatCurrency(parseFloat(run.lines.find(l => l.id === selectedLineId)?.amountOwed.toString() || '0'))}
                  </p>
                </div>
              )}

              <form onSubmit={handleSavePayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={paidAt}
                    onChange={(date) => setPaidAt(date)}
                    dateFormat="MM/dd/yyyy"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CHECK">Check</option>
                    <option value="ZELLE">Zelle</option>
                    <option value="ACH">ACH</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reference (optional)
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Check number, transaction ID, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="flex justify-end space-x-4 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentForm(false)
                      setSelectedLineId(null)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPayment}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                  >
                    {savingPayment ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Payments History */}
      {run.payments.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recorded By</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {run.payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(payment.paidAt), 'MM/dd/yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.employee.fullName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(parseFloat(payment.amount.toString()))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.reference || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.createdBy.username || payment.createdBy.email || 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
