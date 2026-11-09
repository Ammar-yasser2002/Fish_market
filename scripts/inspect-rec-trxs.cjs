const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const recEntries = await prisma.cashEntry.findMany({
    where: {
      OR: [
        { id: { startsWith: 'CASH-REC-' } },
        { performedBy: { contains: 'استعادة تلقائية' } }
      ]
    }
  });

  const trxIds = [...new Set(recEntries.map(e => e.transactionId || e.referenceId).filter(Boolean))];
  const trxs = await prisma.transaction.findMany({
    where: { id: { in: trxIds } }
  });

  console.log(`Found ${trxs.length} transactions that had CASH-REC.`);
  let countRestored = 0;
  for (const t of trxs) {
    // If settlementType is association_credit and paidAtPosBuyerAmount is 0 or less than totalFromBuyer
    const initialPos = (t.settlementType !== 'association_credit' && t.paidAtPosBuyerAmount) ? t.paidAtPosBuyerAmount : 0;
    const invTotal = t.totalFromBuyer || 0;
    console.log(`TRX ${t.id} (${t.buyerName}): total=${invTotal}, paid=${t.buyerPaidAmount}, debt=${t.buyerRemainingDebt}, posPaid=${initialPos}`);
  }

  await prisma.$disconnect();
}
main();

