import { CashEntry } from '../types';

const LINKED_TRANSACTION_ENTRY_TYPES = new Set<CashEntry['type']>([
  'seller_payout',
  'buyer_debt_repayment',
  'buyer_advance_repayment',
  'seller_advance_repayment',
]);

const normalizeText = (value?: string) => (value ?? '').trim().toLowerCase();

export function isTransactionLinkedCashEntry(
  entry: Pick<CashEntry, 'type' | 'transactionId' | 'referenceId' | 'description'>,
  transactionId: string
): boolean {
  if (!transactionId) return false;
  const txId = normalizeText(transactionId);
  if (!txId || !LINKED_TRANSACTION_ENTRY_TYPES.has(entry.type)) return false;

  const refValues = [entry.transactionId, entry.referenceId]
    .filter(Boolean)
    .map((value) => normalizeText(value));
  const summary = normalizeText(entry.description);

  return (
    refValues.includes(txId) ||
    summary.includes(txId) ||
    summary.includes(`#${txId}`) ||
    summary.includes(`رقم ${txId}`)
  );
}

export function removeTransactionLinkedCashEntries(entries: CashEntry[], transactionId: string): CashEntry[] {
  if (!transactionId) return entries;
  return entries.filter((entry) => !isTransactionLinkedCashEntry(entry, transactionId));
}

export function findUnlinkedRepaymentForTransaction(
  entries: CashEntry[],
  transaction: { buyerId?: string; buyerName?: string; previousPaidAmount: number }
): CashEntry[] {
  if (transaction.previousPaidAmount <= 0) return [];

  const buyerId = normalizeText(transaction.buyerId);
  const buyerName = normalizeText(transaction.buyerName);
  const matches = entries.filter((entry) => {
    if (entry.type !== 'buyer_debt_repayment' || entry.transactionId || entry.referenceId) return false;
    const sameBuyer = buyerId
      ? normalizeText(entry.contactId) === buyerId
      : buyerName && normalizeText(entry.contactName) === buyerName;
    return sameBuyer && Math.abs(entry.amount - transaction.previousPaidAmount) < 0.01;
  });

  return matches.length === 1 ? matches : [];
}

export function dedupeTransactionCashEntries(entries: CashEntry[], transactionId: string): CashEntry[] {
  return dedupeTransactionCashEntriesWithRemoved(entries, transactionId).kept;
}

export function dedupeTransactionCashEntriesWithRemoved(
  entries: CashEntry[],
  transactionId: string
): { kept: CashEntry[]; removed: CashEntry[] } {
  if (!transactionId) return { kept: entries, removed: [] };

  const linkedEntries = entries.filter((entry) => isTransactionLinkedCashEntry(entry, transactionId));
  if (linkedEntries.some((entry) => entry.type === 'buyer_debt_repayment')) {
    return { kept: entries, removed: [] };
  }
  if (linkedEntries.length <= 1) return { kept: entries, removed: [] };

  const keepByType = new Map<CashEntry['type'], CashEntry>();
  const orderedLinked = [...linkedEntries].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  for (const entry of orderedLinked) {
    if (!keepByType.has(entry.type)) {
      keepByType.set(entry.type, entry);
    }
  }

  const keepIds = new Set(Array.from(keepByType.values()).map((entry) => entry.id));
  const kept: CashEntry[] = [];
  const removed: CashEntry[] = [];

  for (const entry of entries) {
    if (!isTransactionLinkedCashEntry(entry, transactionId) || keepIds.has(entry.id)) {
      kept.push(entry);
    } else {
      removed.push(entry);
    }
  }

  return { kept, removed };
}

export function reconcileStartupCashEntries(
  entries: CashEntry[],
  transactions: {
    id: string;
    dateStr?: string;
    timeStr?: string;
    timestamp?: number;
    buyerId?: string;
    buyerName?: string;
    settlementType?: string;
    buyerRemainingDebt?: number;
    buyerPaidAmount?: number;
    paidAtPosBuyerAmount?: number;
    totalFromBuyer?: number;
  }[]
): { kept: CashEntry[]; removed: CashEntry[]; recovered: CashEntry[] } {
  const seenLinkedByType = new Map<string, CashEntry>();
  const kept: CashEntry[] = [];
  const removed: CashEntry[] = [];
  const recovered: CashEntry[] = [];

  // Sort newest first so we favor recent entries
  const sorted = [...entries].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  for (const entry of sorted) {
    // إزالة وتطهير أي سندات استعادة تلقائية وهمية (CASH-REC-) منعاً لتكرار السندات أو تضخيم الصندوق
    if (
      entry.id.startsWith('CASH-REC-') ||
      entry.performedBy === 'استعادة تلقائية للنظام' ||
      (entry.description && entry.description.includes('(استعادة تلقائية لسداد فاتورة/شروة'))
    ) {
      removed.push(entry);
      continue;
    }

    const rawTxId = (entry.transactionId || entry.referenceId || '').toLowerCase().trim();

    // Prevent duplicate linked entries of the same type for the same transaction.
    // Never remove a repayment entry merely because its transaction is settled:
    // buyer_debt_repayment entries represent real cash that entered the drawer,
    // and deleting them at startup changes the historical cash balance.
    if (
      rawTxId &&
      LINKED_TRANSACTION_ENTRY_TYPES.has(entry.type) &&
      entry.type !== 'buyer_debt_repayment' &&
      entry.type !== 'buyer_advance_repayment'
    ) {
      const key = `${rawTxId}:${entry.type}`;
      if (seenLinkedByType.has(key)) {
        removed.push(entry);
        continue;
      }
      seenLinkedByType.set(key, entry);
    }

    kept.push(entry);
  }

  // لا نقوم إطلاقاً بتوليد أي سندات سداد وهمية من فواتير الآجل تلقائياً
  return { kept, removed, recovered };
}
