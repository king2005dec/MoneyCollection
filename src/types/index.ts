export type UserRole = 'owner' | 'collection_admin';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
  assigned_sections?: string[];
  avatar_url?: string;
  username?: string;
  password?: string;
  created_at: string;
  updated_at: string;
}

export interface CollectionSection {
  id: string;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  customer_code: string;
  full_name: string;
  phone: string;
  email?: string;
  house_number: string;
  building_name?: string;
  address: string;
  city: string;
  notes?: string;
  is_active: boolean;
  assigned_section_ids: string[];
  created_by: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
}

export interface CustomerSectionJoin {
  id: string;
  customer_id: string;
  section_id: string;
  meter_number?: string;
  assigned_at: string;
  assigned_by?: string;
}

export type PaymentStatus = 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';

export interface BillingPeriod {
  id: string;
  customer_id: string;
  section_id: string;
  billing_month: number; // 1 - 12
  billing_year: number;  // 2026, etc.
  opening_balance: number;
  bill_amount: number;
  additional_charges: number;
  credits_or_adjustments: number;
  total_amount_due: number; // opening + bill + additional - credits
  paid_amount: number;
  closing_balance: number;  // total_amount_due - paid_amount
  due_date: string;         // YYYY-MM-DD
  payment_status: PaymentStatus;
  current_unit?: number;
  previous_unit?: number;
  units_consumed?: number;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Other Online Payment';
export type CollectionStatus = 'Confirmed' | 'Reversed' | 'Corrected';

export interface Collection {
  id: string;
  receipt_number: string;
  customer_id: string;
  billing_period_id: string;
  section_id: string;
  amount: number;
  payment_method: PaymentMethod;
  transaction_reference?: string;
  notes?: string;
  status: CollectionStatus;
  collection_date: string; // YYYY-MM-DD
  collection_time: string; // HH:mm:ss
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_at: string;
}

export interface CollectionReversal {
  id: string;
  collection_id: string;
  amount: number;
  reason: string;
  reversed_by: string;
  reversed_by_name?: string;
  reversed_at: string;
}

export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERSE' | 'STATUS_CHANGE' | 'DEACTIVATE' | 'ACTIVATE';
export type AuditEntityType = 'collection' | 'customer' | 'billing_period' | 'employee' | 'section' | 'settings' | 'cash_reconciliation';

export interface AuditLog {
  id: string;
  actor_user_id: string;
  actor_name: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action_type: AuditActionType;
  previous_values?: Record<string, any>;
  new_values?: Record<string, any>;
  reason?: string;
  created_at: string;
}

export interface CashReconciliation {
  id: string;
  employee_id: string;
  employee_name?: string;
  reconciliation_date: string;
  opening_cash: number;
  cash_collected: number;
  cash_refunded: number;
  cash_handed_over: number;
  expected_closing_cash: number;
  actual_closing_cash: number;
  difference: number;
  verified_by?: string;
  verified_by_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  business_name: string;
  business_phone: string;
  business_address: string;
  currency: string;
  timezone: string;
  default_due_day: number;
  receipt_prefix: string;
  allow_advance_payments: boolean;
}

export interface DashboardMetrics {
  totalOutstanding: number;
  totalCollectionToday: number;
  totalCollectionThisMonth: number;
  totalCashThisMonth: number;
  totalOnlineThisMonth: number;
  totalPendingCustomers: number;
  fullyPaidCustomers: number;
  partiallyPaidCustomers: number;
  overdueCustomers: number;
  totalCustomers: number;
}
