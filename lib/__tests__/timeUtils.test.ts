/**
 * Unit tests for time utilities
 * Run with: npm test or npx jest
 */

import {
  parseTimeToMinutes,
  formatMinutesToDisplay,
  formatMinutesTo24Hour,
  calcDurationMinutes,
  parseUserTimeInput,
  validateTimeRange,
  INVALID_TIME,
  PLACEHOLDER_TIME,
} from '../timeUtils'

describe('parseTimeToMinutes', () => {
  it('should parse 12-hour format correctly', () => {
    expect(parseTimeToMinutes('12:00 AM')).toBe(0) // midnight
    expect(parseTimeToMinutes('1:00 AM')).toBe(60)
    expect(parseTimeToMinutes('12:00 PM')).toBe(720) // noon
    expect(parseTimeToMinutes('1:00 PM')).toBe(780)
    expect(parseTimeToMinutes('11:59 PM')).toBe(1439)
    expect(parseTimeToMinutes('9:30 AM')).toBe(570)
    expect(parseTimeToMinutes('5:45 PM')).toBe(1065)
  })

  it('should parse 24-hour format correctly', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0)
    expect(parseTimeToMinutes('09:00')).toBe(540)
    expect(parseTimeToMinutes('12:00')).toBe(720)
    expect(parseTimeToMinutes('13:30')).toBe(810)
    expect(parseTimeToMinutes('23:59')).toBe(1439)
  })

  it('should return INVALID_TIME for invalid inputs', () => {
    expect(parseTimeToMinutes('')).toBe(INVALID_TIME)
    expect(parseTimeToMinutes(PLACEHOLDER_TIME)).toBe(INVALID_TIME)
    expect(parseTimeToMinutes('invalid')).toBe(INVALID_TIME)
    expect(parseTimeToMinutes('25:00')).toBe(INVALID_TIME)
    expect(parseTimeToMinutes('12:60')).toBe(INVALID_TIME)
    expect(parseTimeToMinutes('13:00 AM')).toBe(INVALID_TIME) // Invalid hour for AM/PM
    expect(parseTimeToMinutes('0:00 AM')).toBe(INVALID_TIME) // Hour must be 1-12
  })

  it('should never return NaN', () => {
    const result = parseTimeToMinutes('invalid')
    expect(isNaN(result)).toBe(false)
    expect(result).toBe(INVALID_TIME)
  })
})

describe('formatMinutesToDisplay', () => {
  it('should format minutes to 12-hour display', () => {
    expect(formatMinutesToDisplay(0)).toBe('12:00 AM')
    expect(formatMinutesToDisplay(60)).toBe('1:00 AM')
    expect(formatMinutesToDisplay(540)).toBe('9:00 AM')
    expect(formatMinutesToDisplay(720)).toBe('12:00 PM')
    expect(formatMinutesToDisplay(780)).toBe('1:00 PM')
    expect(formatMinutesToDisplay(1065)).toBe('5:45 PM')
    expect(formatMinutesToDisplay(1439)).toBe('11:59 PM')
  })

  it('should return placeholder for invalid minutes', () => {
    expect(formatMinutesToDisplay(INVALID_TIME)).toBe(PLACEHOLDER_TIME)
    expect(formatMinutesToDisplay(-1)).toBe(PLACEHOLDER_TIME)
    expect(formatMinutesToDisplay(1440)).toBe(PLACEHOLDER_TIME)
    expect(formatMinutesToDisplay(NaN)).toBe(PLACEHOLDER_TIME)
  })

  it('should never return NaN or undefined', () => {
    const result = formatMinutesToDisplay(NaN)
    expect(result).toBe(PLACEHOLDER_TIME)
    expect(typeof result).toBe('string')
  })
})

describe('formatMinutesTo24Hour', () => {
  it('should format minutes to 24-hour string', () => {
    expect(formatMinutesTo24Hour(0)).toBe('00:00')
    expect(formatMinutesTo24Hour(540)).toBe('09:00')
    expect(formatMinutesTo24Hour(720)).toBe('12:00')
    expect(formatMinutesTo24Hour(810)).toBe('13:30')
    expect(formatMinutesTo24Hour(1439)).toBe('23:59')
  })

  it('should return placeholder for invalid minutes', () => {
    expect(formatMinutesTo24Hour(INVALID_TIME)).toBe(PLACEHOLDER_TIME)
    expect(formatMinutesTo24Hour(-1)).toBe(PLACEHOLDER_TIME)
    expect(formatMinutesTo24Hour(1440)).toBe(PLACEHOLDER_TIME)
    expect(formatMinutesTo24Hour(NaN)).toBe(PLACEHOLDER_TIME)
  })
})

describe('calcDurationMinutes', () => {
  it('should calculate duration correctly', () => {
    expect(calcDurationMinutes(540, 600)).toBe(60) // 9:00 AM to 10:00 AM = 1 hour
    expect(calcDurationMinutes(540, 810)).toBe(270) // 9:00 AM to 1:30 PM = 4.5 hours
    expect(calcDurationMinutes(0, 1440)).toBe(1440) // Midnight to next midnight = 24 hours
  })

  it('should return 0 if end is before start', () => {
    expect(calcDurationMinutes(600, 540)).toBe(0) // 10:00 AM to 9:00 AM = invalid
    expect(calcDurationMinutes(720, 540)).toBe(0) // Noon to 9:00 AM = invalid
  })

  it('should return 0 for invalid inputs', () => {
    expect(calcDurationMinutes(INVALID_TIME, 600)).toBe(0)
    expect(calcDurationMinutes(540, INVALID_TIME)).toBe(0)
    expect(calcDurationMinutes(INVALID_TIME, INVALID_TIME)).toBe(0)
  })

  it('should never return NaN', () => {
    const result = calcDurationMinutes(540, 600)
    expect(isNaN(result)).toBe(false)
    expect(typeof result).toBe('number')
  })
})

describe('parseUserTimeInput', () => {
  it('should handle AM/PM toggle', () => {
    expect(parseUserTimeInput('10:00 AMp', '10:00 AM')).toBe('10:00 PM')
    expect(parseUserTimeInput('10:00 PMa', '10:00 PM')).toBe('10:00 AM')
    expect(parseUserTimeInput('p', '10:00 AM')).toBe('10:00 PM')
    expect(parseUserTimeInput('am', '10:00 PM')).toBe('10:00 AM')
  })

  it('should format numbers as user types', () => {
    expect(parseUserTimeInput('1', '')).toContain('1')
    expect(parseUserTimeInput('10', '')).toContain('10')
    expect(parseUserTimeInput('100', '')).toContain('10:00')
    expect(parseUserTimeInput('1234', '')).toContain('12:34')
  })

  it('should preserve AM/PM if not explicitly changed', () => {
    const result1 = parseUserTimeInput('10:30', '09:00 AM')
    expect(result1).toContain('AM')
    const result2 = parseUserTimeInput('10:30', '09:00 PM')
    expect(result2).toContain('PM')
  })

  it('should return empty string for empty input', () => {
    expect(parseUserTimeInput('', '10:00 AM')).toBe('')
  })
})

describe('validateTimeRange', () => {
  it('should return valid for correct ranges', () => {
    expect(validateTimeRange(540, 600).valid).toBe(true) // 9:00 AM to 10:00 AM
    expect(validateTimeRange(540, 540).valid).toBe(true) // Same time
  })

  it('should return invalid if end is before start', () => {
    const result = validateTimeRange(600, 540)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should return invalid for invalid times', () => {
    expect(validateTimeRange(INVALID_TIME, 600).valid).toBe(false)
    expect(validateTimeRange(540, INVALID_TIME).valid).toBe(false)
  })
})

describe('Integration: Round-trip conversion', () => {
  it('should maintain accuracy through parse -> format cycle', () => {
    const testCases = [
      { input: '9:00 AM', expectedMinutes: 540 },
      { input: '1:30 PM', expectedMinutes: 810 },
      { input: '11:59 PM', expectedMinutes: 1439 },
      { input: '3:00 AM', expectedMinutes: 180 },
      { input: '3:00 PM', expectedMinutes: 900 },
      { input: '12:00 AM', expectedMinutes: 0 },
      { input: '12:00 PM', expectedMinutes: 720 },
    ]

    testCases.forEach(({ input, expectedMinutes }) => {
      const minutes = parseTimeToMinutes(input)
      expect(minutes).toBe(expectedMinutes)
      
      const display = formatMinutesToDisplay(minutes)
      const backToMinutes = parseTimeToMinutes(display)
      expect(backToMinutes).toBe(expectedMinutes)
      
      const storage = formatMinutesTo24Hour(minutes)
      const fromStorage = parseTimeToMinutes(storage)
      expect(fromStorage).toBe(expectedMinutes)
    })
  })

  it('should never produce NaN in any calculation', () => {
    const testInputs = [
      '9:00 AM',
      '1:30 PM',
      '11:59 PM',
      '3:00 AM',
      'invalid',
      '',
      '25:00',
    ]

    testInputs.forEach((input) => {
      const minutes = parseTimeToMinutes(input)
      expect(isNaN(minutes)).toBe(false)
      
      if (minutes !== INVALID_TIME) {
        const display = formatMinutesToDisplay(minutes)
        expect(display).not.toContain('NaN')
        
        const storage = formatMinutesTo24Hour(minutes)
        expect(storage).not.toContain('NaN')
      }
    })
  })

  it('should handle "3" then "00" input correctly (no snap to 12:00 AM)', () => {
    // Simulate typing "3" then "00"
    const minutes1 = parseTimeToMinutes('3:00 AM')
    expect(minutes1).toBe(180) // 3:00 AM, not 0 (12:00 AM)
    expect(minutes1).not.toBe(0)

    const minutes2 = parseTimeToMinutes('3:00 PM')
    expect(minutes2).toBe(900) // 3:00 PM
    expect(minutes2).not.toBe(0)
  })

  it('should calculate duration without NaN', () => {
    const start = parseTimeToMinutes('9:00 AM')
    const end = parseTimeToMinutes('5:00 PM')
    const duration = calcDurationMinutes(start, end)
    
    expect(duration).toBe(480) // 8 hours
    expect(isNaN(duration)).toBe(false)
    expect(duration).toBeGreaterThan(0)
  })

  it('should handle edge cases without NaN', () => {
    // Invalid times should return 0 duration, not NaN
    const duration1 = calcDurationMinutes(INVALID_TIME, 540)
    expect(duration1).toBe(0)
    expect(isNaN(duration1)).toBe(false)

    const duration2 = calcDurationMinutes(540, INVALID_TIME)
    expect(duration2).toBe(0)
    expect(isNaN(duration2)).toBe(false)

    const duration3 = calcDurationMinutes(INVALID_TIME, INVALID_TIME)
    expect(duration3).toBe(0)
    expect(isNaN(duration3)).toBe(false)
  })
})
