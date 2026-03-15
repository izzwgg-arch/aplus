const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');
const prisma = new PrismaClient();

function minutesToUnits(minutes) {
  if (minutes <= 0) return 0;
  const hours = minutes / 60;
  const units = hours * 4;
  return Math.round(units * 100) / 100;
}

function calculateEntryTotals(entryMinutes, entryNotes, ratePerUnit, isRegularTimesheet) {
  const units = minutesToUnits(entryMinutes);
  const rate = ratePerUnit instanceof Decimal ? ratePerUnit : new Decimal(ratePerUnit);
  const isSV = entryNotes === 'SV';
  
  const amount = (isRegularTimesheet && isSV)
    ? new Decimal(0)
    : new Decimal(units).times(rate);
  
  return { units, amount };
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
        },
        client: {
          include: {
            insurance: true
          }
        }
      }
    });

    if (!invoice) {
      console.log('Invoice not found');
      return;
    }

    console.log('Invoice:', invoice.invoiceNumber);
    console.log('Stored Total:', invoice.totalAmount.toString());
    console.log('Stored Outstanding:', invoice.outstanding.toString());
    console.log('');

    const insurance = invoice.client.insurance;
    const isBCBATimesheet = invoice.entries.some(e => e.timesheet?.isBCBA === true);
    const ratePerUnit = isBCBATimesheet
      ? (insurance.bcbaRatePerUnit 
          ? new Decimal(insurance.bcbaRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString()))
      : (insurance.regularRatePerUnit 
          ? new Decimal(insurance.regularRatePerUnit.toString())
          : new Decimal(insurance.ratePerUnit.toString()));

    console.log('Type:', isBCBATimesheet ? 'BCBA' : 'Regular');
    console.log('Rate per Unit:', ratePerUnit.toString());
    console.log('');

    let calculatedTotal = new Decimal(0);
    let totalMinutes = 0;
    let totalUnits = 0;
    let entryCount = 0;

    // Get all unique timesheet entries within invoice date range
    const invoiceStartDate = new Date(invoice.startDate);
    const invoiceEndDate = new Date(invoice.endDate);
    
    const allTimesheetEntries = [];
    invoice.entries.forEach(invoiceEntry => {
      if (invoiceEntry.timesheet?.entries) {
        invoiceEntry.timesheet.entries.forEach(tsEntry => {
          const entryDate = new Date(tsEntry.date);
          if (entryDate >= invoiceStartDate && entryDate <= invoiceEndDate) {
            allTimesheetEntries.push({
              entry: tsEntry,
              timesheet: invoiceEntry.timesheet,
              invoiceEntry: invoiceEntry
            });
          }
        });
      }
    });

    console.log(`Found ${allTimesheetEntries.length} timesheet entries within invoice date range`);
    console.log('');

    allTimesheetEntries.forEach(({ entry: tsEntry, timesheet }) => {
      const minutes = tsEntry.minutes || 0;
      const isRegular = !timesheet.isBCBA;
      const { units, amount } = calculateEntryTotals(minutes, tsEntry.notes, ratePerUnit, isRegular);
      
      calculatedTotal = calculatedTotal.plus(amount);
      totalMinutes += minutes;
      totalUnits += units;
      entryCount++;

      if (entryCount <= 5) {
        console.log(`Entry ${entryCount}: ${minutes} min, ${units.toFixed(2)} units, ${tsEntry.notes || 'null'}, $${amount.toNumber().toFixed(2)}`);
      }
    });

    if (entryCount > 5) {
      console.log(`... and ${entryCount - 5} more entries`);
    }

    console.log('');
    console.log('=== SUMMARY ===');
    console.log('Total Minutes:', totalMinutes);
    console.log('Total Units:', totalUnits.toFixed(2));
    console.log('Calculated Total:', calculatedTotal.toNumber().toFixed(2));
    console.log('Stored Total:', invoice.totalAmount.toNumber().toFixed(2));
    console.log('Difference:', Math.abs(calculatedTotal.toNumber() - invoice.totalAmount.toNumber()).toFixed(2));

    if (Math.abs(calculatedTotal.toNumber() - invoice.totalAmount.toNumber()) > 0.01) {
      console.log('');
      console.log('❌ MISMATCH: Calculated total does not match stored total!');
    } else {
      console.log('');
      console.log('✅ Match: Calculated total matches stored total');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
