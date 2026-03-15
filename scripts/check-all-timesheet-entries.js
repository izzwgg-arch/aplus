const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function minutesToUnits(minutes) {
  if (minutes <= 0) return 0;
  const hours = minutes / 60;
  const units = hours * 4;
  return Math.round(units * 100) / 100;
}

async function main() {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: 'INV-2026-0052' },
      include: {
        entries: {
          include: {
            timesheet: {
              include: {
                entries: true
              }
            }
          }
        }
      }
    });

    if (!invoice) {
      console.log('Invoice not found');
      return;
    }

    console.log('Invoice:', invoice.invoiceNumber);
    console.log('Date Range:', invoice.startDate.toISOString().split('T')[0], 'to', invoice.endDate.toISOString().split('T')[0]);
    console.log('InvoiceEntry records:', invoice.entries.length);
    console.log('');

    const invoiceStartDate = new Date(invoice.startDate);
    const invoiceEndDate = new Date(invoice.endDate);

    // Get ALL unique timesheets from ALL invoice entries
    const allTimesheetIds = new Set(invoice.entries.map(e => e.timesheetId).filter(Boolean));
    console.log('Unique timesheet IDs:', allTimesheetIds.size);
    console.log('');

    // Fetch all timesheets
    const allTimesheets = await prisma.timesheet.findMany({
      where: {
        id: { in: Array.from(allTimesheetIds) }
      },
      include: {
        entries: true
      }
    });

    console.log('Fetched timesheets:', allTimesheets.length);
    console.log('');

    // Collect all timesheet entries within date range
    const allTimesheetEntries = [];
    allTimesheets.forEach(timesheet => {
      if (timesheet.entries) {
        timesheet.entries.forEach(tsEntry => {
          const entryDate = new Date(tsEntry.date);
          if (entryDate >= invoiceStartDate && entryDate <= invoiceEndDate) {
            allTimesheetEntries.push({ entry: tsEntry, timesheet });
          }
        });
      }
    });

    console.log('Total timesheet entries in date range:', allTimesheetEntries.length);
    console.log('');

    // Group by date
    const entriesByDate = new Map();
    allTimesheetEntries.forEach(({ entry: tsEntry }) => {
      const dateKey = new Date(tsEntry.date).toISOString().split('T')[0];
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, []);
      }
      entriesByDate.get(dateKey).push(tsEntry);
    });

    console.log('Entries grouped by date:');
    let totalUnits = 0;
    let totalMinutes = 0;
    entriesByDate.forEach((entries, date) => {
      const dayUnits = entries.reduce((sum, e) => {
        const units = minutesToUnits(e.minutes);
        totalMinutes += e.minutes;
        totalUnits += units;
        return sum + units;
      }, 0);
      const dayMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
      console.log(`  ${date}: ${entries.length} entry(ies), ${dayMinutes} min, ${dayUnits.toFixed(2)} units`);
      entries.forEach(e => {
        console.log(`    - ${e.minutes} min, ${e.notes || 'null'}, ${minutesToUnits(e.minutes).toFixed(2)} units`);
      });
    });

    console.log('');
    console.log('=== SUMMARY ===');
    console.log('Total Timesheet Entries:', allTimesheetEntries.length);
    console.log('Total Minutes:', totalMinutes);
    console.log('Total Units (calculated):', totalUnits.toFixed(2));
    console.log('');
    console.log('Current InvoiceEntry records:', invoice.entries.length);
    const currentUnits = invoice.entries.reduce((sum, e) => sum + parseFloat(e.units.toString()), 0);
    console.log('Current Units (from InvoiceEntry):', currentUnits.toFixed(2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
