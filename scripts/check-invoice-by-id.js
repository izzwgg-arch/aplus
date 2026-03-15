const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoiceId = process.argv[2] || 'cmkwujz9900do13mk536pc07b';
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { 
        entries: { 
          take: 2
        } 
      }
    });
    
    if (!invoice) {
      console.log('Invoice not found');
      return;
    }
    
    console.log('Invoice found:', invoice.invoiceNumber);
    console.log('Deleted:', invoice.deletedAt ? 'YES' : 'NO');
    console.log('Status:', invoice.status);
    console.log('Total Amount:', invoice.totalAmount.toString());
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
