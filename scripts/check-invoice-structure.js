const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
    console.log('Invoice Entries (InvoiceEntry records):', invoice.entries.length);
    console.log('');

    let totalTimesheetEntries = 0;
    invoice.entries.forEach((invoiceEntry, idx) => {
      const timesheet = invoiceEntry.timesheet;
      const tsEntryCount = timesheet?.entries?.length || 0;
      totalTimesheetEntries += tsEntryCount;
      
      console.log(`InvoiceEntry ${idx + 1}:`);
      console.log(`  ID: ${invoiceEntry.id}`);
      console.log(`  Units: ${invoiceEntry.units.toString()}`);
      console.log(`  Amount: ${invoiceEntry.amount.toString()}`);
      console.log(`  Timesheet ID: ${invoiceEntry.timesheetId}`);
      console.log(`  Timesheet Entries: ${tsEntryCount}`);
      
      if (timesheet?.entries && timesheet.entries.length > 0) {
        timesheet.entries.slice(0, 3).forEach((ts, i) => {
          console.log(`    TS Entry ${i + 1}: ${ts.minutes} min, ${ts.notes || 'null'}`);
        });
        if (timesheet.entries.length > 3) {
          console.log(`    ... and ${timesheet.entries.length - 3} more`);
        }
      }
      console.log('');
    });

    console.log(`Total InvoiceEntry records: ${invoice.entries.length}`);
    console.log(`Total TimesheetEntry records across all timesheets: ${totalTimesheetEntries}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
