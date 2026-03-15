const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: 'INV-2026-0052' },
      include: {
        client: true
      }
    });

    if (!invoice) {
      console.log('Invoice not found');
      return;
    }

    console.log('Invoice:', invoice.invoiceNumber);
    console.log('Created:', invoice.createdAt);
    console.log('Client:', invoice.client.name);
    console.log('Date Range:', invoice.startDate.toISOString().split('T')[0], 'to', invoice.endDate.toISOString().split('T')[0]);
    console.log('');

    // Find timesheets that were approved/emailed before invoice creation
    const timesheets = await prisma.timesheet.findMany({
      where: {
        clientId: invoice.clientId,
        startDate: { lte: invoice.endDate },
        endDate: { gte: invoice.startDate },
        deletedAt: null,
        OR: [
          { status: 'APPROVED' },
          { status: 'EMAILED' }
        ]
      },
      include: {
        entries: {
          where: {
            date: {
              gte: invoice.startDate,
              lte: invoice.endDate
            }
          }
        },
        provider: true
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log('Timesheets that could be included:', timesheets.length);
    console.log('');

    timesheets.forEach((ts, idx) => {
      const entriesInRange = ts.entries.filter(e => {
        const entryDate = new Date(e.date);
        return entryDate >= invoice.startDate && entryDate <= invoice.endDate;
      });
      console.log(`Timesheet ${idx + 1}:`);
      console.log(`  ID: ${ts.id}`);
      console.log(`  Provider: ${ts.provider?.name || 'N/A'}`);
      console.log(`  Status: ${ts.status}`);
      console.log(`  Created: ${ts.createdAt}`);
      console.log(`  Entries in range: ${entriesInRange.length}`);
      console.log(`  Total entries: ${ts.entries.length}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
