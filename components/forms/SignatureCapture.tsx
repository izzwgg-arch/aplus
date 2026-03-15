'use client'

import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { X, Upload, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface SignatureCaptureProps {
  value?: string | null
  onChange: (signature: string | null) => void
  disabled?: boolean
}

export function SignatureCapture({ value, onChange, disabled = false }: SignatureCaptureProps) {
  const [showCanvas, setShowCanvas] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const signatureRef = useRef<SignatureCanvas>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClear = () => {
    if (signatureRef.current) {
      signatureRef.current.clear()
    }
    onChange(null)
    setShowCanvas(false)
    setShowUpload(false)
  }

  const handleSave = () => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      const dataUrl = signatureRef.current.toDataURL('image/png')
      onChange(dataUrl)
      setShowCanvas(false)
      toast.success('Signature saved')
    } else {
      toast.error('Please draw a signature')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPEG or PNG)')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      onChange(dataUrl)
      setShowUpload(false)
      toast.success('Signature uploaded')
    }
    reader.onerror = () => {
      toast.error('Failed to read image file')
    }
    reader.readAsDataURL(file)
  }

  if (disabled) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[150px] flex items-center justify-center">
        {value ? (
          <img src={value} alt="Signature" className="max-w-full max-h-[120px] object-contain" />
        ) : (
          <span className="text-gray-400">No signature</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {value && !showCanvas && !showUpload && (
        <div className="relative border-2 border-gray-300 rounded-lg p-4 min-h-[150px] flex items-center justify-center bg-gray-50">
          <img src={value} alt="Signature" className="max-w-full max-h-[120px] object-contain" />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded hover:bg-red-600"
            title="Clear signature"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {showCanvas && (
        <div className="border-2 border-gray-300 rounded-lg p-4 bg-white">
          <div className="mb-2">
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                className: 'w-full border border-gray-300 rounded',
                style: { touchAction: 'none' },
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                if (signatureRef.current) {
                  signatureRef.current.clear()
                }
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCanvas(false)
                if (signatureRef.current) {
                  signatureRef.current.clear()
                }
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="border-2 border-gray-300 rounded-lg p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handleFileUpload}
            className="mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!value && !showCanvas && !showUpload && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[150px] flex items-center justify-center">
          <span className="text-gray-400">No signature</span>
        </div>
      )}

      {!showCanvas && !showUpload && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCanvas(true)
              setShowUpload(false)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
            style={{ color: '#ffffff' }}
          >
            <span style={{ color: '#ffffff' }}>Draw</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowUpload(true)
              setShowCanvas(false)
              fileInputRef.current?.click()
            }}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
            style={{ color: '#ffffff' }}
          >
            <Upload className="w-4 h-4" style={{ color: '#ffffff' }} />
            <span style={{ color: '#ffffff' }}>Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  )
}
