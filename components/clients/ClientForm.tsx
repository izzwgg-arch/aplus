'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import SignatureCanvas from 'react-signature-canvas'

interface Insurance {
  id: string
  name: string
}

interface ClientFormProps {
  client?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    insuranceId: string
    active: boolean
    signature?: string | null
  }
  insurances: Insurance[]
}

export function ClientForm({ client, insurances }: ClientFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(client?.name || '')
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [insuranceId, setInsuranceId] = useState(client?.insuranceId || '')
  const [active, setActive] = useState(client?.active ?? true)
  const [signature, setSignature] = useState<string | null>(client?.signature || null)
  
  const signatureRef = useRef<SignatureCanvas>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load existing signature into canvas when editing
  useEffect(() => {
    if (client?.signature && signatureRef.current) {
      const img = new Image()
      img.onload = () => {
        const canvas = signatureRef.current?.getCanvas()
        if (canvas) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          }
        }
      }
      img.src = client.signature
    }
  }, [client?.signature])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    if (!insuranceId) {
      toast.error('Insurance is required')
      return
    }

    setLoading(true)

    try {
      const url = client 
        ? `/api/clients/${client.id}`
        : '/api/clients'
      
      const method = client ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          insuranceId,
          active,
          signature: signature || null,
        }),
      })

      if (res.ok) {
        toast.success(`Client ${client ? 'updated' : 'created'} successfully`)
        router.push('/clients')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save client')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear()
    }
  }

  const handleSaveSignature = () => {
    if (signatureRef.current) {
      const dataURL = signatureRef.current.toDataURL()
      setSignature(dataURL)
      toast.success('Signature saved')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file')
        return
      }
      
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setSignature(result)
        // Also draw on canvas if possible
        if (signatureRef.current && result) {
          const img = new Image()
          img.onload = () => {
            const canvas = signatureRef.current?.getCanvas()
            if (canvas) {
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
              }
            }
          }
          img.src = result
        }
        toast.success('Image uploaded successfully')
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/clients"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Clients
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {client ? 'Edit Client' : 'Create New Client'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(000) 000-0000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label htmlFor="insurance" className="block text-sm font-medium text-gray-700 mb-1">
              Insurance <span className="text-red-500">*</span>
            </label>
            <select
              id="insurance"
              required
              value={insuranceId}
              onChange={(e) => setInsuranceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
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
            <label htmlFor="idNumber" className="block text-sm font-medium text-gray-700 mb-1">
              ID Number
            </label>
            <input
              type="text"
              id="idNumber"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Signature (Optional)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
              <SignatureCanvas
                ref={signatureRef}
                canvasProps={{
                  className: 'border border-gray-300 rounded bg-white w-full',
                  style: { width: '100%', height: '200px' }
                }}
                backgroundColor="white"
              />
              <div className="mt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={handleSaveSignature}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Signature</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearSignature}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center space-x-2"
                >
                  <X className="w-4 h-4" />
                  <span>Clear</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>↑ Upload JPG</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Link
              href="/clients"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : client ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
