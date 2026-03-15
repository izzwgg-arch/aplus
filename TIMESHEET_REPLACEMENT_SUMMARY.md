# Timesheet Time Input Replacement - Summary

## Root Cause Analysis

The previous time picker had several issues:
1. **Race conditions**: useEffect hooks were auto-updating state while users were typing, causing "snap back" behavior
2. **String parsing issues**: Freeform text input ("3" then "00") was being parsed incorrectly, jumping to 12:00 AM
3. **State synchronization**: Multiple state updates were conflicting, causing AM/PM toggles to revert
4. **NaN propagation**: Invalid calculations were producing NaN values that propagated through the UI

## Solution: Complete Replacement Strategy

Instead of patching the existing component, we implemented a clean replacement:

### 1. New Time Input Component (`TimePartsInput`)
- **No freeform typing**: Uses dropdowns for hour (1-12) and minute (00, 15, 30, 45)
- **Segmented AM/PM toggle**: Button-based toggle instead of dropdown
- **Single source of truth**: Internal value is always `minutesSinceMidnight` (0-1439) or `null`
- **No formatting during input**: Display is derived from minutes, never formatted while typing

### 2. New Time Utilities (`lib/timeParts.ts`)
- `partsToMinutes(hour12, minute, ampm)` → `number | null` (never NaN)
- `minutesToParts(minutes)` → `{hour12, minute, ampm}` (never NaN)
- `durationMinutes(startMins, endMins)` → `number | null` (never NaN)

### 3. Explicit Defaults Application
- **Removed**: Auto-updating useEffect that caused race conditions
- **Added**: "Apply Default Times to Dates" button for explicit application
- **Added**: `isOverridden` flag to track manual edits
- **Behavior**: Default times changes only update non-overridden rows when button is clicked

### 4. Normalized Save Payload
- All times stored as minutes since midnight (0-1439)
- Server-side validation ensures end > start
- Duration calculated server-side (never trust UI)

### 5. Debug Panel (Dev Only)
- Shows defaultTimes minutes values
- Shows first 3 rows minutes values
- Shows save payload preview
- Helps verify no NaN values and correct state

## Files Changed

### New Files
1. `lib/timeParts.ts` - New time conversion utilities
2. `components/timesheets/TimePartsInput.tsx` - New time input component
3. `lib/__tests__/timeParts.test.ts` - Unit tests for timeParts
4. `components/timesheets/__tests__/TimesheetForm.integration.test.md` - Integration test spec

### Modified Files
1. `components/timesheets/TimesheetForm.tsx` - Complete refactor:
   - Replaced `TimeInput` with `TimePartsInput`
   - Changed `INVALID_TIME` (-1) to `null` for consistency
   - Removed auto-updating useEffect
   - Added `applyDefaultsToDates()` function
   - Changed `isDefaultDerived` to `isOverridden` (inverted logic)
   - Updated save payload to use normalized minutes
   - Enhanced debug panel

### Files NOT Changed (Still Used)
- `lib/time.ts` - Still used for some conversions (to24Hour)
- `lib/timeUtils.ts` - Still used for parsing existing timesheet data

## How to Run Tests

### Unit Tests
```bash
# If Jest is configured:
npm test lib/__tests__/timeParts.test.ts

# Or with tsx:
npx tsx lib/__tests__/timeParts.test.ts
```

### Integration Tests
See `components/timesheets/__tests__/TimesheetForm.integration.test.md` for manual test scenarios.

## Confirmation Checklist

- [x] Root cause identified (race conditions, string parsing, state sync)
- [x] New TimePartsInput component created
- [x] New timeParts.ts utilities created
- [x] TimesheetForm updated to use new component
- [x] Auto-updating useEffect removed
- [x] Apply Defaults button added
- [x] Overridden tracking implemented
- [x] Save payload uses normalized minutes
- [x] Debug panel enhanced
- [x] Unit tests created
- [x] Integration test spec created
- [x] No linting errors
- [x] All INVALID_TIME references converted to null

## Key Improvements

1. **No more race conditions**: Explicit button click instead of auto-update
2. **No more string parsing bugs**: Dropdowns prevent invalid input
3. **No more NaN values**: All functions return null instead of NaN
4. **Better UX**: Clear separation between default times and date rows
5. **Easier debugging**: Debug panel shows exact minutes values

## Additional Features Added

### Reset Row to Default
- Added "Reset" button for each overridden row
- Clicking "Reset" restores the row to default times for that day type
- Sets `isOverridden` back to `false`
- Only visible when row is overridden and not in edit mode

## Next Steps

1. Test manually using the integration test scenarios
2. Verify no NaN values appear in debug panel
3. Verify "Apply Defaults" button works correctly
4. Verify manual overrides are preserved
5. Verify "Reset" button works for individual rows
6. Verify save/reload persists correctly
7. See `TIMESHEET_VERIFICATION_CHECKLIST.md` for complete verification steps
