import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import {
  CashDayCloseRecord,
  CashEntry,
  Contact,
  FishType,
  MarketSettings,
  Transaction,
} from '../types';

// Global serialization fix for BigInt in JSON.stringify
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

const DATA_DIR = process.env.FISHE_DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function safeNumber(val: any, fallback = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function formatTransaction(tx: any): Transaction {
  const baseData = tx.data && typeof tx.data === 'object' ? tx.data : {};
  return {
    ...baseData,
    id: tx.id,
    dateStr: tx.dateStr || baseData.dateStr || '',
    timeStr: tx.timeStr || baseData.timeStr || '',
    timestamp: tx.timestamp ? Number(tx.timestamp) : (baseData.timestamp || Date.now()),
    sellerId: tx.sellerId || baseData.sellerId || '',
    sellerName: tx.sellerName || baseData.sellerName || '',
    sellerPhone: tx.sellerPhone || baseData.sellerPhone,
    buyerId: tx.buyerId || baseData.buyerId || '',
    buyerName: tx.buyerName || baseData.buyerName || '',
    buyerPhone: tx.buyerPhone || baseData.buyerPhone,
    grossAmount: safeNumber(tx.grossAmount ?? baseData.grossAmount),
    buyerTaxRate: safeNumber(tx.buyerTaxRate ?? baseData.buyerTaxRate, 0.02),
    buyerTaxAmount: safeNumber(tx.buyerTaxAmount ?? baseData.buyerTaxAmount),
    totalFromBuyer: safeNumber(tx.totalFromBuyer ?? baseData.totalFromBuyer),
    sellerTaxRate: safeNumber(tx.sellerTaxRate ?? baseData.sellerTaxRate, 0.03),
    sellerTaxAmount: safeNumber(tx.sellerTaxAmount ?? baseData.sellerTaxAmount),
    netToSeller: safeNumber(tx.netToSeller ?? baseData.netToSeller),
    harajProfit: safeNumber(tx.harajProfit ?? baseData.harajProfit),
    paymentStatus: tx.paymentStatus || baseData.paymentStatus || 'unpaid',
    settlementType: tx.settlementType || baseData.settlementType || 'association_cash',
    buyerPaidAmount: tx.buyerPaidAmount !== null && tx.buyerPaidAmount !== undefined ? safeNumber(tx.buyerPaidAmount) : baseData.buyerPaidAmount,
    paidAtPosBuyerAmount: tx.paidAtPosBuyerAmount !== null && tx.paidAtPosBuyerAmount !== undefined ? safeNumber(tx.paidAtPosBuyerAmount) : baseData.paidAtPosBuyerAmount,
    buyerRemainingDebt: tx.buyerRemainingDebt !== null && tx.buyerRemainingDebt !== undefined ? safeNumber(tx.buyerRemainingDebt) : baseData.buyerRemainingDebt,
    buyerAdvanceUsed: tx.buyerAdvanceUsed !== null && tx.buyerAdvanceUsed !== undefined ? safeNumber(tx.buyerAdvanceUsed) : baseData.buyerAdvanceUsed,
    sellerPaidAmount: tx.sellerPaidAmount !== null && tx.sellerPaidAmount !== undefined ? safeNumber(tx.sellerPaidAmount) : baseData.sellerPaidAmount,
    paidAtPosAmount: tx.paidAtPosAmount !== null && tx.paidAtPosAmount !== undefined ? safeNumber(tx.paidAtPosAmount) : baseData.paidAtPosAmount,
    sellerRemainingDebt: tx.sellerRemainingDebt !== null && tx.sellerRemainingDebt !== undefined ? safeNumber(tx.sellerRemainingDebt) : baseData.sellerRemainingDebt,
    sellerPaidStatus: tx.sellerPaidStatus || baseData.sellerPaidStatus,
    sellerPayoutMethod: tx.sellerPayoutMethod || baseData.sellerPayoutMethod,
    sellerExchangeName: tx.sellerExchangeName || baseData.sellerExchangeName,
    isEdited: tx.isEdited !== null && tx.isEdited !== undefined ? Boolean(tx.isEdited) : Boolean(baseData.isEdited),
    editedAt: tx.editedAt ? Number(tx.editedAt) : baseData.editedAt,
    editedDateStr: tx.editedDateStr || baseData.editedDateStr,
    isTransferred: tx.isTransferred !== null && tx.isTransferred !== undefined ? Boolean(tx.isTransferred) : Boolean(baseData.isTransferred),
    transferredFromBuyerName: tx.transferredFromBuyerName || baseData.transferredFromBuyerName,
    transferredAt: tx.transferredAt ? Number(tx.transferredAt) : baseData.transferredAt,
    isResale: tx.isResale !== null && tx.isResale !== undefined ? Boolean(tx.isResale) : Boolean(baseData.isResale),
    resaleSurplus: tx.resaleSurplus !== null && tx.resaleSurplus !== undefined ? safeNumber(tx.resaleSurplus) : baseData.resaleSurplus,
    resoldFromTransactionId: tx.resoldFromTransactionId || baseData.resoldFromTransactionId,
    wasResold: tx.wasResold !== null && tx.wasResold !== undefined ? Boolean(tx.wasResold) : Boolean(baseData.wasResold),
    resoldToTransactionId: tx.resoldToTransactionId || baseData.resoldToTransactionId,
    resoldToBuyerName: tx.resoldToBuyerName || baseData.resoldToBuyerName,
    resoldPaymentStatus: tx.resoldPaymentStatus || baseData.resoldPaymentStatus,
    notes: tx.notes || baseData.notes,
    items: Array.isArray(tx.items) && tx.items.length > 0
      ? tx.items.map((i: any) => {
          const rawItem = Array.isArray(baseData.items)
            ? baseData.items.find((bi: any) => bi.id === i.id || bi.fishName === i.fishName)
            : null;
          const rawQty = rawItem && rawItem.quantity !== undefined
            ? rawItem.quantity
            : (typeof i.quantity === 'string' ? i.quantity : safeNumber(i.quantity));
          return {
            id: i.id,
            fishTypeId: i.fishTypeId || '',
            fishName: i.fishName || '',
            quantity: rawQty,
            unit: i.unit || '',
            unitPrice: safeNumber(i.unitPrice),
            totalGross: safeNumber(i.totalGross),
          };
        })
      : (Array.isArray(baseData.items) ? baseData.items : []),
  };
}

function formatContact(c: any): Contact {
  const baseData = c.data && typeof c.data === 'object' ? c.data : {};
  return {
    ...baseData,
    id: c.id,
    name: c.name,
    type: c.type,
    phone: c.phone || baseData.phone,
    taxNumber: c.taxNumber || baseData.taxNumber,
    role: c.role || baseData.role,
    dailyWage: c.dailyWage !== null && c.dailyWage !== undefined ? safeNumber(c.dailyWage) : baseData.dailyWage,
    notes: c.notes || baseData.notes,
    createdAt: c.createdAt || baseData.createdAt || '',
  };
}

function formatFishType(f: any): FishType {
  const baseData = f.data && typeof f.data === 'object' ? f.data : {};
  return {
    ...baseData,
    id: f.id,
    name: f.name,
    arabicName: f.arabicName || baseData.arabicName || f.name,
    defaultUnit: f.defaultUnit || baseData.defaultUnit || 'kg',
    unitLabel: f.unitLabel || baseData.unitLabel || 'كيلو',
    estimatedPricePerUnit: f.estimatedPricePerUnit !== null && f.estimatedPricePerUnit !== undefined ? safeNumber(f.estimatedPricePerUnit) : baseData.estimatedPricePerUnit,
    category: f.category || baseData.category,
    popular: f.popular !== null && f.popular !== undefined ? Boolean(f.popular) : (baseData.popular ?? true),
  };
}

function formatCashEntry(ce: any): CashEntry {
  const baseData = ce.data && typeof ce.data === 'object' ? ce.data : {};
  return {
    ...baseData,
    id: ce.id,
    timestamp: ce.timestamp ? Number(ce.timestamp) : (baseData.timestamp || Date.now()),
    dateStr: ce.dateStr || baseData.dateStr || '',
    timeStr: ce.timeStr || baseData.timeStr || '',
    type: ce.type || baseData.type,
    category: ce.category || baseData.category || '',
    amount: safeNumber(ce.amount ?? baseData.amount),
    description: ce.description || baseData.description || '',
    performedBy: ce.performedBy || baseData.performedBy,
    referenceId: ce.referenceId || baseData.referenceId,
    contactId: ce.contactId || baseData.contactId,
    contactName: ce.contactName || baseData.contactName,
    transactionId: ce.transactionId || baseData.transactionId,
    payoutMethod: ce.payoutMethod || baseData.payoutMethod,
    repaymentMethod: ce.repaymentMethod || baseData.repaymentMethod,
    exchangeName: ce.exchangeName || baseData.exchangeName,
  };
}

function formatCashClosing(cc: any): CashDayCloseRecord {
  const baseData = cc.data && typeof cc.data === 'object' ? cc.data : {};
  return {
    ...baseData,
    id: cc.id,
    timestamp: cc.timestamp ? Number(cc.timestamp) : (baseData.timestamp || Date.now()),
    dateStr: cc.dateStr || baseData.dateStr || '',
    timeStr: cc.timeStr || baseData.timeStr || '',
    openingBalance: safeNumber(cc.openingBalance ?? baseData.openingBalance),
    totalDeposits: safeNumber(cc.totalDeposits ?? baseData.totalDeposits),
    totalExpenses: safeNumber(cc.totalExpenses ?? baseData.totalExpenses),
    totalWithdrawals: safeNumber(cc.totalWithdrawals ?? baseData.totalWithdrawals),
    harajCashSales: cc.harajCashSales !== null && cc.harajCashSales !== undefined ? safeNumber(cc.harajCashSales) : baseData.harajCashSales,
    harajSellerPayouts: cc.harajSellerPayouts !== null && cc.harajSellerPayouts !== undefined ? safeNumber(cc.harajSellerPayouts) : baseData.harajSellerPayouts,
    buyerDebtRepayments: cc.buyerDebtRepayments !== null && cc.buyerDebtRepayments !== undefined ? safeNumber(cc.buyerDebtRepayments) : baseData.buyerDebtRepayments,
    buyerDebtExchangeRepayments: cc.buyerDebtExchangeRepayments !== null && cc.buyerDebtExchangeRepayments !== undefined ? safeNumber(cc.buyerDebtExchangeRepayments) : baseData.buyerDebtExchangeRepayments,
    sellerExchangePayouts: cc.sellerExchangePayouts !== null && cc.sellerExchangePayouts !== undefined ? safeNumber(cc.sellerExchangePayouts) : baseData.sellerExchangePayouts,
    officeExpenses: cc.officeExpenses !== null && cc.officeExpenses !== undefined ? safeNumber(cc.officeExpenses) : baseData.officeExpenses,
    associationProfits: cc.associationProfits !== null && cc.associationProfits !== undefined ? safeNumber(cc.associationProfits) : baseData.associationProfits,
    systemCalculatedBalance: safeNumber(cc.systemCalculatedBalance ?? baseData.systemCalculatedBalance),
    actualCountedCash: safeNumber(cc.actualCountedCash ?? baseData.actualCountedCash),
    difference: safeNumber(cc.difference ?? baseData.difference),
    notes: cc.notes || baseData.notes,
  };
}

export const localDb = {
  // Stats & Info
  async getStats() {
    let txCount = 0;
    let contactsCount = 0;
    let fishCount = 0;
    let cashCount = 0;
    let closingsCount = 0;

    try {
      [txCount, contactsCount, fishCount, cashCount, closingsCount] = await Promise.all([
        prisma.transaction.count(),
        prisma.contact.count(),
        prisma.fishType.count(),
        prisma.cashEntry.count(),
        prisma.cashDayCloseRecord.count(),
      ]);
    } catch (e) {
      console.warn('Could not query counts from PostgreSQL:', e);
    }

    const maskedUrl = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@')
      : 'PostgreSQL Server';

    return {
      type: 'PostgreSQL (Prisma ORM)',
      dbPath: maskedUrl,
      fileSize: 0,
      fileSizeBytes: 0,
      fileSizeFormatted: 'PostgreSQL Engine',
      mode: 'ACID PostgreSQL Multi-User Connection',
      status: 'active_postgresql',
      counts: {
        transactions: txCount,
        contacts: contactsCount,
        fishTypes: fishCount,
        cashEntries: cashCount,
        cashClosings: closingsCount,
      },
    };
  },

  // Transactions
  async getAllTransactions(limit = 2000): Promise<Transaction[]> {
    const rows = await prisma.transaction.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
      include: { items: true },
    });
    return rows.map((r) => formatTransaction(r));
  },

  async saveTransaction(tx: Transaction): Promise<void> {
    const txId = tx.id;
    const ts = BigInt(tx.timestamp || Date.now());
    const txDataPayload = {
      ...(tx.data && typeof tx.data === 'object' ? tx.data : {}),
      ...tx,
    };
    delete (txDataPayload as any).data;

    // 1. Upsert the transaction record
    await prisma.transaction.upsert({
      where: { id: txId },
      create: {
        id: txId,
        dateStr: tx.dateStr || '',
        timeStr: tx.timeStr || '',
        timestamp: ts,
        sellerId: tx.sellerId || null,
        sellerName: tx.sellerName || '',
        sellerPhone: tx.sellerPhone || null,
        buyerId: tx.buyerId || null,
        buyerName: tx.buyerName || '',
        buyerPhone: tx.buyerPhone || null,
        grossAmount: safeNumber(tx.grossAmount),
        buyerTaxRate: tx.buyerTaxRate !== undefined ? safeNumber(tx.buyerTaxRate) : null,
        buyerTaxAmount: safeNumber(tx.buyerTaxAmount),
        totalFromBuyer: safeNumber(tx.totalFromBuyer),
        sellerTaxRate: tx.sellerTaxRate !== undefined ? safeNumber(tx.sellerTaxRate) : null,
        sellerTaxAmount: safeNumber(tx.sellerTaxAmount),
        netToSeller: safeNumber(tx.netToSeller),
        harajProfit: safeNumber(tx.harajProfit),
        paymentStatus: tx.paymentStatus || 'unpaid',
        settlementType: tx.settlementType || 'association_cash',
        buyerPaidAmount: tx.buyerPaidAmount !== undefined ? safeNumber(tx.buyerPaidAmount) : null,
        paidAtPosBuyerAmount: tx.paidAtPosBuyerAmount !== undefined ? safeNumber(tx.paidAtPosBuyerAmount) : null,
        buyerRemainingDebt: tx.buyerRemainingDebt !== undefined ? safeNumber(tx.buyerRemainingDebt) : null,
        buyerAdvanceUsed: tx.buyerAdvanceUsed !== undefined ? safeNumber(tx.buyerAdvanceUsed) : null,
        sellerPaidAmount: tx.sellerPaidAmount !== undefined ? safeNumber(tx.sellerPaidAmount) : null,
        paidAtPosAmount: tx.paidAtPosAmount !== undefined ? safeNumber(tx.paidAtPosAmount) : null,
        sellerRemainingDebt: tx.sellerRemainingDebt !== undefined ? safeNumber(tx.sellerRemainingDebt) : null,
        sellerPaidStatus: tx.sellerPaidStatus || null,
        sellerPayoutMethod: tx.sellerPayoutMethod || null,
        sellerExchangeName: tx.sellerExchangeName || null,
        isEdited: Boolean(tx.isEdited),
        editedAt: tx.editedAt ? BigInt(tx.editedAt) : null,
        editedDateStr: tx.editedDateStr || null,
        isTransferred: Boolean(tx.isTransferred),
        transferredFromBuyerName: tx.transferredFromBuyerName || null,
        transferredAt: tx.transferredAt ? BigInt(tx.transferredAt) : null,
        isResale: Boolean(tx.isResale),
        resaleSurplus: tx.resaleSurplus !== undefined ? safeNumber(tx.resaleSurplus) : null,
        resoldFromTransactionId: tx.resoldFromTransactionId || null,
        wasResold: Boolean(tx.wasResold),
        resoldToTransactionId: tx.resoldToTransactionId || null,
        resoldToBuyerName: tx.resoldToBuyerName || null,
        resoldPaymentStatus: tx.resoldPaymentStatus || null,
        notes: tx.notes || null,
        data: txDataPayload as any,
      },
      update: {
        dateStr: tx.dateStr || '',
        timeStr: tx.timeStr || '',
        timestamp: ts,
        sellerId: tx.sellerId || null,
        sellerName: tx.sellerName || '',
        sellerPhone: tx.sellerPhone || null,
        buyerId: tx.buyerId || null,
        buyerName: tx.buyerName || '',
        buyerPhone: tx.buyerPhone || null,
        grossAmount: safeNumber(tx.grossAmount),
        buyerTaxRate: tx.buyerTaxRate !== undefined ? safeNumber(tx.buyerTaxRate) : null,
        buyerTaxAmount: safeNumber(tx.buyerTaxAmount),
        totalFromBuyer: safeNumber(tx.totalFromBuyer),
        sellerTaxRate: tx.sellerTaxRate !== undefined ? safeNumber(tx.sellerTaxRate) : null,
        sellerTaxAmount: safeNumber(tx.sellerTaxAmount),
        netToSeller: safeNumber(tx.netToSeller),
        harajProfit: safeNumber(tx.harajProfit),
        paymentStatus: tx.paymentStatus || 'unpaid',
        settlementType: tx.settlementType || 'association_cash',
        buyerPaidAmount: tx.buyerPaidAmount !== undefined ? safeNumber(tx.buyerPaidAmount) : null,
        paidAtPosBuyerAmount: tx.paidAtPosBuyerAmount !== undefined ? safeNumber(tx.paidAtPosBuyerAmount) : null,
        buyerRemainingDebt: tx.buyerRemainingDebt !== undefined ? safeNumber(tx.buyerRemainingDebt) : null,
        buyerAdvanceUsed: tx.buyerAdvanceUsed !== undefined ? safeNumber(tx.buyerAdvanceUsed) : null,
        sellerPaidAmount: tx.sellerPaidAmount !== undefined ? safeNumber(tx.sellerPaidAmount) : null,
        paidAtPosAmount: tx.paidAtPosAmount !== undefined ? safeNumber(tx.paidAtPosAmount) : null,
        sellerRemainingDebt: tx.sellerRemainingDebt !== undefined ? safeNumber(tx.sellerRemainingDebt) : null,
        sellerPaidStatus: tx.sellerPaidStatus || null,
        sellerPayoutMethod: tx.sellerPayoutMethod || null,
        sellerExchangeName: tx.sellerExchangeName || null,
        isEdited: Boolean(tx.isEdited),
        editedAt: tx.editedAt ? BigInt(tx.editedAt) : null,
        editedDateStr: tx.editedDateStr || null,
        isTransferred: Boolean(tx.isTransferred),
        transferredFromBuyerName: tx.transferredFromBuyerName || null,
        transferredAt: tx.transferredAt ? BigInt(tx.transferredAt) : null,
        isResale: Boolean(tx.isResale),
        resaleSurplus: tx.resaleSurplus !== undefined ? safeNumber(tx.resaleSurplus) : null,
        resoldFromTransactionId: tx.resoldFromTransactionId || null,
        wasResold: Boolean(tx.wasResold),
        resoldToTransactionId: tx.resoldToTransactionId || null,
        resoldToBuyerName: tx.resoldToBuyerName || null,
        resoldPaymentStatus: tx.resoldPaymentStatus || null,
        notes: tx.notes || null,
        data: txDataPayload as any,
      },
    });

    // 2. Synchronize items safely to avoid unique constraint collisions
    await prisma.transactionItem.deleteMany({
      where: { transactionId: txId },
    });

    if (Array.isArray(tx.items) && tx.items.length > 0) {
      await prisma.transactionItem.createMany({
        data: tx.items.map((item, idx) => ({
          id: `${txId}_item_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          transactionId: txId,
          fishTypeId: item.fishTypeId || null,
          fishName: item.fishName || '',
          quantity: safeNumber(item.quantity, 1),
          unit: item.unit || '',
          unitPrice: safeNumber(item.unitPrice),
          totalGross: safeNumber(item.totalGross),
        })),
      });
    }
  },

  async deleteTransaction(id: string): Promise<void> {
    await prisma.transaction.delete({ where: { id } });
  },

  // Contacts
  async getAllContacts(): Promise<Contact[]> {
    const rows = await prisma.contact.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => formatContact(r));
  },

  async saveContact(c: Contact): Promise<void> {
    await prisma.contact.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone || null,
        taxNumber: c.taxNumber || null,
        role: c.role || null,
        dailyWage: c.dailyWage !== undefined ? safeNumber(c.dailyWage) : null,
        notes: c.notes || null,
        createdAt: c.createdAt || new Date().toISOString(),
        data: c as any,
      },
      update: {
        name: c.name,
        type: c.type,
        phone: c.phone || null,
        taxNumber: c.taxNumber || null,
        role: c.role || null,
        dailyWage: c.dailyWage !== undefined ? safeNumber(c.dailyWage) : null,
        notes: c.notes || null,
        createdAt: c.createdAt || new Date().toISOString(),
        data: c as any,
      },
    });
  },

  async deleteContact(id: string): Promise<void> {
    await prisma.contact.delete({ where: { id } });
  },

  // Fish Types
  async getAllFishTypes(): Promise<FishType[]> {
    const rows = await prisma.fishType.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => formatFishType(r));
  },

  async saveFishType(f: FishType): Promise<void> {
    await prisma.fishType.upsert({
      where: { id: f.id },
      create: {
        id: f.id,
        name: f.name,
        arabicName: f.arabicName || f.name,
        defaultUnit: f.defaultUnit || 'kg',
        unitLabel: f.unitLabel || 'كيلو',
        estimatedPricePerUnit: f.estimatedPricePerUnit !== undefined ? safeNumber(f.estimatedPricePerUnit) : null,
        category: f.category || null,
        popular: f.popular !== undefined ? Boolean(f.popular) : true,
        data: f as any,
      },
      update: {
        name: f.name,
        arabicName: f.arabicName || f.name,
        defaultUnit: f.defaultUnit || 'kg',
        unitLabel: f.unitLabel || 'كيلو',
        estimatedPricePerUnit: f.estimatedPricePerUnit !== undefined ? safeNumber(f.estimatedPricePerUnit) : null,
        category: f.category || null,
        popular: f.popular !== undefined ? Boolean(f.popular) : true,
        data: f as any,
      },
    });
  },

  async deleteFishType(id: string): Promise<void> {
    await prisma.fishType.delete({ where: { id } });
  },

  // Cash Entries
  async getAllCashEntries(limit = 2000): Promise<CashEntry[]> {
    const rows = await prisma.cashEntry.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
    return rows.map((r) => formatCashEntry(r));
  },

  async saveCashEntry(entry: CashEntry): Promise<void> {
    const ts = BigInt(entry.timestamp || Date.now());
    await prisma.cashEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        timestamp: ts,
        dateStr: entry.dateStr || '',
        timeStr: entry.timeStr || '',
        type: entry.type,
        category: entry.category,
        amount: safeNumber(entry.amount),
        description: entry.description || null,
        performedBy: entry.performedBy || null,
        referenceId: entry.referenceId || null,
        contactId: entry.contactId || null,
        contactName: entry.contactName || null,
        transactionId: entry.transactionId || null,
        payoutMethod: entry.payoutMethod || null,
        repaymentMethod: entry.repaymentMethod || null,
        exchangeName: entry.exchangeName || null,
        data: entry as any,
      },
      update: {
        timestamp: ts,
        dateStr: entry.dateStr || '',
        timeStr: entry.timeStr || '',
        type: entry.type,
        category: entry.category,
        amount: safeNumber(entry.amount),
        description: entry.description || null,
        performedBy: entry.performedBy || null,
        referenceId: entry.referenceId || null,
        contactId: entry.contactId || null,
        contactName: entry.contactName || null,
        transactionId: entry.transactionId || null,
        payoutMethod: entry.payoutMethod || null,
        repaymentMethod: entry.repaymentMethod || null,
        exchangeName: entry.exchangeName || null,
        data: entry as any,
      },
    });
  },

  async deleteCashEntry(id: string): Promise<void> {
    await prisma.cashEntry.delete({ where: { id } });
  },

  // Cash Closings
  async getAllCashClosings(limit = 1000): Promise<CashDayCloseRecord[]> {
    const rows = await prisma.cashDayCloseRecord.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
    return rows.map((r) => formatCashClosing(r));
  },

  async saveCashClosing(closing: CashDayCloseRecord): Promise<void> {
    const ts = BigInt(closing.timestamp || Date.now());
    await prisma.cashDayCloseRecord.upsert({
      where: { id: closing.id },
      create: {
        id: closing.id,
        timestamp: ts,
        dateStr: closing.dateStr || '',
        timeStr: closing.timeStr || '',
        openingBalance: safeNumber(closing.openingBalance),
        totalDeposits: safeNumber(closing.totalDeposits),
        totalExpenses: safeNumber(closing.totalExpenses),
        totalWithdrawals: safeNumber(closing.totalWithdrawals),
        harajCashSales: closing.harajCashSales !== undefined ? safeNumber(closing.harajCashSales) : null,
        harajSellerPayouts: closing.harajSellerPayouts !== undefined ? safeNumber(closing.harajSellerPayouts) : null,
        buyerDebtRepayments: closing.buyerDebtRepayments !== undefined ? safeNumber(closing.buyerDebtRepayments) : null,
        buyerDebtExchangeRepayments: closing.buyerDebtExchangeRepayments !== undefined ? safeNumber(closing.buyerDebtExchangeRepayments) : null,
        sellerExchangePayouts: closing.sellerExchangePayouts !== undefined ? safeNumber(closing.sellerExchangePayouts) : null,
        officeExpenses: closing.officeExpenses !== undefined ? safeNumber(closing.officeExpenses) : null,
        associationProfits: closing.associationProfits !== undefined ? safeNumber(closing.associationProfits) : null,
        systemCalculatedBalance: safeNumber(closing.systemCalculatedBalance),
        actualCountedCash: safeNumber(closing.actualCountedCash),
        difference: safeNumber(closing.difference),
        notes: closing.notes || null,
        data: closing as any,
      },
      update: {
        timestamp: ts,
        dateStr: closing.dateStr || '',
        timeStr: closing.timeStr || '',
        openingBalance: safeNumber(closing.openingBalance),
        totalDeposits: safeNumber(closing.totalDeposits),
        totalExpenses: safeNumber(closing.totalExpenses),
        totalWithdrawals: safeNumber(closing.totalWithdrawals),
        harajCashSales: closing.harajCashSales !== undefined ? safeNumber(closing.harajCashSales) : null,
        harajSellerPayouts: closing.harajSellerPayouts !== undefined ? safeNumber(closing.harajSellerPayouts) : null,
        buyerDebtRepayments: closing.buyerDebtRepayments !== undefined ? safeNumber(closing.buyerDebtRepayments) : null,
        buyerDebtExchangeRepayments: closing.buyerDebtExchangeRepayments !== undefined ? safeNumber(closing.buyerDebtExchangeRepayments) : null,
        sellerExchangePayouts: closing.sellerExchangePayouts !== undefined ? safeNumber(closing.sellerExchangePayouts) : null,
        officeExpenses: closing.officeExpenses !== undefined ? safeNumber(closing.officeExpenses) : null,
        associationProfits: closing.associationProfits !== undefined ? safeNumber(closing.associationProfits) : null,
        systemCalculatedBalance: safeNumber(closing.systemCalculatedBalance),
        actualCountedCash: safeNumber(closing.actualCountedCash),
        difference: safeNumber(closing.difference),
        notes: closing.notes || null,
        data: closing as any,
      },
    });
  },

  // Settings
  async getSettings(): Promise<MarketSettings | null> {
    try {
      const row = await prisma.setting.findUnique({
        where: { key: 'global' },
      });
      if (row && row.data) {
        const settingsData = row.data as unknown as MarketSettings;
        settingsData.marketName = settingsData.marketName || 'سوق عين بامعبد المركزي';
        settingsData.subTitle = (settingsData.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة');
        settingsData.location = settingsData.location || 'م/شبوه/رضوم/ عين بامعبد';
        settingsData.contactPhone = settingsData.contactPhone || '782191112';
        if (!settingsData.currency || settingsData.currency === 'ر.س' || settingsData.currency === 'SAR') {
          settingsData.currency = 'ريال يمني';
        }
        return settingsData;
      }
    } catch (e) {
      console.warn('Error reading settings from PostgreSQL:', e);
    }
    return null;
  },

  async saveSettings(settings: MarketSettings): Promise<void> {
    await prisma.setting.upsert({
      where: { key: 'global' },
      create: {
        key: 'global',
        data: settings as any,
      },
      update: {
        data: settings as any,
      },
    });
  },

  // Bulk sync all data
  async syncAllData(payload: {
    transactions?: Transaction[];
    contacts?: Contact[];
    fishTypes?: FishType[];
    cashEntries?: CashEntry[];
    cashClosings?: CashDayCloseRecord[];
    settings?: MarketSettings;
  }) {
    if (payload.settings) await this.saveSettings(payload.settings);
    if (payload.fishTypes) for (const f of payload.fishTypes) await this.saveFishType(f);
    if (payload.contacts) for (const c of payload.contacts) await this.saveContact(c);
    if (payload.transactions) for (const t of payload.transactions) await this.saveTransaction(t);
    if (payload.cashEntries) for (const ce of payload.cashEntries) await this.saveCashEntry(ce);
    if (payload.cashClosings) for (const cc of payload.cashClosings) await this.saveCashClosing(cc);

    const stats = await this.getStats();
    return { success: true, stats };
  },

  // Smart Merge Backup: دمج ذكي بدون مسح البيانات السابقة ومع منع التكرار
  async smartMergeData(payload: {
    transactions?: Transaction[];
    contacts?: Contact[];
    fishTypes?: FishType[];
    cashEntries?: CashEntry[];
    cashClosings?: CashDayCloseRecord[];
    settings?: MarketSettings;
    importSettings?: boolean;
  }) {
    let txAdded = 0;
    let txSkipped = 0;
    let contactsAdded = 0;
    let contactsSkipped = 0;
    let fishAdded = 0;
    let fishSkipped = 0;
    let cashAdded = 0;
    let cashSkipped = 0;
    let closingsAdded = 0;
    let closingsSkipped = 0;

    // 1. Transactions: Skip if already exists
    if (payload.transactions && Array.isArray(payload.transactions)) {
      for (const tx of payload.transactions) {
        if (!tx || !tx.id) continue;
        const exists = await prisma.transaction.findUnique({ where: { id: tx.id } });
        if (!exists) {
          await this.saveTransaction(tx);
          txAdded++;
        } else {
          txSkipped++;
        }
      }
    }

    // 2. Contacts: deduplicate by id or (name + type)
    if (payload.contacts && Array.isArray(payload.contacts)) {
      for (const c of payload.contacts) {
        if (!c || !c.name) continue;
        const exists = await prisma.contact.findFirst({
          where: {
            OR: [
              { id: c.id },
              { name: c.name, type: c.type },
            ],
          },
        });
        if (!exists) {
          await this.saveContact(c);
          contactsAdded++;
        } else {
          contactsSkipped++;
        }
      }
    }

    // 3. Fish Types: deduplicate by id or name
    if (payload.fishTypes && Array.isArray(payload.fishTypes)) {
      for (const f of payload.fishTypes) {
        if (!f || !f.name) continue;
        const exists = await prisma.fishType.findFirst({
          where: {
            OR: [
              { id: f.id },
              { name: f.name },
            ],
          },
        });
        if (!exists) {
          await this.saveFishType(f);
          fishAdded++;
        } else {
          fishSkipped++;
        }
      }
    }

    // 4. Cash Entries: Skip if already exists
    if (payload.cashEntries && Array.isArray(payload.cashEntries)) {
      for (const ce of payload.cashEntries) {
        if (!ce || !ce.id) continue;
        const exists = await prisma.cashEntry.findUnique({ where: { id: ce.id } });
        if (!exists) {
          await this.saveCashEntry(ce);
          cashAdded++;
        } else {
          cashSkipped++;
        }
      }
    }

    // 5. Cash Closings: Skip if already exists
    if (payload.cashClosings && Array.isArray(payload.cashClosings)) {
      for (const cc of payload.cashClosings) {
        if (!cc || !cc.id) continue;
        const exists = await prisma.cashDayCloseRecord.findUnique({ where: { id: cc.id } });
        if (!exists) {
          await this.saveCashClosing(cc);
          closingsAdded++;
        } else {
          closingsSkipped++;
        }
      }
    }

    // 6. Settings: only if requested
    if (payload.importSettings && payload.settings) {
      await this.saveSettings(payload.settings);
    }

    const stats = await this.getStats();
    return {
      success: true,
      mode: 'smart_merge_postgresql',
      stats: {
        txAdded,
        txSkipped,
        contactsAdded,
        contactsSkipped,
        fishAdded,
        fishSkipped,
        cashAdded,
        cashSkipped,
        closingsAdded,
        closingsSkipped,
        dbStats: stats,
      },
    };
  },

  // Clear all data
  async clearAll() {
    await prisma.$transaction([
      prisma.transactionItem.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.contact.deleteMany(),
      prisma.fishType.deleteMany(),
      prisma.cashEntry.deleteMany(),
      prisma.cashDayCloseRecord.deleteMany(),
    ]);
    return { success: true };
  },
};
