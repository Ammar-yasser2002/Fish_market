const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Transactions for Salem Bakherkhor ---');
  const trxs = await prisma.transaction.findMany({
    where: { buyerName: { contains: 'باخرخور' } },
    orderBy: { timestamp: 'asc' }
  });
  for (const t of trxs) {
    console.log({
      id: t.id,
      dateStr: t.dateStr,
      timeStr: t.timeStr,
      total: t.totalFromBuyer,
      paid: t.buyerPaidAmount,
      debt: t.buyerRemainingDebt,
      status: t.paymentStatus
    });
  }

  console.log('\n--- Cash Entries for Salem Bakherkhor ---');
  const cash = await prisma.cashEntry.findMany({
    where: { contactName: { contains: 'باخرخور' } },
    orderBy: { timestamp: 'asc' }
  });
  for (const c of cash) {
    console.log({
      id: c.id,
      dateStr: c.dateStr,
      timeStr: c.timeStr,
      amount: c.amount,
      target: c.transactionId
    });
  }

  await prisma.$disconnect();
}
main();

