'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, X, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import SignatureCanvas from 'react-signature-canvas'

interface BCBAFormProps {
  bcba?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    signature: string | null
  }
}

export function BCBAForm({ bcba }: BCBAFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(bcba?.name || '')
  const [email, setEmail] = useState(bcba?.email || '')
  const [phone, setPhone] = useState(bcba?.phone || '')
  const [signature, setSignature] = useState(bcba?.signature || '')
  
  const signatureRef = useRef<SignatureCanvas>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    setLoading(true)

    try {
      const url = bcba 
        ? `/api/bcbas/${bcba.id}`
        : '/api/bcbas'
      
      const method = bcba ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          signature: signature || null,
        }),
      })

      if (res.ok) {
        toast.success(`BCBA ${bcba ? 'updated' : 'created'} successfully`)
        router.push('/bcbas')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to save BCBA')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <Link
          href="/bcbas"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to BCBAs
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {bcba ? 'Edit BCBA' : 'Create New BCBA'}
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
            <div className="space-y-4">
              {signature ? (
                <div className="mb-4">
                  <img
                    src={signature}
                    alt="BCBA Signature"
                    className="max-h-32 max-w-full object-contain border border-gray-300 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => setSignature('')}
                    className="mt-2 text-sm text-red-600 hover:text-red-800"
                  >
                    Remove Signature
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                  <SignatureCanvas
                    ref={signatureRef}
                    canvasProps={{
                      className: 'w-full border border-gray-300 rounded bg-white',
                      style: { width: '100%', height: '200px', touchAction: 'none' },
                    }}
                    backgroundColor="rgb(255, 255, 255)"
                  />
                  <div className="mt-2 flex space-x-2">
                    <button
                      type="button"
                      onClick={handleSaveSignature}
                      className="flex items-center px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save Signature
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSignature}
                      className="flex items-center px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </button>
                  </div>
                </div>
              )}
              {!signature && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Upload Image
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Link
              href="/bcbas"
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : bcba ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
