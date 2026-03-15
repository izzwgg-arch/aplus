# Timesheet Time Input Replacement - Verification Checklist

## Pre-Deployment Verification

### ✅ Code Changes Complete
- [x] `lib/timeParts.ts` created with all required functions
- [x] `TimePartsInput` component created and working
- [x] `TimesheetForm` updated to use `TimePartsInput`
- [x] Old `TimeInput` marked as deprecated
- [x] All imports updated
- [x] No linting errors

### ✅ Functionality Tests

#### Default Times Section
- [ ] Set Weekdays DR to 3:00 PM - 4:00 PM
- [ ] Set Weekdays SV to 4:00 PM - 5:00 PM
- [ ] Enable Weekdays checkbox
- [ ] Verify times display correctly in dropdowns
- [ ] Change times and verify they update
- [ ] Toggle AM/PM and verify it works

#### Date Generation
- [ ] Select start date (e.g., Monday)
- [ ] Select end date (e.g., Friday)
- [ ] Verify rows are generated
- [ ] Verify rows show default times (if defaults are set)
- [ ] Verify hours are calculated correctly

#### Apply Defaults Button
- [ ] Set default times
- [ ] Generate date rows
- [ ] Change default times
- [ ] Click "Apply Default Times to Dates"
- [ ] Verify non-overridden rows update
- [ ] Verify overridden rows do NOT update

#### Manual Override
- [ ] Generate rows with defaults
- [ ] Manually edit one row's DR time
- [ ] Verify "Reset" button appears for that row
- [ ] Click "Reset" button
- [ ] Verify row resets to default times
- [ ] Verify `isOverridden` flag updates correctly

#### Save and Reload
- [ ] Create timesheet with multiple entries
- [ ] Save timesheet
- [ ] Edit the saved timesheet
- [ ] Verify all times display correctly
- [ ] Verify no NaN values appear
- [ ] Verify hours calculate correctly

### ✅ Debug Panel Verification (Dev Only)

When testing, check the Debug Panel shows:
- [ ] `defaultTimes`: All values are numbers (0-1439) or null, never NaN
- [ ] `dayEntries`: All minutes values are numbers or null, never NaN
- [ ] `dayEntries`: `isOverridden` flags are correct
- [ ] `savePayload`: All minutes values are valid
- [ ] `savePayload`: All durations are positive numbers

### ✅ Edge Cases

#### Invalid Input Handling
- [ ] Leave time fields empty → should allow (null values)
- [ ] Try to save with empty times → should show error
- [ ] Set end time before start time → should show error
- [ ] Verify no crashes occur

#### Time Component Behavior
- [ ] Select hour "3", minute "00", AM/PM "PM" → should show 3:00 PM (900 minutes)
- [ ] Change AM/PM toggle → should update correctly
- [ ] Verify no jumping to 12:00 AM
- [ ] Verify no NaN values in calculations

#### Multiple Day Types
- [ ] Set Sunday defaults
- [ ] Set Friday defaults
- [ ] Set Weekdays defaults
- [ ] Generate date range including all three
- [ ] Verify correct defaults apply to each day type

### ✅ Performance

- [ ] No console errors
- [ ] No React warnings
- [ ] Smooth interactions (no lag)
- [ ] Debug panel updates correctly

## Post-Deployment Monitoring

After deployment, monitor for:
- [ ] User reports of time input issues
- [ ] NaN values in database (should never happen)
- [ ] Incorrect time calculations
- [ ] "Apply Defaults" button not working
- [ ] Manual overrides being lost

## Rollback Plan

If issues are found:
1. The old `TimeInput` component still exists (marked deprecated)
2. Can revert `TimesheetForm.tsx` to use `TimeInput` if needed
3. Database format unchanged (still stores 24-hour strings)
4. No migration needed

## Test Commands

```bash
# Check for linting errors
npm run lint

# Build to verify no TypeScript errors
npm run build

# Run unit tests (if Jest is configured)
npm test lib/__tests__/timeParts.test.ts
```

## Success Criteria

✅ All checklist items pass
✅ No NaN values in debug panel
✅ "Apply Defaults" works correctly
✅ Manual overrides are preserved
✅ Save/reload works correctly
✅ No user-facing errors
