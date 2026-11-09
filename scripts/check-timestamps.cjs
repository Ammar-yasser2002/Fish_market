const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const trx = await prisma.transaction.findUnique({
    where: { id: 'TRX-2611-0272' }
  });
  console.log('TRX-2611-0272 timestamp:', new Date(Number(trx.timestamp)).toISOString(), trx.timeStr);
  console.log('TRX-2611-0272 editedAt:', new Date(Number(trx.editedAt)).toISOString());

  const c = await prisma.cashEntry.findUnique({
    where: { id: 'CASH-040564' }
  });
  console.log('CASH-040564 timestamp:', new Date(Number(c.timestamp)).toISOString(), c.timeStr);

  const c100 = await prisma.cashEntry.findUnique({
    where: { id: 'CASH-749165' }
  });
  console.log('CASH-749165 timestamp:', new Date(Number(c100.timestamp)).toISOString(), c100.timeStr);

  await prisma.$disconnect();
}
main();

