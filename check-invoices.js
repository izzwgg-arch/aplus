const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkInvoices() {
  try {
    const invoices = await prisma.invoice.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        deletedAt: true,
        status: true,
        clientId: true,
      }
    });
    
    console.log('Total invoices found:', invoices.length);
    console.log('Recent invoices:');
    invoices.forEach(inv => {
      console.log(JSON.stringify({
        number: inv.invoiceNumber,
        created: inv.createdAt,
        deleted: inv.deletedAt,
        status: inv.status,
      }, null, 2));
    });
    
    const totalCount = await prisma.invoice.count();
    const nonDeletedCount = await prisma.invoice.count({ where: { deletedAt: null } });
    console.log('Total invoices in DB:', totalCount);
    console.log('Non-deleted invoices:', nonDeletedCount);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkInvoices();
