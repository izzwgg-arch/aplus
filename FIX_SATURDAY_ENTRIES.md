# Fix Saturday Timesheet Entries

## Problem
Due to timezone conversion issues, some timesheet entries were incorrectly stored as Saturday dates when they should have been other days (most commonly Sunday).

## Solution
A script has been created to identify and fix all existing Saturday entries in the database.

## How to Run the Fix Script

### On the Server

1. SSH into the server:
```bash
ssh root@66.94.105.43
```

2. Navigate to the application directory:
```bash
cd /var/www/aplus-center
```

3. Run the fix script:
```bash
npx tsx scripts/fix-saturday-entries.ts
```

The script will:
- Find all timesheet entries with Saturday dates
- Determine the original intended date (usually Sunday)
- Update the entries to the correct dates
- Show a summary of what was fixed

### What the Script Does

1. **Scans all entries**: Checks every timesheet entry in the database
2. **Identifies Saturday entries**: Finds entries where the date is Saturday in the timesheet's timezone
3. **Determines correct date**: 
   - If the previous day is Sunday, it assumes the original was Sunday
   - Otherwise, it uses heuristics to determine the most likely original date
4. **Updates entries**: Corrects the date in the database

### Safety

- The script shows a summary before making changes
- It waits 5 seconds before proceeding (you can cancel with Ctrl+C)
- It logs all changes for review

## Prevention

The code has been updated to prevent this issue in the future:
- Dates are now sent as date-only strings (YYYY-MM-DD) instead of ISO timestamps
- Dates are parsed in the timesheet's timezone to prevent conversion issues
- Saturday validation now works correctly across all timezones

## Verification

After running the script, verify the fixes:
1. Check timesheet entries in the UI - no Saturday entries should appear
2. Review the script output for any errors
3. Test creating a new timesheet to ensure Saturday prevention works
