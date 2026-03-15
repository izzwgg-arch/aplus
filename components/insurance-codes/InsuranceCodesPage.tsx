'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Trash2, Edit } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  APPLIES_TO_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  formatServiceType,
} from '@/lib/insuranceCodes/constants'
import { parseDateOnlyToLocal } from '@/lib/insuranceCodes/dateOnly'

interface ClientOption {
  id: string
  name: string
  insuranceId?: string | null
  insurance?: {
    id: string
    name: string
  }
}

interface InsuranceOption {
  id: string
  name: string
}

interface Authorization {
  id: string
  clientId: string
  insuranceId: string
  cptCode: string
  codeName: string
  serviceType: string
  appliesTo: string
  startDate: string
  endDate: string
  authorizedUnits: number
  notes?: string | null
  isActive: boolean
  client: { id: string; name: string }
  insurance: { id: string; name: string }
  usedUnitsAuthRange?: number
  remainingUnitsAuthRange?: number
  hasOverlap?: boolean
}

interface AnalyticsSummary {
  totalAuthorized: number
  totalUsedWeek: number
  totalUsedMonth: number
  totalRemaining: number
  totalRemainingHours: number
}

interface AuthorizationFormState {
  clientId: string
  insuranceId: string
  cptCode: string
  codeName: string
  serviceType: string
  appliesTo: string
  startDate: string
  endDate: string
  authorizedUnits: string
  notes: string
  isActive: boolean
}

export function InsuranceCodesPage() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [insurances, setInsurances] = useState<InsuranceOption[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Authorization | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [serviceTypeSummary, setServiceTypeSummary] = useState<Record<string, { used: number; remaining: number }>>({})
  const [serviceTypeBreakdown, setServiceTypeBreakdown] = useState<Record<string, any>>({})
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [selectedInsuranceId, setSelectedInsuranceId] = useState<string>('')
  const [showFullCpt, setShowFullCpt] = useState(false)

  const [form, setForm] = useState<AuthorizationFormState>({
    clientId: '',
    insuranceId: '',
    cptCode: '',
    codeName: '',
    serviceType: SERVICE_TYPE_OPTIONS[0].value,
    appliesTo: APPLIES_TO_OPTIONS[0].value,
    startDate: '',
    endDate: '',
    authorizedUnits: '',
    notes: '',
    isActive: true,
  })

  const filteredInsurances = useMemo(() => {
    if (!selectedClientId) return insurances
    const client = clients.find((item) => item.id === selectedClientId)
    if (client?.insurance) {
      return insurances.filter((insurance) => insurance.id === client.insurance!.id)
    }
    return insurances
  }, [clients, insurances, selectedClientId])

  const fetchAnalytics = async (clientId?: string, insuranceId?: string, searchValue?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientId) params.set('clientId', clientId)
      if (insuranceId) params.set('insuranceId', insuranceId)
      if (searchValue) params.set('search', searchValue)
      const res = await fetch(`/api/admin/insurance-codes/analytics?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setAuthorizations(data.items || [])
        setSummary(data.summary)
        setServiceTypeSummary(data.serviceTypeSummary || {})
        setServiceTypeBreakdown(data.serviceTypeBreakdown || {})
      } else {
        toast.error('Failed to load insurance code analytics')
      }
    } catch (error) {
      toast.error('Failed to load insurance code analytics')
    } finally {
      setLoading(false)
    }
  }

  const fetchClients = async () => {
    const res = await fetch('/api/clients')
    if (res.ok) {
      const data = await res.json()
      setClients(data)
    }
  }

  const fetchInsurances = async () => {
    const res = await fetch('/api/insurance')
    if (res.ok) {
      const data = await res.json()
      setInsurances(data)
    }
  }


  useEffect(() => {
    fetchAnalytics()
    fetchClients()
    fetchInsurances()
  }, [])

  const handleSearch = (value: string) => {
    setSearch(value)
  }

  const resetForm = () => {
    setForm({
      clientId: '',
      insuranceId: '',
      cptCode: '',
      codeName: '',
      serviceType: SERVICE_TYPE_OPTIONS[0].value,
      appliesTo: APPLIES_TO_OPTIONS[0].value,
      startDate: '',
      endDate: '',
      authorizedUnits: '',
      notes: '',
      isActive: true,
    })
    setShowFullCpt(false)
    setEditing(null)
  }

  const openNewForm = () => {
    resetForm()
    setShowForm(true)
  }

  const openEditForm = (auth: Authorization) => {
    setEditing(auth)
    setForm({
      clientId: auth.clientId,
      insuranceId: auth.insuranceId,
      cptCode: auth.cptCode.startsWith('971') && auth.cptCode.length === 5 ? auth.cptCode.slice(3) : auth.cptCode,
      codeName: auth.codeName,
      serviceType: auth.serviceType,
      appliesTo: auth.appliesTo,
      startDate: auth.startDate,
      endDate: auth.endDate,
      authorizedUnits: String(auth.authorizedUnits),
      notes: auth.notes || '',
      isActive: auth.isActive,
    })
    const shouldShowFull = !(auth.cptCode.startsWith('971') && auth.cptCode.length === 5)
    if (shouldShowFull) {
      console.warn('[INSURANCE_CODES] Unexpected CPT code format:', auth.cptCode)
    }
    setShowFullCpt(shouldShowFull)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.clientId || !form.insuranceId || !form.cptCode || !form.codeName) {
      toast.error('Please fill out all required fields')
      return
    }
    if (!form.startDate || !form.endDate) {
      toast.error('Please provide a valid date range')
      return
    }

    if (!showFullCpt && !/^\d{2}$/.test(form.cptCode)) {
      toast.error('CPT code must be 2 digits')
      return
    }

    const payload = {
      ...form,
      cptCode: showFullCpt && editing ? editing.cptCode : `971${form.cptCode}`,
      authorizedUnits: Number(form.authorizedUnits),
    }

    if (!Number.isFinite(payload.authorizedUnits) || payload.authorizedUnits <= 0) {
      toast.error('Authorized units must be a positive number')
      return
    }

    try {
      const res = await fetch(
        editing ? `/api/admin/insurance-codes/${editing.id}` : '/api/admin/insurance-codes',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (res.ok) {
        toast.success(editing ? 'Authorization updated' : 'Authorization created')
        setShowForm(false)
        resetForm()
        fetchAnalytics(selectedClientId || undefined, selectedInsuranceId || undefined, search)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save authorization')
      }
    } catch (error) {
      toast.error('Failed to save authorization')
    }
  }

  const handleDelete = async (auth: Authorization) => {
    if (!confirm('Mark this authorization as inactive?')) return
    try {
      const res = await fetch(`/api/admin/insurance-codes/${auth.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Authorization updated')
        fetchAnalytics(selectedClientId || undefined, selectedInsuranceId || undefined, search)
      } else {
        toast.error('Failed to update authorization')
      }
    } catch (error) {
      toast.error('Failed to update authorization')
    }
  }

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId)
    const client = clients.find((item) => item.id === clientId)
    if (client?.insuranceId) {
      setSelectedInsuranceId(client.insuranceId)
      fetchAnalytics(clientId || undefined, client.insuranceId || undefined, search)
      return
    }
    setSelectedInsuranceId('')
    fetchAnalytics(clientId || undefined, undefined, search)
  }

  const handleInsuranceSelect = (insuranceId: string) => {
    setSelectedInsuranceId(insuranceId)
    fetchAnalytics(selectedClientId || undefined, insuranceId || undefined, search)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAnalytics(selectedClientId || undefined, selectedInsuranceId || undefined, search)
    }, 300)

    return () => clearTimeout(timer)
  }, [search])

  if (loading) {
    return <div className="text-center py-12">Loading insurance codes...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Insurance Codes</h1>
        </div>
        <button
          onClick={openNewForm}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Code</span>
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by client, insurance, code, service type..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientSelect(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Insurance</label>
            <select
              value={selectedInsuranceId}
              onChange={(e) => handleInsuranceSelect(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">All Insurance</option>
              {filteredInsurances.map((insurance) => (
                <option key={insurance.id} value={insurance.id}>
                  {insurance.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {summary ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Total Authorized Units</div>
              <div className="text-2xl font-semibold">{summary.totalAuthorized.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Used Units (Week)</div>
              <div className="text-2xl font-semibold">{summary.totalUsedWeek.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Used Units (Month)</div>
              <div className="text-2xl font-semibold">{summary.totalUsedMonth.toFixed(2)}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Remaining Units</div>
              <div className="text-2xl font-semibold">{summary.totalRemaining.toFixed(2)}</div>
              <div className="text-xs text-gray-500">{summary.totalRemainingHours.toFixed(2)} hours</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Select a client to view usage analytics.</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SERVICE_TYPE_OPTIONS.map((option) => {
            const item = serviceTypeSummary[option.value]
            const breakdown = serviceTypeBreakdown[option.value]
            return (
              <div key={option.value} className="p-3 border border-gray-200 rounded-md">
                <div className="text-sm font-medium text-gray-700">{option.label}</div>
                <div className="text-sm text-gray-500">
                  Units Used: {item?.used?.toFixed(2) || '0.00'} | Units Remaining: {item?.remaining?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-gray-500">
                  Week Hours Used: {breakdown?.hoursUsedWeek?.toFixed(2) || '0.00'} | Week Hours Remaining: {breakdown?.hoursRemainingWeek?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-gray-500">
                  Month Hours Used: {breakdown?.hoursUsedMonth?.toFixed(2) || '0.00'} | Month Hours Remaining: {breakdown?.hoursRemainingMonth?.toFixed(2) || '0.00'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">{editing ? 'Edit Authorization' : 'Add New Authorization'}</h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Insurance</label>
              <select
                value={form.insuranceId}
                onChange={(e) => setForm({ ...form, insuranceId: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select insurance</option>
                {insurances.map((insurance) => (
                  <option key={insurance.id} value={insurance.id}>
                    {insurance.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPT Code (last 2 digits)</label>
              <input
                type="text"
                value={form.cptCode}
                onChange={(e) => setForm({ ...form, cptCode: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                disabled={showFullCpt}
              />
              <div className="text-xs text-gray-500 mt-1">
                {showFullCpt
                  ? 'Full CPT code stored. Edit disabled for this record.'
                  : 'All ABA codes start with 971 — enter only the last 2 digits (e.g., 53)'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code Name</label>
              <input
                type="text"
                value={form.codeName}
                onChange={(e) => setForm({ ...form, codeName: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
              <select
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                {SERVICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Applies To</label>
              <select
                value={form.appliesTo}
                onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                {APPLIES_TO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Authorized Units</label>
              <input
                type="number"
                min="1"
                value={form.authorizedUnits}
                onChange={(e) => setForm({ ...form, authorizedUnits: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                rows={3}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              {editing ? 'Update Authorization' : 'Create Authorization'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insurance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CPT Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applies To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Range</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Authorized Units</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Used Units</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining Units</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {authorizations.map((auth) => (
                <tr key={auth.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{auth.client.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{auth.insurance.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{auth.cptCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{auth.codeName}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{formatServiceType(auth.serviceType)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{auth.appliesTo}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {format(parseDateOnlyToLocal(auth.startDate), 'MM/dd/yyyy')} - {format(parseDateOnlyToLocal(auth.endDate), 'MM/dd/yyyy')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{auth.authorizedUnits}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{(auth.usedUnitsAuthRange || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{(auth.remainingUnitsAuthRange || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {!auth.isActive ? 'Inactive' : auth.hasOverlap ? 'Overlap Warning' : 'Active'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(auth)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(auth)}
                        className="text-red-600 hover:text-red-800"
                        title="Deactivate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {authorizations.length === 0 && (
          <div className="text-center py-12 text-gray-500">No insurance codes found</div>
        )}
      </div>
    </div>
  )
}
