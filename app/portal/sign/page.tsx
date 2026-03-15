'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SignatureCapture } from '@/components/forms/SignatureCapture'

interface SignatureTarget {
  name: string
  entityType: 'CLIENT' | 'PROVIDER'
}

export default function SignaturePortalPage() {
  const searchParams = useSearchParams()
  const entityId = searchParams.get('id')
  const token = searchParams.get('token')
  const [target, setTarget] = useState<SignatureTarget | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchTarget() {
      if (!entityId || !token) {
        setError('Signature link is missing required parameters.')
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/public/signature?id=${entityId}&token=${token}`)
        const data = await res.json()
        if (res.ok) {
          setTarget(data)
        } else {
          setError(data.error || 'Signature link is invalid or expired.')
        }
      } catch (err) {
        console.error('Error loading signature link:', err)
        setError('Unable to load the signature page. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchTarget()
  }, [entityId, token])

  const handleSubmit = async () => {
    if (!signature) {
      setError('Please provide a signature before submitting.')
      return
    }

    if (!entityId || !token) {
      setError('Signature link is missing required parameters.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/public/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entityId, token, signature }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || 'Failed to submit signature.')
      }
    } catch (err) {
      console.error('Error submitting signature:', err)
      setError('Failed to submit signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading signature...</div>
  }

  if (error && !target) {
    return <div className="flex justify-center items-center min-h-screen text-red-600">{error}</div>
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Signature Submitted</h1>
          <p className="text-gray-600">Thank you. Your signature has been saved successfully.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Signature Request</h1>
        <p className="text-gray-600 mb-6">
          {target?.name || 'Hello'}, please provide your signature below.
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        )}

        <SignatureCapture value={signature} onChange={setSignature} />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-6 w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Submit Signature'}
        </button>
      </div>
    </div>
  )
}
