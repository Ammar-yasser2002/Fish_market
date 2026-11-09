const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.cashEntry.findUnique({
    where: { id: 'CASH-040564' }
  });
  console.log('--- CASH-040564 ---');
  console.log(c);
  await prisma.$disconnect();
}
main();

