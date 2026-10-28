-- ==============================================================================
-- MONEY COLLECTION & MONTHLY BILLING MANAGEMENT SYSTEM
-- SUPABASE POSTGRESQL SCHEMA WITH TEXT PRIMARY KEYS & REALTIME REPLICATION
-- Timezone: Asia/Kolkata | Currency: INR (₹)
-- ==============================================================================

-- 1. DROP EXISTING CONFLICTING TABLES IF RE-INITIALIZING
DROP TABLE IF EXISTS public.collection_reversals CASCADE;
DROP TABLE IF EXISTS public.cash_reconciliation CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.collections CASCADE;
DROP TABLE IF EXISTS public.billing_periods CASCADE;
DROP TABLE IF EXISTS public.customer_sections CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.collection_sections CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 2. PROFILES TABLE (Multi-user roles: 'owner', 'collection_admin')
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'collection_admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_sections TEXT[] NOT NULL DEFAULT ARRAY['Section 1', 'Section 2', 'Section 3'],
    username TEXT,
    password TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- 3. COLLECTION SECTIONS TABLE (Section 1 = Electricity, Section 2 = Water, Section 3 = Other)
CREATE TABLE IF NOT EXISTS public.collection_sections (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'Zap',
    color TEXT DEFAULT 'amber',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- 4. CUSTOMERS TABLE (Residents / Accounts)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    customer_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    house_number TEXT NOT NULL DEFAULT '',
    building_name TEXT DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT 'Indore',
    notes TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_section_ids TEXT[] NOT NULL DEFAULT ARRAY['sec-elec-001'],
    created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(full_name);

-- 5. BILLING PERIODS TABLE (Monthly ledger per customer per section)
CREATE TABLE IF NOT EXISTS public.billing_periods (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES public.collection_sections(id) ON DELETE RESTRICT,
    billing_month INTEGER NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
    billing_year INTEGER NOT NULL CHECK (billing_year >= 2020),
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    bill_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    additional_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credits_or_adjustments NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    due_date TEXT NOT NULL DEFAULT '2026-10-25',
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    current_unit NUMERIC(12, 2) DEFAULT 0.00,
    previous_unit NUMERIC(12, 2) DEFAULT 0.00,
    units_consumed NUMERIC(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    CONSTRAINT uq_customer_section_period UNIQUE(customer_id, section_id, billing_month, billing_year)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_period ON public.billing_periods(billing_year, billing_month);
CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON public.billing_periods(payment_status);

-- 6. COLLECTIONS / PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.collections (
    id TEXT PRIMARY KEY,
    receipt_number TEXT UNIQUE NOT NULL,
    customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    billing_period_id TEXT NOT NULL REFERENCES public.billing_periods(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES public.collection_sections(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    transaction_reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Confirmed',
    collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    collection_time TEXT NOT NULL DEFAULT CURRENT_TIME::TEXT,
    created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by_name TEXT DEFAULT '',
    updated_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by_name TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

CREATE INDEX IF NOT EXISTS idx_collections_date ON public.collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_collections_customer ON public.collections(customer_id);

-- 7. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    actor_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    previous_values JSONB,
    new_values JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- 8. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES - OPEN FOR CLIENT APPLICATION ACCESS
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public full access on profiles" ON public.profiles FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access on sections" ON public.collection_sections FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access on customers" ON public.customers FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access on billing_periods" ON public.billing_periods FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access on collections" ON public.collections FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access on audit_logs" ON public.audit_logs FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access on system_settings" ON public.system_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- ==============================================================================
-- ENABLE REALTIME REPLICATION FOR LIVE 4-USER SYNCHRONIZATION
-- ==============================================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE collection_sections;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE billing_periods;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE collections;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ==============================================================================
-- INITIAL SEED DATA INSERTION
-- ==============================================================================

-- 1. Profiles (Owner is Raj only)
INSERT INTO public.profiles (id, full_name, email, phone, role, is_active, assigned_sections, username, password)
VALUES 
  ('usr-owner-001', 'Raj', 'owner@collectionpro.in', '+91 98260 11001', 'owner', true, ARRAY['Section 1', 'Section 2', 'Section 3'], 'rxjhaldar', 'raj25520035'),
  ('usr-admin-001', 'Abhishek', 'abhishek@collectionpro.in', '+91 98261 22002', 'collection_admin', true, ARRAY['Section 1', 'Section 2'], 'Abhishek1218', 'abhishek@1218'),
  ('usr-admin-002', 'Bablu Raut', 'bablu@collectionpro.in', '+91 98262 33003', 'collection_admin', true, ARRAY['Section 2', 'Section 3'], 'Babluraut', 'bablu18'),
  ('usr-admin-003', 'Seema Haldar', 'seema@collectionpro.in', '+91 98263 44004', 'collection_admin', true, ARRAY['Section 1', 'Section 2', 'Section 3'], 'seemahaldar', 'seema2026')
ON CONFLICT (id) DO UPDATE SET 
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  password = EXCLUDED.password;

-- 2. Sections
INSERT INTO public.collection_sections (id, code, name, description, icon, color, is_active)
VALUES 
  ('sec-elec-001', 'electricity', 'Section 1', 'Section 1 Electricity & Utility Meter Collections', 'Zap', 'amber', true),
  ('sec-water-002', 'water', 'Section 2', 'Section 2 Monthly Water Supply & Pipeline Dues', 'Droplets', 'blue', true),
  ('sec-other-003', 'other', 'Section 3', 'Section 3 Maintenance & Miscellaneous Charges', 'Layers', 'emerald', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Initial Settings
INSERT INTO public.system_settings (key, value)
VALUES 
  ('general', '{"business_name": "Raj Utility Billing & Collection", "business_phone": "+91 98260 11001", "currency": "INR", "currency_symbol": "₹"}')
ON CONFLICT (key) DO NOTHING;
