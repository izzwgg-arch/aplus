'use client'

import { useState, useEffect } from 'react'
import { partsToMinutes, minutesToParts } from '@/lib/timeParts'

interface TimePartsInputProps {
  value: number | null // minutes since midnight, or null
  onChange: (minutes: number | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * Simple, controlled time input component with separate hour/minute/ampm controls.
 * No freeform typing. No formatting while typing.
 * Single source of truth: minutes since midnight (0-1439) or null
 */
export function TimePartsInput({
  value,
  onChange,
  placeholder = '--:-- AM',
  className = '',
  disabled = false,
}: TimePartsInputProps) {
  // Parse value to get current hour/minute/ampm
  const parts = minutesToParts(value)

  // Local state for the three parts
  const [hour12, setHour12] = useState<number | null>(parts.hour12)
  const [minute, setMinute] = useState<number | null>(parts.minute)
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(parts.ampm || 'AM')

  // Sync state when value prop changes externally
  useEffect(() => {
    const newParts = minutesToParts(value)
    setHour12(newParts.hour12)
    setMinute(newParts.minute)
    setAmpm(newParts.ampm || 'AM')
  }, [value])

  // Generate options
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1)
  // ABA units: 00, 15, 30, 45
  const minuteOptions = [0, 15, 30, 45]

  // Handle changes - update parent only when all three are valid
  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHour = e.target.value ? parseInt(e.target.value, 10) : null
    setHour12(newHour)

    if (newHour !== null && minute !== null && ampm) {
      const mins = partsToMinutes(newHour, minute, ampm)
      onChange(mins)
    } else {
      onChange(null)
    }
  }

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMinute = e.target.value ? parseInt(e.target.value, 10) : null
    setMinute(newMinute)

    if (hour12 !== null && newMinute !== null && ampm) {
      const mins = partsToMinutes(hour12, newMinute, ampm)
      onChange(mins)
    } else {
      onChange(null)
    }
  }

  const handleAmpmChange = (newAmpm: 'AM' | 'PM') => {
    setAmpm(newAmpm)

    if (hour12 !== null && minute !== null && newAmpm) {
      const mins = partsToMinutes(hour12, minute, newAmpm)
      onChange(mins)
    } else {
      onChange(null)
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        value={hour12 || ''}
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
        value={minute !== null ? minute : ''}
        onChange={handleMinuteChange}
        disabled={disabled}
        className="w-14 px-1 py-1 text-center border border-gray-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
      >
        <option value="">--</option>
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {m.toString().padStart(2, '0')}
          </option>
        ))}
      </select>
      <div className="flex border border-gray-300 rounded text-sm overflow-hidden">
        <button
          type="button"
          onClick={() => handleAmpmChange('AM')}
          disabled={disabled}
          className={`px-2 py-1 ${
            ampm === 'AM'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={() => handleAmpmChange('PM')}
          disabled={disabled}
          className={`px-2 py-1 border-l border-gray-300 ${
            ampm === 'PM'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          PM
        </button>
      </div>
    </div>
  )
}
