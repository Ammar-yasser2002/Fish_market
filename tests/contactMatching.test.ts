import test from 'node:test';
import assert from 'node:assert/strict';

import { isExactContactMatch, isTransactionSellerMatchForBuyer } from '../src/utils/contactMatching';

test('same buyer and seller name is not treated as a sale by that buyer', () => {
  const buyer = { id: 'A1', name: 'احمد علي سالم' };
  const trx = {
    buyerId: 'A1',
    buyerName: 'احمد علي سالم',
    sellerId: 'A1',
    sellerName: 'احمد علي سالم',
  };

  assert.equal(isExactContactMatch(trx.sellerId, trx.sellerName, buyer.id, buyer.name), true);
  assert.equal(isExactContactMatch(trx.buyerId, trx.buyerName, buyer.id, buyer.name), true);
  assert.equal(isTransactionSellerMatchForBuyer(trx, buyer), false);
});

test('distinct same-name entries are not matched by substring when the identity differs', () => {
  const buyer = { id: 'B2', name: 'علي' };
  const trx = {
    buyerId: 'X9',
    buyerName: 'علي محمد',
    sellerId: 'B2',
    sellerName: 'علي',
  };

  assert.equal(isExactContactMatch(trx.sellerId, trx.sellerName, buyer.id, buyer.name), true);
  assert.equal(isExactContactMatch(trx.buyerId, trx.buyerName, buyer.id, buyer.name), false);
  assert.equal(isTransactionSellerMatchForBuyer(trx, buyer), true);
});
