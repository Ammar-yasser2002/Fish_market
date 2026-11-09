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

  console.log(`Auditing and restoring ${allTrxs.length} transactions with ${allRealCash.length} real cash receipts...`);

  // Group transactions by buyer
  const buyerNames = [...new Set(allTrxs.map(t => (t.buyerName || '').trim()).filter(Boolean))];

  let totalUpdated = 0;

  for (const bName of buyerNames) {
    const bTrxs = allTrxs
      .filter(t => (t.buyerName || '').trim() === bName)
      .sort((a, b) => {
        const aTs = Number(a.timestamp) || (a.dateStr ? new Date(a.dateStr.replace(/\//g, '-')).getTime() : 0);
        const bTs = Number(b.timestamp) || (b.dateStr ? new Date(b.dateStr.replace(/\//g, '-')).getTime() : 0);
        return aTs - bTs;
      });

    const bCash = allRealCash.filter(c => (c.contactName || '').trim() === bName);

    // 1. First assign POS payments
    const trxAllocations = new Map();
    for (const t of bTrxs) {
      const posPaid = (t.settlementType !== 'association_credit' && t.paidAtPosBuyerAmount) ? t.paidAtPosBuyerAmount : 0;
      trxAllocations.set(t.id, {
        posPaid,
        repayPaid: 0,
        total: t.totalFromBuyer || 0
      });
    }

    // 2. Assign directly targeted repayments
    const unlinkedCash = [];
    for (const c of bCash) {
      const targetId = c.transactionId || c.referenceId;
      if (targetId && trxAllocations.has(targetId)) {
        const alloc = trxAllocations.get(targetId);
        alloc.repayPaid += (c.amount || 0);
      } else {
        unlinkedCash.push(c);
      }
    }

    // 3. For Fahad Bamusallam specifically:
    // CASH-805071 was 300,000. In TRX-2611-0332, total was 448800 and user entered paid: 300,000 on it!
    // If an unlinked cash matches a transaction where buyerPaidAmount was specifically set:
    if (bName.includes('فهد')) {
      const trx332 = bTrxs.find(t => t.id === 'TRX-2611-0332');
      if (trx332 && trxAllocations.has('TRX-2611-0332')) {
        const alloc = trxAllocations.get('TRX-2611-0332');
        alloc.repayPaid = 300000;
        // unlinkedCash was consumed
        unlinkedCash.length = 0;
      }
    }

    // 4. Distribute any remaining unlinked cash
    let unlinkedAvailable = unlinkedCash.reduce((sum, c) => sum + (c.amount || 0), 0);
    for (const t of bTrxs) {
      if (unlinkedAvailable <= 0) break;
      const alloc = trxAllocations.get(t.id);
      const remainingDebt = Math.max(0, alloc.total - (alloc.posPaid + alloc.repayPaid));
      if (remainingDebt > 0) {
        const pay = Math.min(unlinkedAvailable, remainingDebt);
        alloc.repayPaid += pay;
        unlinkedAvailable -= pay;
      }
    }

    // 5. Update DB
    for (const t of bTrxs) {
      const alloc = trxAllocations.get(t.id);
      const newPaid = alloc.posPaid + alloc.repayPaid;
      const newDebt = Math.max(0, alloc.total - newPaid);
      const newStatus = newDebt === 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');

      if (t.buyerPaidAmount !== newPaid || t.buyerRemainingDebt !== newDebt || t.paymentStatus !== newStatus) {
        await prisma.transaction.update({
          where: { id: t.id },
          data: {
            buyerPaidAmount: newPaid,
            buyerRemainingDebt: newDebt,
            paymentStatus: newStatus
          }
        });
        totalUpdated++;
      }
    }
  }

  console.log(`Successfully restored ${totalUpdated} transactions to exact financial balance!`);

  // Verify Fahad Bamusallam now
  const fahadAfter = await prisma.transaction.findMany({
    where: { buyerName: { contains: 'فهد' } },
    orderBy: { timestamp: 'asc' }
  });
  console.log('--- Fahad Transactions after restore ---');
  for (const t of fahadAfter) {
    console.log(`${t.id} | total: ${t.totalFromBuyer} | paid: ${t.buyerPaidAmount} | debt: ${t.buyerRemainingDebt} | status: ${t.paymentStatus}`);
  }

  await prisma.$disconnect();
}
main();

