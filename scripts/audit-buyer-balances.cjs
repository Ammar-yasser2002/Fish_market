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

  // Group by buyer name
  const buyers = new Set(allTrxs.map(t => (t.buyerName || '').trim()).filter(Boolean));

  for (const bName of buyers) {
    const bTrxs = allTrxs.filter(t => (t.buyerName || '').trim() === bName);
    const bCash = allRealCash.filter(c => (c.contactName || '').trim() === bName);

    const totalRealCash = bCash.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalInvoiced = bTrxs.reduce((sum, t) => sum + (t.totalFromBuyer || 0), 0);
    const totalPosPaid = bTrxs.reduce((sum, t) => sum + (t.settlementType !== 'association_credit' && t.paidAtPosBuyerAmount ? t.paidAtPosBuyerAmount : 0), 0);
    const totalCurrentPaidInTrxs = bTrxs.reduce((sum, t) => sum + (t.buyerPaidAmount || 0), 0);
    const totalCurrentDebtInTrxs = bTrxs.reduce((sum, t) => sum + (t.buyerRemainingDebt || 0), 0);

    const maxLegitPaid = Math.min(totalInvoiced, totalPosPaid + totalRealCash);
    const excessPaid = totalCurrentPaidInTrxs - maxLegitPaid;

    if (excessPaid > 1) {
      console.log(`Buyer: "${bName}"`);
      console.log(`  Total Invoiced: ${totalInvoiced}`);
      console.log(`  Real Cash Repayments: ${totalRealCash} (${bCash.length} entries)`);
      console.log(`  POS Paid: ${totalPosPaid}`);
      console.log(`  Current Trx Paid: ${totalCurrentPaidInTrxs}`);
      console.log(`  Current Trx Debt: ${totalCurrentDebtInTrxs}`);
      console.log(`  EXCESS FAKE PAID (debt that was falsely erased): ${excessPaid}`);
    }
  }

  await prisma.$disconnect();
}
main();

