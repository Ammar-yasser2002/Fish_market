export type ContactType = 'seller' | 'buyer' | 'both' | 'worker';

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  phone?: string;
  taxNumber?: string;
  role?: string; // المسمى الوظيفي: أمين صندوق، محاسب، كاتب حراج، عامل تنزيل، دلال، إلخ
  dailyWage?: number; // الأجر اليومي أو الراتب التقديري
  notes?: string;
  createdAt: string;
}

export type FishUnit = 'kg' | 'box' | 'lot' | 'piece' | 'whale';

export interface FishType {
  id: string;
  name: string;
  arabicName: string;
  defaultUnit: FishUnit;
  unitLabel: string; // e.g. "كيلو", "صندوق", "طراد / شلة", "حبة"
  estimatedPricePerUnit?: number;
  category?: string;
  popular?: boolean;
}

export interface TransactionItem {
  id: string;
  fishTypeId: string;
  fishName: string;
  quantity: number | string;
  unit: string;
  unitPrice: number;
  totalGross: number; // quantity * unitPrice (or set directly)
}

export interface Transaction {
  id: string; // e.g. TRX-1001
  timestamp: number;
  dateStr: string; // formatted
  timeStr: string;
  sellerId: string;
  sellerName: string;
  sellerPhone?: string;
  sellerRole?: 'fisherman' | 'seller'; // مسمى الطرف الأول في الفاتورة والطباعة: صياد أو بائع
  buyerId: string;
  buyerName: string;
  buyerPhone?: string;
  items: TransactionItem[];
  grossAmount: number; // المبلغ الأساسي للبيع (مثلاً 1000 ريال)
  buyerTaxRate: number; // 0.02 (2%)
  buyerTaxAmount: number; // 20 ريال
  totalFromBuyer: number; // 1020 ريال
  sellerTaxRate: number; // 0.03 (3%)
  sellerTaxAmount: number; // 30 ريال
  netToSeller: number; // 970 ريال
  harajProfit: number; // 50 ريال (20 + 30)
  paymentStatus: 'paid' | 'pending' | 'settled';
  settlementType?: SettlementType; // طريقة التسوية والمقاصة
  buyerPaidAmount?: number; // المبلغ المدفوع كاش من المشتري وقت العملية
  paidAtPosBuyerAmount?: number; // المبلغ المدفوع نقداً من المشتري وقت نقطة البيع مباشرة
  buyerRemainingDebt?: number; // المتبقي ديناً على المشتري لصالح الجمعية
  buyerAdvanceUsed?: number; // المبلغ المخصوم من رصيد قدمة المشتري
  sellerPaidAmount?: number; // المبلغ المسلم للبائع/الصياد
  paidAtPosAmount?: number; // المبلغ المسلم نقداً للصياد عند نقطة البيع مباشرة
  sellerRemainingDebt?: number; // المتبقي مستحقاً للبائع/الصياد
  sellerPaidStatus?: 'paid' | 'unpaid' | 'partial'; // حالة استلام الصياد
  sellerPayoutMethod?: 'cash' | 'exchange'; // طريقة تسليم وصرف الصافي للصياد: نقداً أو عبر الصرافة
  sellerExchangeName?: string; // اسم الصرافة أو رقم الحوالة
  isEdited?: boolean; // هل تم تعديل الفاتورة بعد إنشائها
  editedAt?: number; // وقت آخر تعديل بالملي ثانية
  editedDateStr?: string; // تاريخ التعديل
  isTransferred?: boolean; // هل تم تحويل الشروة لمشتري آخر
  transferredFromBuyerName?: string; // اسم المشتري السابق المحول منه
  transferredAt?: number; // وقت وتاريخ التحويل
  isResale?: boolean; // هل العملية إعادة بيع شروة لمشتري آخر
  resaleSurplus?: number; // الفائض المالي الناتج عن إعادة بيع الشروة (أودع في درج الكاش)
  resoldFromTransactionId?: string; // رقم الشروة الأصلية التي تم إعادة بيعها
  wasResold?: boolean; // هل تم إعادة بيع هذه الشروة لمشتري آخر (شروة أصلية تمت تسويتها بالبيع)
  resoldToTransactionId?: string; // رقم فاتورة إعادة البيع الجديدة
  resoldToBuyerName?: string; // اسم المشتري الجديد الذي بيعت له الشروة
  resoldPaymentStatus?: 'pending' | 'paid'; // حالة سداد المشتري الجديد للشروة المعاد بيعها
  notes?: string;
}

export type SettlementType =
  | 'association_cash' // دفع كامل للصندوق (الجمعية تقبض من المشتري وتسلم الصياد)
  | 'direct_cash' // دفع مباشر بين الطرفين (المشتري حاسب الصياد يداً بيد وعمولة الجمعية فقط)
  | 'association_credit' // الجمعية حاسبت الصياد كاش والمشتري آجل بالكامل (دين للجمعية)
  | 'partial_cash' // دفع جزئي من المشتري + تكملة الجمعية للصياد + الباقي دين
  | 'buyer_advance'; // دفع مخصوم من رصيد قدمة المشتري

export interface MarketSettings {
  marketName: string;
  subTitle: string;
  buyerTaxRate: number; // 0.02 (2%)
  sellerTaxRate: number; // 0.03 (3%)
  currency: string; // "ريال يمني" أو "ر.ي"
  contactPhone?: string;
  location?: string;
  employeeName?: string; // اسم الموظف / المحاسب المسؤول المطبوع في الفواتير وسندات القبض
  paperWidth: '80mm' | '58mm';
  autoOpenPrint: boolean;
  systemPin?: string; // رمز الدخول الرقمي للنظام
  showSellerRoleToggle?: boolean; // إظهار مفتاح التبديل (صياد / بائع) في واجهة الفاتورة
  separateProfitsFromDrawerCash?: boolean; // فصل أرباح وعمولات الحراج من إجمالي كاش الدرج
  showSurplusInCashCards?: boolean; // إظهار العهدة الافتتاحية وفائض أرباح الشروات المسترد في بطاقات النقدية واليومية
  enableBuyerFishSalesAndOffset?: boolean; // حصر مبيعات المشترين والمقاصة المالية في كشف المشتري وعدم إظهارهم في كشف الصيادين
  showBuyerResaleButton?: boolean; // إظهار زر (شروة و بيعة) في كشف حساب المشتري

  // ── إعدادات خدمة النسخ الاحتياطي عبر البريد الإلكتروني ──
  emailBackupEnabled?: boolean; // تفعيل النسخ التلقائي
  emailBackupOnScheduleEnabled?: boolean; // تفعيل الإرسال اليومي في ساعة محددة
  emailBackupScheduledTime?: string;     // الساعة المحددة بصيغة HH:mm (مثلاً "23:00" لـ 11:00 مساءً)
  emailBackupOnDayCloseEnabled?: boolean; // تفعيل الإرسال الفوري عند اعتماد إغلاق اليومية والجرد
  backupFrequency?: 'daily' | 'weekly' | 'monthly'; // دورية النسخ: يومي كل 24 ساعة / أسبوعي / شهري
  smtpHost?: string;            // مثل smtp.gmail.com
  smtpPort?: number;            // مثل 465 أو 587
  smtpUser?: string;            // بريد الإرسال
  smtpPass?: string;            // كلمة مرور التطبيق (App Password)
  smtpSecure?: boolean;         // true لـ 465 (SSL/TLS)
  lastEmailBackupAt?: number;   // توقيت آخر إرسال بالملي ثانية
  lastEmailBackupDate?: string; // YYYY-MM-DD
  googleDriveFolderUrl?: string; // رابط مجلد Google Drive المخصص للنسخ الاحتياطية

  // ── تخصيص المظهر وحجم ونوع الخط ──
  fontFamily?: string;     // نوع الخط العربي المعتمد (مثل Cairo, Tajawal, Almarai, Readex Pro, Alexandria, إلخ)
  fontSizeScale?: number;  // نسبة تكبير الخط بالنسبة المئوية (95, 100, 112 المعتمد, 120, 128)

  // ── تخصيص طريقة عرض رصيد صندوق النقدية ──
  cashDrawerDisplayMode?: 'today_only' | 'cumulative'; // 'today_only' (اليوم الفعلي لمنع الارتباك) أو 'cumulative' (التراكمي الشامل)
}

export type CashEntryType =
  | 'opening'
  | 'deposit'
  | 'withdrawal'
  | 'expense'
  | 'seller_payout'
  | 'buyer_debt_repayment'
  | 'buyer_advance_deposit'
  | 'buyer_advance_refund'
  | 'advance_debt_settlement'
  | 'seller_advance'
  | 'seller_advance_repayment'
  | 'buyer_advance'
  | 'buyer_advance_repayment';

export interface CashEntry {
  id: string; // e.g. "CASH-2609-001"
  timestamp: number;
  dateStr: string; // e.g. "2026-09-12"
  timeStr: string; // e.g. "08:30 ص"
  type: CashEntryType;
  category: string; // e.g. "عهدة صباحية", "شراء ثلج", "أجور عمال وتنزيل", "وقود ومحروقات", "نثريات وضيافة", "توريد بنكي", "تسليم مستحقات صياد", "سداد دين مشتري", "سلفة صياد", "أخرى"
  amount: number;
  description: string;
  performedBy?: string;
  referenceId?: string; // Optional link to transaction or external ref
  contactId?: string;
  contactName?: string;
  transactionId?: string;
  payoutMethod?: 'cash' | 'exchange';
  repaymentMethod?: 'cash' | 'exchange' | 'advance' | 'offset';
  exchangeName?: string;
}

export interface CashDayCloseRecord {
  id: string;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  openingBalance: number;
  totalDeposits: number;
  totalExpenses: number;
  totalWithdrawals: number;
  harajCashSales?: number;
  harajSellerPayouts?: number;
  buyerDebtRepayments?: number;
  buyerDebtExchangeRepayments?: number; // إجمالي تسديد ديون المشترين عبر الصرافة
  sellerExchangePayouts?: number; // إجمالي تسلم مستحقات الصيادين عبر الصرافة
  sellerAdvanceRepayments?: number; // إجمالي سداد سلف الصيادين نقداً
  officeExpenses?: number;
  exchangeExpenses?: number; // مصروفات دُفعت من الصرافة ولا تخصم من درج النقدية
  associationProfits?: number;
  systemCalculatedBalance: number;
  actualCountedCash: number;
  difference: number; // actual - calculated (عجز أو فائض)
  carriedOverBalance?: number; // حقل قديم للتوافق مع السجلات السابقة (غير مستخدم)
  newCustodyAmount?: number; // العهدة الجديدة المضافة من الجمعية اليوم
  notes?: string;
  isAutoClosed?: boolean; // هل تم الإغلاق تلقائياً بواسطة النظام لليوم المنتهي
  reconciliationStatus?: 'pending' | 'reconciled'; // حالة المطابقة: معلقة لم تتم المعاينة بعد أم تم اعتمادها
  reconciledAt?: number; // توقيت المعاينة والاعتماد
  reconciledBy?: string; // اسم من قام بالمعاينة والاعتماد
  closedBy?: string; // اسم من قام بالإقفال
}

export interface LotTransferRecord {
  id: string;
  transactionId: string;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  fromBuyerId?: string;
  fromBuyerName: string;
  toBuyerId: string;
  toBuyerName: string;
  toBuyerPhone?: string;
  grossAmount: number;
  buyerTaxAmount: number;
  totalAmount: number;
  paymentStatus: 'pending' | 'paid';
  notes?: string;
}


