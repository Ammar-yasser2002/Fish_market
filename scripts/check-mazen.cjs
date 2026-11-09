const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const trx = await prisma.transaction.findUnique({
    where: { id: 'TRX-2611-0272' }
  });
  console.log('--- TRX-2611-0272 ---');
  console.log(trx);

  const mazenTrxs = await prisma.transaction.findMany({
    where: {
      OR: [
        { buyerName: { contains: 'مازن' } },
        { sellerName: { contains: 'مازن' } }
      ]
    }
  });
  console.log('--- All Transactions for Mazen ---');
  for (const t of mazenTrxs) {
    console.log({
      id: t.id,
      buyerId: t.buyerId,
      buyerName: t.buyerName,
      dateStr: t.dateStr,
      timeStr: t.timeStr,
      totalFromBuyer: t.totalFromBuyer,
      settlementType: t.settlementType,
      buyerPaidAmount: t.buyerPaidAmount,
      buyerRemainingDebt: t.buyerRemainingDebt,
      paidAtPosBuyerAmount: t.paidAtPosBuyerAmount,
      paymentStatus: t.paymentStatus,
      isEdited: t.isEdited,
      isResale: t.isResale,
      resoldToTransactionId: t.resoldToTransactionId,
      resoldFromTransactionId: t.resoldFromTransactionId
    });
  }

  const mazenCash = await prisma.cashEntry.findMany({
    where: {
      OR: [
        { contactName: { contains: 'مازن' } },
        { description: { contains: 'مازن' } },
        { transactionId: 'TRX-2611-0272' },
        { referenceId: 'TRX-2611-0272' }
      ]
    }
  });
  console.log('--- All Cash Entries for Mazen ---');
  for (const c of mazenCash) {
    console.log({
      id: c.id,
      amount: c.amount,
      dateStr: c.dateStr,
      type: c.type,
      category: c.category,
      description: c.description,
      performedBy: c.performedBy,
      transactionId: c.transactionId
    });
  }

  // Also check Contacts for Mazen
  const contacts = await prisma.contact.findMany({
    where: { name: { contains: 'مازن' } }
  });
  console.log('--- Contacts for Mazen ---');
  console.log(contacts);

  await prisma.$disconnect();
}

main().catch(console.error);

