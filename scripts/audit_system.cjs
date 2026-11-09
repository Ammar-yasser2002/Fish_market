const path = require('path');
const fs = require('fs');

// Attempt to load node:sqlite
let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  console.error('node:sqlite not available in this node version:', e.message);
  process.exit(1);
}

const dbPath = path.join(__dirname, '..', 'data', 'market.db');
console.log('=== SYSTEM PRE-DELIVERY HEALTH CHECK & AUDIT ===');
console.log('Database Path:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

console.log('\n--- 1. SQLITE INTEGRITY & STRUCTURE AUDIT ---');
// 1.1 Integrity Check
const integrity = db.prepare('PRAGMA integrity_check;').all();
console.log('PRAGMA integrity_check result:', JSON.stringify(integrity));

// 1.2 Quick Check
const quick = db.prepare('PRAGMA quick_check;').all();
console.log('PRAGMA quick_check result:', JSON.stringify(quick));

// 1.3 Pragma settings
const journalMode = db.prepare('PRAGMA journal_mode;').all();
console.log('PRAGMA journal_mode:', JSON.stringify(journalMode));

const foreignKeys = db.prepare('PRAGMA foreign_keys;').all();
console.log('PRAGMA foreign_keys:', JSON.stringify(foreignKeys));

const synchronous = db.prepare('PRAGMA synchronous;').all();
console.log('PRAGMA synchronous:', JSON.stringify(synchronous));

// 1.4 Indexes Check
const indexes = db.prepare("SELECT tbl_name, name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL;").all();
console.log('Existing Custom Indexes count:', indexes.length);
indexes.forEach(idx => console.log(`  - [${idx.tbl_name}] ${idx.name}`));

console.log('\n--- 2. FINANCIAL CONSISTENCY AUDIT ---');
const txRows = db.prepare('SELECT data FROM transactions;').all();
console.log(`Total Transactions in SQLite: ${txRows.length}`);

let totalRecordsChecked = 0;
let eq1Errors = 0; // grossAmount + buyerTaxAmount == totalFromBuyer
let eq2Errors = 0; // buyerPaidAmount + buyerRemainingDebt == totalFromBuyer
let eq3Errors = 0; // harajProfit == buyerTaxAmount + sellerTaxAmount

for (const row of txRows) {
  const t = JSON.parse(row.data);
  totalRecordsChecked++;

  const gross = Number(t.grossAmount || 0);
  const buyerTax = Number(t.buyerTaxAmount || 0);
  const totalBuyer = Number(t.totalFromBuyer || 0);
  const sellerTax = Number(t.sellerTaxAmount || 0);
  const harajProfit = Number(t.harajProfit || 0);
  const paid = Number(t.buyerPaidAmount !== undefined ? t.buyerPaidAmount : (t.paidAmount || 0));
  const remaining = Number(t.buyerRemainingDebt !== undefined ? t.buyerRemainingDebt : (t.remainingDebt || 0));

  // Check 1: gross + buyerTax == totalBuyer (allowing 0.05 rounding diff)
  if (Math.abs((gross + buyerTax) - totalBuyer) > 0.05) {
    eq1Errors++;
    if (eq1Errors <= 3) {
      console.warn(`[Diff EQ1] TX #${t.id}: gross(${gross}) + buyerTax(${buyerTax}) = ${gross + buyerTax} != totalBuyer(${totalBuyer})`);
    }
  }

  // Check 2: paid + remaining == totalBuyer
  if (Math.abs((paid + remaining) - totalBuyer) > 0.05) {
    eq2Errors++;
    if (eq2Errors <= 3) {
      console.warn(`[Diff EQ2] TX #${t.id}: paid(${paid}) + remaining(${remaining}) = ${paid + remaining} != totalBuyer(${totalBuyer})`);
    }
  }

  // Check 3: harajProfit == buyerTax + sellerTax
  if (Math.abs((buyerTax + sellerTax) - harajProfit) > 0.05) {
    eq3Errors++;
    if (eq3Errors <= 3) {
      console.warn(`[Diff EQ3] TX #${t.id}: buyerTax(${buyerTax}) + sellerTax(${sellerTax}) = ${buyerTax + sellerTax} != profit(${harajProfit})`);
    }
  }
}

console.log(`Equation 1 (gross + buyerTax = totalFromBuyer): ${eq1Errors === 0 ? '100% MATCH ✓' : `${eq1Errors} discrepancies`}`);
console.log(`Equation 2 (paid + remaining = totalFromBuyer): ${eq2Errors === 0 ? '100% MATCH ✓' : `${eq2Errors} discrepancies`}`);
console.log(`Equation 3 (buyerTax + sellerTax = harajProfit): ${eq3Errors === 0 ? '100% MATCH ✓' : `${eq3Errors} discrepancies`}`);

console.log('\n--- 3. CASH ENTRIES AUDIT ---');
const cashRows = db.prepare('SELECT data FROM cash_entries;').all();
console.log(`Total Cash Entries: ${cashRows.length}`);
let posCount = 0;
let totalAmount = 0;
for (const r of cashRows) {
  const c = JSON.parse(r.data);
  totalAmount += (c.amount || 0);
  if (c.type === 'inflow') posCount++;
}
console.log(`Total Inflows/Outflows Recorded: ${cashRows.length} entries. Net Sum: ${totalAmount}`);

console.log('\n=== AUDIT FINISHED SUCCESSFULLY ===');
