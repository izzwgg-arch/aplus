# Automatic Weekly Invoice Generation - Final Implementation

## ✅ Status: COMPLETE

## 📋 Requirements Summary

1. **Schedule**: Every Tuesday at 7:00 AM ET
2. **Billing Period**: Monday 12:00 AM → Monday 11:59 PM (whole week, Monday to Monday)
3. **Grouping**: One invoice per **Client** (not Client + Insurance)
4. **Rate**: Insurance rate per unit (from client's insurance)
5. **Unit**: 1 unit = 15 minutes
6. **Rounding**: Round UP to nearest 15 minutes

## 🎯 Implementation Details

### Billing Period
- **Period**: Monday to Monday (whole week)
- **Example**: If today is Tuesday, Jan 7, 2025 at 7:00 AM
  - Billing period: Monday, Dec 30, 2024 12:00 AM → Monday, Jan 6, 2025 11:59 PM
- **Calculation**: `lib/billingPeriodUtils.ts` → `calculateWeeklyBillingPeriod()`

### Invoice Generation
- **One invoice per client**
- Aggregates all timesheets for the client within the billing period
- Uses **client's insurance rate** (from `Client.insurance.ratePerUnit`)
- All entries use the same rate (client's insurance rate)

### Unit Calculation
- **1 unit = 15 minutes**
- **Rounding**: Round UP to nearest 15 minutes
- **Formula**: `Math.ceil(minutes / 15) * 15 / 15`
- Uses `calculateUnitsRounded()` from `lib/timesheetUtils.ts`

### Rate Application
- Rate per unit = Client's insurance rate
- Rate is **snapshotted** at invoice generation time
- Stored in `InvoiceEntry.rate`
- Future rate changes do NOT affect past invoices

## 📁 Key Files

- `lib/billingPeriodUtils.ts` - Monday to Monday billing period calculation
- `lib/jobs/invoiceGeneration.ts` - Invoice generation (groups by Client)
- `lib/cron.ts` - Tuesday 7:00 AM schedule
- `app/api/invoices/generate/route.ts` - Manual generation API
- `components/invoices/InvoicesList.tsx` - Manual generation UI

## ✅ Features

- ✅ Automatic generation every Tuesday at 7:00 AM
- ✅ Billing period: Monday to Monday (whole week)
- ✅ One invoice per client
- ✅ Aggregates all timesheets for client
- ✅ Uses client's insurance rate per unit
- ✅ 1 unit = 15 minutes (rounded up)
- ✅ Idempotent (safe to run multiple times)
- ✅ Marks entries as invoiced
- ✅ Locks timesheets after invoicing
- ✅ Manual generation for admins
- ✅ Proper error handling

## 🧪 Testing

Test the following:
1. Verify billing period is Monday to Monday
2. Verify one invoice per client (not per Client + Insurance)
3. Verify rate comes from client's insurance
4. Verify units = minutes / 15 (rounded up)
5. Verify idempotency (no duplicates)
6. Verify entries marked as invoiced
7. Verify timesheets locked

---

**Status**: ✅ Complete - Ready for Testing
