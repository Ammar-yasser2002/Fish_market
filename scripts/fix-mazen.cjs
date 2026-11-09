const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.cashEntry.findUnique({
    where: { id: 'CASH-040564' }
  });
  console.log('Current CASH-040564:', c.amount, c.description);

  // Update CASH-040564 to 29132
  await prisma.cashEntry.update({
    where: { id: 'CASH-040564' },
    data: {
      amount: 29132,
      data: {
        ...c.data,
        amount: 29132
      }
    }
  });

  console.log('Updated CASH-040564 to 29,132 YER.');

  // Check TRX-2611-0272
  const trx = await prisma.transaction.findUnique({
    where: { id: 'TRX-2611-0272' }
  });
  console.log('TRX-2611-0272:', {
    id: trx.id,
    buyerName: trx.buyerName,
    totalFromBuyer: trx.totalFromBuyer,
    buyerPaidAmount: trx.buyerPaidAmount,
    buyerRemainingDebt: trx.buyerRemainingDebt,
    paymentStatus: trx.paymentStatus
  });

  await prisma.$disconnect();
}
main();

