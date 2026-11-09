import { CashDayCloseRecord, CashEntry, Contact, FishType, MarketSettings, Transaction } from '../types';
import { calculateFinancials, getArabicFormattedDate } from '../utils/calculations';

export const DEFAULT_SETTINGS: MarketSettings = {
  marketName: 'سوق عين بامعبد المركزي',
  subTitle: 'للأسماك الطازجة والخضروات والفواكة',
  buyerTaxRate: 0.02, // 2%
  sellerTaxRate: 0.03, // 3%
  currency: 'ريال يمني',
  contactPhone: '782191112',
  location: 'م/شبوه/رضوم/ عين بامعبد',
  employeeName: 'أمين الصندوق',
  paperWidth: '80mm',
  autoOpenPrint: true,
  systemPin: '1234',
  showSellerRoleToggle: false,
  separateProfitsFromDrawerCash: false,
  showSurplusInCashCards: true,
  enableBuyerFishSalesAndOffset: false,
  showBuyerResaleButton: true,
  emailBackupEnabled: true,
  emailBackupOnScheduleEnabled: true,
  emailBackupScheduledTime: '23:00',
  emailBackupOnDayCloseEnabled: true,
  backupFrequency: 'daily',
  googleDriveFolderUrl: 'G:\\ملفاتي\\ابناء مديرية رضوم\\معروف',
  fontFamily: 'Cairo',
  fontSizeScale: 112,
  cashDrawerDisplayMode: 'today_only',
};

export const INITIAL_FISH_TYPES: FishType[] = [
  {
    id: 'fish-1',
    name: 'Derak (Kingfish)',
    arabicName: 'ديرك (كنعد)',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-2',
    name: 'Thamad (Yellowfin Tuna)',
    arabicName: 'ثمد (تونة)',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-3',
    name: 'Bagha (Mackerel)',
    arabicName: 'باغة',
    defaultUnit: 'box',
    unitLabel: 'صندوق',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-4',
    name: 'Shaoor (Emperor)',
    arabicName: 'شعور',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-5',
    name: 'Hamoor (Grouper)',
    arabicName: 'هامور',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-6',
    name: 'Kanaan / Kaneed',
    arabicName: 'كنعيد',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-7',
    name: 'Salmani',
    arabicName: 'سلماني',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-8',
    name: 'Anflos (Trevally)',
    arabicName: 'عنفلوص',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-9',
    name: 'Bagher',
    arabicName: 'باغر',
    defaultUnit: 'box',
    unitLabel: 'صندوق',
    estimatedPricePerUnit: 0,
    popular: true,
  },
  {
    id: 'fish-10',
    name: 'Najil (Coral Trout)',
    arabicName: 'ناجل أحمر',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: false,
  },
  {
    id: 'fish-11',
    name: 'Harid (Parrotfish)',
    arabicName: 'حريد',
    defaultUnit: 'kg',
    unitLabel: 'كيلو',
    estimatedPricePerUnit: 0,
    popular: false,
  },
  {
    id: 'fish-12',
    name: 'Shrimp (Auction Box)',
    arabicName: 'ربيان حراج',
    defaultUnit: 'box',
    unitLabel: 'صندوق',
    estimatedPricePerUnit: 0,
    popular: true,
  },
];

export const INITIAL_CONTACTS: Contact[] = [];

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const INITIAL_CASH_ENTRIES: CashEntry[] = [];

export const INITIAL_CASH_CLOSINGS: CashDayCloseRecord[] = [];


