import assert from 'node:assert/strict';
import test from 'node:test';
import { CashEntry } from '../src/types';
import { calculateDayClosingStats, calculateDrawerCash, calculateInventoryDrawerBalance, calculateNewCustody, getTodayLocalYMD } from '../src/utils/calculations';

function entry(id: string, type: CashEntry['type'], amount: number, payoutMethod?: CashEntry['payoutMethod']): CashEntry {
  return {
    id,
    timestamp: Date.now(),
    dateStr: getTodayLocalYMD(),
    timeStr: '12:00 م',
    type,
    category: type === 'opening' ? 'عهدة صباحية' : 'مصروف اختبار',
    amount,
    description: 'مصروف اختبار',
    payoutMethod,
  };
}

test('exchange expenses remain in expense totals but do not reduce the cash drawer', () => {
  const entries = [
    entry('opening', 'opening', 1000),
    entry('exchange-expense', 'expense', 100, 'exchange'),
    entry('cash-expense', 'expense', 50, 'cash'),
  ];

  const drawer = calculateDrawerCash(entries, [], true);
  assert.equal(drawer.expenses, 150);
  assert.equal(drawer.exchangeExpenses, 100);
  assert.equal(drawer.totalCashOut, 50);
  assert.equal(drawer.currentDrawerBalance, 950);

  const closing = calculateDayClosingStats(getTodayLocalYMD(), entries, [], []);
  assert.equal(closing.totalExpenses, 150);
  assert.equal(closing.exchangeExpenses, 100);
  assert.equal(closing.systemCalculatedBalance, 950);
});

test('exchange repayments do not count as cash deposits in the drawer', () => {
  const entries = [
    entry('opening', 'opening', 1000),
    {
      ...entry('exchange-repayment', 'deposit', 200),
      repaymentMethod: 'exchange' as const,
      exchangeName: 'صرافة الاختبار',
    },
  ];

  const drawer = calculateDrawerCash(entries, [], true);
  assert.equal(drawer.deposits, 0);
  assert.equal(drawer.totalCashIn, 1000);
  assert.equal(drawer.currentDrawerBalance, 1000);
});

test('current-day custody uses live entries instead of a stale saved closing amount', () => {
  const entriesCustody = 1015500;
  const staleSavedCustody = 1005800;

  assert.equal(calculateNewCustody(entriesCustody, staleSavedCustody, true), 1015500);
});

test('historical custody continues to use its saved closing value', () => {
  assert.equal(calculateNewCustody(1015500, 1005800, false), 1005800);
});

test('saved custody is a fallback when current-day entries are unavailable', () => {
  assert.equal(calculateNewCustody(0, 1005800, true), 1005800);
});

test('today inventory card uses the same canonical balance as the drawer card', () => {
  const entries = [entry('opening', 'opening', 1015500)];
  const inventoryBalance = calculateInventoryDrawerBalance(
    1005800,
    entries,
    [],
    [],
    getTodayLocalYMD(),
    true
  );

  assert.equal(inventoryBalance, 1015500);
});

test('historical inventory card keeps its saved detailed balance', () => {
  assert.equal(calculateInventoryDrawerBalance(1005800, [], [], [], '2026-10-23', false), 1005800);
});