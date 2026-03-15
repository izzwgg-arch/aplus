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
    console.log('Client:', invoice.client.name);
    console.log('Date Range:', invoice.startDate.toISOString().split('T')[0], 'to', invoice.endDate.toISOString().split('T')[0]);
    console.log('');

    // Find all timesheets for this client in the date range
    const timesheets = await prisma.timesheet.findMany({
      where: {
        clientId: invoice.clientId,
        startDate: { lte: invoice.endDate },
        endDate: { gte: invoice.startDate },
        deletedAt: null,
        status: { in: ['APPROVED', 'EMAILED'] }
      },
      include: {
        entries: true,
        provider: true
      }
    });

    console.log('Timesheets for this client in date range:', timesheets.length);
    console.log('');

    timesheets.forEach((ts, idx) => {
      console.log(`Timesheet ${idx + 1}:`);
      console.log(`  ID: ${ts.id}`);
      console.log(`  Provider: ${ts.provider?.name || 'N/A'}`);
      console.log(`  Date Range: ${ts.startDate.toISOString().split('T')[0]} to ${ts.endDate.toISOString().split('T')[0]}`);
      console.log(`  Entries: ${ts.entries.length}`);
      console.log(`  Is BCBA: ${ts.isBCBA || false}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
