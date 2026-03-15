'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class TimesheetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('[TIMESHEET ERROR BOUNDARY] Client-side exception caught:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorBoundary: 'TimesheetErrorBoundary',
    })

    this.setState({
      error,
      errorInfo,
    })

    // Optionally log to error reporting service
    if (typeof window !== 'undefined' && (window as any).navigator?.sendBeacon) {
      try {
        const errorData = JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        })
        // Could send to error reporting service here
        console.log('[TIMESHEET ERROR] Error data prepared for reporting:', errorData)
      } catch (e) {
        console.error('[TIMESHEET ERROR] Failed to prepare error data:', e)
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-6 text-center">
              An error occurred while creating or editing the timesheet. Your data has been saved locally if you were using auto-save.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800 font-semibold mb-2">Error Message:</p>
                <p className="text-xs text-red-700 font-mono break-all mb-3">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <>
                    <p className="text-sm text-red-800 font-semibold mb-2">Stack Trace:</p>
                    <pre className="text-xs text-red-700 font-mono break-all whitespace-pre-wrap max-h-40 overflow-auto">
                      {this.state.error.stack}
                    </pre>
                  </>
                )}
                {this.state.errorInfo?.componentStack && (
                  <>
                    <p className="text-sm text-red-800 font-semibold mb-2 mt-3">Component Stack:</p>
                    <pre className="text-xs text-red-700 font-mono break-all whitespace-pre-wrap max-h-40 overflow-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col space-y-3">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try again
              </button>
              <Link
                href="/timesheets"
                className="flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Home className="w-4 h-4 mr-2" />
                Back to Timesheets
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
