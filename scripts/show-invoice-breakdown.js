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
    const invoiceNumber = process.argv[2] || 'INV-2026-0052';
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber },
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

    console.log('='.repeat(60));
    console.log(`Invoice: ${invoice.invoiceNumber}`);
    console.log(`Date Range: ${invoice.startDate.toISOString().split('T')[0]} to ${invoice.endDate.toISOString().split('T')[0]}`);
    console.log(`Current Stored Total: $${invoice.totalAmount.toString()}`);
    console.log('='.repeat(60));
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

    console.log(`Type: ${isBCBATimesheet ? 'BCBA' : 'Regular'}`);
    console.log(`Rate per Unit: $${ratePerUnit.toString()}`);
    console.log('');
    console.log(`InvoiceEntry Records: ${invoice.entries.length}`);
    console.log('');

    // Option 1: Sum of existing InvoiceEntry amounts
    let option1Total = new Decimal(0);
    invoice.entries.forEach(e => {
      option1Total = option1Total.plus(e.amount);
    });
    console.log(`Option 1 - Sum of existing InvoiceEntry amounts: $${option1Total.toNumber().toFixed(2)}`);
    console.log('');

    // Option 2: Recalculate from existing InvoiceEntry records (match to timesheet entries)
    console.log('Option 2 - Recalculate from existing InvoiceEntry records:');
    let option2Total = new Decimal(0);
    let option2Count = 0;
    
    invoice.entries.forEach((invoiceEntry, idx) => {
      const timesheet = invoiceEntry.timesheet;
      if (!timesheet || !timesheet.entries || timesheet.entries.length === 0) {
        return;
      }

      // Try to find matching timesheet entry
      let matched = null;
      for (const tsEntry of timesheet.entries) {
        const { amount: calculatedAmount } = calculateEntryTotals(
          tsEntry.minutes,
          tsEntry.notes,
          ratePerUnit,
          !timesheet.isBCBA
        );
        
        if (Math.abs(calculatedAmount.toNumber() - invoiceEntry.amount.toNumber()) < 0.01) {
          matched = tsEntry;
          break;
        }
      }

      if (matched) {
        const { units, amount } = calculateEntryTotals(
          matched.minutes,
          matched.notes,
          ratePerUnit,
          !timesheet.isBCBA
        );
        option2Total = option2Total.plus(amount);
        option2Count++;
        
        if (idx < 5) {
          console.log(`  Entry ${idx + 1}: ${matched.minutes} min, ${units.toFixed(2)} units, ${matched.notes || 'null'}, $${amount.toNumber().toFixed(2)}`);
        }
      }
    });
    
    if (invoice.entries.length > 5) {
      console.log(`  ... and ${invoice.entries.length - 5} more entries`);
    }
    console.log(`  Total: $${option2Total.toNumber().toFixed(2)} (${option2Count} entries matched)`);
    console.log('');

    // Option 3: All timesheet entries in date range
    console.log('Option 3 - All timesheet entries in date range:');
    let option3Total = new Decimal(0);
    let option3Count = 0;
    const invoiceStartDate = new Date(invoice.startDate);
    const invoiceEndDate = new Date(invoice.endDate);
    
    invoice.entries.forEach(invoiceEntry => {
      if (invoiceEntry.timesheet?.entries) {
        invoiceEntry.timesheet.entries.forEach(tsEntry => {
          const entryDate = new Date(tsEntry.date);
          if (entryDate >= invoiceStartDate && entryDate <= invoiceEndDate) {
            const { units, amount } = calculateEntryTotals(
              tsEntry.minutes,
              tsEntry.notes,
              ratePerUnit,
              !invoiceEntry.timesheet.isBCBA
            );
            option3Total = option3Total.plus(amount);
            option3Count++;
          }
        });
      }
    });
    
    console.log(`  Total: $${option3Total.toNumber().toFixed(2)} (${option3Count} entries)`);
    console.log('');

    console.log('='.repeat(60));
    console.log('SUMMARY:');
    console.log(`  Stored Total: $${invoice.totalAmount.toNumber().toFixed(2)}`);
    console.log(`  Option 1 (Sum InvoiceEntry): $${option1Total.toNumber().toFixed(2)}`);
    console.log(`  Option 2 (Recalc matched): $${option2Total.toNumber().toFixed(2)}`);
    console.log(`  Option 3 (All in range): $${option3Total.toNumber().toFixed(2)}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
