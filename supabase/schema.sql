-- ==============================================================================
-- MONEY COLLECTION & MONTHLY BILLING MANAGEMENT SYSTEM
-- COMPLETE SUPABASE POSTGRESQL SCHEMA WITH RLS, TRIGGERS, AND STORED FUNCTIONS
-- Timezone: Asia/Kolkata | Currency: INR (₹)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('owner', 'collection_admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- 2. COLLECTION SECTIONS TABLE (Configurable & Renameable)
CREATE TABLE IF NOT EXISTS public.collection_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- e.g. 'electricity', 'water', 'other'
    name TEXT NOT NULL,         -- e.g. 'Electricity Bill'
    description TEXT,
    icon TEXT DEFAULT 'Zap',
    color TEXT DEFAULT 'amber',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- 3. CUSTOMERS TABLE (Single Profile per person, multiple bill assignments)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code TEXT UNIQUE NOT NULL, -- e.g. 'CUST-0001'
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    house_number TEXT NOT NULL,
    building_name TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Indore',
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- Index for speedy searching
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(full_name);

-- 4. CUSTOMER_SECTIONS (Join table: One customer to multiple sections)
CREATE TABLE IF NOT EXISTS public.customer_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.collection_sections(id) ON DELETE CASCADE,
    meter_number TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    assigned_by UUID REFERENCES public.profiles(id),
    CONSTRAINT uq_customer_section UNIQUE(customer_id, section_id)
);

-- 5. BILLING PERIODS TABLE (Customer + Section + Month + Year)
CREATE TABLE IF NOT EXISTS public.billing_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES public.collection_sections(id) ON DELETE RESTRICT,
    billing_month INTEGER NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
    billing_year INTEGER NOT NULL CHECK (billing_year >= 2020),
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    bill_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    additional_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    credits_or_adjustments NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount_due NUMERIC(12, 2) GENERATED ALWAYS AS (opening_balance + bill_amount + additional_charges - credits_or_adjustments) STORED,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closing_balance NUMERIC(12, 2) GENERATED ALWAYS AS (opening_balance + bill_amount + additional_charges - credits_or_adjustments - paid_amount) STORED,
    due_date DATE NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Paid', 'Partially Paid', 'Pending', 'Overdue')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    CONSTRAINT uq_customer_section_period UNIQUE(customer_id, section_id, billing_month, billing_year)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_period ON public.billing_periods(billing_year, billing_month);
CREATE INDEX IF NOT EXISTS idx_billing_periods_status ON public.billing_periods(payment_status);

-- 6. COLLECTIONS / PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    billing_period_id UUID NOT NULL REFERENCES public.billing_periods(id) ON DELETE RESTRICT,
    section_id UUID NOT NULL REFERENCES public.collection_sections(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Other Online Payment')),
    transaction_reference TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed', 'Reversed', 'Corrected')),
    collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    collection_time TIME NOT NULL DEFAULT CURRENT_TIME,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

CREATE INDEX IF NOT EXISTS idx_collections_date ON public.collections(collection_date);
CREATE INDEX IF NOT EXISTS idx_collections_created_by ON public.collections(created_by);
CREATE INDEX IF NOT EXISTS idx_collections_status ON public.collections(status);

-- 7. COLLECTION REVERSALS TABLE (Mandatory owner-only audit trail)
CREATE TABLE IF NOT EXISTS public.collection_reversals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL,
    reversed_by UUID NOT NULL REFERENCES public.profiles(id),
    reversed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    CONSTRAINT uq_collection_reversal UNIQUE(collection_id)
);

-- 8. IMMUTABLE AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID NOT NULL REFERENCES public.profiles(id),
    actor_name TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- 'collection', 'customer', 'billing_period', 'employee', 'section'
    entity_id UUID NOT NULL,
    action_type TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'REVERSE', 'STATUS_CHANGE', 'DEACTIVATE'
    previous_values JSONB,
    new_values JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- 9. CASH RECONCILIATION TABLE
CREATE TABLE IF NOT EXISTS public.cash_reconciliation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id),
    reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_refunded NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_handed_over NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    expected_closing_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    actual_closing_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    difference NUMERIC(12, 2) GENERATED ALWAYS AS (actual_closing_cash - expected_closing_cash) STORED,
    verified_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now()),
    CONSTRAINT uq_cash_reconciliation UNIQUE(employee_id, reconciliation_date)
);

-- 10. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Kolkata', now())
);

-- ==============================================================================
-- DATABASE FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Function to recalculate billing period status and paid amount
CREATE OR REPLACE FUNCTION public.recalculate_billing_period(period_id UUID)
RETURNS VOID AS $$
DECLARE
    total_paid NUMERIC(12, 2);
    period_due NUMERIC(12, 2);
    period_due_date DATE;
    new_status TEXT;
BEGIN
    -- Sum confirmed collections for this period
    SELECT COALESCE(SUM(amount), 0.00) INTO total_paid
    FROM public.collections
    WHERE billing_period_id = period_id AND status = 'Confirmed';

    -- Get total amount due and due date
    SELECT (opening_balance + bill_amount + additional_charges - credits_or_adjustments), due_date
    INTO period_due, period_due_date
    FROM public.billing_periods
    WHERE id = period_id;

    -- Compute payment status
    IF total_paid >= period_due AND period_due > 0 THEN
        new_status := 'Paid';
    ELSIF total_paid > 0 AND total_paid < period_due THEN
        new_status := 'Partially Paid';
    ELSE
        IF CURRENT_DATE > period_due_date THEN
            new_status := 'Overdue';
        ELSE
            new_status := 'Pending';
        END IF;
    END IF;

    -- Update billing period
    UPDATE public.billing_periods
    SET paid_amount = total_paid,
        payment_status = new_status,
        updated_at = timezone('Asia/Kolkata', now())
    WHERE id = period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recalculate on collection insert, update, or status change
CREATE OR REPLACE FUNCTION public.on_collection_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM public.recalculate_billing_period(NEW.billing_period_id);
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalculate_billing_period(OLD.billing_period_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_collection_change ON public.collections;
CREATE TRIGGER trg_collection_change
AFTER INSERT OR UPDATE OR DELETE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.on_collection_change();

-- Carry Forward Function to open a new billing month
CREATE OR REPLACE FUNCTION public.carry_forward_month(
    target_month INTEGER,
    target_year INTEGER,
    prev_month INTEGER,
    prev_year INTEGER,
    default_due_day INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
DECLARE
    rec RECORD;
    count_created INTEGER := 0;
    calc_due_date DATE;
BEGIN
    -- Determine due date
    calc_due_date := make_date(target_year, target_month, LEAST(default_due_day, 28));

    -- For every active customer and their assigned sections
    FOR rec IN
        SELECT cs.customer_id, cs.section_id, COALESCE(bp.closing_balance, 0.00) AS prev_closing
        FROM public.customer_sections cs
        JOIN public.customers c ON c.id = cs.customer_id
        LEFT JOIN public.billing_periods bp ON bp.customer_id = cs.customer_id
                                           AND bp.section_id = cs.section_id
                                           AND bp.billing_month = prev_month
                                           AND bp.billing_year = prev_year
        WHERE c.is_active = true
    LOOP
        -- Check if target period already exists
        IF NOT EXISTS (
            SELECT 1 FROM public.billing_periods
            WHERE customer_id = rec.customer_id
              AND section_id = rec.section_id
              AND billing_month = target_month
              AND billing_year = target_year
        ) THEN
            INSERT INTO public.billing_periods (
                customer_id,
                section_id,
                billing_month,
                billing_year,
                opening_balance,
                bill_amount,
                additional_charges,
                credits_or_adjustments,
                paid_amount,
                due_date,
                payment_status
            ) VALUES (
                rec.customer_id,
                rec.section_id,
                target_month,
                target_year,
                GREATEST(rec.prev_closing, 0.00), -- unpaid closing balance carries forward
                0.00, -- default bill amount, edited per meter/section
                0.00,
                0.00,
                0.00,
                calc_due_date,
                'Pending'
            );
            count_created := count_created + 1;
        END IF;
    END LOOP;

    RETURN count_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: Is user owner?
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'owner' AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Profiles: Authenticated users can view profiles. Only owner can insert/update other roles.
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_owner_all" ON public.profiles
FOR ALL TO authenticated USING (public.is_owner());

-- Customers & Sections: Read by all authenticated; write by authenticated
CREATE POLICY "sections_read" ON public.collection_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections_owner_write" ON public.collection_sections FOR ALL TO authenticated USING (public.is_owner());

CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_write" ON public.customers FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "customer_sections_read" ON public.customer_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "customer_sections_write" ON public.customer_sections FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Billing periods: Read by all authenticated; manage by authenticated
CREATE POLICY "billing_periods_read" ON public.billing_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "billing_periods_write" ON public.billing_periods FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Collections: Read by all authenticated; Insert by all authenticated (with created_by = auth.uid())
CREATE POLICY "collections_read" ON public.collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "collections_insert" ON public.collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "collections_update" ON public.collections FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- Reversals: Only owner can reverse transactions
CREATE POLICY "reversals_read" ON public.collection_reversals FOR SELECT TO authenticated USING (true);
CREATE POLICY "reversals_owner_insert" ON public.collection_reversals FOR INSERT TO authenticated WITH CHECK (public.is_owner());

-- Audit logs: Read by all authenticated; Insert by authenticated; No user can delete or update audit logs
CREATE POLICY "audit_logs_read" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_user_id);

-- Cash Reconciliation: Read by all authenticated; Manage by authenticated
CREATE POLICY "cash_reconciliation_read" ON public.cash_reconciliation FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_reconciliation_write" ON public.cash_reconciliation FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- System Settings: Read by all; Write only by owner
CREATE POLICY "system_settings_read" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_settings_owner_write" ON public.system_settings FOR ALL TO authenticated USING (public.is_owner());
