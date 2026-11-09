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
  console.log(`Found ${recEntries.length} fake CASH-REC entries in database.`);
  let totalAmount = 0;
  for (const e of recEntries) {
    totalAmount += e.amount || 0;
    console.log(`${e.id} | ${e.dateStr} | ${e.amount} | ${e.contactName} | ${e.transactionId}`);
  }
  console.log(`Total fake cash added by CASH-REC: ${totalAmount}`);
  await prisma.$disconnect();
}
main();

