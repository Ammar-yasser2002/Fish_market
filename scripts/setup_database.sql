-- ========================================================
-- سكربت تهيئة قاعدة بيانات نظام حراج الأسماك (PostgreSQL)
-- نظام حراج الأسماك ونقاط البيع والحسابات
-- ========================================================

-- 1. جدول المعاملات والصفقات (Transactions)
CREATE TABLE IF NOT EXISTS "transactions" (
    "id" TEXT NOT NULL,
    "date_str" TEXT,
    "time_str" TEXT,
    "timestamp" BIGINT NOT NULL,
    "seller_id" TEXT,
    "seller_name" TEXT NOT NULL,
    "seller_phone" TEXT,
    "buyer_id" TEXT,
    "buyer_name" TEXT NOT NULL,
    "buyer_phone" TEXT,
    "gross_amount" DOUBLE PRECISION NOT NULL,
    "buyer_tax_rate" DOUBLE PRECISION,
    "buyer_tax_amount" DOUBLE PRECISION NOT NULL,
    "total_from_buyer" DOUBLE PRECISION NOT NULL,
    "seller_tax_rate" DOUBLE PRECISION,
    "seller_tax_amount" DOUBLE PRECISION NOT NULL,
    "net_to_seller" DOUBLE PRECISION NOT NULL,
    "haraj_profit" DOUBLE PRECISION NOT NULL,
    "payment_status" TEXT NOT NULL,
    "settlement_type" TEXT,
    "buyer_paid_amount" DOUBLE PRECISION,
    "paid_at_pos_buyer_amount" DOUBLE PRECISION,
    "buyer_remaining_debt" DOUBLE PRECISION,
    "buyer_advance_used" DOUBLE PRECISION,
    "seller_paid_amount" DOUBLE PRECISION,
    "paid_at_pos_amount" DOUBLE PRECISION,
    "seller_remaining_debt" DOUBLE PRECISION,
    "seller_paid_status" TEXT,
    "seller_payout_method" TEXT,
    "seller_exchange_name" TEXT,
    "is_edited" BOOLEAN DEFAULT false,
    "edited_at" BIGINT,
    "edited_date_str" TEXT,
    "is_transferred" BOOLEAN DEFAULT false,
    "transferred_from_buyer_name" TEXT,
    "transferred_at" BIGINT,
    "is_resale" BOOLEAN DEFAULT false,
    "resale_surplus" DOUBLE PRECISION,
    "resold_from_transaction_id" TEXT,
    "was_resold" BOOLEAN DEFAULT false,
    "resold_to_transaction_id" TEXT,
    "resold_to_buyer_name" TEXT,
    "resold_payment_status" TEXT,
    "notes" TEXT,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- 2. جدول تفاصيل وبنود الأسماك في الفاتورة (Transaction Items)
CREATE TABLE IF NOT EXISTS "transaction_items" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "fish_type_id" TEXT,
    "fish_name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_gross" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- 3. جدول دليل العملاء والموردين (Contacts)
CREATE TABLE IF NOT EXISTS "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "tax_number" TEXT,
    "role" TEXT,
    "daily_wage" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TEXT,
    "data" JSONB,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- 4. جدول أصناف الأسماك (Fish Types)
CREATE TABLE IF NOT EXISTS "fish_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arabic_name" TEXT,
    "default_unit" TEXT NOT NULL,
    "unit_label" TEXT NOT NULL,
    "estimated_price_per_unit" DOUBLE PRECISION,
    "category" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB,

    CONSTRAINT "fish_types_pkey" PRIMARY KEY ("id")
);

-- 5. جدول حركات الصندوق والمالية (Cash Entries)
CREATE TABLE IF NOT EXISTS "cash_entries" (
    "id" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "date_str" TEXT NOT NULL,
    "time_str" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "performed_by" TEXT,
    "reference_id" TEXT,
    "contact_id" TEXT,
    "contact_name" TEXT,
    "transaction_id" TEXT,
    "payout_method" TEXT,
    "repayment_method" TEXT,
    "exchange_name" TEXT,
    "data" JSONB,

    CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

-- 6. جدول إغلاقات الجرد اليومي واليومية (Cash Closings)
CREATE TABLE IF NOT EXISTS "cash_closings" (
    "id" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "date_str" TEXT NOT NULL,
    "time_str" TEXT NOT NULL,
    "opening_balance" DOUBLE PRECISION NOT NULL,
    "total_deposits" DOUBLE PRECISION NOT NULL,
    "total_expenses" DOUBLE PRECISION NOT NULL,
    "total_withdrawals" DOUBLE PRECISION NOT NULL,
    "haraj_cash_sales" DOUBLE PRECISION,
    "haraj_seller_payouts" DOUBLE PRECISION,
    "buyer_debt_repayments" DOUBLE PRECISION,
    "buyer_debt_exchange_repayments" DOUBLE PRECISION,
    "seller_exchange_payouts" DOUBLE PRECISION,
    "office_expenses" DOUBLE PRECISION,
    "association_profits" DOUBLE PRECISION,
    "system_calculated_balance" DOUBLE PRECISION NOT NULL,
    "actual_counted_cash" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "data" JSONB,

    CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id")
);

-- 7. جدول إعدادات النظام والنسب (Settings)
CREATE TABLE IF NOT EXISTS "settings" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- الفهارس لتسريع البحث والتقارير
CREATE INDEX IF NOT EXISTS "transactions_timestamp_idx" ON "transactions"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "transactions_date_str_idx" ON "transactions"("date_str");
CREATE INDEX IF NOT EXISTS "transactions_buyer_name_idx" ON "transactions"("buyer_name");
CREATE INDEX IF NOT EXISTS "transactions_seller_name_idx" ON "transactions"("seller_name");
CREATE INDEX IF NOT EXISTS "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");
CREATE INDEX IF NOT EXISTS "contacts_name_idx" ON "contacts"("name");
CREATE INDEX IF NOT EXISTS "contacts_type_idx" ON "contacts"("type");
CREATE INDEX IF NOT EXISTS "fish_types_name_idx" ON "fish_types"("name");
CREATE INDEX IF NOT EXISTS "cash_entries_timestamp_idx" ON "cash_entries"("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "cash_closings_timestamp_idx" ON "cash_closings"("timestamp" DESC);

-- الربط العلائقي بين الفاتورة وبنودها
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'transaction_items_transaction_id_fkey'
    ) THEN
        ALTER TABLE "transaction_items" 
        ADD CONSTRAINT "transaction_items_transaction_id_fkey" 
        FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
