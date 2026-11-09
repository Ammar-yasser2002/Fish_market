const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const allTrxs = await prisma.transaction.findMany();
  const allRealCash = await prisma.cashEntry.findMany({
    where: {
      type: { in: ['buyer_debt_repayment', 'buyer_advance_repayment'] },
      NOT: {
        OR: [
          { id: { startsWith: 'CASH-REC-' } },
          { performedBy: { contains: 'استعادة تلقائية' } }
        ]
      }
    }
  });

  const buyers = new Set(allTrxs.map(t => (t.buyerName || '').trim()).filter(Boolean));

  for (const bName of buyers) {
    const bTrxs = allTrxs.filter(t => (t.buyerName || '').trim() === bName);
    const bCash = allRealCash.filter(c => (c.contactName || '').trim() === bName);

    const totalRealCash = bCash.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalPosPaid = bTrxs.reduce((sum, t) => sum + (t.settlementType !== 'association_credit' && t.paidAtPosBuyerAmount ? t.paidAtPosBuyerAmount : 0), 0);
    const totalCurrentPaidInTrxs = bTrxs.reduce((sum, t) => sum + (t.buyerPaidAmount || 0), 0);

    const excess = totalCurrentPaidInTrxs - (totalPosPaid + totalRealCash);
    if (excess > 1) {
      console.log(`========================================`);
      console.log(`Buyer: "${bName}" | Real Cash: ${totalRealCash} | Excess: ${excess}`);
      console.log('Real cash entries:');
      for (const c of bCash) {
        console.log(`  ${c.id} | ${c.dateStr} | ${c.amount} | target: ${c.transactionId || 'none'}`);
      }
      console.log('Transactions:');
      for (const t of bTrxs) {
        console.log(`  ${t.id} | ${t.dateStr} | total: ${t.totalFromBuyer} | paid: ${t.buyerPaidAmount} | debt: ${t.buyerRemainingDebt}`);
      }
    }
  }

  await prisma.$disconnect();
}
main();

