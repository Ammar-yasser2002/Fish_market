export interface FontOption {
  id: string;
  nameArabic: string;
  nameEnglish: string;
  category: string;
  sampleText: string;
  recommended?: boolean;
}

export const ARABIC_FONTS: FontOption[] = [
  {
    id: 'Cairo',
    nameArabic: 'خط كايرو (Cairo)',
    nameEnglish: 'Cairo',
    category: 'عصري قياسي للأعمال والحسابات (الافتراضي)',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - شروة تونة 123,450 ريال',
    recommended: true,
  },
  {
    id: 'Tajawal',
    nameArabic: 'خط تجوال (Tajawal)',
    nameEnglish: 'Tajawal',
    category: 'ناعم، انسيابي، وعصري ومريح للعين',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - شروة ديرك 85,200 ريال',
  },
  {
    id: 'Almarai',
    nameArabic: 'خط المراعي (Almarai)',
    nameEnglish: 'Almarai',
    category: 'أنيق واحترافي ممتاز للتقارير والطباعة والوضوح',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - شروة باغة 45,000 ريال',
    recommended: true,
  },
  {
    id: 'Readex Pro',
    nameArabic: 'خط ريدكس برو (Readex Pro)',
    nameEnglish: 'Readex Pro',
    category: 'تقني متطور بمسافات قراءة استثنائية وأرقام هندسية',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - شروة هامور 92,600 ريال',
  },
  {
    id: 'Alexandria',
    nameArabic: 'خط الإسكندرية (Alexandria)',
    nameEnglish: 'Alexandria',
    category: 'هندسي فخم بوزن متوازن ووضوح ممتاز',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - شروة شعور 64,800 ريال',
  },
  {
    id: 'IBM Plex Sans Arabic',
    nameArabic: 'خط آي بي إم بلكس (IBM Plex Arabic)',
    nameEnglish: 'IBM Plex Sans Arabic',
    category: 'احترافي، تقني، ومحاسبي دقيق',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - شروة ثمد 110,500 ريال',
  },
  {
    id: 'Noto Sans Arabic',
    nameArabic: 'خط نوتو سانس (Noto Sans Arabic)',
    nameEnglish: 'Noto Sans Arabic',
    category: 'الخط القياسي العالمي المعتمد للشاشات والأنظمة',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - إجمالي الصندوق 350,000 ريال',
  },
  {
    id: 'Changa',
    nameArabic: 'خط تشانجا (Changa)',
    nameEnglish: 'Changa',
    category: 'عريض وبارز بوضوح فائق للشاشات البعيدة ونقاط البيع',
    sampleText: 'سوق عين بامعبد المركزي للأسماك - مبيعات اليوم 2,450,000 ريال',
  },
];

export interface FontSizeOption {
  scale: number;
  label: string;
  description: string;
  isDefault?: boolean;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { scale: 95, label: 'صغير (95%)', description: 'مناسب للشاشات الصغيرة لتوفير المساحة' },
  { scale: 100, label: 'قياسي (100%)', description: 'الحجم الأصلي بدون تكبير' },
  { scale: 112, label: 'معتمد للنظام (112%)', description: 'الحجم المعتمد والمثالي لقراءة واضحة ومريحة', isDefault: true },
  { scale: 120, label: 'كبير (120%)', description: 'حجم واضح وبارز يسهل العمل السريع' },
  { scale: 128, label: 'كبير جداً (128%)', description: 'حجم استثنائي فائق الوضوح للشاشات الكبيرة' },
];

/**
 * Applies root font size and dynamic font family across the entire application in real time.
 */
export function applyTypography(fontFamily?: string, fontSizeScale?: number): void {
  try {
    const font = fontFamily && ARABIC_FONTS.some((f) => f.id === fontFamily) ? fontFamily : 'Cairo';
    const scale = Number(fontSizeScale) && !isNaN(Number(fontSizeScale)) && Number(fontSizeScale) >= 80 && Number(fontSizeScale) <= 150
      ? Number(fontSizeScale)
      : 112;

    // 1. Scale root font-size (16px base * scale / 100).
    // All Tailwind rem measurements (text-xs, text-sm, text-base, etc.) dynamically scale!
    const rootPx = (16 * scale) / 100;
    document.documentElement.style.fontSize = `${rootPx}px`;

    // 2. Set dynamic CSS variable & body font family
    const fontStack = `'${font}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    document.documentElement.style.setProperty('--app-font-family', fontStack);
    document.body.style.fontFamily = fontStack;

    // Store in root attribute for easy CSS targeting
    document.documentElement.setAttribute('data-app-font', font);
    document.documentElement.setAttribute('data-app-font-scale', String(scale));
  } catch (err) {
    console.warn('Failed to apply typography settings:', err);
  }
}
