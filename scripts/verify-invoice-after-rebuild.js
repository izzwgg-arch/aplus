const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: 'INV-2026-0052' },
      include: {
        entries: true
      }
    });

    if (!invoice) {
      console.log('Invoice not found');
      return;
    }

    console.log('Invoice:', invoice.invoiceNumber);
    console.log('InvoiceEntry records:', invoice.entries.length);
    console.log('');

    let totalUnits = 0;
    invoice.entries.forEach((entry, idx) => {
      const units = parseFloat(entry.units.toString());
      totalUnits += units;
      console.log(`Entry ${idx + 1}: ${units.toFixed(2)} units, $${parseFloat(entry.amount.toString()).toFixed(2)}`);
    });

    console.log('');
    console.log('Total Units (from InvoiceEntry):', totalUnits.toFixed(2));
    console.log('Total Amount (from Invoice):', invoice.totalAmount.toString());

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
