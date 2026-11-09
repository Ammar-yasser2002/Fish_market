const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deepAudit() {
  console.log('====================================================');
  console.log('       فحص شامل وعميق لكافة سجلات وحسابات النظام    ');
  console.log('====================================================\n');

  const allTrxs = await prisma.transaction.findMany();
  const allCash = await prisma.cashEntry.findMany();
  const allContacts = await prisma.contact.findMany();

  console.log(`عدد الفواتير الإجمالي: ${allTrxs.length}`);
  console.log(`عدد الحركات النقدية الإجمالي: ${allCash.length}`);
  console.log(`عدد جهات الاتصال: ${allContacts.length}\n`);

  // 1. فحص وجود أي سندات وهمية
  const fakeEntries = allCash.filter(c =>
    (c.id && c.id.startsWith('CASH-REC-')) ||
    (c.performedBy && c.performedBy.includes('استعادة تلقائية')) ||
    (c.description && c.description.includes('استعادة تلقائية'))
  );
  if (fakeEntries.length > 0) {
    console.error(`🚨 تحذير: تم العثور على ${fakeEntries.length} سندات وهمية!`);
  } else {
    console.log('✓ 1. سلامة السندات: لا توجد أي سندات وهمية (CASH-REC) نهائياً في النظام.');
  }

  // 2. فحص النزاهة الرياضية لكل فاتورة على حدة
  const trxMathIssues = [];
  for (const t of allTrxs) {
    const total = Number(t.totalFromBuyer) || 0;
    const paid = Number(t.buyerPaidAmount) || 0;
    const debt = Number(t.buyerRemainingDebt) || 0;
    const posPaid = (t.settlementType !== 'association_credit' && t.paidAtPosBuyerAmount) ? Number(t.paidAtPosBuyerAmount) : 0;

    // هل المجموع يطابق الإجمالي؟
    if (Math.abs(total - (paid + debt)) > 1) {
      trxMathIssues.push({
        id: t.id,
        buyerName: t.buyerName,
        total,
        paid,
        debt,
        diff: total - (paid + debt)
      });
    }

    // هل الحالة متناسقة مع الدين؟
    if (debt === 0 && t.paymentStatus !== 'paid' && t.paymentStatus !== 'settled') {
      trxMathIssues.push({ id: t.id, buyerName: t.buyerName, issue: `الدين 0 لكن الحالة ${t.paymentStatus}` });
    }
    if (debt > 0 && debt === total && t.paymentStatus === 'paid') {
      trxMathIssues.push({ id: t.id, buyerName: t.buyerName, issue: `الدين كامل لكن الحالة مسددة paid` });
    }
  }

  if (trxMathIssues.length > 0) {
    console.log(`⚠️ فواتير بها خلل رياضي أو عدم اتساق الحالة (${trxMathIssues.length}):`);
    console.log(trxMathIssues);
  } else {
    console.log('✓ 2. سلامة الفواتير: جميع الفواتير متسقة رياضياً 100% (المسدد + المتبقي = الإجمالي).');
  }

  // 3. فحص ومطابقة كل مشتري على حدة (كاش الصندوق مقابل ديون الفواتير)
  console.log('\n--- 3. فحص مطابقة حساب كل مشتري (الكاش المقبوض vs ديون الفواتير) ---');
  
  // استخراج أسماء المشترين الفريدة
  const buyerNames = [...new Set(allTrxs.map(t => (t.buyerName || '').trim()).filter(Boolean))];
  
  const buyerDiscrepancies = [];

  for (const bName of buyerNames) {
    const bTrxs = allTrxs.filter(t => (t.buyerName || '').trim().toLowerCase() === bName.toLowerCase());
    const bCash = allCash.filter(c =>
      (c.type === 'buyer_debt_repayment' || c.type === 'buyer_advance_repayment') &&
      (c.contactName || '').trim().toLowerCase() === bName.toLowerCase()
    );

    const totalInvoiced = bTrxs.reduce((sum, t) => sum + (Number(t.totalFromBuyer) || 0), 0);
    const totalPosPaid = bTrxs.reduce((sum, t) => sum + ((t.settlementType !== 'association_credit' && t.paidAtPosBuyerAmount) ? Number(t.paidAtPosBuyerAmount) : 0), 0);
    const totalRecordedPaid = bTrxs.reduce((sum, t) => sum + (Number(t.buyerPaidAmount) || 0), 0);
    const totalRecordedDebt = bTrxs.reduce((sum, t) => sum + (Number(t.buyerRemainingDebt) || 0), 0);

    const totalRealCashRepaid = bCash.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // المبلغ المسدد من الشروات بخلاف كاش نقطة البيع
    const repaidInTrxs = totalRecordedPaid - totalPosPaid;

    // الفارق بين ما دخل الصندوق كسندات سداد وبين ما تم تسجيله كمدفوع في الفواتير
    const cashVsTrxDiff = totalRealCashRepaid - repaidInTrxs;

    // الفارق بين إجمالي الفواتير وبين (المسدد بالصندوق + المتبقي)
    const expectedDebt = Math.max(0, totalInvoiced - totalPosPaid - totalRealCashRepaid);
    const debtDiff = totalRecordedDebt - expectedDebt;

    if (Math.abs(cashVsTrxDiff) > 1 || Math.abs(debtDiff) > 1) {
      buyerDiscrepancies.push({
        buyerName: bName,
        totalInvoiced,
        totalPosPaid,
        totalRecordedPaid,
        totalRecordedDebt,
        totalRealCashRepaid,
        cashEntriesCount: bCash.length,
        cashVsTrxDiff,
        expectedDebt,
        debtDiff,
        cashEntries: bCash.map(c => ({ id: c.id, amount: c.amount, dateStr: c.dateStr, target: c.transactionId }))
      });
    }
  }

  if (buyerDiscrepancies.length === 0) {
    console.log('✓ مذهل: جميع حسابات المشترين (بلا استثناء) مطابقة 100% بين كاش الصندوق وفواتير الشروات!');
  } else {
    console.log(`⚠️ تم العثور على ${buyerDiscrepancies.length} مشترين بحاجة إلى تدقيق ومطابقة:`);
    for (const d of buyerDiscrepancies) {
      console.log('----------------------------------------------------');
      console.log(`المشتري: "${d.buyerName}"`);
      console.log(`  إجمالي الشروات المطلوبة: ${d.totalInvoiced}`);
      console.log(`  المسدد كاش فوري في الحراج: ${d.totalPosPaid}`);
      console.log(`  سندات السداد المقبوضة بالصندوق: ${d.totalRealCashRepaid} (${d.cashEntriesCount} سند)`);
      console.log(`  المسدد المقيد بالفواتير: ${d.totalRecordedPaid}`);
      console.log(`  المتبقي ديناً المقيد بالفواتير: ${d.totalRecordedDebt}`);
      console.log(`  الدين الحقيقي المحسوب: ${d.expectedDebt}`);
      console.log(`  الفارق بين الكاش والفواتير: ${d.cashVsTrxDiff}`);
      console.log('  السندات النقدية المسجلة له:', d.cashEntries);
    }
  }

  await prisma.$disconnect();
}

deepAudit().catch(console.error);

