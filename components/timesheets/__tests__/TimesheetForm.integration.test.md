# TimesheetForm Integration Test Specification

## Test Scenarios

### Test 1: Set Default Times and Generate Rows
**Steps:**
1. Set Default Times (Weekdays) to 3:00 PM - 4:00 PM (DR) and 4:00 PM - 5:00 PM (SV)
2. Enable Weekdays checkbox
3. Select a weekday date range (e.g., Mon-Fri)
4. Click "Apply Default Times to Dates" button

**Expected Results:**
- Generated rows show 3:00 PM - 4:00 PM for DR
- Generated rows show 4:00 PM - 5:00 PM for SV
- Hours calculated correctly (1.0 for DR, 1.0 for SV)
- Debug panel shows correct minutes values (900, 960 for DR; 960, 1020 for SV)

### Test 2: Apply Defaults After Changing Defaults
**Steps:**
1. Set Default Times to 3:00 PM - 4:00 PM
2. Select dates and generate rows (should auto-populate)
3. Change Default Times to 2:00 PM - 3:00 PM
4. Click "Apply Default Times to Dates"

**Expected Results:**
- Rows update to show 2:00 PM - 3:00 PM
- Hours recalculate correctly
- Debug panel shows updated minutes values (840, 900)

### Test 3: Manual Override Prevents Auto-Update
**Steps:**
1. Set Default Times to 3:00 PM - 4:00 PM
2. Select dates and generate rows
3. Manually edit one row's DR time to 1:00 PM - 2:00 PM
4. Change Default Times to 5:00 PM - 6:00 PM
5. Click "Apply Default Times to Dates"

**Expected Results:**
- The manually edited row remains at 1:00 PM - 2:00 PM (not updated)
- Other rows update to 5:00 PM - 6:00 PM
- Debug panel shows isOverridden: true for the edited row

### Test 4: Save and Reload Persists Data
**Steps:**
1. Create timesheet with multiple entries
2. Save timesheet
3. Reload/edit the timesheet

**Expected Results:**
- All times display correctly
- Minutes values are preserved
- No NaN values appear
- Debug panel shows correct minutes values

### Test 5: Time Input Component Behavior
**Steps:**
1. Click on hour dropdown, select "3"
2. Click on minute dropdown, select "00"
3. Click on AM/PM toggle, select "PM"

**Expected Results:**
- Time displays as 3:00 PM
- No jumping to 12:00 AM
- AM/PM toggle works correctly
- No NaN values in debug panel

### Test 6: Duration Calculation
**Steps:**
1. Set start time to 3:00 PM (900 minutes)
2. Set end time to 4:30 PM (990 minutes)

**Expected Results:**
- Duration shows 90 minutes (1.5 hours)
- No NaN values
- Debug panel shows correct duration

### Test 7: Invalid Time Handling
**Steps:**
1. Leave time fields empty
2. Try to save

**Expected Results:**
- Error message: "Please enter both start and end times"
- No crashes
- No NaN values in calculations

## Running Tests

### Manual Testing
1. Start the development server: `npm run dev`
2. Navigate to `/timesheets/new`
3. Follow each test scenario above
4. Check the Debug Panel (dev only) to verify minutes values

### Automated Testing (Future)
These scenarios should be automated using:
- React Testing Library for component testing
- Jest for unit tests
- Playwright or Cypress for E2E testing

## Debug Panel Verification

The Debug Panel (visible in development mode) should show:
- `defaultTimes`: Object with minutes values (not NaN)
- `dayEntries`: Array with minutes values and `isOverridden` flags
- `savePayload`: Array with normalized minutes and calculated durations

All minutes values should be:
- Numbers between 0 and 1439, or null
- Never NaN
- Consistent across all three sections
