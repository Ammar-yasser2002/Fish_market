import test from 'node:test';
import assert from 'node:assert/strict';

import { dedupeTransactionCashEntries, findUnlinkedRepaymentForTransaction, reconcileStartupCashEntries, removeTransactionLinkedCashEntries } from '../src/utils/cashEntrySync';
import { getTransactionBuyerDebt, normalizeBuyerDebtFields } from '../src/utils/calculations';

test('getTransactionBuyerDebt does not hide pending debt when buyerRemainingDebt is stale zero', () => {
  assert.equal(getTransactionBuyerDebt({
    paymentStatus: 'pending',
    settlementType: 'association_credit',
    buyerRemainingDebt: 0,
    buyerPaidAmount: 0,
    totalFromBuyer: 102000,
  } as any), 102000);
});

test('getTransactionBuyerDebt returns zero for fully paid transactions', () => {
  assert.equal(getTransactionBuyerDebt({
    paymentStatus: 'paid',
    settlementType: 'association_credit',
    buyerRemainingDebt: 102000,
    buyerPaidAmount: 102000,
    totalFromBuyer: 102000,
  } as any), 0);
});

test('normalizeBuyerDebtFields repairs multiple stale buyer records and persists corrections', () => {
  const result = normalizeBuyerDebtFields([
    {
      id: 'buyer-a',
      paymentStatus: 'paid',
      settlementType: 'association_credit',
      buyerRemainingDebt: 0,
      buyerPaidAmount: 0,
      totalFromBuyer: 50000,
    },
    {
      id: 'buyer-b',
      paymentStatus: 'partial',
      settlementType: 'association_credit',
      buyerRemainingDebt: 0,
      buyerPaidAmount: 10000,
      totalFromBuyer: 50000,
    },
  ] as any[]);

  assert.equal(result.hasChanges, true);
  assert.equal(result.updatedTrxs[0].buyerRemainingDebt, 50000);
  assert.equal(result.updatedTrxs[0].paymentStatus, 'pending');
  assert.equal(result.updatedTrxs[1].buyerRemainingDebt, 40000);
  assert.equal(result.updatedTrxs[1].paymentStatus, 'partial');
});

test('getTransactionBuyerDebt recovers association-credit debt even when old data says paid with no payment', () => {
  assert.equal(getTransactionBuyerDebt({
    paymentStatus: 'paid',
    settlementType: 'association_credit',
    buyerRemainingDebt: 0,
    buyerPaidAmount: 0,
    paidAtPosBuyerAmount: 0,
    totalFromBuyer: 102000,
  } as any), 102000);
});

test('dedupeTransactionCashEntries preserves multiple buyer repayment vouchers and deduplicates other linked types', () => {
  const entries = [
    {
      id: 'old-repay-1',
      type: 'buyer_debt_repayment',
      category: 'سداد دين مشتري',
      amount: 10000,
      description: 'سداد دين المشتري: أحمد #TRX-7',
      transactionId: 'TRX-7',
      referenceId: 'TRX-7',
      timestamp: 1,
      dateStr: '2026-10-24',
      timeStr: '09:00',
    },
    {
      id: 'old-repay-2',
      type: 'buyer_debt_repayment',
      category: 'سداد دين مشتري',
      amount: 10000,
      description: 'سداد دين المشتري: أحمد #TRX-7',
      transactionId: 'TRX-7',
      referenceId: 'TRX-7',
      timestamp: 2,
      dateStr: '2026-10-24',
      timeStr: '09:01',
    },
    {
      id: 'payout-1',
      type: 'seller_payout',
      category: 'تسليم مستحقات صياد',
      amount: 7000,
      description: 'تسليم مستحقات الصياد: علي - الفاتورة #TRX-7',
      transactionId: 'TRX-7',
      referenceId: 'TRX-7',
      timestamp: 3,
      dateStr: '2026-10-24',
      timeStr: '09:02',
    },
    {
      id: 'other-entry',
      type: 'expense',
      category: 'مصاريف',
      amount: 500,
      description: 'مبلغ مستقل',
      timestamp: 4,
      dateStr: '2026-10-24',
      timeStr: '09:03',
    },
  ] as any;

  const sanitized = dedupeTransactionCashEntries(entries, 'TRX-7');

  assert.equal(sanitized.filter((e) => e.type === 'buyer_debt_repayment').length, 2);
  assert.equal(sanitized.filter((e) => e.type === 'seller_payout').length, 1);
  assert.equal(sanitized.filter((e) => e.id === 'other-entry').length, 1);
});

test('startup reconciliation preserves multiple repayment vouchers for Omar-style partial payments', () => {
  const entries = [
    { id: 'omar-repay-1', type: 'buyer_debt_repayment', transactionId: 'OMAR-TX-1', amount: 20000, timestamp: 3 } ,
    { id: 'omar-repay-2', type: 'buyer_debt_repayment', transactionId: 'OMAR-TX-1', amount: 30000, timestamp: 4 },
  ] as any;

  const result = reconcileStartupCashEntries(entries, []);

  assert.equal(result.kept.filter((entry) => entry.type === 'buyer_debt_repayment').length, 2);
  assert.deepEqual(result.removed, []);
});

test('removeTransactionLinkedCashEntries clears all linked repayment entries when a transaction is removed or reverted', () => {
  const entries = [
    {
      id: 'repay-1',
      type: 'buyer_debt_repayment',
      category: 'سداد دين مشتري',
      amount: 10000,
      description: 'سداد دين المشتري: أحمد #TRX-10',
      transactionId: 'TRX-10',
      referenceId: 'TRX-10',
      timestamp: 1,
      dateStr: '2026-10-24',
      timeStr: '09:00',
    },
    {
      id: 'other',
      type: 'deposit',
      category: 'إيداع',
      amount: 2000,
      description: 'إيداع عادي',
      timestamp: 2,
      dateStr: '2026-10-24',
      timeStr: '09:01',
    },
  ] as any;

  const sanitized = removeTransactionLinkedCashEntries(entries, 'TRX-10');

  assert.deepEqual(sanitized.map((e) => e.id), ['other']);
});

test('findUnlinkedRepaymentForTransaction recovers one legacy repayment by buyer and previous paid amount', () => {
  const entry = {
    id: 'legacy-repay',
    type: 'buyer_debt_repayment',
    category: 'سداد دين مشتري',
    amount: 1107000,
    description: 'سداد دين المشتري: أحمد',
    contactId: 'buyer-1',
    contactName: 'أحمد',
    timestamp: 1,
    dateStr: '2026-10-24',
    timeStr: '09:00',
  } as any;

  assert.deepEqual(
    findUnlinkedRepaymentForTransaction([entry], {
      buyerId: 'buyer-1',
      buyerName: 'أحمد',
      previousPaidAmount: 1107000,
    }),
    [entry]
  );
});

test('findUnlinkedRepaymentForTransaction leaves ambiguous unlinked repayments untouched', () => {
  const entries = ['repay-1', 'repay-2'].map((id) => ({
    id,
    type: 'buyer_debt_repayment',
    category: 'سداد دين مشتري',
    amount: 1107000,
    description: 'سداد دين المشتري: أحمد',
    contactId: 'buyer-1',
    contactName: 'أحمد',
    timestamp: 1,
    dateStr: '2026-10-24',
    timeStr: '09:00',
  })) as any;

  assert.deepEqual(
    findUnlinkedRepaymentForTransaction(entries, {
      buyerId: 'buyer-1',
      buyerName: 'أحمد',
      previousPaidAmount: 1107000,
    }),
    []
  );
});

test('reconcileStartupCashEntries preserves settled buyer repayment vouchers', () => {
  const entry = {
    id: 'repay-102000',
    type: 'buyer_debt_repayment',
    category: 'سداد دين مشتري',
    amount: 102000,
    description: 'سداد دين المشتري: ابراهيم الشبار (سداد فاتورة/شروة #TRX-2610-0004)',
    contactId: 'buyer-1',
    contactName: 'ابراهيم الشبار',
    transactionId: 'TRX-2610-0004',
    referenceId: 'TRX-2610-0004',
    timestamp: 1792789884859,
    dateStr: '2026/10/24',
    timeStr: '12:11 ص',
    payoutMethod: 'cash',
    repaymentMethod: 'cash',
  } as any;

  const result = reconcileStartupCashEntries([entry], [{
    id: 'TRX-2610-0004',
    settlementType: 'association_credit',
    buyerRemainingDebt: 0,
    buyerPaidAmount: 102000,
    totalFromBuyer: 102000,
  }]);

  assert.deepEqual(result.kept.map((item) => item.id), ['repay-102000']);
  assert.deepEqual(result.removed, []);
});

test('reconcileStartupCashEntries restores a missing settled debt repayment voucher', () => {
  const result = reconcileStartupCashEntries([], [{
    id: 'TRX-2610-0004',
    timestamp: 1792788717604,
    dateStr: '2026/10/23',
    timeStr: '11:51 م',
    buyerId: 'contact-1792783184303',
    buyerName: 'ابراهيم الشبار',
    settlementType: 'association_credit',
    buyerPaidAmount: 102000,
    paidAtPosBuyerAmount: 0,
    buyerRemainingDebt: 0,
  }]);

  assert.equal(result.recovered.length, 1);
  assert.equal(result.recovered[0].amount, 102000);
  assert.equal(result.recovered[0].transactionId, 'TRX-2610-0004');
  assert.equal(result.kept.length, 1);
});
