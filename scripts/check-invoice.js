const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: 'INV-2026-0052' },
      include: { 
        entries: { 
          take: 5,
          include: {
            timesheet: {
              include: {
                entries: { take: 3 }
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
    console.log('Total Amount:', invoice.totalAmount.toString());
    console.log('Total Units:', invoice.totalUnits?.toString() || 'N/A');
    console.log('Entries:', invoice.entries.length);
    
    console.log('\nFirst 3 entries:');
    invoice.entries.slice(0, 3).forEach((e, idx) => {
      console.log(`  Entry ${idx + 1}:`, e.units.toString(), 'units,', e.amount.toString(), 'amount');
      if (e.timesheet?.entries) {
        console.log(`    Timesheet entries:`, e.timesheet.entries.length);
        e.timesheet.entries.slice(0, 2).forEach(ts => {
          console.log(`      - ${ts.date}: ${ts.minutes} min, notes: ${ts.notes || 'null'}`);
        });
      }
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
