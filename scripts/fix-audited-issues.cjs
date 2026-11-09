const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Fixing Salem Bakherkhor TRX-2611-0343 ---');
  await prisma.transaction.update({
    where: { id: 'TRX-2611-0343' },
    data: {
      buyerPaidAmount: 0,
      buyerRemainingDebt: 45900,
      paymentStatus: 'pending'
    }
  });
  console.log('✓ TRX-2611-0343 restored to: debt = 45,900, paid = 0, status = pending.');

  console.log('\n--- Fixing Saleh Al-Anq TRX-2611-0266 ---');
  // Cap TRX-2611-0266 to 40,800
  await prisma.transaction.update({
    where: { id: 'TRX-2611-0266' },
    data: {
      buyerPaidAmount: 40800,
      buyerRemainingDebt: 0,
      paymentStatus: 'paid'
    }
  });

  // Apply the 200 riyal difference to his unpaid invoice TRX-2611-0327 or next unpaid
  const salehUnpaid = await prisma.transaction.findFirst({
    where: {
      buyerName: { contains: 'العنق' },
      buyerRemainingDebt: { gt: 0 }
    },
    orderBy: { timestamp: 'asc' }
  });

  if (salehUnpaid) {
    const curPaid = salehUnpaid.buyerPaidAmount || 0;
    const curDebt = salehUnpaid.buyerRemainingDebt || 0;
    const newPaid = curPaid + 200;
    const newDebt = Math.max(0, curDebt - 200);
    const newStatus = newDebt === 0 ? 'paid' : 'partial';

    await prisma.transaction.update({
      where: { id: salehUnpaid.id },
      data: {
        buyerPaidAmount: newPaid,
        buyerRemainingDebt: newDebt,
        paymentStatus: newStatus
      }
    });
    console.log(`✓ Applied 200 excess to ${salehUnpaid.id}: new paid = ${newPaid}, new debt = ${newDebt}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

