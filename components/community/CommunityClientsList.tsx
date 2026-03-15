'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Plus, Download, Search, Edit, Trash2, FileText, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { exportToCSV, exportToExcel } from '@/lib/exportUtils'
import { RowActionsMenu } from '@/components/shared/RowActionsMenu'

interface CommunityClient {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  medicaidId: string | null
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

export function CommunityClientsList() {
  const [clients, setClients] = useState<CommunityClient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/community/clients')
      const data = await res.json()
      if (res.ok) {
        setClients(data)
      } else {
        console.error('Failed to load community clients:', data)
        toast.error(data.error || `Failed to load community clients (${res.status})`)
      }
    } catch (error: any) {
      console.error('Error fetching community clients:', error)
      toast.error(`Failed to load community clients: ${error.message || 'Network error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this community client?')) return

    try {
      const res = await fetch(`/api/community/clients/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Community client deleted')
        fetchClients()
      } else {
        toast.error('Failed to delete community client')
      }
    } catch (error) {
      toast.error('Failed to delete community client')
    }
  }

  const filteredClients = clients.filter(
    (client) =>
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Close export menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formatClientsForExport = (clients: CommunityClient[]) => {
    return clients.map(client => ({
      'First Name': client.firstName,
      'Last Name': client.lastName,
      'Email': client.email || '',
      'Phone': client.phone || '',
      'Address': client.address || '',
      'City': client.city || '',
      'State': client.state || '',
      'Zip Code': client.zipCode || '',
      'Medicaid ID': client.medicaidId || '',
      'Status': client.status,
      'Created At': new Date(client.createdAt).toLocaleDateString(),
    }))
  }

  const handleExportCSV = () => {
    const data = formatClientsForExport(filteredClients)
    exportToCSV(data, `community-clients-${new Date().toISOString().split('T')[0]}`)
    setShowExportMenu(false)
    toast.success('Community clients exported to CSV')
  }

  const handleExportExcel = () => {
    const data = formatClientsForExport(filteredClients)
    exportToExcel(data, `community-clients-${new Date().toISOString().split('T')[0]}`, 'Community Clients')
    setShowExportMenu(false)
    toast.success('Community clients exported to Excel')
  }

  if (loading) {
    return <div className="text-center py-12">Loading community clients...</div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Community Clients</h1>
          <p className="text-gray-600 mt-1">Manage community class clients</p>
        </div>
        <div className="flex space-x-3">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>Export as CSV</span>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export as Excel</span>
                </button>
              </div>
            )}
          </div>
          <Link
            href="/community/clients/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Medicaid ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  {searchTerm ? 'No clients found matching your search' : 'No community clients yet'}
                </td>
              </tr>
            ) : (
              filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {client.firstName} {client.lastName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{client.email || '-'}</div>
                    <div className="text-sm text-gray-500">{client.phone || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {client.address ? (
                        <>
                          {client.address}
                          {client.city && `, ${client.city}`}
                          {client.state && ` ${client.state}`}
                          {client.zipCode && ` ${client.zipCode}`}
                        </>
                      ) : (
                        '-'
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{client.medicaidId || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        client.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <RowActionsMenu>
                      <button
                        onClick={() => {
                          window.location.href = `/community/clients/${client.id}/edit`
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 min-h-[44px]"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 min-h-[44px]"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </button>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
