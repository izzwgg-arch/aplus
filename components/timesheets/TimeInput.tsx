'use client'

import { useState, useEffect, useRef } from 'react'
import { INVALID_TIME } from '@/lib/timeUtils'
import { toMinutes, fromMinutes } from '@/lib/time'

interface TimeInputProps {
  value: number // minutes since midnight, or INVALID_TIME
  onChange: (minutes: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * @deprecated This component has been replaced by TimePartsInput.
 * 
 * Use TimePartsInput instead, which:
 * - Uses minutes since midnight (0-1439) or null (not INVALID_TIME)
 * - Has better state management (no race conditions)
 * - Uses ABA-friendly minute increments (00, 15, 30, 45)
 * - Has explicit "Apply Defaults" functionality
 * 
 * This component is kept for backward compatibility but should not be used in new code.
 * 
 * Stable time input with 3 separate controls:
 * - Hour select (1-12)
 * - Minute select (00-59)
 * - AM/PM select
 * 
 * NEVER overwrites user input.
 * Only syncs from value prop when it changes externally.
 */
export function TimeInput({
  value,
  onChange,
  placeholder = '--:-- AM',
  className = '',
  disabled = false,
}: TimeInputProps) {
  // Parse value to get current hour/minute/ampm
  const parts = fromMinutes(value === INVALID_TIME ? null : value)
  
  // Initialize state from props
  const [hour, setHour] = useState<string>(parts.hour12?.toString() || '')
  const [minute, setMinute] = useState<string>(parts.minute2 || '')
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(parts.ampm || 'AM')

  // Track the last value we sent to parent to avoid syncing our own changes
  const lastSentValueRef = useRef<number>(value)

  // Sync state when value prop changes externally (not from our onChange)
  useEffect(() => {
    // Only sync if value changed externally (not from our own onChange)
    if (value === lastSentValueRef.current) return

    const newParts = fromMinutes(value === INVALID_TIME ? null : value)
    if (newParts.hour12 !== null && newParts.minute2 !== null && newParts.ampm !== null) {
      setHour(newParts.hour12.toString())
      setMinute(newParts.minute2)
      setAmpm(newParts.ampm)
      lastSentValueRef.current = value
    } else {
      // Clear if invalid
      setHour('')
      setMinute('')
      setAmpm('AM')
      lastSentValueRef.current = value
    }
  }, [value])

  // Generate options
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

  // Handle changes - update parent only when all three are valid
  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHour = e.target.value
    setHour(newHour)
    
    if (newHour && minute && ampm) {
      const mins = toMinutes(parseInt(newHour, 10), parseInt(minute, 10), ampm)
      if (mins !== null) {
        lastSentValueRef.current = mins
        onChange(mins)
      }
    }
  }

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMinute = e.target.value
    setMinute(newMinute)
    
    if (hour && newMinute && ampm) {
      const mins = toMinutes(parseInt(hour, 10), parseInt(newMinute, 10), ampm)
      if (mins !== null) {
        lastSentValueRef.current = mins
        onChange(mins)
      }
    }
  }

  const handleAmpmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAmpm = e.target.value as 'AM' | 'PM'
    setAmpm(newAmpm)
    
    if (hour && minute && newAmpm) {
      const mins = toMinutes(parseInt(hour, 10), parseInt(minute, 10), newAmpm)
      if (mins !== null) {
        lastSentValueRef.current = mins
        onChange(mins)
      }
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        value={hour}
        onChange={handleHourChange}
        disabled={disabled}
        className="w-12 px-1 py-1 text-center border border-gray-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
      >
        <option value="">--</option>
        {hourOptions.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-gray-500">:</span>
      <select
        value={minute}
        onChange={handleMinuteChange}
        disabled={disabled}
        className="w-14 px-1 py-1 text-center border border-gray-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
      >
        <option value="">--</option>
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={handleAmpmChange}
        disabled={disabled}
        className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}
