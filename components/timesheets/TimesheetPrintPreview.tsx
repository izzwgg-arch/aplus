'use client'

import React from 'react'
import { X } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { formatDateInTimezone } from '@/lib/dateUtils'

interface Timesheet {
  id: string
  startDate: string
  endDate: string
  timezone?: string
  isBCBA?: boolean
  serviceType?: string | null
  sessionData?: string | null
  client: {
    name: string
    phone?: string | null
    id?: string
    idNumber?: string | null
    address?: string | null
    dlb?: string | null
    signature?: string | null
  }
  provider: {
    name: string
    phone?: string | null
    dlb?: string | null
    signature?: string | null
  }
  bcba: {
    name: string
    signature?: string | null
  }
  entries: Array<{
    date: string
    startTime: string
    endTime: string
    minutes: number
    notes: string | null
  }>
}

interface TimesheetPrintPreviewProps {
  timesheet: Timesheet
  onClose: () => void
}

export function TimesheetPrintPreview({ timesheet, onClose }: TimesheetPrintPreviewProps) {
  // Detect if this is a BCBA timesheet (use isBCBA flag or check entries)
  const isBCBATimesheet = timesheet.isBCBA === true || !timesheet.entries.some((e) => e.notes === 'DR' || e.notes === 'SV')
  
  // Calculate totals
  const drEntries = timesheet.entries.filter((e) => e.notes === 'DR')
  const svEntries = timesheet.entries.filter((e) => e.notes === 'SV')
  // For BCBA timesheets, include ALL entries (they may have service type in notes)
  const bcbaEntries = isBCBATimesheet ? timesheet.entries : timesheet.entries.filter((e) => !e.notes || e.notes === '')
  
  const totalDR = drEntries.reduce((sum, e) => sum + e.minutes / 60, 0)
  const totalSV = svEntries.reduce((sum, e) => sum + e.minutes / 60, 0)
  const totalBCBA = bcbaEntries.reduce((sum, e) => sum + e.minutes / 60, 0)
  const total = isBCBATimesheet ? totalBCBA : totalDR + totalSV

  const formatTime = (time: string): string => {
    if (!time || time === '--:--') return ''
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours, 10)
    if (isNaN(hour)) return ''
    
    const ampm = hour >= 12 ? 'PM' : 'AM'
    let displayHour = hour
    if (hour === 0) {
      displayHour = 12 // 00:xx = 12:xx AM
    } else if (hour > 12) {
      displayHour = hour - 12 // 13:xx = 1:xx PM
    }
    // hour === 12 stays as 12 (12:xx PM)
    
    return `${displayHour}:${minutes.padStart(2, '0')} ${ampm}`
  }

  // Convert service type to initials
  const getServiceTypeInitials = (serviceType: string | null | undefined): string => {
    if (!serviceType) return '-'
    switch (serviceType) {
      case 'Assessment':
        return 'A'
      case 'Direct Care':
        return 'DC'
      case 'Supervision':
        return 'S'
      case 'Treatment Planning':
        return 'TP'
      case 'Parent Training':
        return 'PT'
      default:
        return '-'
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 no-print" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto no-print" onClick={(e) => e.stopPropagation()} style={{ pointerEvents: 'auto' }}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b no-print">
            <h2 className="text-xl font-bold">Timesheet Print Preview</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content - This is what gets printed */}
          <div className={`p-6 print-preview-content ${isBCBATimesheet ? 'bcba-print-layout' : ''}`} style={{ color: '#000', backgroundColor: '#fff' }}>
            {/* Company Name Header */}
            <div className="mb-4 print-company-header">
              <h1 className="text-3xl font-bold text-center">
                {isBCBATimesheet ? 'BCBA Timesheet' : 'Timesheet'} Smart Steps ABA
              </h1>
            </div>

            {/* Client and Provider Info */}
            {isBCBATimesheet ? (
              <div className="mb-6">
                <div className="mb-2">
                  <span className="font-semibold">BCBA:</span> {timesheet.bcba.name}
                </div>
                <div className="mb-2">
                  <span className="font-semibold">Client:</span> {timesheet.client.name || ''}
                </div>
                {timesheet.client.address && (
                  <div className="mb-2">
                    <span className="font-semibold">Address:</span> {timesheet.client.address}
                  </div>
                )}
                <div className="mb-2">
                  <span className="font-semibold">Phone:</span> {timesheet.client.phone || ''}
                </div>
                {timesheet.sessionData && (
                  <div className="mb-2">
                    <span className="font-semibold">Session Data / Analysis:</span> {timesheet.sessionData}
                  </div>
                )}
                {timesheet.client.dlb && (
                  <div className="mt-2">
                    <span className="font-semibold">DLB:</span> {timesheet.client.dlb}
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-6">
                <div className="mb-2">
                  <span className="font-semibold">Provider:</span> {timesheet.provider.name}
                </div>
                <div className="mb-2">
                  <span className="font-semibold">BCBA:</span> {timesheet.bcba.name}
                </div>
                <div className="mb-2">
                  <span className="font-semibold">Child:</span> {timesheet.client.name || ''}
                </div>
                <div className="mb-2">
                  <span className="font-semibold">Phone:</span> {timesheet.client.phone || ''}
                </div>
              </div>
            )}

            {/* Period */}
            <div className="mb-4">
              <span className="font-semibold">Period:</span>{' '}
              {formatDateInTimezone(timesheet.startDate, 'EEE M/d/yyyy', timesheet.timezone || 'America/New_York').toLowerCase()} -{' '}
              {formatDateInTimezone(timesheet.endDate, 'EEE M/d/yyyy', timesheet.timezone || 'America/New_York').toLowerCase()}
            </div>

            {/* Table */}
            <div className="mb-6 overflow-x-auto">
              <table className="min-w-full border-collapse border border-gray-800">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-800 px-4 py-2 text-left font-semibold">DATE</th>
                    {isBCBATimesheet && (
                      <th className="border border-gray-800 px-4 py-2 text-left font-semibold">TYPE</th>
                    )}
                    <th className="border border-gray-800 px-4 py-2 text-left font-semibold">IN</th>
                    <th className="border border-gray-800 px-4 py-2 text-left font-semibold">OUT</th>
                    <th className="border border-gray-800 px-4 py-2 text-left font-semibold">HOURS</th>
                    {!isBCBATimesheet && (
                      <>
                        <th className="border border-gray-800 px-4 py-2 text-left font-semibold">TYPE</th>
                        <th className="border border-gray-800 px-4 py-2 text-left font-semibold">LOCATION</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {timesheet.entries
                    .sort((a, b) => {
                      const dateA = new Date(a.date).getTime()
                      const dateB = new Date(b.date).getTime()
                      if (dateA !== dateB) return dateA - dateB
                      const timeA = a.startTime
                      const timeB = b.startTime
                      return timeA.localeCompare(timeB)
                    })
                    .map((entry, index) => {
                      // CRITICAL: Always display dates in NY timezone, not user's local timezone
                      const timesheetTimezone = timesheet.timezone || 'America/New_York'
                      const entryDateStr = formatDateInTimezone(entry.date, 'EEE M/d/yyyy', timesheetTimezone)

                      return (
                        <tr key={index}>
                          <td className="border border-gray-800 px-4 py-2">
                            {entryDateStr.toLowerCase()}
                          </td>
                          {isBCBATimesheet && (
                            <td className="border border-gray-800 px-4 py-2">
                              {(() => {
                                // For BCBA timesheets, check if notes contains a valid service type
                                const serviceTypes = ['Assessment', 'Direct Care', 'Supervision', 'Treatment Planning', 'Parent Training']
                                let entryServiceType = null
                                if (entry.notes && serviceTypes.includes(entry.notes)) {
                                  entryServiceType = entry.notes
                                } else if (timesheet.serviceType && serviceTypes.includes(timesheet.serviceType)) {
                                  entryServiceType = timesheet.serviceType
                                }
                                return getServiceTypeInitials(entryServiceType)
                              })()}
                            </td>
                          )}
                          <td className="border border-gray-800 px-4 py-2">
                            {formatTime(entry.startTime)}
                          </td>
                          <td className="border border-gray-800 px-4 py-2">
                            {formatTime(entry.endTime)}
                          </td>
                          <td className="border border-gray-800 px-4 py-2">
                            {(entry.minutes / 60).toFixed(1)}
                          </td>
                          {!isBCBATimesheet && (
                            <>
                              <td className="border border-gray-800 px-4 py-2">
                                {entry.notes || '-'}
                              </td>
                              <td className="border border-gray-800 px-4 py-2">Home</td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mb-6">
              <div className="flex justify-end space-x-8 text-base font-semibold">
                {!isBCBATimesheet && (
                  <>
                    <div>
                      Total DR: <span className="ml-2">{totalDR.toFixed(1)}</span>
                    </div>
                    <div>
                      Total SV: <span className="ml-2">{totalSV.toFixed(1)}</span>
                    </div>
                  </>
                )}
                <div>
                  Total: <span className="ml-2">{total.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* Signatures */}
            {isBCBATimesheet ? (
              <div className="mb-6">
                <div>
                  <div className="mb-2">
                    <span className="font-semibold">BCBA Signature:</span>
                  </div>
                  {timesheet.bcba.signature ? (
                    <div className="mb-2">
                      <img
                        src={timesheet.bcba.signature}
                        alt="BCBA Signature"
                        className="max-h-20 max-w-full object-contain border border-gray-300 print:max-h-16"
                        style={{ maxHeight: '80px' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="h-12 border-b border-gray-400 mb-1"></div>
                      <div className="text-xs text-gray-400 italic">(No signature on file)</div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-8 mb-6">
                <div>
                  <div className="mb-2">
                    <span className="font-semibold">Client Signature:</span>
                  </div>
                  {timesheet.client.signature ? (
                    <div className="mb-2">
                      <img
                        src={timesheet.client.signature}
                        alt="Client Signature"
                        className="max-h-20 max-w-full object-contain border border-gray-300 print:max-h-16"
                        style={{ maxHeight: '80px' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="h-12 border-b border-gray-400 mb-1"></div>
                      <div className="text-xs text-gray-400 italic">(No signature on file)</div>
                    </>
                  )}
                </div>
                <div>
                  <div className="mb-2">
                    <span className="font-semibold">Provider Signature:</span>
                  </div>
                  {timesheet.provider.signature ? (
                    <div className="mb-2">
                      <img
                        src={timesheet.provider.signature}
                        alt="Provider Signature"
                        className="max-h-20 max-w-full object-contain border border-gray-300 print:max-h-16"
                        style={{ maxHeight: '80px' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="h-12 border-b border-gray-400 mb-1"></div>
                      <div className="text-xs text-gray-400 italic">(No signature on file)</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Legend - Only show for regular timesheets */}
            {!isBCBATimesheet && (
              <div className="text-sm text-gray-700 mt-6">
                <div className="mb-1">DR = Direct Service</div>
                <div>SV = Super Vision</div>
              </div>
            )}

            {/* Action Buttons - Hidden when printing */}
            <div 
              className="mt-8 flex justify-end space-x-3 no-print sticky bottom-0 bg-white pt-4 pb-2" 
              style={{ pointerEvents: 'auto', position: 'relative', zIndex: 9999 }}
            >
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 cursor-pointer"
                style={{ pointerEvents: 'auto', position: 'relative', zIndex: 10000 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
