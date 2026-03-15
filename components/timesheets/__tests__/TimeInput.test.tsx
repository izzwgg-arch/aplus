/**
 * Integration tests for TimeInput component
 * Run with: npm test components/timesheets/__tests__/TimeInput.test.tsx
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TimeInput } from '../TimeInput'
import { INVALID_TIME } from '@/lib/timeUtils'

describe('TimeInput Component', () => {
  it('should render with initial value', () => {
    const onChange = jest.fn()
    render(<TimeInput value={900} onChange={onChange} />) // 3:00 PM

    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PM')).toBeInTheDocument()
  })

  it('should render with INVALID_TIME as empty', () => {
    const onChange = jest.fn()
    render(<TimeInput value={INVALID_TIME} onChange={onChange} />)

    expect(screen.getByDisplayValue('--')).toBeInTheDocument()
  })

  it('should update parent when hour changes', async () => {
    const onChange = jest.fn()
    render(<TimeInput value={900} onChange={onChange} />) // 3:00 PM

    const hourSelect = screen.getByDisplayValue('3')
    fireEvent.change(hourSelect, { target: { value: '4' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(960) // 4:00 PM
    })
  })

  it('should update parent when minute changes', async () => {
    const onChange = jest.fn()
    render(<TimeInput value={900} onChange={onChange} />) // 3:00 PM

    const minuteSelect = screen.getByDisplayValue('00')
    fireEvent.change(minuteSelect, { target: { value: '30' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(930) // 3:30 PM
    })
  })

  it('should update parent when AM/PM changes', async () => {
    const onChange = jest.fn()
    render(<TimeInput value={900} onChange={onChange} />) // 3:00 PM

    const ampmSelect = screen.getByDisplayValue('PM')
    fireEvent.change(ampmSelect, { target: { value: 'AM' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(180) // 3:00 AM
    })
  })

  it('should NOT revert when typing "3" then "00" and selecting PM', async () => {
    const onChange = jest.fn()
    const { rerender } = render(<TimeInput value={INVALID_TIME} onChange={onChange} />)

    // Select hour 3
    const hourSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(hourSelect, { target: { value: '3' } })

    // Select minute 00
    const minuteSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(minuteSelect, { target: { value: '00' } })

    // Select PM
    const ampmSelect = screen.getAllByRole('combobox')[2]
    fireEvent.change(ampmSelect, { target: { value: 'PM' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(900) // 3:00 PM
    })

    // Re-render with the new value - should NOT revert
    rerender(<TimeInput value={900} onChange={onChange} />)

    // Verify it stays as 3:00 PM
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('00')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PM')).toBeInTheDocument()
  })

  it('should handle 2:00 AM correctly', async () => {
    const onChange = jest.fn()
    render(<TimeInput value={INVALID_TIME} onChange={onChange} />)

    const hourSelect = screen.getAllByRole('combobox')[0]
    const minuteSelect = screen.getAllByRole('combobox')[1]
    const ampmSelect = screen.getAllByRole('combobox')[2]

    fireEvent.change(hourSelect, { target: { value: '2' } })
    fireEvent.change(minuteSelect, { target: { value: '00' } })
    fireEvent.change(ampmSelect, { target: { value: 'AM' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(120) // 2:00 AM
    })
  })

  it('should handle 4:00 PM correctly', async () => {
    const onChange = jest.fn()
    render(<TimeInput value={INVALID_TIME} onChange={onChange} />)

    const hourSelect = screen.getAllByRole('combobox')[0]
    const minuteSelect = screen.getAllByRole('combobox')[1]
    const ampmSelect = screen.getAllByRole('combobox')[2]

    fireEvent.change(hourSelect, { target: { value: '4' } })
    fireEvent.change(minuteSelect, { target: { value: '00' } })
    fireEvent.change(ampmSelect, { target: { value: 'PM' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(960) // 4:00 PM
    })
  })

  it('should handle 10:00 PM correctly', async () => {
    const onChange = jest.fn()
    render(<TimeInput value={INVALID_TIME} onChange={onChange} />)

    const hourSelect = screen.getAllByRole('combobox')[0]
    const minuteSelect = screen.getAllByRole('combobox')[1]
    const ampmSelect = screen.getAllByRole('combobox')[2]

    fireEvent.change(hourSelect, { target: { value: '10' } })
    fireEvent.change(minuteSelect, { target: { value: '00' } })
    fireEvent.change(ampmSelect, { target: { value: 'PM' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(1320) // 10:00 PM
    })
  })

  it('should sync when value prop changes externally', () => {
    const onChange = jest.fn()
    const { rerender } = render(<TimeInput value={900} onChange={onChange} />)

    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PM')).toBeInTheDocument()

    // Change value prop
    rerender(<TimeInput value={540} onChange={onChange} />) // 9:00 AM

    expect(screen.getByDisplayValue('9')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AM')).toBeInTheDocument()
  })

  it('should not call onChange when value is incomplete', () => {
    const onChange = jest.fn()
    render(<TimeInput value={INVALID_TIME} onChange={onChange} />)

    // Only select hour, not minute
    const hourSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(hourSelect, { target: { value: '3' } })

    // Should not call onChange yet (minute not selected)
    expect(onChange).not.toHaveBeenCalled()
  })
})
