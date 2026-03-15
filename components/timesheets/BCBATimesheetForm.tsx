'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  getDaysInRange,
  getDayName,
  isSunday,
  isFriday,
  isSaturday,
  formatDateOnly,
  getDateInTimezone,
  getDateObjectInTimezone,
  formatDateInTimezone,
  parseDateOnly,
  isSaturdayInTimezone,
} from '@/lib/dateUtils'
import {
  parseTimeToMinutes,
  INVALID_TIME,
} from '@/lib/timeUtils'
import { TimeFieldAMPM, TimeAMPM, timeAMPMToMinutes, minutesToTimeAMPM, timeAMPMTo24Hour } from '@/components/timesheets/TimeFieldAMPM'
import { format } from 'date-fns'
import {
  calculateDurationMinutes,
  validateTimeRange,
  formatHours,
} from '@/lib/timesheetUtils'

interface Provider {
  id: string
  name: string
  phone?: string | null
  dlb?: string | null
  signature?: string | null
}

interface Client {
  id: string
  name: string
  phone?: string | null
  address?: string | null
  idNumber?: string | null
  dlb?: string | null
  signature?: string | null
}

interface BCBA {
  id: string
  name: string
}

interface Insurance {
  id: string
  name: string
}

// BCBA timesheets now use regular Insurance (with BCBA-specific rates)

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
  insuranceId?: string | null // BCBA timesheets use regular Insurance
  serviceType?: string | null
  sessionData?: string | null
  startDate: string
  endDate: string
  status: string
  timezone?: string
  entries: TimesheetEntry[]
}

interface BCBATimesheetFormProps {
  providers: Provider[]
  clients: Client[]
  bcbas: BCBA[]
  insurances?: Insurance[] // Optional, not used for BCBA timesheets
  // BCBA timesheets use regular Insurance (insurances prop)
  timesheet?: Timesheet
}

// Simplified DayEntry for BCBA - single time entry (no DR/SV)
interface DayEntry {
  date: Date
  dayName: string
  from: TimeAMPM | null
  to: TimeAMPM | null
  hours: number
  use: boolean
  invoiced: boolean
  serviceType?: string | null // Per-row service type
  touched: {
    from: boolean
    to: boolean
  }
  errors: {
    time: string | null
  }
  overlapConflict?: {
    message: string
  }
}

interface DefaultTimes {
  sun: {
    from: TimeAMPM | null
    to: TimeAMPM | null
    enabled: boolean
  }
  weekdays: {
    from: TimeAMPM | null
    to: TimeAMPM | null
    enabled: boolean
  }
  fri: {
    from: TimeAMPM | null
    to: TimeAMPM | null
    enabled: boolean
  }
}

export function BCBATimesheetForm({
  providers,
  clients,
  bcbas,
  insurances = [], // BCBA timesheets now use regular Insurance
  timesheet,
}: BCBATimesheetFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // BCBA timesheets use regular Insurance (insuranceId) - selectable by user
  const [insuranceId, setInsuranceId] = useState(timesheet?.insuranceId || '')
  const [startDate, setStartDate] = useState<Date | null>(() => {
    try {
      if (timesheet?.startDate) {
        // CRITICAL: Always interpret timesheet dates in NY timezone, not user's local timezone
        const dateStr = getDateInTimezone(timesheet.startDate, 'America/New_York')
        const date = parseDateOnly(dateStr, 'America/New_York')
        if (!isNaN(date.getTime())) {
          return date
        }
        console.error('[BCBA TIMESHEET] Invalid startDate in timesheet:', timesheet.startDate)
      }
      return null
    } catch (error) {
      console.error('[BCBA TIMESHEET] Error parsing startDate:', error)
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
        console.error('[BCBA TIMESHEET] Invalid endDate in timesheet:', timesheet.endDate)
      }
      return null
    } catch (error) {
      console.error('[BCBA TIMESHEET] Error parsing endDate:', error)
      return null
    }
  })
  const [clientId, setClientId] = useState(timesheet?.clientId || '')
  const [bcbaId, setBcbaId] = useState(timesheet?.bcbaId || '')
  const [serviceType, setServiceType] = useState(timesheet?.serviceType || '')
  const [sessionData, setSessionData] = useState(timesheet?.sessionData || '')
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([])
  const [totalHours, setTotalHours] = useState(0)
  // Always use America/New_York timezone for all timesheets regardless of user location
  const [timezone, setTimezone] = useState<string>('America/New_York')
  
  // Bulk selection state
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [bulkServiceType, setBulkServiceType] = useState('')
  
  // Get DLB from client
  const selectedClient = clients.find(c => c.id === clientId)
  const dlb = selectedClient?.dlb || ''

  useEffect(() => {
    if (!clientId || insuranceId) return
    const clientInsuranceId = (selectedClient as any)?.insuranceId || (selectedClient as any)?.insurance?.id
    if (clientInsuranceId) {
      setInsuranceId(clientInsuranceId)
    }
  }, [clientId, insuranceId, selectedClient])

  const [defaultTimes, setDefaultTimes] = useState<DefaultTimes>({
    sun: {
      from: null,
      to: null,
      enabled: false,
    },
    weekdays: {
      from: null,
      to: null,
      enabled: false,
    },
    fri: {
      from: null,
      to: null,
      enabled: false,
    },
  })

  const hasInitializedRef = useRef(false)

  // Load timesheet data when in edit mode
  useEffect(() => {
    if (timesheet && startDate && endDate && !hasInitializedRef.current) {
      try {
        // Validate dates before processing
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.error('[BCBA TIMESHEET] Invalid dates in edit mode:', { startDate, endDate })
          toast.error('Invalid date range. Please refresh the page.')
          return
        }

        // Validate timesheet entries exist
        if (!timesheet.entries || !Array.isArray(timesheet.entries)) {
          console.error('[BCBA TIMESHEET] Invalid timesheet entries:', timesheet.entries)
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
              console.error('[BCBA TIMESHEET] Saturday entry found in existing timesheet - removing:', entry)
              return false
            }
            return true
          } catch (error) {
            console.error('[BCBA TIMESHEET] Error checking entry date:', error, entry)
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
          console.error('[BCBA TIMESHEET] Error getting days in range:', error)
          toast.error('Error processing date range. Please refresh the page.')
          hasInitializedRef.current = false
          return
        }

        // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
        const daysWithoutSaturday = days.filter((date) => {
          try {
            if (!date || isNaN(date.getTime())) return false
            const dateStr = formatDateOnly(date, timezone)
            if (isSaturdayInTimezone(dateStr, timezone)) {
              return false
            }
            return true
          } catch (error) {
            console.error('[BCBA TIMESHEET] Error filtering date:', error, date)
            return false
          }
        })

        const entries = daysWithoutSaturday
          .map((date) => {
            try {
              // Validate date
              if (!date || isNaN(date.getTime())) {
                console.error('[BCBA TIMESHEET] Invalid date in entry generation:', date)
                return null
              }

              let dateStr: string
              try {
                dateStr = format(date, 'yyyy-MM-dd')
              } catch (error) {
                console.error('[BCBA TIMESHEET] Error formatting date:', error, date)
                return null as any
              }

              const dayEntries = timesheetWithoutSaturdays.entries.filter((entry) => {
                try {
                  if (!entry || !entry.date) return false
                  // CRITICAL: Always interpret entry dates in NY timezone, not user's local timezone
                  const entryDate = getDateInTimezone(entry.date, timezone)
                  // Check if it's Saturday in NY timezone
                  const entryDateObj = getDateObjectInTimezone(entry.date, timezone)
                  if (isSaturday(entryDateObj)) {
                    console.error('[BCBA TIMESHEET] Saturday entry found in existing timesheet - filtering out:', entry)
                    return false
                  }
                  return entryDate === dateStr
                } catch (error) {
                  console.error('[BCBA TIMESHEET] Error parsing entry date:', error, entry)
                  return false
                }
              })

              // BCBA timesheets have single entry (no DR/SV distinction)
              const entry = dayEntries[0]

              let fromMinutes: number | null = null
              let toMinutes: number | null = null

              try {
                fromMinutes = entry?.startTime ? parseTimeToMinutes(entry.startTime) : null
                toMinutes = entry?.endTime ? parseTimeToMinutes(entry.endTime) : null
              } catch (error) {
                console.error('[BCBA TIMESHEET] Error parsing times:', error, entry)
              }

              let from: TimeAMPM | null = null
              let to: TimeAMPM | null = null

              try {
                from = fromMinutes !== null && fromMinutes !== INVALID_TIME
                  ? minutesToTimeAMPM(fromMinutes)
                  : null
                to = toMinutes !== null && toMinutes !== INVALID_TIME
                  ? minutesToTimeAMPM(toMinutes)
                  : null
              } catch (error) {
                console.error('[BCBA TIMESHEET] Error converting to TimeAMPM:', error)
              }

              let duration: number | null = null
              try {
                duration = calculateDurationMinutes(from, to)
              } catch (error) {
                console.error('[BCBA TIMESHEET] Error calculating duration:', error)
              }

              const hours = duration !== null && !isNaN(duration) ? duration / 60 : 0

              // Get day name safely
              let dayName: string = 'Unknown'
              try {
                dayName = getDayName(date)
              } catch (error) {
                console.error('[BCBA TIMESHEET] Error getting day name:', error, date)
                try {
                  dayName = format(date, 'EEE') // Fallback to short name
                } catch {
                  dayName = 'Unknown'
                }
              }

              // For BCBA timesheets, service type can be stored in entry.notes
              // Check if notes contains a service type, otherwise use timesheet-level serviceType
              let entryServiceType: string | null = null
              if (entry?.notes) {
                const serviceTypes = ['Assessment', 'Direct Care', 'Supervision', 'Treatment Planning', 'Parent Training']
                if (serviceTypes.includes(entry.notes)) {
                  entryServiceType = entry.notes
                }
              }
              // Fallback to timesheet-level serviceType if entry doesn't have one
              if (!entryServiceType && timesheet?.serviceType) {
                entryServiceType = timesheet.serviceType
              }

              return {
                date,
                dayName,
                from,
                to,
                hours: isNaN(hours) ? 0 : hours,
                use: !!entry,
                invoiced: entry?.invoiced || false,
                serviceType: entryServiceType,
                touched: {
                  from: true,
                  to: true,
                },
                errors: {
                  time: null,
                },
              }
            } catch (error) {
              console.error('[BCBA TIMESHEET] Error processing entry in edit mode:', error, date)
              return null // Return null instead of crashing
            }
          })
          .filter((entry): entry is DayEntry => {
            return entry !== null && entry !== undefined
          }) // Filter out nulls

        setDayEntries(entries)
        calculateTotalHours(entries)
      } catch (error) {
        console.error('[BCBA TIMESHEET] Error loading timesheet data in edit mode:', error)
        toast.error('Failed to load timesheet data. Please refresh the page.')
        hasInitializedRef.current = false // Allow retry
      }
    }
  }, [timesheet, startDate, endDate])

  // Generate days when date range changes (for new timesheets only)
  useEffect(() => {
    // Only run if both dates are set and we're creating a new timesheet
    if (!startDate || !endDate || timesheet) {
      return
    }

    // Validate dates before processing
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('[BCBA TIMESHEET] Invalid dates in new timesheet:', { startDate, endDate })
      return
    }

    // Ensure end date is after start date
    if (endDate < startDate) {
      console.warn('[BCBA TIMESHEET] End date is before start date, skipping generation')
      return
    }

    try {
      let days: Date[] = []
      try {
        days = getDaysInRange(startDate, endDate)
      } catch (error) {
        console.error('[BCBA TIMESHEET] Error getting days in range:', error)
        return
      }

      if (!Array.isArray(days) || days.length === 0) {
        console.warn('[BCBA TIMESHEET] No days in range')
        setDayEntries([])
        setTotalHours(0)
        return
      }

      // CRITICAL: Check Saturdays in NY timezone, not user's local timezone
      const daysWithoutSaturday = days.filter((date) => {
        try {
          if (!date || isNaN(date.getTime())) return false
          const dateStr = formatDateOnly(date, timezone)
          if (isSaturdayInTimezone(dateStr, timezone)) {
            return false
          }
          return true
        } catch (error) {
          console.error('[BCBA TIMESHEET] Error filtering date:', error, date)
          return false
        }
      })

      const entries = daysWithoutSaturday
        .map((date) => {
          try {
            // Validate date
            if (!date || isNaN(date.getTime())) {
              console.error('[BCBA TIMESHEET] Invalid date in entry generation:', date)
              return null
            }

            let defaults = defaultTimes.weekdays
            try {
              if (isSunday(date)) {
                defaults = defaultTimes.sun
              } else if (isFriday(date)) {
                defaults = defaultTimes.fri
              }
            } catch (error) {
              console.error('[BCBA TIMESHEET] Error determining day type:', error, date)
            }

            const hasValidTimes =
              defaults.enabled &&
              defaults.from !== null &&
              defaults.to !== null

            let duration: number | null = null
            try {
              duration = hasValidTimes
                ? calculateDurationMinutes(defaults.from, defaults.to)
                : null
            } catch (error) {
              console.error('[BCBA TIMESHEET] Error calculating duration:', error)
            }

            const hours = duration !== null && !isNaN(duration) ? duration / 60 : 0

            // Get day name safely
            let dayName: string = 'Unknown'
            try {
              dayName = getDayName(date)
            } catch (error) {
              console.error('[BCBA TIMESHEET] Error getting day name:', error, date)
              try {
                dayName = format(date, 'EEE') // Fallback to short name
              } catch {
                dayName = 'Unknown'
              }
            }

            return {
              date,
              dayName,
              from: hasValidTimes ? defaults.from : null,
              to: hasValidTimes ? defaults.to : null,
              hours: isNaN(hours) ? 0 : hours,
              use: hasValidTimes,
              invoiced: false,
              serviceType: null as string | null,
              touched: {
                from: false,
                to: false,
              },
              errors: {
                time: null,
              },
            } as DayEntry
          } catch (error) {
            console.error('[BCBA TIMESHEET] Error processing entry in new timesheet:', error, date)
            return null // Return null instead of crashing
          }
          })
        .filter((entry): entry is DayEntry => {
          if (entry === null || entry === undefined) return false
          if (typeof entry !== 'object') return false
          return 'date' in entry && 'dayName' in entry
        }) // Filter out nulls

        setDayEntries(entries)
        calculateTotalHours(entries)
    } catch (error) {
      console.error('[BCBA TIMESHEET] Error generating days for new timesheet:', error)
      toast.error('Error generating date entries. Please try again.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, timesheet])

  // Auto-update day entries when defaults change
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

        const hasValidTimes =
          defaults.enabled &&
          defaults.from !== null &&
          defaults.to !== null

        const newFrom = entry.touched.from ? entry.from : (hasValidTimes ? defaults.from : null)
        const newTo = entry.touched.to ? entry.to : (hasValidTimes ? defaults.to : null)

        const duration = calculateDurationMinutes(newFrom, newTo)
        const hours = duration !== null ? duration / 60 : 0

        return {
          ...entry,
          from: newFrom,
          to: newTo,
          hours,
          use: hasValidTimes && !entry.touched.from && !entry.touched.to ? true : entry.use,
        }
      })

      calculateTotalHours(updated)
      return updated
    })
  }, [defaultTimes, startDate, endDate, timesheet])

  // Overlap checking removed for BCBA timesheets - they allow overlaps

  // Bulk selection handlers
  const handleRowSelect = (index: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIndices = new Set(dayEntries.map((_, index) => index))
      setSelectedRows(allIndices)
    } else {
      setSelectedRows(new Set())
    }
  }

  const handleBulkApply = () => {
    if (selectedRows.size === 0) {
      toast.error('Please select at least one row')
      return
    }

    if (!bulkServiceType) {
      toast.error('Please select a service type to apply')
      return
    }

    // Apply service type to selected rows only
    setDayEntries((prevEntries) => {
      const updated = [...prevEntries]
      selectedRows.forEach((index) => {
        if (index >= 0 && index < updated.length) {
          updated[index] = {
            ...updated[index],
            serviceType: bulkServiceType,
          }
        }
      })
      return updated
    })

    toast.success(`Applied "${bulkServiceType}" to ${selectedRows.size} selected row(s)`)
    
    // Clear selection after applying
    setSelectedRows(new Set())
    setBulkServiceType('')
  }

  const handleClearSelection = () => {
    setSelectedRows(new Set())
    setBulkServiceType('')
  }

  const allRowsSelected = dayEntries.length > 0 && selectedRows.size === dayEntries.length
  const someRowsSelected = selectedRows.size > 0 && selectedRows.size < dayEntries.length

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

  const calculateTotalHours = (entries: DayEntry[]) => {
    try {
      if (!Array.isArray(entries)) {
        console.error('[BCBA TIMESHEET] calculateTotalHours: entries is not an array', entries)
        setTotalHours(0)
        return
      }
      const total = entries.reduce((sum, entry) => {
        if (!entry) return sum
        const hours = entry.use && typeof entry.hours === 'number' && entry.hours > 0 ? entry.hours : 0
        if (isNaN(hours)) {
          console.error('[BCBA TIMESHEET] Invalid hours in entry:', entry)
          return sum
        }
        return sum + hours
      }, 0)
      setTotalHours(isNaN(total) ? 0 : total)
    } catch (error) {
      console.error('[BCBA TIMESHEET] Error calculating total hours:', error)
      setTotalHours(0)
    }
  }

  const updateDefaultTimes = (
    dayType: 'sun' | 'weekdays' | 'fri',
    field: 'from' | 'to' | 'enabled',
    value: TimeAMPM | null | boolean
  ) => {
    if (field === 'enabled') {
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

  const applyDefaultsToDates = () => {
    if (timesheet) return
    if (!startDate || !endDate) return

    setDayEntries((prevEntries) => {
      if (prevEntries.length === 0) return prevEntries

      const updated = prevEntries.map((entry) => {
        let defaults = defaultTimes.weekdays
        if (isSunday(entry.date)) {
          defaults = defaultTimes.sun
        } else if (isFriday(entry.date)) {
          defaults = defaultTimes.fri
        }

        const hasValidTimes =
          defaults.enabled &&
          defaults.from !== null &&
          defaults.to !== null

        const newFrom = entry.touched.from ? entry.from : (hasValidTimes ? defaults.from : null)
        const newTo = entry.touched.to ? entry.to : (hasValidTimes ? defaults.to : null)

        const duration = calculateDurationMinutes(newFrom, newTo)
        const hours = duration !== null ? duration / 60 : 0

        return {
          ...entry,
          from: newFrom,
          to: newTo,
          hours,
          use: hasValidTimes && !entry.touched.from && !entry.touched.to ? true : entry.use,
        }
      })

      calculateTotalHours(updated)
      return updated
    })
  }

  const resetRowToDefault = (index: number) => {
    if (timesheet) return
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

      const hasValidTimes =
        defaults.enabled &&
        defaults.from !== null &&
        defaults.to !== null

      const duration = hasValidTimes ? calculateDurationMinutes(defaults.from, defaults.to) : null
      const hours = duration !== null ? duration / 60 : 0

      const updated = [...prevEntries]
      updated[index] = {
        ...entry,
        from: hasValidTimes ? defaults.from : null,
        to: hasValidTimes ? defaults.to : null,
        hours,
        use: hasValidTimes,
        touched: {
          from: false,
          to: false,
        },
      }

      calculateTotalHours(updated)
      return updated
    })
  }

  const updateDayEntry = (
    index: number,
    field: 'from' | 'to' | 'use',
    value: TimeAMPM | null | boolean
  ) => {
    try {
      if (typeof index !== 'number' || index < 0 || index >= dayEntries.length) {
        console.error('[BCBA TIMESHEET] Invalid index in updateDayEntry:', index, dayEntries.length)
        return
      }
      if (!Array.isArray(dayEntries)) {
        console.error('[BCBA TIMESHEET] dayEntries is not an array in updateDayEntry')
        return
      }
      const updated = [...dayEntries]

    if (field === 'use') {
      updated[index] = {
        ...updated[index],
        use: value as boolean,
      }
      setDayEntries(updated)
      calculateTotalHours(updated)
      return
    }

    if (typeof value !== 'object' && value !== null) return

    const touchedField = field as 'from' | 'to'
    updated[index] = {
      ...updated[index],
      [field]: value as TimeAMPM | null,
      touched: {
        ...updated[index].touched,
        [touchedField]: true,
      },
    }

    // Recalculate hours
    if (field === 'from' || field === 'to') {
      const startTime = updated[index].from
      const endTime = updated[index].to

      if (startTime && endTime) {
        const duration = calculateDurationMinutes(startTime, endTime)
        if (duration !== null) {
          updated[index].hours = duration / 60
          const error = validateTimeRange(startTime, endTime)
          updated[index].errors.time = error
        } else {
          updated[index].hours = 0
          updated[index].errors.time = 'Invalid time range'
        }
      } else {
        updated[index].hours = 0
        updated[index].errors.time = null
      }
    }

      setDayEntries(updated)
      calculateTotalHours(updated)
    } catch (error) {
      console.error('[BCBA TIMESHEET] Error updating day entry:', error, { index, field, value })
      toast.error('Failed to update entry. Please try again.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!startDate || !endDate) {
      toast.error('Please select start and end dates')
      return
    }

    if (!clientId || !bcbaId) {
      toast.error('Please fill all required fields')
      return
    }

  if (!insuranceId) {
    toast.error('Please select an insurance')
    return
  }

    // Check if at least one entry has a service type
    const entriesWithServiceType = dayEntries.filter(e => e.use && e.serviceType)
    if (entriesWithServiceType.length === 0) {
      toast.error('Please assign a Service Type to at least one entry')
      return
    }

    if (!sessionData) {
      toast.error('Please select Session Data / Analysis')
      return
    }

    if (dayEntries.length === 0) {
      toast.error('Please select dates')
      return
    }

    // Check for validation errors
    const hasErrors = dayEntries.some(entry => entry.errors.time)
    if (hasErrors) {
      toast.error('Please fix validation errors before submitting')
      return
    }

    // Check for invoiced entries
    const hasInvoicedEntries = dayEntries.some(entry => entry.use && entry.invoiced)
    if (hasInvoicedEntries) {
      const confirmed = confirm(
        'Warning: Some entries are already invoiced. Editing them may cause double billing. Continue?'
      )
      if (!confirmed) return
    }

    const entries = dayEntries
      .filter((entry) => entry.use)
      .map((entry) => {
        if (entry.from === null || entry.to === null) {
          toast.error(
            `Invalid times for ${formatDateInTimezone(entry.date, 'MMM d', timezone)}: Please enter both start and end times`
          )
          return null
        }

        const duration = calculateDurationMinutes(entry.from, entry.to)
        if (duration === null) {
          toast.error(
            `Invalid time range for ${formatDateInTimezone(entry.date, 'MMM d', timezone)}: ${entry.errors.time || 'Invalid times'}`
          )
          return null
        }

        const units = duration / 15

        // For BCBA timesheets, store service type in notes field
        // This allows per-entry service types without schema changes
        const notes = entry.serviceType || null

        return {
          date: formatDateOnly(entry.date, timezone),
          startTime: timeAMPMTo24Hour(entry.from),
          endTime: timeAMPMTo24Hour(entry.to),
          minutes: duration,
          units: units,
          notes: notes,
          invoiced: entry.invoiced,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

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
          providerId: '', // BCBA timesheets don't use provider
          clientId,
          bcbaId,
          insuranceId, // Use selected insurance
          isBCBA: true,
          serviceType: serviceType || null, // Keep for backward compatibility
          sessionData: sessionData || null, // Keep for backward compatibility
          startDate: formatDateOnly(startDate, timezone),
          endDate: formatDateOnly(endDate, timezone),
          timezone,
          entries,
        }),
      })

      if (res.ok) {
        toast.success(`BCBA Timesheet ${timesheet ? 'updated' : 'created'} successfully`)
        router.push('/bcba-timesheets')
        router.refresh()
      } else {
        const data = await res.json()
        toast.error(data.error || `Failed to ${timesheet ? 'update' : 'create'} timesheet`)
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <Link
          href="/bcba-timesheets"
          className="inline-flex items-center text-sm text-white hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to BCBA Timesheets
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {timesheet ? 'Edit BCBA Timesheet' : 'New BCBA Timesheet'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date Range Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Date Range</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => {
                  try {
                    if (date) {
                      // Validate date
                      if (!(date instanceof Date) || isNaN(date.getTime())) {
                        console.error('[BCBA TIMESHEET] Invalid date object:', date)
                        toast.error('Invalid date selected')
                        return
                      }
                      // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                      const dateStr = formatDateOnly(date, timezone)
                      if (isSaturday(new Date(dateStr))) {
                        toast.error('Timesheets cannot be created on Saturdays')
                        return
                      }
                      // If end date is set and new start date is after end date, clear end date
                      if (endDate && date > endDate) {
                        setEndDate(null)
                      }
                      setStartDate(date)
                    } else {
                      setStartDate(null)
                    }
                  } catch (error: any) {
                    console.error('[BCBA TIMESHEET] Error setting start date:', error)
                    toast.error(error?.message || 'Invalid date selected')
                  }
                }}
                filterDate={(date) => {
                  // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                  const dateStr = formatDateOnly(date, timezone)
                  return !isSaturdayInTimezone(dateStr, timezone)
                }}
                selectsStart
                startDate={startDate || undefined}
                endDate={endDate || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                dateFormat="MM/dd/yyyy"
                placeholderText="Select start date"
                required
                isClearable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => {
                  try {
                    if (date) {
                      // Validate date
                      if (!(date instanceof Date) || isNaN(date.getTime())) {
                        console.error('[BCBA TIMESHEET] Invalid date object:', date)
                        toast.error('Invalid date selected')
                        return
                      }
                      // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                      const dateStr = formatDateOnly(date, timezone)
                      if (isSaturday(new Date(dateStr))) {
                        toast.error('Timesheets cannot be created on Saturdays')
                        return
                      }
                      // Ensure end date is not before start date
                      if (startDate && date < startDate) {
                        toast.error('End date must be after start date')
                        return
                      }
                      setEndDate(date)
                    } else {
                      setEndDate(null)
                    }
                  } catch (error: any) {
                    console.error('[BCBA TIMESHEET] Error setting end date:', error)
                    toast.error(error?.message || 'Invalid date selected')
                  }
                }}
                filterDate={(date) => {
                  // CRITICAL: Check if Saturday in NY timezone, not user's local timezone
                  const dateStr = formatDateOnly(date, timezone)
                  return !isSaturdayInTimezone(dateStr, timezone)
                }}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate || undefined}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                dateFormat="MM/dd/yyyy"
                placeholderText="Select end date"
                required
              />
            </div>
          </div>
        </div>

        {/* Default Times Section */}
        {!timesheet && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Default Times</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Day Type</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">FROM</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">TO</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">ENABLED</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(['sun', 'weekdays', 'fri'] as const).map((dayType) => {
                    const defaults = defaultTimes[dayType]
                    const label = dayType === 'sun' ? 'Sunday' : dayType === 'fri' ? 'Friday' : 'Weekdays'
                    return (
                      <tr key={dayType}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{label}</td>
                        <td className="px-4 py-2">
                          <TimeFieldAMPM
                            value={defaults.from}
                            onChange={(time) => updateDefaultTimes(dayType, 'from', time)}
                            placeholder="--:--"
                            className="justify-center"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <TimeFieldAMPM
                            value={defaults.to}
                            onChange={(time) => updateDefaultTimes(dayType, 'to', time)}
                            placeholder="--:--"
                            className="justify-center"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={defaults.enabled}
                              onChange={(e) =>
                                updateDefaultTimes(dayType, 'enabled', e.target.checked)
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
        )}

        {/* Assignment Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Assignment</h2>
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Data / Analysis <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={sessionData}
                onChange={(e) => setSessionData(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select session data</option>
                <option value="Session Notes">Session Notes</option>
                <option value="Client Data Analysis">Client Data Analysis</option>
                <option value="Excel Export Action Plan">Excel Export Action Plan</option>
              </select>
            </div>
            {dlb && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  DLB
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-700">
                  {dlb}
                </div>
              </div>
            )}
            <div>
              {/* Timezone is always America/New_York - hidden from UI */}
              <input type="hidden" value={timezone} />
            </div>
          </div>
        </div>

        {/* Days Table */}
        {dayEntries.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Days for {startDate && format(startDate, 'MMM d')} - {endDate && format(endDate, 'MMM d')}
              </h2>
              <div className="flex items-center gap-4">
                {!timesheet && (
                  <button
                    type="button"
                    onClick={applyDefaultsToDates}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply Default Times to Dates
                  </button>
                )}
                <div className="text-lg font-bold text-primary-600">
                  TOTAL: {totalHours.toFixed(2)} HRS
                </div>
              </div>
            </div>
            
            {/* Bulk Action Bar */}
            {selectedRows.size > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-blue-900">
                    {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Clear selection
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Service Type
                    </label>
                    <select
                      value={bulkServiceType}
                      onChange={(e) => setBulkServiceType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">Select service type</option>
                      <option value="Assessment">Assessment</option>
                      <option value="Direct Care">Direct Care</option>
                      <option value="Supervision">Supervision</option>
                      <option value="Treatment Planning">Treatment Planning</option>
                      <option value="Parent Training">Parent Training</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleBulkApply}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                    >
                      Apply to Selected
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase w-12">
                      <input
                        type="checkbox"
                        checked={allRowsSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = someRowsSelected
                        }}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                        title="Select all rows"
                      />
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">DATE</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">TYPE</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">FROM</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">TO</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">HOURS</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">USE</th>
                    {!timesheet && (
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">ACTIONS</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dayEntries.map((entry, index) => {
                    // BCBA timesheets don't have overlap conflicts
                    const hasConflict = false
                    return (
                      <tr
                        key={index}
                        className={selectedRows.has(index) ? 'bg-blue-50' : ''}
                      >
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(index)}
                            onChange={() => handleRowSelect(index)}
                            className="rounded border-gray-300 text-primary-600"
                            disabled={timesheet?.status === 'LOCKED'}
                          />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                          {formatDateInTimezone(entry.date, 'EEE M/d/yyyy', timezone)}
                        </td>
                        <td className="px-4 py-2 text-center text-sm font-medium text-gray-700">
                          {getServiceTypeInitials(entry.serviceType)}
                        </td>
                        <td className={`px-2 py-2 ${hasConflict ? 'bg-red-100' : ''}`}>
                          <TimeFieldAMPM
                            value={entry.from}
                            onChange={(time) => updateDayEntry(index, 'from', time)}
                            placeholder="--:--"
                            className={`justify-center ${hasConflict ? 'border-red-500' : ''}`}
                            disabled={timesheet?.status === 'LOCKED'}
                          />
                        </td>
                        <td className={`px-2 py-2 ${hasConflict ? 'bg-red-100' : ''}`}>
                          <TimeFieldAMPM
                            value={entry.to}
                            onChange={(time) => updateDayEntry(index, 'to', time)}
                            placeholder="--:--"
                            className={`justify-center ${hasConflict ? 'border-red-500' : ''}`}
                            disabled={timesheet?.status === 'LOCKED'}
                          />
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-700">
                          {entry.hours > 0 ? formatHours(entry.hours) : '-'}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col items-center">
                            <input
                              type="checkbox"
                              checked={entry.use}
                              onChange={(e) => updateDayEntry(index, 'use', e.target.checked)}
                              disabled={timesheet?.status === 'LOCKED'}
                              className="rounded border-gray-300 text-primary-600"
                            />
                            {entry.invoiced && (
                              <span className="text-xs text-red-600 mt-1" title="Already invoiced">⚠</span>
                            )}
                          </div>
                          {entry.errors.time && (
                            <div className="text-xs text-red-600 mt-1">{entry.errors.time}</div>
                          )}
                        </td>
                        {!timesheet && (
                          <td className="px-2 py-2 text-center">
                            {(entry.touched.from || entry.touched.to) && (
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

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <Link
            href="/bcba-timesheets"
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || dayEntries.length === 0}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (timesheet ? 'Updating...' : 'Creating...') : (timesheet ? 'Update Timesheet' : 'Create Timesheet')}
          </button>
        </div>
      </form>
    </div>
  )
}
