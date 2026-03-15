'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import SignatureCanvas from 'react-signature-canvas'

interface ProviderFormProps {
  provider?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    signature: string | null
    active: boolean
  }
}

export function ProviderForm({ provider }: ProviderFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(provider?.name || '')
  const [email, setEmail] = useState(provider?.email || '')
  const [phone, setPhone] = useState(provider?.phone || '')
  const [active, setActive] = useState(provider?.active ?? true)
  const [signature, setSignature] = useState(provider?.signature || '')
  
  const signatureRef = useRef<SignatureCanvas>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    setLoading(true)

    try {
      const url = provider 
        ? `/api/providers/${provider.id}`
        : '/api/providers'
      
      const method = provider ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          signature: signature || null,
          active,
        }),
      })

      if (res.ok) {
        toast.success(`Provider ${provider ? 'updated' : 'created'} successfully`)
        router.push('/providers')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save provider')
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
      setSignature('')
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
        toast.success('Image uploaded successfully')
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/providers"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Providers
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {provider ? 'Edit Provider' : 'Create New Provider'}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Signature (Optional)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
              {signature && !signatureRef.current?.isEmpty() && (
                <div className="mb-4">
                  <img src={signature} alt="Signature" className="max-h-32 border border-gray-200 rounded" />
                </div>
              )}
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
              href="/providers"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : provider ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
