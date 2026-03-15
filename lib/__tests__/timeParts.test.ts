/**
 * Unit tests for timeParts utilities (lib/timeParts.ts)
 * Run with: npm test or npx jest lib/__tests__/timeParts.test.ts
 */

import {
  partsToMinutes,
  minutesToParts,
  durationMinutes,
} from '../timeParts'

describe('partsToMinutes', () => {
  it('should convert 3:00 PM to 900 minutes', () => {
    expect(partsToMinutes(3, 0, 'PM')).toBe(900)
  })

  it('should convert 12:00 AM to 0 minutes', () => {
    expect(partsToMinutes(12, 0, 'AM')).toBe(0)
  })

  it('should convert 2:00 AM to 120 minutes', () => {
    expect(partsToMinutes(2, 0, 'AM')).toBe(120)
  })

  it('should convert 4:00 PM to 960 minutes', () => {
    expect(partsToMinutes(4, 0, 'PM')).toBe(960)
  })

  it('should convert 10:00 PM to 1320 minutes', () => {
    expect(partsToMinutes(10, 0, 'PM')).toBe(1320)
  })

  it('should convert 12:00 PM to 720 minutes (noon)', () => {
    expect(partsToMinutes(12, 0, 'PM')).toBe(720)
  })

  it('should convert 1:00 AM to 60 minutes', () => {
    expect(partsToMinutes(1, 0, 'AM')).toBe(60)
  })

  it('should handle minutes correctly', () => {
    expect(partsToMinutes(3, 30, 'PM')).toBe(930) // 3:30 PM = 15:30 = 930 minutes
    expect(partsToMinutes(9, 15, 'AM')).toBe(555) // 9:15 AM = 9:15 = 555 minutes
    expect(partsToMinutes(11, 45, 'PM')).toBe(1425) // 11:45 PM = 23:45 = 1425 minutes
  })

  it('should return null for invalid hour', () => {
    expect(partsToMinutes(0, 0, 'AM')).toBeNull()
    expect(partsToMinutes(13, 0, 'AM')).toBeNull()
    expect(partsToMinutes(-1, 0, 'AM')).toBeNull()
  })

  it('should return null for invalid minute', () => {
    expect(partsToMinutes(3, 60, 'PM')).toBeNull()
    expect(partsToMinutes(3, -1, 'PM')).toBeNull()
    expect(partsToMinutes(3, 99, 'PM')).toBeNull()
  })

  it('should return null for invalid input (never NaN)', () => {
    expect(partsToMinutes(NaN, 0, 'AM')).toBeNull()
    expect(partsToMinutes(3, NaN, 'PM')).toBeNull()
  })
})

describe('minutesToParts', () => {
  it('should convert 900 minutes to 3:00 PM', () => {
    const result = minutesToParts(900)
    expect(result.hour12).toBe(3)
    expect(result.minute).toBe(0)
    expect(result.ampm).toBe('PM')
  })

  it('should convert 0 minutes to 12:00 AM', () => {
    const result = minutesToParts(0)
    expect(result.hour12).toBe(12)
    expect(result.minute).toBe(0)
    expect(result.ampm).toBe('AM')
  })

  it('should convert 120 minutes to 2:00 AM', () => {
    const result = minutesToParts(120)
    expect(result.hour12).toBe(2)
    expect(result.minute).toBe(0)
    expect(result.ampm).toBe('AM')
  })

  it('should convert 960 minutes to 4:00 PM', () => {
    const result = minutesToParts(960)
    expect(result.hour12).toBe(4)
    expect(result.minute).toBe(0)
    expect(result.ampm).toBe('PM')
  })

  it('should convert 1320 minutes to 10:00 PM', () => {
    const result = minutesToParts(1320)
    expect(result.hour12).toBe(10)
    expect(result.minute).toBe(0)
    expect(result.ampm).toBe('PM')
  })

  it('should convert 720 minutes to 12:00 PM (noon)', () => {
    const result = minutesToParts(720)
    expect(result.hour12).toBe(12)
    expect(result.minute).toBe(0)
    expect(result.ampm).toBe('PM')
  })

  it('should handle minutes correctly', () => {
    const result = minutesToParts(930) // 3:30 PM
    expect(result.hour12).toBe(3)
    expect(result.minute).toBe(30)
    expect(result.ampm).toBe('PM')
  })

  it('should return null for invalid minutes', () => {
    expect(minutesToParts(null)).toEqual({ hour12: null, minute: null, ampm: null })
    expect(minutesToParts(-1)).toEqual({ hour12: null, minute: null, ampm: null })
    expect(minutesToParts(1440)).toEqual({ hour12: null, minute: null, ampm: null })
  })

  it('should never return NaN', () => {
    const result = minutesToParts(900)
    expect(isNaN(result.hour12 as number)).toBe(false)
    expect(isNaN(result.minute as number)).toBe(false)
  })
})

describe('durationMinutes', () => {
  it('should calculate duration correctly', () => {
    expect(durationMinutes(900, 990)).toBe(90) // 3:00 PM to 4:30 PM = 90 minutes
    expect(durationMinutes(540, 900)).toBe(360) // 9:00 AM to 3:00 PM = 6 hours = 360 minutes
    expect(durationMinutes(0, 60)).toBe(60) // 12:00 AM to 1:00 AM = 1 hour
    expect(durationMinutes(120, 960)).toBe(840) // 2:00 AM to 4:00 PM = 14 hours
  })

  it('should return null for invalid start time', () => {
    expect(durationMinutes(null, 900)).toBeNull()
    expect(durationMinutes(-1, 900)).toBeNull()
    expect(durationMinutes(1440, 900)).toBeNull()
  })

  it('should return null for invalid end time', () => {
    expect(durationMinutes(540, null)).toBeNull()
    expect(durationMinutes(540, -1)).toBeNull()
    expect(durationMinutes(540, 1440)).toBeNull()
  })

  it('should return null if end < start (overnight not supported)', () => {
    expect(durationMinutes(900, 540)).toBeNull() // 3:00 PM to 9:00 AM (next day)
  })

  it('should never return NaN', () => {
    const result = durationMinutes(540, 900)
    expect(result).not.toBeNaN()
    expect(result).toBe(360)
  })
})

describe('Round-trip conversion', () => {
  it('should convert partsToMinutes and minutesToParts correctly', () => {
    const testCases = [
      { hour: 3, minute: 0, ampm: 'PM' as const },
      { hour: 12, minute: 0, ampm: 'AM' as const },
      { hour: 2, minute: 0, ampm: 'AM' as const },
      { hour: 4, minute: 0, ampm: 'PM' as const },
      { hour: 10, minute: 0, ampm: 'PM' as const },
      { hour: 9, minute: 30, ampm: 'AM' as const },
      { hour: 11, minute: 45, ampm: 'PM' as const },
    ]

    testCases.forEach(({ hour, minute, ampm }) => {
      const minutes = partsToMinutes(hour, minute, ampm)
      expect(minutes).not.toBeNull()
      if (minutes !== null) {
        const parts = minutesToParts(minutes)
        expect(parts.hour12).toBe(hour)
        expect(parts.minute).toBe(minute)
        expect(parts.ampm).toBe(ampm)
      }
    })
  })
})
