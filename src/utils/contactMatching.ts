import { Contact, Transaction } from '../types';

function normalizeContactName(value?: string): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

export function isExactContactMatch(
  contactId?: string,
  contactName?: string,
  targetId?: string,
  targetName?: string
): boolean {
  const currentId = (contactId || '').trim().toLowerCase();
  const targetIdNorm = (targetId || '').trim().toLowerCase();
  const currentName = normalizeContactName(contactName || '');
  const targetNameNorm = normalizeContactName(targetName || '');

  if (currentId && targetIdNorm && currentId === targetIdNorm) return true;
  if (currentName && targetNameNorm && currentName === targetNameNorm) return true;

  return false;
}

export function isTransactionSellerMatchForBuyer(
  transaction: Pick<Transaction, 'buyerId' | 'buyerName' | 'sellerId' | 'sellerName'>,
  buyer: Pick<Contact, 'id' | 'name'>
): boolean {
  const isSameBuyer = isExactContactMatch(transaction.buyerId, transaction.buyerName, buyer.id, buyer.name);
  const isSameSeller = isExactContactMatch(transaction.sellerId, transaction.sellerName, buyer.id, buyer.name);

  return isSameSeller && !isSameBuyer;
}
