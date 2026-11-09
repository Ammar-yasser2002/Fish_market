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

  const trxIds = recEntries.map(e => e.transactionId || e.referenceId).filter(Boolean);
  const trxs = await prisma.transaction.findMany({
    where: {
      id: { in: trxIds }
    }
  });

  console.log(`Analyzing ${trxs.length} transactions linked to CASH-REC...`);

  // Check how many real cash repayments exist for these trxs
  const realCash = await prisma.cashEntry.findMany({
    where: {
      type: 'buyer_debt_repayment',
      NOT: {
        OR: [
          { id: { startsWith: 'CASH-REC-' } },
          { performedBy: { contains: 'استعادة تلقائية' } }
        ]
      }
    }
  });

  console.log(`Total real cash repayments in DB: ${realCash.length}`);
  for (const rc of realCash) {
    console.log(`Real repayment: ${rc.id} | ${rc.amount} | ${rc.contactName} | ${rc.transactionId} | ${rc.dateStr}`);
  }

  await prisma.$disconnect();
}
main();

