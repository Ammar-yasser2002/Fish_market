const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const trxs = await prisma.transaction.findMany({
    where: { buyerName: { contains: 'فهد' } },
    orderBy: { timestamp: 'asc' }
  });
  console.log('--- Transactions for Fahad ---');
  console.log(trxs.map(t => ({
    id: t.id,
    dateStr: t.dateStr,
    timeStr: t.timeStr,
    totalFromBuyer: t.totalFromBuyer,
    buyerPaidAmount: t.buyerPaidAmount,
    buyerRemainingDebt: t.buyerRemainingDebt,
    settlementType: t.settlementType,
    paymentStatus: t.paymentStatus,
    timestamp: t.timestamp
  })));
  
  const cash = await prisma.cashEntry.findMany({
    where: {
      OR: [
        { contactName: { contains: 'فهد' } },
        { description: { contains: 'فهد' } }
      ]
    },
    orderBy: { timestamp: 'asc' }
  });
  console.log('--- Cash Entries for Fahad ---');
  console.log(cash.map(c => ({
    id: c.id,
    amount: c.amount,
    dateStr: c.dateStr,
    timeStr: c.timeStr,
    type: c.type,
    description: c.description,
    performedBy: c.performedBy,
    transactionId: c.transactionId
  })));

  await prisma.$disconnect();
}
main();
