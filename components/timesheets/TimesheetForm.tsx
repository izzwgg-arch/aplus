'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  getDaysInRange,
  getDayName,
  getDayShortName,
  isSunday,
  isFriday,
  isSaturday,
  isSaturdayInTimezone,
  formatDateOnly,
  getDateInTimezone,
  getDateObjectInTimezone,
  formatDateInTimezone,
  parseDateOnly,
} from '@/lib/dateUtils'
import {
  parseTimeToMinutes,
  INVALID_TIME,
} from '@/lib/timeUtils'
import { TimeFieldAMPM, TimeAMPM, timeAMPMToMinutes, minutesToTimeAMPM, timeAMPMTo24Hour } from './TimeFieldAMPM'
import { format } from 'date-fns'
import { calculateUnits } from '@/lib/dateUtils'
import {
  calculateDurationMinutes,
  validateTimeRange,
  formatHours,
} from '@/lib/timesheetUtils'
import { checkInternalOverlaps, prepareEntriesForOverlapCheck } from '@/lib/timesheetOverlapUtils'
import { TimesheetPrintPreview } from './TimesheetPrintPreview'
import { exportToCSV, exportToExcel, formatTimesheetForDetailedExport } from '@/lib/exportUtils'

interface Provider {
  id: string
  name: string
}

interface Client {
  id: string
  name: string
  insurance: {
    id: string
    name: string
  }
}

interface BCBA {
  id: string
  name: string
}

interface Insurance {
  id: string
  name: string
}

interface TimesheetEntry {
  id: string
  date: string
  startTime: string
  endTime: string
  minutes: number
  units: number
  notes: string | null
  invoiced?: boolean
}

interface Timesheet {
  id: string
  providerId: string
  clientId: string
  bcbaId: string
  insuranceId: string | null
  startDate: string
  endDate: string
  status: string
  timezone?: string
  entries: TimesheetEntry[]
}

interface TimesheetFormProps {
  providers: Provider[]
  clients: Client[]
  bcbas: BCBA[]
  insurances: Insurance[]
  timesheet?: Timesheet
}

// Internal representation: TimeAMPM objects (canonical AM/PM form)
interface DayEntry {
  date: Date
  dayName: string
  drFrom: TimeAMPM | null
  drTo: TimeAMPM | null
  drHours: number
  drUse: boolean
  svFrom: TimeAMPM | null
  svTo: TimeAMPM | null
  svHours: number
  svUse: boolean
  drInvoiced: boolean // Track if DR entry is invoiced
  svInvoiced: boolean // Track if SV entry is invoiced
  // Track touched fields per field (prevents auto-update when user manually edits)
  touched: {
    drFrom: boolean
    drTo: boolean
    svFrom: boolean
    svTo: boolean
  }
  // Validation errors per field
  errors: {
    dr: string | null
    sv: string | null
  }
  // Overlap conflict tracking
  overlapConflict?: {
    type: 'DR' | 'SV'
    message: string
  }
}

interface DefaultTimes {
  sun: {
    drFrom: TimeAMPM | null
    drTo: TimeAMPM | null
    drEnabled: boolean
    svFrom: TimeAMPM | null
    svTo: TimeAMPM | null
    svEnabled: boolean
  }
  weekdays: {
    drFrom: TimeAMPM | null
    drTo: TimeAMPM | null
    drEnabled: boolean
    svFrom: TimeAMPM | null
    svTo: TimeAMPM | null
    svEnabled: boolean
  }
  fri: {
    drFrom: TimeAMPM | null
    drTo: TimeAMPM | null
    drEnabled: boolean
    svFrom: TimeAMPM | null
    svTo: TimeAMPM | null
    svEnabled: boolean
  }
}

export function TimesheetForm({
  providers,
  clients,
  bcbas,
  insurances,
  timesheet,
}: TimesheetFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState<Date | null>(() => {
    try {
      if (timesheet?.startDate) {
        // CRITICAL: Always interpret timesheet dates in NY timezone, not user's local timezone
        const dateStr = getDateInTimezone(timesheet.startDate, 'America/New_York')
        const date = parseDateOnly(dateStr, 'America/New_York')
        if (!isNaN(date.getTime())) {
          return date
        }
        console.error('[TIMESHEET] Invalid startDate in timesheet:', timesheet.startDate)
      }
      return null
    } catch (error) {
      console.error('[TIMESHEET] Error parsing startDate:', error)
      return null
    }
  })
  const [endDate, setEndDate] = useState<Date | null>(() => {
    try {
      if (timesheet?.endDate) {
        // CRITICAL: Always interpret timesheet dates in NY timezone, not user's local timezone
        const dateStr = getDateInTimezone(timesheet.endDate, 'America/New_York')
        const date = parseDateOnly(dateStr, 'America/New_York')
        if (!isNaN(date.getTime())) {
          return date
        }
        console.error('[TIMESHEET] Invalid endDate in timesheet:', timesheet.endDate)
      }
      return null
    } catch (error) {
      console.error('[TIMESHEET] Error parsing endDate:', error)
      return null
    }
  })
  const [providerId, setProviderId] = useState(timesheet?.providerId || '')
  const [clientId, setClientId] = useState(timesheet?.clientId || '')
  const [bcbaId, setBcbaId] = useState(timesheet?.bcbaId || '')
  const [insuranceId, setInsuranceId] = useState(timesheet?.insuranceId || '')
  
  // Auto-select insurance when client changes
  useEffect(() => {
    if (clientId) {
      const selectedClient = clients.find(c => c.id === clientId)
      if (selectedClient?.insurance?.id) {
        setInsuranceId(selectedClient.insurance.id)
      }
    }
  }, [clientId, clients])
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([])
  const [totalHours, setTotalHours] = useState(0)
  // Always use America/New_York timezone for all timesheets regardless of user location
  const [timezone, setTimezone] = useState<string>('America/New_York')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [overlapConflicts, setOverlapConflicts] = useState<Array<{ index: number; type: 'DR' | 'SV'; message: string; isExternal?: boolean }>>([])
  const conflictRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())
  const [printPreviewTimesheet, setPrintPreviewTimesheet] = useState<any | null>(null)
  
  // Store temporary display values for day entry inputs while typing

  const [defaultTimes, setDefaultTimes] = useState<DefaultTimes>({
    sun: {
      drFrom: null,
      drTo: null,
      drEnabled: false,
      svFrom: null,
      svTo: null,
      svEnabled: false,
    },
    weekdays: {
      drFrom: null,
      drTo: null,
      drEnabled: false,
      svFrom: null,
      svTo: null,
      svEnabled: false,
    },
    fri: {
      drFrom: null,
      drTo: null,
      drEnabled: false,
      svFrom: null,
      svTo: null,
      svEnabled: false,
    },
  })

  // Track if we've initialized edit mode to prevent overwriting existing entries
  const hasInitializedRef = useRef(false)

  // Insurance is derived from client - no need to auto-select or store

  // Load timesheet data when in edit mode
  useEffect(() => {
    if (timesheet && startDate && endDate && !hasInitializedRef.current) {
      try {
        // Validate dates before processing
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.error('[TIMESHEET] Invalid dates in edit mode:', { startDate, endDate })
          toast.error('Invalid date range. Please refresh the page.')
          return
        }

        // Validate timesheet entries exist
        if (!timesheet.entries || !Array.isArray(timesheet.entries)) {
          console.error('[TIMESHEET] Invalid timesheet entries:', timesheet.entries)
          toast.error('Invalid timesheet data. Please refresh the page.')
          return
        }

        // CRITICAL: Filter out any Saturday entries from existing timesheet data
        const filteredEntries = timesheet.entries.filter((entry) => {
          try {
            if (!entry || !entry.date) return false
            // CRITICAL: Always check dates in NY timezone, not user's local timezone
            const entryDateObj = getDateObjectInTimezone(entry.date, timezone)
            if (isNaN(entryDateObj.getTime())) return false
            if (isSaturday(entryDateObj)) {
              console.error('[TIMESHEET] Saturday entry found in existing timesheet - removing:', entry)
              return false
            }
            return true
          } catch (error) {
            console.error('[TIMESHEET] Error checking entry date:', error, entry)
            return false
          }
        })

        // Use filtered entries instead of original
        const timesheetWithoutSaturdays = { ...timesheet, entries: filteredEntries }

        hasInitializedRef.current = true
        
        let days: Date[] = []
        try {
          days = getDaysInRange(startDate, endDate)
        } catch (error) {
          console.error('[TIMESHEET] Error getting days in range:', error)
          toast.error('Error processing date range. Please refresh the page.')
          hasInitializedRef.current = false
          return
        }

        // Exclude Saturdays - never render in bottom section (CRITICAL: Filter at data generation level)
        // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
        const daysWithoutSaturday = days.filter((date) => {
          try {
            if (!date || isNaN(date.getTime())) return false
            // Convert date to date string in NY timezone and check if it's Saturday
            const dateStr = formatDateOnly(date, timezone)
            if (isSaturdayInTimezone(dateStr, timezone)) {
              console.error('[TIMESHEET] CRITICAL: Saturday detected in edit mode date generation - this should never happen!', date)
              return false
            }
            return true
          } catch (error) {
            console.error('[TIMESHEET] Error filtering date:', error, date)
            return false
          }
        })
        
        // Final assertion: Verify no Saturdays in final entries
        const entries = daysWithoutSaturday
          .map((date) => {
            try {
              // Validate date before processing
              if (!date || isNaN(date.getTime())) {
                console.error('[TIMESHEET] Invalid date in entry generation:', date)
                return null
              }

              // Assert no Saturdays in rendered data (skip instead of throw)
              // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
              const checkDateStr = formatDateOnly(date, timezone)
              if (isSaturdayInTimezone(checkDateStr, timezone)) {
                console.error('[TIMESHEET] CRITICAL: Saturday found in edit mode entry generation!', date)
                return null // Skip instead of throwing
              }

              let dateStr: string
              try {
                dateStr = format(date, 'yyyy-MM-dd')
              } catch (error) {
                console.error('[TIMESHEET] Error formatting date:', error, date)
                return null
              }

              const dayEntries = timesheetWithoutSaturdays.entries.filter((entry) => {
                try {
                  if (!entry || !entry.date) return false
                  // CRITICAL: Always interpret entry dates in NY timezone, not user's local timezone
                  const entryDate = getDateInTimezone(entry.date, timezone)
                  return entryDate === dateStr
                } catch (error) {
                  console.error('[TIMESHEET] Error parsing entry date:', error, entry)
                  return false
                }
              })

              const drEntry = dayEntries.find((e) => e?.notes === 'DR')
              const svEntry = dayEntries.find((e) => e?.notes === 'SV')

              // Convert 24-hour strings to minutes, then to TimeAMPM
              let drFromMinutes: number | null = null
              let drToMinutes: number | null = null
              let svFromMinutes: number | null = null
              let svToMinutes: number | null = null

              try {
                drFromMinutes = drEntry?.startTime ? parseTimeToMinutes(drEntry.startTime) : null
                drToMinutes = drEntry?.endTime ? parseTimeToMinutes(drEntry.endTime) : null
                svFromMinutes = svEntry?.startTime ? parseTimeToMinutes(svEntry.startTime) : null
                svToMinutes = svEntry?.endTime ? parseTimeToMinutes(svEntry.endTime) : null
              } catch (error) {
                console.error('[TIMESHEET] Error parsing times:', error, { drEntry, svEntry })
              }

              // Convert to TimeAMPM
              let drFrom: TimeAMPM | null = null
              let drTo: TimeAMPM | null = null
              let svFrom: TimeAMPM | null = null
              let svTo: TimeAMPM | null = null

              try {
                drFrom = drFromMinutes !== null && drFromMinutes !== INVALID_TIME
                  ? minutesToTimeAMPM(drFromMinutes)
                  : null
                drTo = drToMinutes !== null && drToMinutes !== INVALID_TIME
                  ? minutesToTimeAMPM(drToMinutes)
                  : null
                svFrom = svFromMinutes !== null && svFromMinutes !== INVALID_TIME
                  ? minutesToTimeAMPM(svFromMinutes)
                  : null
                svTo = svToMinutes !== null && svToMinutes !== INVALID_TIME
                  ? minutesToTimeAMPM(svToMinutes)
                  : null
              } catch (error) {
                console.error('[TIMESHEET] Error converting to TimeAMPM:', error)
              }

              // Calculate hours
              let drDuration: number | null = null
              let svDuration: number | null = null

              try {
                drDuration = calculateDurationMinutes(drFrom, drTo)
                svDuration = calculateDurationMinutes(svFrom, svTo)
              } catch (error) {
                console.error('[TIMESHEET] Error calculating duration:', error)
              }

              // Guard against NaN
              const drHours = drDuration !== null && !isNaN(drDuration) ? drDuration / 60 : 0
              const svHours = svDuration !== null && !isNaN(svDuration) ? svDuration / 60 : 0

              // Get day name safely
              let dayName: string = 'Unknown'
              try {
                dayName = getDayName(date)
              } catch (error) {
                console.error('[TIMESHEET] Error getting day name:', error, date)
                dayName = format(date, 'EEE') // Fallback to short name
              }

              return {
                date,
                dayName,
                drFrom,
                drTo,
                drHours: isNaN(drHours) ? 0 : drHours,
                drUse: !!drEntry,
                drInvoiced: drEntry?.invoiced || false,
                svFrom,
                svTo,
                svHours: isNaN(svHours) ? 0 : svHours,
                svUse: !!svEntry,
                svInvoiced: svEntry?.invoiced || false,
                touched: {
                  drFrom: true, // Existing entries are always touched
                  drTo: true,
                  svFrom: true,
                  svTo: true,
                },
                errors: {
                  dr: null,
                  sv: null,
                },
              }
            } catch (error) {
              console.error('[TIMESHEET] Error processing entry in edit mode:', error, date)
              return null // Return null instead of crashing
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null) // Filter out nulls

        // Final verification: Assert no Saturdays in final state (edit mode)
        const hasSaturday = entries.some(entry => {
          try {
            return entry?.date ? isSaturday(entry.date) : false
          } catch {
            return false
          }
        })
        if (hasSaturday) {
          console.error('[TIMESHEET] CRITICAL: Saturday entries found in final state (edit mode)!', entries.filter(e => {
            try {
              // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
              if (!e?.date) return false
              const entryDateStr = typeof e.date === 'string' ? e.date : formatDateOnly(e.date, timezone)
              return isSaturdayInTimezone(entryDateStr, timezone)
            } catch {
              return false
            }
          }))
          // Filter out Saturdays instead of throwing
          const filteredEntries = entries.filter(e => {
            try {
              // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
              if (!e?.date) return false
              const entryDateStr = typeof e.date === 'string' ? e.date : formatDateOnly(e.date, timezone)
              return !isSaturdayInTimezone(entryDateStr, timezone)
            } catch {
              return false
            }
          })
          setDayEntries(filteredEntries)
          calculateTotalHours(filteredEntries)
        } else {
          setDayEntries(entries)
          calculateTotalHours(entries)
        }
      } catch (error) {
        console.error('[TIMESHEET] Error loading timesheet data in edit mode:', error)
        toast.error('Failed to load timesheet data. Please refresh the page.')
        hasInitializedRef.current = false // Allow retry
      }
    }
  }, [timesheet, startDate, endDate])

  // Generate days when date range changes (for new timesheets only)
  // This ONLY runs when dates change, not when defaults change
  useEffect(() => {
    if (startDate && endDate && !timesheet) {
      try {
        // Validate dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.error('[TIMESHEET] Invalid dates in new timesheet:', { startDate, endDate })
          return
        }

        let days: Date[] = []
        try {
          days = getDaysInRange(startDate, endDate)
        } catch (error) {
          console.error('[TIMESHEET] Error getting days in range:', error)
          return
        }

        // Exclude Saturdays - never render in bottom section (CRITICAL: Filter at data generation level)
        // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
        const daysWithoutSaturday = days.filter((date) => {
          try {
            if (!date || isNaN(date.getTime())) return false
            // Convert date to date string in NY timezone and check if it's Saturday
            const dateStr = formatDateOnly(date, timezone)
            if (isSaturdayInTimezone(dateStr, timezone)) {
              console.error('[TIMESHEET] CRITICAL: Saturday detected in date generation - this should never happen!', date)
              return false
            }
            return true
          } catch (error) {
            console.error('[TIMESHEET] Error filtering date:', error, date)
            return false
          }
        })
        
        // Final assertion: Verify no Saturdays in final entries
        const entries = daysWithoutSaturday
          .map((date) => {
            try {
              // Validate date
              if (!date || isNaN(date.getTime())) {
                console.error('[TIMESHEET] Invalid date in entry generation:', date)
                return null
              }

              // Assert no Saturdays in rendered data (skip instead of throw)
              // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
              const dateStr = formatDateOnly(date, timezone)
              if (isSaturdayInTimezone(dateStr, timezone)) {
                console.error('[TIMESHEET] CRITICAL: Saturday found in entry generation!', date)
                return null // Skip instead of throwing
              }
              let defaults = defaultTimes.weekdays
              try {
                if (isSunday(date)) {
                  defaults = defaultTimes.sun
                } else if (isFriday(date)) {
                  defaults = defaultTimes.fri
                }
              } catch (error) {
                console.error('[TIMESHEET] Error determining day type:', error, date)
              }

              const hasValidDrTimes =
                defaults.drEnabled &&
                defaults.drFrom !== null &&
                defaults.drTo !== null
              const hasValidSvTimes =
                defaults.svEnabled &&
                defaults.svFrom !== null &&
                defaults.svTo !== null

              // Calculate hours using new utility functions
              let drDuration: number | null = null
              let svDuration: number | null = null

              try {
                drDuration = hasValidDrTimes
                  ? calculateDurationMinutes(defaults.drFrom, defaults.drTo)
                  : null
                svDuration = hasValidSvTimes
                  ? calculateDurationMinutes(defaults.svFrom, defaults.svTo)
                  : null
              } catch (error) {
                console.error('[TIMESHEET] Error calculating duration:', error)
              }

              const drHours = drDuration !== null && !isNaN(drDuration) ? drDuration / 60 : 0
              const svHours = svDuration !== null && !isNaN(svDuration) ? svDuration / 60 : 0

              // Get day name safely
              let dayName: string = 'Unknown'
              try {
                dayName = getDayName(date)
              } catch (error) {
                console.error('[TIMESHEET] Error getting day name:', error, date)
                try {
                  dayName = format(date, 'EEE') // Fallback to short name
                } catch {
                  dayName = 'Unknown'
                }
              }

              return {
                date,
                dayName,
                drFrom: hasValidDrTimes ? defaults.drFrom : null,
                drTo: hasValidDrTimes ? defaults.drTo : null,
                drHours: isNaN(drHours) ? 0 : drHours,
                drUse: hasValidDrTimes,
                drInvoiced: false,
                svFrom: hasValidSvTimes ? defaults.svFrom : null,
                svTo: hasValidSvTimes ? defaults.svTo : null,
                svHours: isNaN(svHours) ? 0 : svHours,
                svUse: hasValidSvTimes,
                svInvoiced: false,
                touched: {
                  drFrom: false, // New entries start as not touched
                  drTo: false,
                  svFrom: false,
                  svTo: false,
                },
                errors: {
                  dr: null,
                  sv: null,
                },
              }
            } catch (error) {
              console.error('[TIMESHEET] Error processing entry in new timesheet:', error, date)
              return null // Return null instead of crashing
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null) // Filter out nulls

        // Final verification: Assert no Saturdays in final state
        const hasSaturday = entries.some(entry => {
          try {
            return entry?.date?.getDay() === 6
          } catch {
            return false
          }
        })
        if (hasSaturday) {
          console.error('[TIMESHEET] CRITICAL: Saturday entries found in final state!', entries.filter(e => {
            try {
              return e?.date?.getDay() === 6
            } catch {
              return false
            }
          }))
          // Filter out Saturdays instead of throwing
          const filteredEntries = entries.filter(e => {
            try {
              return e?.date?.getDay() !== 6
            } catch {
              return false
            }
          })
          setDayEntries(filteredEntries)
          calculateTotalHours(filteredEntries)
        } else {
          setDayEntries(entries)
          calculateTotalHours(entries)
        }
      } catch (error) {
        console.error('[TIMESHEET] Error generating days for new timesheet:', error)
        toast.error('Error generating date entries. Please try again.')
      }
    }
  }, [startDate, endDate, timesheet]) // REMOVED defaultTimes - no auto-update

  // Auto-update day entries when defaults change (only non-touched fields)
  useEffect(() => {
    if (timesheet || !startDate || !endDate) return

    setDayEntries((prevEntries) => {
      if (prevEntries.length === 0) return prevEntries

      const updated = prevEntries.map((entry) => {
        let defaults = defaultTimes.weekdays
        if (isSunday(entry.date)) {
          defaults = defaultTimes.sun
        } else if (isFriday(entry.date)) {
          defaults = defaultTimes.fri
        }

        const hasValidDrTimes =
          defaults.drEnabled &&
          defaults.drFrom !== null &&
          defaults.drTo !== null
        const hasValidSvTimes =
          defaults.svEnabled &&
          defaults.svFrom !== null &&
          defaults.svTo !== null

        // Only update non-touched fields
        const newDrFrom = entry.touched.drFrom ? entry.drFrom : (hasValidDrTimes ? defaults.drFrom : null)
        const newDrTo = entry.touched.drTo ? entry.drTo : (hasValidDrTimes ? defaults.drTo : null)
        const newSvFrom = entry.touched.svFrom ? entry.svFrom : (hasValidSvTimes ? defaults.svFrom : null)
        const newSvTo = entry.touched.svTo ? entry.svTo : (hasValidSvTimes ? defaults.svTo : null)

        // Recalculate hours
        const drFromMins = timeAMPMToMinutes(newDrFrom)
        const drToMins = timeAMPMToMinutes(newDrTo)
        const svFromMins = timeAMPMToMinutes(newSvFrom)
        const svToMins = timeAMPMToMinutes(newSvTo)

        const drDuration = (drFromMins !== null && drToMins !== null && drToMins >= drFromMins)
          ? drToMins - drFromMins
          : null
        const svDuration = (svFromMins !== null && svToMins !== null && svToMins >= svFromMins)
          ? svToMins - svFromMins
          : null

        const drHours = drDuration !== null ? drDuration / 60 : 0
        const svHours = svDuration !== null ? svDuration / 60 : 0

        return {
          ...entry,
          drFrom: newDrFrom,
          drTo: newDrTo,
          drHours,
          drUse: hasValidDrTimes && !entry.touched.drFrom && !entry.touched.drTo ? true : entry.drUse,
          svFrom: newSvFrom,
          svTo: newSvTo,
          svHours,
          svUse: hasValidSvTimes && !entry.touched.svFrom && !entry.touched.svTo ? true : entry.svUse,
        }
      })

      calculateTotalHours(updated)
      return updated
    })
  }, [defaultTimes, startDate, endDate, timesheet])

  // Check for overlaps whenever dayEntries change
  useEffect(() => {
    if (dayEntries.length === 0 || !providerId || !clientId) {
      setOverlapConflicts([])
      return
    }

    // Check internal overlaps (within the same timesheet)
    let internalConflicts: Array<{ date: Date; type: 'DR' | 'SV'; message: string }> = []
    try {
      if (!Array.isArray(dayEntries)) {
        console.error('[TIMESHEET] dayEntries is not an array in overlap check')
        return
      }
      internalConflicts = checkInternalOverlaps(dayEntries)
    } catch (error) {
      console.error('[TIMESHEET] Error checking internal overlaps:', error)
      // Continue with external check even if internal check fails
    }
    
    // Map internal conflicts to entry indices
    const conflictMap = new Map<number, { type: 'DR' | 'SV'; message: string; isExternal?: boolean }>()
    
    for (const conflict of internalConflicts) {
      const entryIndex = dayEntries.findIndex(e => 
        format(e.date, 'yyyy-MM-dd') === format(conflict.date, 'yyyy-MM-dd')
      )
      if (entryIndex >= 0) {
        conflictMap.set(entryIndex, {
          type: conflict.type,
          message: conflict.message,
          isExternal: false,
        })
      }
    }

    // Check external overlaps (against existing saved timesheets)
    const checkExternalOverlaps = async () => {
      try {
        if (!Array.isArray(dayEntries)) {
          console.error('[TIMESHEET] dayEntries is not an array in external overlap check')
          return
        }
        // Prepare entries for API call
        const entriesForCheck = dayEntries
          .filter(e => {
            if (!e || !e.date) return false
            try {
              const hasDr = e.drUse && e.drFrom && e.drTo
              const hasSv = e.svUse && e.svFrom && e.svTo
              return hasDr || hasSv
            } catch (error) {
              console.error('[TIMESHEET] Error filtering entry for overlap check:', error, e)
              return false
            }
          })
          .flatMap(e => {
            const result: Array<{
              date: string
              startTime: string
              endTime: string
              notes: string | null
            }> = []
            
            try {
              if (!e || !e.date) return result
              
              if (e.drUse && e.drFrom && e.drTo) {
                result.push({
                  date: formatDateOnly(e.date, timezone),
                  startTime: timeAMPMTo24Hour(e.drFrom),
                  endTime: timeAMPMTo24Hour(e.drTo),
                  notes: 'DR',
                })
              }
              
              if (e.svUse && e.svFrom && e.svTo) {
                result.push({
                  date: formatDateOnly(e.date, timezone),
                  startTime: timeAMPMTo24Hour(e.svFrom),
                  endTime: timeAMPMTo24Hour(e.svTo),
                  notes: 'SV',
                })
              }
            } catch (error) {
              console.error('[TIMESHEET] Error processing entry for overlap check:', error, e)
            }
            
            return result
          })

        if (entriesForCheck.length === 0) {
          const conflictsArray = Array.from(conflictMap.entries()).map(([index, data]) => ({
            index,
            ...data,
          }))
          setOverlapConflicts(conflictsArray)
          return
        }

        const res = await fetch('/api/timesheets/check-overlaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId,
            clientId,
            entries: entriesForCheck,
            excludeTimesheetId: timesheet?.id,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.hasOverlaps && Array.isArray(data.conflicts)) {
            // Map external conflicts to entry indices
            for (const conflict of data.conflicts) {
              try {
                if (!conflict || !conflict.date || !Array.isArray(dayEntries)) continue
                const entryIndex = dayEntries.findIndex(e => {
                  try {
                    if (!e || !e.date) return false
                    return format(e.date, 'yyyy-MM-dd') === conflict.date
                  } catch (error) {
                    console.error('[TIMESHEET] Error comparing dates in external conflict:', error)
                    return false
                  }
                })
                if (entryIndex >= 0 && entryIndex < dayEntries.length) {
                  const existing = conflictMap.get(entryIndex)
                  if (!existing || !existing.isExternal) {
                    conflictMap.set(entryIndex, {
                      type: conflict.entryType === 'SV' ? 'SV' : 'DR',
                      message: conflict.message || `Overlap detected on ${conflict.date}`,
                      isExternal: true,
                    })
                  }
                }
              } catch (error) {
                console.error('[TIMESHEET] Error processing external conflict:', error, conflict)
              }
            }
          }
        }

        // Convert to array format
        const conflictsArray = Array.from(conflictMap.entries()).map(([index, data]) => ({
          index,
          ...data,
        }))

        setOverlapConflicts(conflictsArray)

        // Scroll to first conflict if any
        if (conflictsArray.length > 0) {
          try {
            const firstConflictIndex = conflictsArray[0]?.index
            if (typeof firstConflictIndex === 'number' && firstConflictIndex >= 0) {
              const rowElement = conflictRowRefs.current.get(firstConflictIndex)
              if (rowElement) {
                setTimeout(() => {
                  try {
                    rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  } catch (scrollError) {
                    console.error('[TIMESHEET] Error scrolling to conflict:', scrollError)
                  }
                }, 100)
              }
            }
          } catch (error) {
            console.error('[TIMESHEET] Error handling conflict scroll:', error)
          }
        }
      } catch (error) {
        console.error('[TIMESHEET] Error checking external overlaps:', error)
        // Still show internal conflicts even if external check fails
        try {
          const conflictsArray = Array.from(conflictMap.entries()).map(([index, data]) => ({
            index,
            ...data,
          }))
          setOverlapConflicts(conflictsArray)
        } catch (mapError) {
          console.error('[TIMESHEET] Error mapping conflicts after external check failure:', mapError)
          setOverlapConflicts([])
        }
      }
    }

    checkExternalOverlaps()
  }, [dayEntries, providerId, clientId, timesheet?.id])

  const calculateTotalHours = (entries: DayEntry[]) => {
    try {
      if (!Array.isArray(entries)) {
        console.error('[TIMESHEET] calculateTotalHours: entries is not an array', entries)
        setTotalHours(0)
        return
      }
      const total = entries.reduce((sum, entry) => {
        if (!entry) return sum
        const drHours = entry.drUse && typeof entry.drHours === 'number' && entry.drHours > 0 ? entry.drHours : 0
        const svHours = entry.svUse && typeof entry.svHours === 'number' && entry.svHours > 0 ? entry.svHours : 0
        const entryTotal = drHours + svHours
        if (isNaN(entryTotal)) {
          console.error('[TIMESHEET] Invalid hours in entry:', entry)
          return sum
        }
        return sum + entryTotal
      }, 0)
      setTotalHours(isNaN(total) ? 0 : total)
    } catch (error) {
      console.error('[TIMESHEET] Error calculating total hours:', error)
      setTotalHours(0)
    }
  }

  const updateDefaultTimes = (
    dayType: 'sun' | 'weekdays' | 'fri',
    field: 'drFrom' | 'drTo' | 'drEnabled' | 'svFrom' | 'svTo' | 'svEnabled',
    value: TimeAMPM | null | boolean
  ) => {
    if (field === 'drEnabled' || field === 'svEnabled') {
      setDefaultTimes((prev) => ({
        ...prev,
        [dayType]: {
          ...prev[dayType],
          [field]: value as boolean,
        },
      }))
      return
    }

    if (typeof value !== 'object' && value !== null) return

    setDefaultTimes((prev) => ({
      ...prev,
      [dayType]: {
        ...prev[dayType],
        [field]: value as TimeAMPM | null,
      },
    }))
  }

  // Apply default times to all non-touched rows
  const applyDefaultsToDates = () => {
    if (timesheet) return // Don't apply in edit mode
    if (!startDate || !endDate) return

    setDayEntries((prevEntries) => {
      if (prevEntries.length === 0) return prevEntries

      // Safety filter: Remove any Saturday entries that might have slipped through
      const filteredEntries = prevEntries.filter((entry) => {
        // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
        const entryDateStr = typeof entry.date === 'string' ? entry.date : formatDateOnly(entry.date, timezone)
        if (isSaturdayInTimezone(entryDateStr, timezone)) {
          console.error('[TIMESHEET] CRITICAL: Saturday entry found in applyDefaultsToDates - removing!', entry)
          return false
        }
        return true
      })

      const updated = filteredEntries.map((entry) => {
        let defaults = defaultTimes.weekdays
        if (isSunday(entry.date)) {
          defaults = defaultTimes.sun
        } else if (isFriday(entry.date)) {
          defaults = defaultTimes.fri
        }

        const hasValidDrTimes =
          defaults.drEnabled &&
          defaults.drFrom !== null &&
          defaults.drTo !== null
        const hasValidSvTimes =
          defaults.svEnabled &&
          defaults.svFrom !== null &&
          defaults.svTo !== null

        // Only update non-touched fields
        const newDrFrom = entry.touched.drFrom ? entry.drFrom : (hasValidDrTimes ? defaults.drFrom : null)
        const newDrTo = entry.touched.drTo ? entry.drTo : (hasValidDrTimes ? defaults.drTo : null)
        const newSvFrom = entry.touched.svFrom ? entry.svFrom : (hasValidSvTimes ? defaults.svFrom : null)
        const newSvTo = entry.touched.svTo ? entry.svTo : (hasValidSvTimes ? defaults.svTo : null)

        // Recalculate hours
        const drFromMins = timeAMPMToMinutes(newDrFrom)
        const drToMins = timeAMPMToMinutes(newDrTo)
        const svFromMins = timeAMPMToMinutes(newSvFrom)
        const svToMins = timeAMPMToMinutes(newSvTo)

        const drDuration = (drFromMins !== null && drToMins !== null && drToMins >= drFromMins)
          ? drToMins - drFromMins
          : null
        const svDuration = (svFromMins !== null && svToMins !== null && svToMins >= svFromMins)
          ? svToMins - svFromMins
          : null

        const drHours = drDuration !== null ? drDuration / 60 : 0
        const svHours = svDuration !== null ? svDuration / 60 : 0

        return {
          ...entry,
          drFrom: newDrFrom,
          drTo: newDrTo,
          drHours,
          drUse: hasValidDrTimes && !entry.touched.drFrom && !entry.touched.drTo ? true : entry.drUse,
          svFrom: newSvFrom,
          svTo: newSvTo,
          svHours,
          svUse: hasValidSvTimes && !entry.touched.svFrom && !entry.touched.svTo ? true : entry.svUse,
        }
      })

      calculateTotalHours(updated)
      return updated
    })
  }

  // Reset a single row to default times
  const resetRowToDefault = (index: number) => {
    if (timesheet) return // Don't reset in edit mode
    if (!startDate || !endDate) return

    setDayEntries((prevEntries) => {
      if (index < 0 || index >= prevEntries.length) return prevEntries

      const entry = prevEntries[index]
      let defaults = defaultTimes.weekdays
      if (isSunday(entry.date)) {
        defaults = defaultTimes.sun
      } else if (isFriday(entry.date)) {
        defaults = defaultTimes.fri
      }

      const hasValidDrTimes =
        defaults.drEnabled &&
        defaults.drFrom !== null &&
        defaults.drTo !== null
      const hasValidSvTimes =
        defaults.svEnabled &&
        defaults.svFrom !== null &&
        defaults.svTo !== null

      // Recalculate hours
      const drFromMins = hasValidDrTimes ? timeAMPMToMinutes(defaults.drFrom) : null
      const drToMins = hasValidDrTimes ? timeAMPMToMinutes(defaults.drTo) : null
      const svFromMins = hasValidSvTimes ? timeAMPMToMinutes(defaults.svFrom) : null
      const svToMins = hasValidSvTimes ? timeAMPMToMinutes(defaults.svTo) : null

      const drDuration = (drFromMins !== null && drToMins !== null && drToMins >= drFromMins)
        ? drToMins - drFromMins
        : null
      const svDuration = (svFromMins !== null && svToMins !== null && svToMins >= svFromMins)
        ? svToMins - svFromMins
        : null

      const drHours = drDuration !== null ? drDuration / 60 : 0
      const svHours = svDuration !== null ? svDuration / 60 : 0

      const updated = [...prevEntries]
      updated[index] = {
        ...entry,
        drFrom: hasValidDrTimes ? defaults.drFrom : null,
        drTo: hasValidDrTimes ? defaults.drTo : null,
        drHours,
        drUse: hasValidDrTimes,
        svFrom: hasValidSvTimes ? defaults.svFrom : null,
        svTo: hasValidSvTimes ? defaults.svTo : null,
        svHours,
        svUse: hasValidSvTimes,
        touched: {
          drFrom: false, // Reset touched flags
          drTo: false,
          svFrom: false,
          svTo: false,
        },
      }

      calculateTotalHours(updated)
      return updated
    })
  }

  const updateDayEntry = (
    index: number,
    field: 'drFrom' | 'drTo' | 'svFrom' | 'svTo' | 'drUse' | 'svUse',
    value: TimeAMPM | null | boolean
  ) => {
    try {
      if (typeof index !== 'number' || index < 0 || index >= dayEntries.length) {
        console.error('[TIMESHEET] Invalid index in updateDayEntry:', index, dayEntries.length)
        return
      }
      if (!Array.isArray(dayEntries)) {
        console.error('[TIMESHEET] dayEntries is not an array in updateDayEntry')
        return
      }
      const updated = [...dayEntries]

    if (field === 'drUse' || field === 'svUse') {
      updated[index] = {
        ...updated[index],
        [field]: value as boolean,
      }
      
      setDayEntries(updated)
      calculateTotalHours(updated)
      setHasUnsavedChanges(true)
      return
    }

    if (typeof value !== 'object' && value !== null) return

    // Mark field as touched
    const touchedField = field as 'drFrom' | 'drTo' | 'svFrom' | 'svTo'
    updated[index] = {
      ...updated[index],
      [field]: value as TimeAMPM | null,
      touched: {
        ...updated[index].touched,
        [touchedField]: true,
      },
    }

    // Recalculate hours using new utility functions
    if (field === 'drFrom' || field === 'drTo') {
      const startTime = updated[index].drFrom
      const endTime = updated[index].drTo
      
      if (startTime && endTime) {
        const duration = calculateDurationMinutes(startTime, endTime)
        if (duration !== null) {
          updated[index].drHours = duration / 60
          // Validate
          const error = validateTimeRange(startTime, endTime)
          updated[index].errors.dr = error
        } else {
          updated[index].drHours = 0
          updated[index].errors.dr = 'Invalid time range'
        }
      } else {
        updated[index].drHours = 0
        updated[index].errors.dr = null
      }
    }

    if (field === 'svFrom' || field === 'svTo') {
      const startTime = updated[index].svFrom
      const endTime = updated[index].svTo
      
      if (startTime && endTime) {
        const duration = calculateDurationMinutes(startTime, endTime)
        if (duration !== null) {
          updated[index].svHours = duration / 60
          // Validate
          const error = validateTimeRange(startTime, endTime)
          updated[index].errors.sv = error
        } else {
          updated[index].svHours = 0
          updated[index].errors.sv = 'Invalid time range'
        }
      } else {
        updated[index].svHours = 0
        updated[index].errors.sv = null
      }
    }

      setDayEntries(updated)
      calculateTotalHours(updated)
      setHasUnsavedChanges(true)
      
      // Auto-save after 2 seconds of inactivity
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSaveDraft()
      }, 2000)
    } catch (error) {
      console.error('[TIMESHEET] Error updating day entry:', error, { index, field, value })
      toast.error('Failed to update entry. Please try again.')
    }
  }

  // Auto-save draft to localStorage
  const autoSaveDraft = async () => {
    if (timesheet) return // Don't auto-save existing timesheets
    
    try {
      const draft = {
        providerId,
        clientId,
        bcbaId,
        insuranceId: insuranceId || null,
        startDate: startDate ? formatDateOnly(startDate, timezone) : null,
        endDate: endDate ? formatDateOnly(endDate, timezone) : null,
        timezone,
        defaultTimes,
        dayEntries: dayEntries.map(entry => ({
          date: entry.date.toISOString(),
          drFrom: entry.drFrom,
          drTo: entry.drTo,
          drUse: entry.drUse,
          svFrom: entry.svFrom,
          svTo: entry.svTo,
          svUse: entry.svUse,
          touched: entry.touched,
        })),
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem('timesheet-draft', JSON.stringify(draft))
      setLastSavedAt(new Date())
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }

  // Load draft from localStorage on mount
  useEffect(() => {
    if (timesheet) return // Don't load draft for existing timesheets
    
    try {
      const draftStr = localStorage.getItem('timesheet-draft')
      if (draftStr) {
        const draft = JSON.parse(draftStr)
        // Only load if draft is recent (within 7 days)
        const savedAt = new Date(draft.savedAt)
        const daysSince = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < 7) {
          if (confirm('Found a saved draft. Would you like to restore it?')) {
            setProviderId(draft.providerId || '')
            setClientId(draft.clientId || '')
            setBcbaId(draft.bcbaId || '')
            setInsuranceId(draft.insuranceId || '')
            if (draft.startDate) setStartDate(new Date(draft.startDate))
            if (draft.endDate) setEndDate(new Date(draft.endDate))
            // Timezone is always America/New_York - ignore draft timezone
            if (draft.defaultTimes) setDefaultTimes(draft.defaultTimes)
            // Day entries will be regenerated when dates are set
          } else {
            localStorage.removeItem('timesheet-draft')
          }
        } else {
          localStorage.removeItem('timesheet-draft')
        }
      }
    } catch (error) {
      console.error('Failed to load draft:', error)
    }
  }, [timesheet])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Clear draft on successful save
  const clearDraft = () => {
    localStorage.removeItem('timesheet-draft')
    setHasUnsavedChanges(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!startDate || !endDate) {
      toast.error('Please select start and end dates')
      return
    }

    if (!providerId || !clientId || !bcbaId || !insuranceId) {
      toast.error('Please fill all assignment fields')
      return
    }

    if (dayEntries.length === 0) {
      toast.error('Please select dates')
      return
    }

    // Check for validation errors
    const hasErrors = dayEntries.some(entry => entry.errors.dr || entry.errors.sv)
    if (hasErrors) {
      toast.error('Please fix validation errors before submitting')
      return
    }

    // Check for overlap conflicts
    if (overlapConflicts.length > 0) {
      toast.error('Please fix overlap conflicts before submitting')
      return
    }

    // Check for invoiced entries (double billing prevention)
    const hasInvoicedEntries = dayEntries.some(
      entry => (entry.drUse && entry.drInvoiced) || (entry.svUse && entry.svInvoiced)
    )
    if (hasInvoicedEntries) {
      const confirmed = confirm(
        'Warning: Some entries are already invoiced. Editing them may cause double billing. Continue?'
      )
      if (!confirmed) return
    }

    const entries = dayEntries
      .filter((entry) => entry.drUse || entry.svUse)
      .flatMap((entry) => {
        const result = []
        if (entry.drUse) {
          // Guard against invalid times
          if (entry.drFrom === null || entry.drTo === null) {
            toast.error(
              `Invalid DR times for ${formatDateInTimezone(entry.date, 'MMM d', timezone)}: Please enter both start and end times`
            )
            return []
          }

          // Use new calculation function
          const duration = calculateDurationMinutes(entry.drFrom, entry.drTo)
          if (duration === null) {
            toast.error(
              `Invalid DR time range for ${formatDateInTimezone(entry.date, 'MMM d', timezone)}: ${entry.errors.dr || 'Invalid times'}`
            )
            return []
          }

          // Calculate units (1 unit = 15 minutes, no rounding)
          const units = duration / 15

          result.push({
            date: entry.date.toISOString(),
            startTime: timeAMPMTo24Hour(entry.drFrom),
            endTime: timeAMPMTo24Hour(entry.drTo),
            minutes: duration,
            units: units,
            notes: 'DR',
            invoiced: entry.drInvoiced,
          })
        }
        if (entry.svUse) {
          // Guard against invalid times
          if (entry.svFrom === null || entry.svTo === null) {
            toast.error(
              `Invalid SV times for ${formatDateInTimezone(entry.date, 'MMM d', timezone)}: Please enter both start and end times`
            )
            return []
          }

          // Use new calculation function
          const duration = calculateDurationMinutes(entry.svFrom, entry.svTo)
          if (duration === null) {
            toast.error(
              `Invalid SV time range for ${formatDateInTimezone(entry.date, 'MMM d', timezone)}: ${entry.errors.sv || 'Invalid times'}`
            )
            return []
          }

          // Calculate units (1 unit = 15 minutes, no rounding)
          const units = duration / 15

          result.push({
            date: entry.date.toISOString(),
            startTime: timeAMPMTo24Hour(entry.svFrom),
            endTime: timeAMPMTo24Hour(entry.svTo),
            minutes: duration,
            units: units,
            notes: 'SV',
            invoiced: entry.svInvoiced,
          })
        }
        return result
      })

    if (entries.length === 0) {
      toast.error('Please add at least one valid time entry')
      return
    }

    setLoading(true)

    try {
      const url = timesheet ? `/api/timesheets/${timesheet.id}` : '/api/timesheets'
      const method = timesheet ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          clientId,
          bcbaId,
          insuranceId: insuranceId, // Use selected insurance for regular timesheets
          startDate: formatDateOnly(startDate, timezone),
          endDate: formatDateOnly(endDate, timezone),
          timezone,
          entries,
        }),
      })

      if (res.ok) {
        clearDraft() // Clear auto-saved draft on success
        toast.success(`Timesheet ${timesheet ? 'updated' : 'created'} successfully`)
        router.push('/timesheets')
        router.refresh()
      } else {
        const data = await res.json()
        if (data?.code === 'OVERLAP_CONFLICT' && Array.isArray(data?.conflicts)) {
          const next = (data.conflicts as Array<any>)
            .map((c) => {
              try {
                if (!c || !c.date || !Array.isArray(dayEntries)) return null
                const idx = dayEntries.findIndex((d) => {
                  try {
                    if (!d || !d.date) return false
                    return format(d.date, 'yyyy-MM-dd') === c.date
                  } catch (error) {
                    console.error('[TIMESHEET] Error comparing dates in overlap conflict:', error)
                    return false
                  }
                })
                const type = c.entryType === 'SV' ? 'SV' : 'DR'
                return idx >= 0 && idx < dayEntries.length ? { index: idx, type, message: c.message || 'Overlap detected' } : null
              } catch (error) {
                console.error('[TIMESHEET] Error processing overlap conflict:', error, c)
                return null
              }
            })
            .filter(Boolean) as Array<{ index: number; type: 'DR' | 'SV'; message: string }>

          setOverlapConflicts(next)
          if (next.length > 0) {
            const rowElement = conflictRowRefs.current.get(next[0].index)
            if (rowElement) {
              setTimeout(() => rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
            }
          }
          toast.error('Overlap conflicts detected. Please fix highlighted rows.')
        } else {
          toast.error(data.error || `Failed to ${timesheet ? 'update' : 'create'} timesheet`)
        }
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Debug panel state (dev only)
  const [showDebug, setShowDebug] = useState(false)

  // Prepare debug data
  const debugData = {
    defaultTimes: {
      sun: {
        drFrom: defaultTimes.sun.drFrom,
        drTo: defaultTimes.sun.drTo,
        drEnabled: defaultTimes.sun.drEnabled,
        svFrom: defaultTimes.sun.svFrom,
        svTo: defaultTimes.sun.svTo,
        svEnabled: defaultTimes.sun.svEnabled,
      },
      weekdays: {
        drFrom: defaultTimes.weekdays.drFrom,
        drTo: defaultTimes.weekdays.drTo,
        drEnabled: defaultTimes.weekdays.drEnabled,
        svFrom: defaultTimes.weekdays.svFrom,
        svTo: defaultTimes.weekdays.svTo,
        svEnabled: defaultTimes.weekdays.svEnabled,
      },
      fri: {
        drFrom: defaultTimes.fri.drFrom,
        drTo: defaultTimes.fri.drTo,
        drEnabled: defaultTimes.fri.drEnabled,
        svFrom: defaultTimes.fri.svFrom,
        svTo: defaultTimes.fri.svTo,
        svEnabled: defaultTimes.fri.svEnabled,
      },
    },
    dayEntries: dayEntries.map((entry) => ({
      date: getDateInTimezone(entry.date, timezone),
      dayName: entry.dayName,
      drFrom: entry.drFrom,
      drTo: entry.drTo,
      drHours: entry.drHours,
      drUse: entry.drUse,
      svFrom: entry.svFrom,
      svTo: entry.svTo,
      svHours: entry.svHours,
      svUse: entry.svUse,
      touched: entry.touched,
    })),
    savePayload: (() => {
      const entries = dayEntries
        .filter((entry) => entry.drUse || entry.svUse)
        .flatMap((entry) => {
          const result = []
          if (entry.drUse && entry.drFrom !== null && entry.drTo !== null) {
            const startMins = timeAMPMToMinutes(entry.drFrom)
            const endMins = timeAMPMToMinutes(entry.drTo)
            if (startMins !== null && endMins !== null && endMins >= startMins) {
              result.push({
                date: formatDateOnly(entry.date, timezone),
                startTime: timeAMPMTo24Hour(entry.drFrom),
                endTime: timeAMPMTo24Hour(entry.drTo),
                minutes: endMins - startMins,
                notes: 'DR',
              })
            }
          }
          if (entry.svUse && entry.svFrom !== null && entry.svTo !== null) {
            const startMins = timeAMPMToMinutes(entry.svFrom)
            const endMins = timeAMPMToMinutes(entry.svTo)
            if (startMins !== null && endMins !== null && endMins >= startMins) {
              result.push({
                date: formatDateOnly(entry.date, timezone),
                startTime: timeAMPMTo24Hour(entry.svFrom),
                endTime: timeAMPMTo24Hour(entry.svTo),
                minutes: endMins - startMins,
                notes: 'SV',
              })
            }
          }
          return result
        })
      return entries
    })(),
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Debug Panel */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className="text-sm font-semibold text-yellow-800 hover:text-yellow-900"
          >
            {showDebug ? '▼' : '▶'} Debug Panel (Dev Only)
          </button>
          {showDebug && (
            <div className="mt-2 text-xs font-mono bg-white p-3 rounded border border-yellow-300 max-h-96 overflow-auto">
              <div className="mb-2">
                <strong>Default Times (minutes):</strong>
                <pre className="mt-1">{JSON.stringify(debugData.defaultTimes, null, 2)}</pre>
              </div>
              <div className="mb-2">
                <strong>Day Entries (first 3):</strong>
                <pre className="mt-1">{JSON.stringify(debugData.dayEntries.slice(0, 3), null, 2)}</pre>
              </div>
              <div className="mb-2">
                <strong>Save Payload (first 3):</strong>
                <pre className="mt-1">{JSON.stringify(debugData.savePayload.slice(0, 3), null, 2)}</pre>
              </div>
              <div>
                <strong>Total Hours:</strong> {totalHours.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mb-6">
        <Link
          href="/timesheets"
          className="inline-flex items-center text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Timesheets
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {timesheet ? 'Edit Timesheet' : 'Create Timesheet'}
        </h1>
        {timesheet && timesheet.status !== 'DRAFT' && (
          <p className="mt-2 text-sm text-yellow-600">
            Note: Only draft timesheets can be edited. This timesheet status is: {timesheet.status}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dates Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <DatePicker
                selected={startDate}
                onChange={(date) => {
                  try {
                    if (date && !isNaN(new Date(date).getTime())) {
                      // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                      const dateStr = formatDateOnly(date, timezone)
                      if (isSaturdayInTimezone(dateStr, timezone)) {
                        toast.error('Timesheets cannot be created on Saturdays')
                        return
                      }
                      setStartDate(date)
                    } else if (date === null) {
                        setStartDate(null)
                    }
                  } catch (error) {
                    console.error('[TIMESHEET] Error setting start date:', error)
                    toast.error('Invalid date selected')
                  }
                }}
                filterDate={(date) => {
                  // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                  const dateStr = formatDateOnly(date, timezone)
                  return !isSaturdayInTimezone(dateStr, timezone)
                }}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholderText="mm/dd/yyyy"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <DatePicker
                selected={endDate}
                onChange={(date) => {
                  try {
                    if (date && !isNaN(new Date(date).getTime())) {
                      // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                      const dateStr = formatDateOnly(date, timezone)
                      if (isSaturdayInTimezone(dateStr, timezone)) {
                        toast.error('Timesheets cannot be created on Saturdays')
                        return
                      }
                      setEndDate(date)
                    } else if (date === null) {
                      setEndDate(null)
                    }
                  } catch (error) {
                    console.error('[TIMESHEET] Error setting end date:', error)
                    toast.error('Invalid date selected')
                  }
                }}
                filterDate={(date) => {
                  // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                  const dateStr = formatDateOnly(date, timezone)
                  return !isSaturdayInTimezone(dateStr, timezone)
                }}
                dateFormat="MM/dd/yyyy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholderText="mm/dd/yyyy"
                required
              />
            </div>
          </div>
          <div className="mt-4">
            {/* Timezone is always America/New_York - hidden from UI */}
            <input type="hidden" value={timezone} />
          </div>
        </div>


        {/* Auto-save Status */}
        {!timesheet && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center">
              <div className={`h-2 w-2 rounded-full mr-2 ${hasUnsavedChanges ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
              <span className="text-sm text-gray-700">
                {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
              </span>
            </div>
            {lastSavedAt && (
              <span className="text-xs text-gray-500">
                Last saved: {format(lastSavedAt, 'h:mm a')}
              </span>
            )}
          </div>
        )}

        {/* Default Times Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Default Times</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Day
                  </th>
                  <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase border-l border-r">
                    DR
                  </th>
                  <th colSpan={3} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                    SV
                  </th>
                </tr>
                <tr>
                  <th></th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 border-l">From</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500">To</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 border-r">USE</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500">From</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500">To</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500">USE</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(['sun', 'weekdays', 'fri'] as const).map((dayType) => {
                  const defaults = defaultTimes[dayType]
                  return (
                    <tr key={dayType}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                        {dayType === 'sun' ? 'Sun' : dayType === 'fri' ? 'Fri' : 'Weekdays'}
                      </td>
                      <td className="px-4 py-2 border-l">
                        <TimeFieldAMPM
                          value={defaults.drFrom}
                          onChange={(time) => updateDefaultTimes(dayType, 'drFrom', time)}
                          placeholder="--:--"
                          className="justify-center"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TimeFieldAMPM
                          value={defaults.drTo}
                          onChange={(time) => updateDefaultTimes(dayType, 'drTo', time)}
                          placeholder="--:--"
                          className="justify-center"
                        />
                      </td>
                      <td className="px-4 py-2 border-r">
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={defaults.drEnabled}
                            onChange={(e) =>
                              updateDefaultTimes(dayType, 'drEnabled', e.target.checked)
                            }
                            className="rounded border-gray-300 text-primary-600"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <TimeFieldAMPM
                          value={defaults.svFrom}
                          onChange={(time) => updateDefaultTimes(dayType, 'svFrom', time)}
                          placeholder="--:--"
                          className="justify-center"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <TimeFieldAMPM
                          value={defaults.svTo}
                          onChange={(time) => updateDefaultTimes(dayType, 'svTo', time)}
                          placeholder="--:--"
                          className="justify-center"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={defaults.svEnabled}
                            onChange={(e) =>
                              updateDefaultTimes(dayType, 'svEnabled', e.target.checked)
                            }
                            className="rounded border-gray-300 text-primary-600"
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assignment Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Assignment</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Provider <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select provider</option>
                {Array.isArray(providers) && providers.map((provider) => {
                  if (!provider || !provider.id) return null
                  return (
                    <option key={provider.id} value={provider.id}>
                      {provider.name || 'Unnamed Provider'}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select client</option>
                {Array.isArray(clients) && clients.map((client) => {
                  if (!client || !client.id) return null
                  return (
                    <option key={client.id} value={client.id}>
                      {client.name || 'Unnamed Client'}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                BCBA <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={bcbaId}
                onChange={(e) => setBcbaId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select BCBA</option>
                {Array.isArray(bcbas) && bcbas.map((bcba) => {
                  if (!bcba || !bcba.id) return null
                  return (
                    <option key={bcba.id} value={bcba.id}>
                      {bcba.name || 'Unnamed BCBA'}
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Insurance <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={insuranceId}
                onChange={(e) => setInsuranceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select insurance</option>
                {Array.isArray(insurances) && insurances.map((insurance) => {
                  if (!insurance || !insurance.id) return null
                  return (
                    <option key={insurance.id} value={insurance.id}>
                      {insurance.name || 'Unnamed Insurance'}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Days Table */}
        {dayEntries.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            {/* Regression test: Assert no Saturdays in rendered entries */}
            {(() => {
              const saturdayEntries = dayEntries.filter(entry => entry.date.getDay() === 6)
              if (saturdayEntries.length > 0) {
                console.error('[TIMESHEET] CRITICAL: Saturday entries detected in render!', saturdayEntries)
                return (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    <strong>ERROR:</strong> Saturday entries found in timesheet data. This should never happen.
                  </div>
                )
              }
              return null
            })()}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Days for {startDate && format(startDate, 'MMM d')} - {endDate && format(endDate, 'MMM d')}
              </h2>
              <div className="flex items-center gap-4">
                {!timesheet && (
                  <button
                    type="button"
                    onClick={applyDefaultsToDates}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 active:bg-primary-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply Default Times to Dates
                  </button>
                )}
                <div className="text-lg font-bold text-primary-600">
                  TOTAL: {totalHours.toFixed(2)} HRS
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">DATE</th>
                    <th colSpan={4} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase border-l border-r">DR</th>
                    <th colSpan={4} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">SV</th>
                    {!timesheet && (
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">ACTIONS</th>
                    )}
                  </tr>
                  <tr>
                    <th></th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500 border-l">FROM</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500">TO</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500">HOURS</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500 border-r">USE</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500">FROM</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500">TO</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500">HOURS</th>
                    <th className="px-2 py-1 text-xs font-medium text-gray-500">USE</th>
                    {!timesheet && <th></th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dayEntries.map((entry, index) => {
                    const drConflict = overlapConflicts.find(c => c.index === index && c.type === 'DR')
                    const svConflict = overlapConflicts.find(c => c.index === index && c.type === 'SV')
                    const hasConflict = drConflict || svConflict
                    
                    return (
                    <tr 
                      key={index} 
                      ref={(el) => {
                        if (el && hasConflict) {
                          conflictRowRefs.current.set(index, el)
                        } else {
                          conflictRowRefs.current.delete(index)
                        }
                      }}
                      className={hasConflict ? 'bg-red-50' : ''}
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                        {formatDateInTimezone(entry.date, 'EEE M/d/yyyy', timezone)}
                      </td>
                      <td className={`px-2 py-2 border-l ${drConflict ? 'bg-red-100' : ''}`}>
                        <TimeFieldAMPM
                          value={entry.drFrom}
                          onChange={(time) => updateDayEntry(index, 'drFrom', time)}
                          placeholder="--:--"
                          className={`justify-center ${drConflict ? 'border-red-500' : ''}`}
                          disabled={timesheet?.status === 'LOCKED'}
                        />
                      </td>
                      <td className={`px-2 py-2 ${drConflict ? 'bg-red-100' : ''}`}>
                        <TimeFieldAMPM
                          value={entry.drTo}
                          onChange={(time) => updateDayEntry(index, 'drTo', time)}
                          placeholder="--:--"
                          className={`justify-center ${drConflict ? 'border-red-500' : ''}`}
                          disabled={timesheet?.status === 'LOCKED'}
                        />
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-700">
                        {entry.drHours > 0 ? formatHours(entry.drHours) : '-'}
                      </td>
                      <td className="px-2 py-2 border-r">
                        <div className="flex flex-col items-center">
                          <input
                            type="checkbox"
                            checked={entry.drUse}
                            onChange={(e) => updateDayEntry(index, 'drUse', e.target.checked)}
                            disabled={timesheet?.status === 'LOCKED'}
                            className="rounded border-gray-300 text-primary-600"
                          />
                          {entry.drInvoiced && (
                            <span className="text-xs text-red-600 mt-1" title="Already invoiced">⚠</span>
                          )}
                        </div>
                        {entry.errors.dr && (
                          <div className="text-xs text-red-600 mt-1">{entry.errors.dr}</div>
                        )}
                                        {drConflict && (
                          <div className="text-xs text-red-600 mt-1 font-semibold" title={drConflict.message}>
                            Overlap!
                          </div>
                        )}
                      </td>
                      <td className={`px-2 py-2 ${svConflict ? 'bg-red-100' : ''}`}>
                        <TimeFieldAMPM
                          value={entry.svFrom}
                          onChange={(time) => updateDayEntry(index, 'svFrom', time)}
                          placeholder="--:--"
                          className={`justify-center ${svConflict ? 'border-red-500' : ''}`}
                          disabled={timesheet?.status === 'LOCKED'}
                        />
                      </td>
                      <td className={`px-2 py-2 ${svConflict ? 'bg-red-100' : ''}`}>
                        <TimeFieldAMPM
                          value={entry.svTo}
                          onChange={(time) => updateDayEntry(index, 'svTo', time)}
                          placeholder="--:--"
                          className={`justify-center ${svConflict ? 'border-red-500' : ''}`}
                          disabled={timesheet?.status === 'LOCKED'}
                        />
                      </td>
                      <td className="px-2 py-2 text-sm text-gray-700">
                        {entry.svHours > 0 ? formatHours(entry.svHours) : '-'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col items-center">
                          <input
                            type="checkbox"
                            checked={entry.svUse}
                            onChange={(e) => updateDayEntry(index, 'svUse', e.target.checked)}
                            disabled={timesheet?.status === 'LOCKED'}
                            className="rounded border-gray-300 text-primary-600"
                          />
                          {entry.svInvoiced && (
                            <span className="text-xs text-red-600 mt-1" title="Already invoiced">⚠</span>
                          )}
                        </div>
                        {entry.errors.sv && (
                          <div className="text-xs text-red-600 mt-1">{entry.errors.sv}</div>
                        )}
                        {svConflict && (
                          <div className="text-xs text-red-600 mt-1 font-semibold" title={svConflict.message}>
                            Overlap!
                          </div>
                        )}
                      </td>
                      {!timesheet && (
                        <td className="px-2 py-2 text-center">
                          {(entry.touched.drFrom || entry.touched.drTo || entry.touched.svFrom || entry.touched.svTo) && (
                            <button
                              type="button"
                              onClick={() => resetRowToDefault(index)}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              title="Reset this row to default times"
                            >
                              Reset
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {dayEntries.length === 0 && startDate && endDate && (
          <div className="bg-white shadow rounded-lg p-12 text-center text-gray-500">
            Select a start and end date to generate days.
          </div>
        )}

        {/* Overlap Conflict Messages */}
        {overlapConflicts.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-red-800 mb-2 flex items-center">
              <span className="mr-2">⚠️</span>
              Overlap Conflicts Detected
            </h3>
            <p className="text-sm text-red-700 mb-3">
              Please fix the following conflicts before saving:
            </p>
            <ul className="list-disc list-inside space-y-2">
              {overlapConflicts.map((conflict, idx) => {
                if (!conflict || typeof conflict.index !== 'number' || conflict.index < 0 || conflict.index >= dayEntries.length) {
                  console.error('[TIMESHEET] Invalid conflict index:', conflict)
                  return null
                }
                const entry = dayEntries[conflict.index]
                if (!entry || !entry.date) return null
                try {
                  return (
                    <li key={idx} className="text-sm text-red-700">
                      <strong>{formatDateInTimezone(entry.date, 'MM/dd/yyyy', timezone)}</strong> - {conflict.type}: {conflict.message}
                      {conflict.isExternal && (
                        <span className="ml-2 text-xs bg-red-200 px-2 py-0.5 rounded">
                          (Existing Timesheet)
                        </span>
                      )}
                    </li>
                  )
                } catch (error) {
                  console.error('[TIMESHEET] Error formatting conflict date:', error, entry)
                  return (
                    <li key={idx} className="text-sm text-red-700">
                      <strong>Invalid Date</strong> - {conflict.type}: {conflict.message}
                    </li>
                  )
                }
              })}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <Link
            href="/timesheets"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || dayEntries.length === 0 || overlapConflicts.length > 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (timesheet ? 'Updating...' : 'Creating...') : (timesheet ? 'Update Timesheet' : 'Create Timesheet')}
          </button>
        </div>
      </form>
    </div>
  )
}
