const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Step 1: Deleting all fake CASH-REC entries ---');
  const deleteResult = await prisma.cashEntry.deleteMany({
    where: {
      OR: [
        { id: { startsWith: 'CASH-REC-' } },
        { performedBy: { contains: 'استعادة تلقائية' } },
        { description: { contains: 'استعادة تلقائية لسداد فاتورة/شروة' } }
      ]
    }
  });
  console.log(`Successfully deleted ${deleteResult.count} fake CASH-REC cash entries.`);

  console.log('--- Step 2: Checking Real Repayments ---');
  const realCash = await prisma.cashEntry.findMany({
    where: {
      type: { in: ['buyer_debt_repayment', 'buyer_advance_repayment'] }
    }
  });
  console.log(`Total real repayments remaining: ${realCash.length}`);

  // Fetch all transactions
  const allTrxs = await prisma.transaction.findMany();
  console.log(`Total transactions in DB: ${allTrxs.length}`);

  // Specifically check Fahad Bamusallam
  const fahadTrxs = allTrxs.filter(t => (t.buyerName || '').includes('فهد'));
  console.log('--- Fahad Transactions before restore ---');
  for (const t of fahadTrxs) {
    console.log(`${t.id} | total: ${t.totalFromBuyer} | paid: ${t.buyerPaidAmount} | debt: ${t.buyerRemainingDebt} | status: ${t.paymentStatus}`);
  }

  // Restore transactions that were closed only by CASH-REC
  // For each transaction that is association_credit and has buyerRemainingDebt === 0 or buyerPaidAmount > 0
  let restoredCount = 0;
  for (const t of allTrxs) {
    if (t.settlementType === 'association_credit') {
      // Check if there is a real cash entry explicitly targeting this transaction
      const directRealRepayment = realCash.filter(c => c.transactionId === t.id || c.referenceId === t.id);
      const totalDirectPaid = directRealRepayment.reduce((sum, c) => sum + (c.amount || 0), 0);

      // In addition, if it's TRX-2611-0332 for Fahad, the 300,000 CASH-805071 was intended for it:
      // Wait, let's see which transactions have direct repayments
      if (directRealRepayment.length > 0) {
        const newPaid = totalDirectPaid;
        const newDebt = Math.max(0, (t.totalFromBuyer || 0) - newPaid);
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
          restoredCount++;
        }
      }
    }
  }

  console.log(`Step 2 completed. Restored ${restoredCount} directly targeted transactions.`);
  await prisma.$disconnect();
}
main();

