'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * TimeFieldAMPM - Rebuilt time input component
 * 
 * Requirements:
 * - Allows ANY valid time entry (1:00, 2:15, 3:25, 5:15, 6:45, 11:59, etc.)
 * - NO auto-jumping, no forced conversions, no snapping
 * - NO automatic rounding of any kind
 * - Colon (:) is auto-inserted after numeric entry
 * - Accept both keyboard entry and manual editing
 * - Invalid partial states allowed while typing
 * - Final validation occurs only on blur or save
 * - AM/PM toggle next to EVERY time input
 * - Toggling AM/PM must NOT change hour or minute
 */

export interface TimeAMPM {
  hour: number // 1-12
  minute: number // 0-59
  meridiem: 'AM' | 'PM'
}

interface TimeFieldAMPMProps {
  value: TimeAMPM | null // Canonical stored form
  onChange: (value: TimeAMPM | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
}

export function TimeFieldAMPM({
  value,
  onChange,
  placeholder = '--:--',
  className = '',
  disabled = false,
  required = false,
}: TimeFieldAMPMProps) {
  // rawText: what user is currently typing (never auto-rewritten during typing)
  const [rawText, setRawText] = useState<string>('')
  // storedTime: canonical AM/PM form
  const [storedTime, setStoredTime] = useState<TimeAMPM | null>(value)
  // Validation error
  const [error, setError] = useState<string | null>(null)
  // Track if input is focused (to prevent auto-formatting while typing)
  const [isFocused, setIsFocused] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize from value prop
  useEffect(() => {
    if (value !== storedTime) {
      setStoredTime(value)
      if (value) {
        // Format as "h:mm" for display
        setRawText(`${value.hour}:${value.minute.toString().padStart(2, '0')}`)
      } else {
        setRawText('')
      }
      setError(null)
    }
  }, [value, storedTime])

  /**
   * Auto-insert colon after numeric entry
   * Examples:
   * - "3" -> "3:" (if user continues typing)
   * - "315" -> "3:15" (auto-insert colon)
   * - "1030" -> "10:30" (auto-insert colon)
   */
  const autoInsertColon = (text: string): string => {
    // Remove all non-digits
    const digits = text.replace(/\D/g, '')
    
    if (digits.length === 0) return text
    
    // If user typed 3+ digits, auto-insert colon
    if (digits.length >= 3) {
      // Format as h:mm or hh:mm
      if (digits.length === 3) {
        // "315" -> "3:15"
        return `${digits[0]}:${digits.slice(1, 3)}`
      } else if (digits.length >= 4) {
        // "1030" -> "10:30"
        return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
      }
    }
    
    // If user typed 1-2 digits and there's no colon, don't auto-insert yet
    // (let them type more)
    if (digits.length <= 2 && !text.includes(':')) {
      return text
    }
    
    return text
  }

  /**
   * Parse user input text to TimeAMPM
   * Accepts: "3", "3:25", "03:25", "12:00", "12", etc.
   * Uses current meridiem if not specified in input
   */
  const parseTextToTime = (text: string, currentMeridiem: 'AM' | 'PM'): TimeAMPM | null => {
    if (!text || text.trim() === '') return null
    
    const trimmed = text.trim()
    
    // Extract AM/PM if present in text
    const ampmMatch = trimmed.match(/\s*(AM|PM)\s*$/i)
    const detectedMeridiem = ampmMatch 
      ? (ampmMatch[1].toUpperCase() === 'PM' ? 'PM' : 'AM')
      : currentMeridiem
    
    // Remove AM/PM and extract numbers
    const numbersOnly = trimmed.replace(/\s*(AM|PM)\s*/gi, '').replace(/\D/g, '')
    
    if (numbersOnly.length === 0) return null
    
    let hour: number
    let minute: number
    
    // Parse based on length
    if (numbersOnly.length <= 2) {
      // Just hours: "3" or "12"
      hour = parseInt(numbersOnly, 10)
      minute = 0
    } else if (numbersOnly.length === 3) {
      // "315" -> 3:15 (single digit hour, two digit minute)
      hour = parseInt(numbersOnly[0], 10)
      minute = parseInt(numbersOnly.slice(1, 3), 10)
    } else if (numbersOnly.length === 4) {
      // "1030" -> 10:30 (two digit hour, two digit minute)
      const firstTwo = parseInt(numbersOnly.slice(0, 2), 10)
      if (firstTwo >= 1 && firstTwo <= 12) {
        // Could be hour:minute (e.g., "1030" -> 10:30)
        hour = firstTwo
        minute = parseInt(numbersOnly.slice(2, 4), 10)
      } else {
        // First digit is hour (e.g., "515" -> 5:15)
        hour = parseInt(numbersOnly[0], 10)
        minute = parseInt(numbersOnly.slice(1, 4), 10)
        // If minute > 59, try two-digit hour
        if (minute > 59) {
          hour = parseInt(numbersOnly.slice(0, 2), 10)
          minute = parseInt(numbersOnly.slice(2, 4), 10)
        }
      }
    } else {
      // 5+ digits: take first 4 as HHMM
      hour = parseInt(numbersOnly.slice(0, 2), 10)
      minute = parseInt(numbersOnly.slice(2, 4), 10)
    }
    
    // Validate ranges
    if (isNaN(hour) || isNaN(minute)) return null
    if (hour < 1 || hour > 12) return null
    if (minute < 0 || minute > 59) return null
    
    return {
      hour,
      minute,
      meridiem: detectedMeridiem,
    }
  }

  // Handle blur - parse and update
  const handleBlur = () => {
    setIsFocused(false)
    
    if (!rawText.trim()) {
      // Empty is allowed (unless required)
      if (required) {
        setError('Time is required')
      } else {
        setError(null)
        setStoredTime(null)
        onChange(null)
      }
      return
    }
    
    const parsed = parseTextToTime(rawText, storedTime?.meridiem || 'AM')
    
    if (parsed) {
      setStoredTime(parsed)
      onChange(parsed)
      // Normalize display to "h:mm" format (ONLY on blur)
      setRawText(`${parsed.hour}:${parsed.minute.toString().padStart(2, '0')}`)
      setError(null)
    } else {
      setError('Invalid time format')
      // Keep rawText as-is for user to fix
    }
  }

  // Handle input change - update rawText only, auto-insert colon
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value
    // Auto-insert colon if needed
    const formatted = autoInsertColon(newText)
    setRawText(formatted)
    setError(null) // Clear error while typing
  }

  // Handle AM/PM toggle
  const handleMeridiemToggle = (newMeridiem: 'AM' | 'PM') => {
    if (storedTime) {
      // Toggling AM/PM must NOT change hour or minute
      const updated: TimeAMPM = {
        ...storedTime,
        meridiem: newMeridiem,
      }
      setStoredTime(updated)
      onChange(updated)
      // Keep rawText untouched
    } else if (rawText.trim()) {
      // Try to parse with new meridiem
      const parsed = parseTextToTime(rawText, newMeridiem)
      if (parsed) {
        const updated: TimeAMPM = {
          ...parsed,
          meridiem: newMeridiem,
        }
        setStoredTime(updated)
        onChange(updated)
        setRawText(`${updated.hour}:${updated.minute.toString().padStart(2, '0')}`)
        setError(null)
      } else {
        // Can't parse, but set meridiem for future input
        setStoredTime({ hour: 12, minute: 0, meridiem: newMeridiem })
        onChange({ hour: 12, minute: 0, meridiem: newMeridiem })
      }
    } else {
      // No time yet, just set default meridiem for future input
      setStoredTime({ hour: 12, minute: 0, meridiem: newMeridiem })
      onChange({ hour: 12, minute: 0, meridiem: newMeridiem })
    }
  }

  // Display value when not focused (show formatted)
  const displayValue = isFocused 
    ? rawText 
    : (storedTime ? `${storedTime.hour}:${storedTime.minute.toString().padStart(2, '0')}` : '')

  const currentMeridiem = storedTime?.meridiem || 'AM'

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={() => {
              setIsFocused(true)
              // When focusing, show rawText or current formatted value
              if (!rawText && storedTime) {
                setRawText(`${storedTime.hour}:${storedTime.minute.toString().padStart(2, '0')}`)
              }
            }}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={placeholder}
            className={`w-20 px-2 py-1 text-center border ${
              error ? 'border-red-500' : 'border-gray-300'
            } rounded text-sm focus:ring-primary-500 focus:border-primary-500`}
          />
          <div className="flex border border-gray-300 rounded text-sm overflow-hidden">
            <button
              type="button"
              onClick={() => handleMeridiemToggle('AM')}
              disabled={disabled}
              className={`px-2 py-1 ${
                currentMeridiem === 'AM'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => handleMeridiemToggle('PM')}
              disabled={disabled}
              className={`px-2 py-1 border-l border-gray-300 ${
                currentMeridiem === 'PM'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              PM
            </button>
          </div>
        </div>
        {error && (
          <span className="text-xs text-red-500 mt-0.5">{error}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Convert TimeAMPM to minutes since midnight (0-1439)
 * Returns null if invalid (never NaN)
 */
export function timeAMPMToMinutes(time: TimeAMPM | null): number | null {
  if (!time) return null
  
  let hours24 = time.hour
  if (time.meridiem === 'PM' && time.hour !== 12) hours24 += 12
  if (time.meridiem === 'AM' && time.hour === 12) hours24 = 0
  
  const result = hours24 * 60 + time.minute
  if (result < 0 || result >= 1440) return null
  return result
}

/**
 * Convert minutes since midnight to TimeAMPM
 */
export function minutesToTimeAMPM(minutes: number | null): TimeAMPM | null {
  if (minutes === null || minutes < 0 || minutes >= 1440) return null
  
  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  let hour12 = hours24 % 12
  if (hour12 === 0) hour12 = 12
  const meridiem: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM'
  
  return {
    hour: hour12,
    minute: mins,
    meridiem,
  }
}

/**
 * Convert TimeAMPM to 24-hour format string (HH:mm) for API
 */
export function timeAMPMTo24Hour(time: TimeAMPM | null): string {
  if (!time) return '--:--'
  
  let hours24 = time.hour
  if (time.meridiem === 'PM' && time.hour !== 12) hours24 += 12
  if (time.meridiem === 'AM' && time.hour === 12) hours24 = 0
  
  return `${hours24.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`
}
