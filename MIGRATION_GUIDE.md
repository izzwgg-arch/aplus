# Timesheet System Migration Guide

## Database Migration

After pulling the latest code, you must run the database migration to add the new fields:

```bash
npx prisma db push
```

Or if using migrations:

```bash
npx prisma migrate dev --name add_timesheet_features
```

## New Database Fields

### Timesheet Table
- `timezone` (String, default: "America/New_York") - IANA timezone identifier
- `lastEditedBy` (String?) - User ID who last edited
- `lastEditedAt` (DateTime?) - Timestamp of last edit

### TimesheetEntry Table
- `overnight` (Boolean, default: false) - True if session crosses midnight
- `invoiced` (Boolean, default: false) - True if included in an invoice

## Breaking Changes

### API Changes
- POST `/api/timesheets` now accepts `timezone` field
- POST/PUT `/api/timesheets` now accepts `overnight` and `invoiced` in entries
- Units calculation now uses rounded-up policy (round up to nearest 15 minutes)

### Data Format Changes
- Time entries now use AM/PM format internally (TimeAMPM type)
- Units are calculated using rounded-up policy (was: exact calculation)

## Migration Steps

1. **Backup Database** (Recommended)
   ```bash
   pg_dump your_database > backup.sql
   ```

2. **Run Migration**
   ```bash
   npx prisma db push
   ```

3. **Verify Migration**
   - Check that new fields exist in database
   - Verify default values are set correctly

4. **Update Existing Data** (Optional)
   If you have existing timesheets, you may want to:
   - Set `timezone` for existing timesheets (defaults to "America/New_York")
   - Recalculate units using new rounding policy (if needed)

## Testing Checklist

After migration, test the following:

- [ ] Create new timesheet with timezone selection
- [ ] Edit existing timesheet (should load correctly)
- [ ] Test overnight session toggle
- [ ] Verify units are rounded up correctly
- [ ] Test auto-save functionality
- [ ] Verify locked timesheets cannot be edited
- [ ] Test invoice generation marks entries as invoiced
- [ ] Test export (CSV and Excel)
- [ ] Verify print preview displays correctly

## Rollback Plan

If you need to rollback:

1. Restore database from backup
2. Revert code to previous commit
3. Run `npx prisma generate` to regenerate Prisma client

## Notes

- Existing timesheets will work with default timezone (America/New_York)
- Existing entries will have `overnight: false` and `invoiced: false` by default
- Units calculation change may result in slightly different totals for existing timesheets
- Auto-save uses localStorage (client-side only, no server persistence)
