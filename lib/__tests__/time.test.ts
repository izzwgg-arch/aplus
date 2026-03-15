/**
 * Unit tests for time utilities (lib/time.ts)
 * Run with: npm test or npx jest lib/__tests__/time.test.ts
 */

import { toMinutes, fromMinutes, duration, to24Hour, to12Hour, validateRange, INVALID_TIME } from '../time'

describe('toMinutes', () => {
  it('should convert 3:00 PM to 900 minutes', () => {
    expect(toMinutes(3, '00', 'PM')).toBe(900)
    expect(toMinutes(3, 0, 'PM')).toBe(900)
  })

  it('should convert 12:00 AM to 0 minutes', () => {
    expect(toMinutes(12, '00', 'AM')).toBe(0)
    expect(toMinutes(12, 0, 'AM')).toBe(0)
  })

  it('should convert 2:00 AM to 120 minutes', () => {
    expect(toMinutes(2, '00', 'AM')).toBe(120)
  })

  it('should convert 4:00 PM to 960 minutes', () => {
    expect(toMinutes(4, '00', 'PM')).toBe(960)
  })

  it('should convert 10:00 PM to 1320 minutes', () => {
    expect(toMinutes(10, '00', 'PM')).toBe(1320)
  })

  it('should convert 12:00 PM to 720 minutes (noon)', () => {
    expect(toMinutes(12, '00', 'PM')).toBe(720)
  })

  it('should convert 1:00 AM to 60 minutes', () => {
    expect(toMinutes(1, '00', 'AM')).toBe(60)
  })

  it('should handle minutes correctly', () => {
    expect(toMinutes(3, '30', 'PM')).toBe(930) // 3:30 PM = 15:30 = 930 minutes
    expect(toMinutes(9, '15', 'AM')).toBe(555) // 9:15 AM = 9:15 = 555 minutes
  })

  it('should return null for invalid hour', () => {
    expect(toMinutes(0, '00', 'AM')).toBeNull()
    expect(toMinutes(13, '00', 'AM')).toBeNull()
    expect(toMinutes(-1, '00', 'AM')).toBeNull()
  })

  it('should return null for invalid minute', () => {
    expect(toMinutes(3, '60', 'PM')).toBeNull()
    expect(toMinutes(3, -1, 'PM')).toBeNull()
    expect(toMinutes(3, '99', 'PM')).toBeNull()
  })

  it('should return null for invalid input (never NaN)', () => {
    expect(toMinutes('invalid', '00', 'AM')).toBeNull()
    expect(toMinutes(3, 'invalid', 'PM')).toBeNull()
    expect(toMinutes(NaN, '00', 'AM')).toBeNull()
    expect(toMinutes(3, NaN, 'PM')).toBeNull()
  })
})

describe('fromMinutes', () => {
  it('should convert 900 minutes to 3:00 PM', () => {
    const result = fromMinutes(900)
    expect(result.hour12).toBe(3)
    expect(result.minute2).toBe('00')
    expect(result.ampm).toBe('PM')
  })

  it('should convert 0 minutes to 12:00 AM', () => {
    const result = fromMinutes(0)
    expect(result.hour12).toBe(12)
    expect(result.minute2).toBe('00')
    expect(result.ampm).toBe('AM')
  })

  it('should convert 120 minutes to 2:00 AM', () => {
    const result = fromMinutes(120)
    expect(result.hour12).toBe(2)
    expect(result.minute2).toBe('00')
    expect(result.ampm).toBe('AM')
  })

  it('should convert 960 minutes to 4:00 PM', () => {
    const result = fromMinutes(960)
    expect(result.hour12).toBe(4)
    expect(result.minute2).toBe('00')
    expect(result.ampm).toBe('PM')
  })

  it('should convert 1320 minutes to 10:00 PM', () => {
    const result = fromMinutes(1320)
    expect(result.hour12).toBe(10)
    expect(result.minute2).toBe('00')
    expect(result.ampm).toBe('PM')
  })

  it('should convert 720 minutes to 12:00 PM (noon)', () => {
    const result = fromMinutes(720)
    expect(result.hour12).toBe(12)
    expect(result.minute2).toBe('00')
    expect(result.ampm).toBe('PM')
  })

  it('should handle minutes correctly', () => {
    const result = fromMinutes(930) // 3:30 PM
    expect(result.hour12).toBe(3)
    expect(result.minute2).toBe('30')
    expect(result.ampm).toBe('PM')
  })

  it('should return null for invalid minutes', () => {
    expect(fromMinutes(null)).toEqual({ hour12: null, minute2: null, ampm: null })
    expect(fromMinutes(INVALID_TIME)).toEqual({ hour12: null, minute2: null, ampm: null })
    expect(fromMinutes(-1)).toEqual({ hour12: null, minute2: null, ampm: null })
    expect(fromMinutes(1440)).toEqual({ hour12: null, minute2: null, ampm: null })
  })

  it('should never return NaN', () => {
    const result = fromMinutes(900)
    expect(isNaN(result.hour12 as number)).toBe(false)
    expect(isNaN(parseInt(result.minute2 || '0', 10))).toBe(false)
  })
})

describe('duration', () => {
  it('should calculate duration correctly', () => {
    expect(duration(540, 900)).toBe(360) // 9:00 AM to 3:00 PM = 6 hours = 360 minutes
    expect(duration(0, 60)).toBe(60) // 12:00 AM to 1:00 AM = 1 hour
    expect(duration(120, 960)).toBe(840) // 2:00 AM to 4:00 PM = 14 hours
  })

  it('should return null for invalid start time', () => {
    expect(duration(null, 900)).toBeNull()
    expect(duration(INVALID_TIME, 900)).toBeNull()
  })

  it('should return null for invalid end time', () => {
    expect(duration(540, null)).toBeNull()
    expect(duration(540, INVALID_TIME)).toBeNull()
  })

  it('should return null if end < start (overnight not supported)', () => {
    expect(duration(900, 540)).toBeNull() // 3:00 PM to 9:00 AM (next day)
  })

  it('should never return NaN', () => {
    const result = duration(540, 900)
    expect(result).not.toBeNaN()
    expect(result).toBe(360)
  })
})

describe('to24Hour', () => {
  it('should convert minutes to 24-hour format', () => {
    expect(to24Hour(0)).toBe('00:00')
    expect(to24Hour(540)).toBe('09:00')
    expect(to24Hour(900)).toBe('15:00')
    expect(to24Hour(1439)).toBe('23:59')
  })

  it('should return placeholder for invalid times', () => {
    expect(to24Hour(null)).toBe('--:--')
    expect(to24Hour(INVALID_TIME)).toBe('--:--')
    expect(to24Hour(-1)).toBe('--:--')
    expect(to24Hour(1440)).toBe('--:--')
  })
})

describe('to12Hour', () => {
  it('should convert minutes to 12-hour format', () => {
    expect(to12Hour(0)).toBe('12:00 AM')
    expect(to12Hour(540)).toBe('9:00 AM')
    expect(to12Hour(900)).toBe('3:00 PM')
    expect(to12Hour(1320)).toBe('10:00 PM')
    expect(to12Hour(720)).toBe('12:00 PM')
  })

  it('should return placeholder for invalid times', () => {
    expect(to12Hour(null)).toBe('--:--')
    expect(to12Hour(INVALID_TIME)).toBe('--:--')
    expect(to12Hour(-1)).toBe('--:--')
    expect(to12Hour(1440)).toBe('--:--')
  })
})

describe('validateRange', () => {
  it('should validate correct ranges', () => {
    expect(validateRange(540, 900).valid).toBe(true)
    expect(validateRange(0, 60).valid).toBe(true)
  })

  it('should reject invalid start time', () => {
    const result = validateRange(null, 900)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid start time')
  })

  it('should reject invalid end time', () => {
    const result = validateRange(540, null)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Invalid end time')
  })

  it('should reject end < start', () => {
    const result = validateRange(900, 540)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('End time must be after start time')
  })
})

describe('Round-trip conversion', () => {
  it('should convert toMinutes and fromMinutes correctly', () => {
    const testCases = [
      { hour: 3, minute: '00', ampm: 'PM' as const },
      { hour: 12, minute: '00', ampm: 'AM' as const },
      { hour: 2, minute: '00', ampm: 'AM' as const },
      { hour: 4, minute: '00', ampm: 'PM' as const },
      { hour: 10, minute: '00', ampm: 'PM' as const },
      { hour: 9, minute: '30', ampm: 'AM' as const },
      { hour: 11, minute: '59', ampm: 'PM' as const },
    ]

    testCases.forEach(({ hour, minute, ampm }) => {
      const minutes = toMinutes(hour, minute, ampm)
      expect(minutes).not.toBeNull()
      if (minutes !== null) {
        const parts = fromMinutes(minutes)
        expect(parts.hour12).toBe(hour)
        expect(parts.minute2).toBe(minute)
        expect(parts.ampm).toBe(ampm)
      }
    })
  })
})
