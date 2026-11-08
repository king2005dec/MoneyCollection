import {
  Profile,
  CollectionSection,
  Customer,
  BillingPeriod,
  Collection,
  CollectionReversal,
  AuditLog,
  CashReconciliation,
  SystemSettings,
  DashboardMetrics,
  PaymentStatus,
  LedgerHistoryEntry,
} from '../types';
import {
  INITIAL_PROFILES,
  INITIAL_SECTIONS,
  INITIAL_CUSTOMERS,
  INITIAL_BILLING_PERIODS,
  INITIAL_COLLECTIONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_CASH_RECONCILIATION,
  INITIAL_SETTINGS,
} from './seedData';
import { getSupabaseClient } from './supabaseClient';

const STORAGE_KEYS = {
  PROFILES: 'col_db_profiles_v1',
  SECTIONS: 'col_db_sections_v2',
  CUSTOMERS: 'col_db_customers_v6',
  BILLING_PERIODS: 'col_db_billing_periods_v6',
  COLLECTIONS: 'col_db_collections_v6',
  REVERSALS: 'col_db_reversals_v1',
  AUDIT_LOGS: 'col_db_audit_logs_v1',
  CASH_RECONCILIATION: 'col_db_cash_recon_v1',
  SETTINGS: 'col_db_settings_v1',
  LEDGER_HISTORY: 'col_db_ledger_history_v1',
};

// Local storage helpers with fallback to initial seed
function getStored<T>(key: string, defaultData: T): T {
  try {
    if (typeof window === 'undefined') return defaultData;
    const raw = localStorage.getItem(key);
    if (!raw) return defaultData;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return defaultData;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (err) {
    console.error(`Error writing ${key} to storage:`, err);
  }
}

const syncBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('money_collection_live_sync') 
  : null;

export function notifySync(key?: string, data?: unknown) {
  if (syncBroadcast) {
    try {
      syncBroadcast.postMessage({ key, data, timestamp: Date.now() });
    } catch (e) {
      // ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Broadcast sync – delegates to syncService (instant broadcast + Supabase DB upsert)
// ─────────────────────────────────────────────────────────────────────────────
type BroadcastSendFn = (key: string, data: unknown) => Promise<void>;
let _broadcastSender: BroadcastSendFn | null = null;

export function setBroadcastSender(fn: BroadcastSendFn | null): void {
  _broadcastSender = fn;
}

async function broadcastDataSync(changedKeys: string[], actorName?: string): Promise<void> {
  try {
    const { syncAfterWrite } = await import('./syncService');
    await syncAfterWrite(changedKeys, actorName);
  } catch (e) {
    console.warn('[Sync] broadcastDataSync error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE / SYNC INFO HELPER
// Captures which device/session made each data change for audit & sync debugging.
// ─────────────────────────────────────────────────────────────────────────────
function getDeviceInfo(): { device: string; device_info: string; timestamp: string } {
  const now = new Date().toISOString();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const platform = typeof navigator !== 'undefined' ? navigator.platform : 'unknown';
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'unknown';
  const device = `${platform}|${lang}`;
  const device_info = ua;
  return { device, device_info, timestamp: now };
}

// Ensure database is initialized
export function initLocalDatabase(): void {
  getStored(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  getStored(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS);
  getStored(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  getStored(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  getStored(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  getStored(STORAGE_KEYS.REVERSALS, []);
  getStored(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  getStored(STORAGE_KEYS.CASH_RECONCILIATION, INITIAL_CASH_RECONCILIATION);
  getStored(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);

  seedSupabaseIfEmpty();
}

export async function seedSupabaseIfEmpty(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('key')
      .eq('key', STORAGE_KEYS.CUSTOMERS)
      .maybeSingle();
    if (!data) {
      const { pushKeyToCloud } = await import('./syncService');
      const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
      const sections = getStored<CollectionSection[]>(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS);
      const profiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
      const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
      const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
      await Promise.all([
        pushKeyToCloud(STORAGE_KEYS.CUSTOMERS, customers, 'System'),
        pushKeyToCloud(STORAGE_KEYS.SECTIONS, sections, 'System'),
        pushKeyToCloud(STORAGE_KEYS.PROFILES, profiles, 'System'),
        pushKeyToCloud(STORAGE_KEYS.BILLING_PERIODS, periods, 'System'),
        pushKeyToCloud(STORAGE_KEYS.COLLECTIONS, collections, 'System'),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('Seed Supabase check:', err);
  }
  return false;
}

// -------------------------------------------------------------
// PROFILES / EMPLOYEES
// -------------------------------------------------------------
export async function getProfiles(): Promise<Profile[]> {
  const local = getStored<Profile[]>(STORAGE_KEYS.PROFILES, []);
  if (local && local.length > 0) return local;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', STORAGE_KEYS.PROFILES)
        .maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        setStored(STORAGE_KEYS.PROFILES, data.value);
        return data.value as Profile[];
      }
    } catch (e) {
      console.warn('Supabase getProfiles error:', e);
    }
  }
  return INITIAL_PROFILES;
}

export async function getProfileById(id: string): Promise<Profile | undefined> {
  const profiles = await getProfiles();
  return profiles.find(p => p.id === id);
}

export async function createEmployee(
  employee: Omit<Profile, 'id' | 'created_at' | 'updated_at'>,
  actor: { id: string; name: string }
): Promise<Profile> {
  const newProfile: Profile = {
    ...employee,
    assigned_sections: employee.assigned_sections || ['Section 1', 'Section 2', 'Section 3'],
    id: `usr-admin-${Date.now().toString().slice(-4)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('profiles').upsert(newProfile);
  }

  const profiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  profiles.push(newProfile);
  setStored(STORAGE_KEYS.PROFILES, profiles);

  // Add audit log
  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'employee',
    entity_id: newProfile.id,
    action_type: 'CREATE',
    new_values: {
      name: newProfile.full_name,
      role: newProfile.role,
      email: newProfile.email,
      assigned_sections: newProfile.assigned_sections,
    },
    reason: `Created user account with sections: ${(newProfile.assigned_sections || []).join(', ')}`,
  });

  return newProfile;
}

export async function updateEmployeeSections(
  id: string,
  assigned_sections: string[],
  actor: { id: string; name: string }
): Promise<Profile | undefined> {
  const profiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  const target = profiles.find(p => p.id === id);
  if (!target) return undefined;

  const prev = target.assigned_sections || [];
  target.assigned_sections = assigned_sections;
  target.updated_at = new Date().toISOString();
  setStored(STORAGE_KEYS.PROFILES, profiles);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('profiles').update({ updated_at: target.updated_at }).eq('id', id);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'employee',
    entity_id: id,
    action_type: 'UPDATE',
    previous_values: { assigned_sections: prev },
    new_values: { assigned_sections },
    reason: `Updated section assignments for ${target.full_name}: ${assigned_sections.join(', ')}`,
  });

  return target;
}

export async function toggleEmployeeStatus(
  id: string,
  isActive: boolean,
  actor: { id: string; name: string }
): Promise<void> {
  const profiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  const target = profiles.find(p => p.id === id);
  if (!target) return;

  const prevStatus = target.is_active;
  target.is_active = isActive;
  target.updated_at = new Date().toISOString();
  setStored(STORAGE_KEYS.PROFILES, profiles);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('profiles').update({ is_active: isActive, updated_at: target.updated_at }).eq('id', id);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'employee',
    entity_id: id,
    action_type: isActive ? 'ACTIVATE' : 'DEACTIVATE',
    previous_values: { is_active: prevStatus },
    new_values: { is_active: isActive },
    reason: `${isActive ? 'Activated' : 'Deactivated'} employee account ${target.full_name}`,
  });
}

export async function clearSectionData(sectionId: string, actor: { id: string; name: string }): Promise<void> {
  const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);

  const customerIdsToRemove = customers
    .filter(c => (c.assigned_section_ids || []).includes(sectionId))
    .map(c => c.id);

  const remainingCustomers = customers.filter(c => !customerIdsToRemove.includes(c.id));
  const remainingPeriods = periods.filter(p => !(p.section_id === sectionId && customerIdsToRemove.includes(p.customer_id)));
  const remainingCollections = collections.filter(c => !(c.section_id === sectionId && customerIdsToRemove.includes(c.customer_id)));

  setStored(STORAGE_KEYS.CUSTOMERS, remainingCustomers);
  setStored(STORAGE_KEYS.BILLING_PERIODS, remainingPeriods);
  setStored(STORAGE_KEYS.COLLECTIONS, remainingCollections);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      for (const cid of customerIdsToRemove) {
        await supabase.from('billing_periods').delete().eq('customer_id', cid).eq('section_id', sectionId);
        await supabase.from('collections').delete().eq('customer_id', cid).eq('section_id', sectionId);
        await supabase.from('customers').delete().eq('id', cid);
      }
    } catch (e) {
      console.warn('Supabase clearSectionData error:', e);
    }
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'section',
    entity_id: sectionId,
    action_type: 'DELETE',
    reason: `Cleared all data for section ${sectionId}`,
  });

  await broadcastDataSync([STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.AUDIT_LOGS]);
}

export async function deleteEmployee(
  id: string,
  actor: { id: string; name: string }
): Promise<void> {
  const profiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  const index = profiles.findIndex(p => p.id === id);
  if (index < 0) return;
  const target = profiles[index];

  if (target.role === 'owner') {
    throw new Error('Cannot delete owner account.');
  }

  profiles.splice(index, 1);
  setStored(STORAGE_KEYS.PROFILES, profiles);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('profiles').delete().eq('id', id);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'employee',
    entity_id: id,
    action_type: 'DELETE',
    previous_values: { name: target.full_name, email: target.email, role: target.role },
    reason: `Deleted employee account ${target.full_name}`,
  });
}

// -------------------------------------------------------------
// SECTIONS
// -------------------------------------------------------------
export async function getSections(): Promise<CollectionSection[]> {
  const local = getStored<CollectionSection[]>(STORAGE_KEYS.SECTIONS, []);
  if (local && local.length > 0) return local;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', STORAGE_KEYS.SECTIONS)
        .maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        setStored(STORAGE_KEYS.SECTIONS, data.value);
        return data.value as CollectionSection[];
      }
    } catch (e) {
      console.warn('Supabase getSections error:', e);
    }
  }
  return INITIAL_SECTIONS;
}

export async function updateSectionName(
  id: string,
  newName: string,
  actor: { id: string; name: string }
): Promise<void> {
  const sections = getStored<CollectionSection[]>(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS);
  const target = sections.find(s => s.id === id);
  if (!target) return;

  const oldName = target.name;
  target.name = newName.trim();
  target.updated_at = new Date().toISOString();
  setStored(STORAGE_KEYS.SECTIONS, sections);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('collection_sections').update({ name: target.name, updated_at: target.updated_at }).eq('id', id);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'section',
    entity_id: id,
    action_type: 'UPDATE',
    previous_values: { name: oldName },
    new_values: { name: newName },
    reason: `Renamed section from "${oldName}" to "${newName}"`,
  });
}

// -------------------------------------------------------------
// CUSTOMERS
// -------------------------------------------------------------
export async function getCustomers(): Promise<Customer[]> {
  const local = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
  if (local && local.length > 0) return local;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', STORAGE_KEYS.CUSTOMERS)
        .maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        setStored(STORAGE_KEYS.CUSTOMERS, data.value);
        return data.value as Customer[];
      }
    } catch (e) {
      console.warn('Supabase getCustomers error:', e);
    }
  }
  return INITIAL_CUSTOMERS;
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
  const customers = await getCustomers();
  return customers.find(c => c.id === id);
}

export async function createCustomer(
  customerData: Omit<Customer, 'id' | 'customer_code' | 'created_at' | 'updated_at'>,
  actor: { id: string; name: string },
  billingMonth?: number,
  billingYear?: number
): Promise<Customer> {
  const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  
  // Section 1 = A, Section 2 = B, Section 3 = C
  const prefix = customerData.assigned_section_ids.includes('sec-water-002')
    ? 'B'
    : customerData.assigned_section_ids.includes('sec-other-003')
    ? 'C'
    : 'A';

  const existingCodes = customers
    .map(c => c.customer_code)
    .filter(code => code && code.startsWith(prefix));

  const maxNum = existingCodes.reduce((max, code) => {
    const num = parseInt(code.slice(prefix.length), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 0);

  const customer_code = `${prefix}${maxNum + 1}`;

  const newCustomer: Customer = {
    ...customerData,
    id: `cust-${customer_code}`,
    customer_code,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  customers.unshift(newCustomer);
  setStored(STORAGE_KEYS.CUSTOMERS, customers);

  // Automatically create billing periods for the specified month for each assigned section
  const now = new Date();
  const currentMonth = billingMonth || now.getMonth() + 1;
  const currentYear = billingYear || now.getFullYear();
  const dueDay = 5;
  const billingPeriods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);

  for (const sectionId of newCustomer.assigned_section_ids) {
    billingPeriods.push({
      id: `bp-${newCustomer.id}-${sectionId}-${currentMonth}-${currentYear}`,
      customer_id: newCustomer.id,
      section_id: sectionId,
      billing_month: currentMonth,
      billing_year: currentYear,
      opening_balance: 0.00,
      bill_amount: 0.00,
      additional_charges: 0.00,
      credits_or_adjustments: 0.00,
      total_amount_due: 0.00,
      paid_amount: 0.00,
      closing_balance: 0.00,
      due_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
      payment_status: 'Pending',
      current_unit: 0,
      previous_unit: 0,
      units_consumed: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  setStored(STORAGE_KEYS.BILLING_PERIODS, billingPeriods);

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'customer',
    entity_id: newCustomer.id,
    action_type: 'CREATE',
    new_values: { code: customer_code, name: newCustomer.full_name, phone: newCustomer.phone },
    reason: `Registered new customer with ID ${customer_code}`,
  });

  // Broadcast to all connected devices
  await broadcastDataSync([STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS], actor?.name);

  return newCustomer;
}

export async function updateCustomer(
  id: string,
  updates: Partial<Customer>,
  actor: { id: string; name: string }
): Promise<void> {
  const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  const index = customers.findIndex(c => c.id === id);
  if (index === -1) return;

  const prevValues = { ...customers[index] };
  customers[index] = {
    ...customers[index],
    ...updates,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  setStored(STORAGE_KEYS.CUSTOMERS, customers);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('customers').update(updates).eq('id', id);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'customer',
    entity_id: id,
    action_type: 'UPDATE',
    previous_values: { name: prevValues.full_name, phone: prevValues.phone, address: prevValues.address },
    new_values: { name: customers[index].full_name, phone: customers[index].phone, address: customers[index].address },
    reason: 'Updated customer profile information',
  });
}

export async function deleteCustomer(
  id: string,
  actor: { id: string; name: string }
): Promise<void> {
  const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  const target = customers.find(c => c.id === id || c.customer_code === id || c.customer_code === id.replace(/^cust-/, ''));
  if (!target) return;

  const targetId = target.id;
  const targetCode = target.customer_code;

  const remaining = customers.filter(c => c.id !== targetId && c.customer_code !== targetCode);
  setStored(STORAGE_KEYS.CUSTOMERS, remaining);

  const billingPeriods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  const remainingPeriods = billingPeriods.filter(
    p => p.customer_id !== targetId &&
         p.customer_id !== targetCode &&
         p.customer_id !== targetId.replace(/^cust-/, '') &&
         !p.id.includes(`-${targetId}-`) &&
         !p.id.includes(`-${targetCode}-`)
  );
  setStored(STORAGE_KEYS.BILLING_PERIODS, remainingPeriods);

  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  const remainingCollections = collections.filter(
    c => c.customer_id !== targetId && c.customer_id !== targetCode
  );
  setStored(STORAGE_KEYS.COLLECTIONS, remainingCollections);

  const ledgerHistory = getStored<LedgerHistoryEntry[]>(STORAGE_KEYS.LEDGER_HISTORY, []);
  const remainingLedger = ledgerHistory.filter(
    h => h.customer_id !== targetId && h.customer_id !== targetCode
  );
  setStored(STORAGE_KEYS.LEDGER_HISTORY, remainingLedger);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('customers').delete().eq('id', targetId);
      await supabase.from('billing_periods').delete().eq('customer_id', targetId);
      await supabase.from('collections').delete().eq('customer_id', targetId);
    } catch (e) {
      console.warn('Supabase deleteCustomer error:', e);
    }
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'customer',
    entity_id: targetId,
    action_type: 'DELETE',
    previous_values: { code: target.customer_code, name: target.full_name },
    reason: `Deleted resident ${target.full_name} (${target.customer_code})`,
  });

  // Broadcast deletion to all staff devices and update Supabase system_settings in real time
  await broadcastDataSync([
    STORAGE_KEYS.CUSTOMERS,
    STORAGE_KEYS.BILLING_PERIODS,
    STORAGE_KEYS.COLLECTIONS,
    STORAGE_KEYS.LEDGER_HISTORY,
    STORAGE_KEYS.AUDIT_LOGS,
  ], actor?.name);
}

// -------------------------------------------------------------
// BILLING PERIODS
// -------------------------------------------------------------
function sanitizeBillingPeriods(periods: BillingPeriod[]): BillingPeriod[] {
  if (!Array.isArray(periods)) return [];
  const map = new Map<string, BillingPeriod>();

  for (const p of periods) {
    if (!p || !p.id) continue;
    // Auto-repair corrupt customer_id / section_id
    if (p.customer_id === 'cust' || !p.customer_id || (p.section_id === 'sec-elec-001' && (p.id.includes('sec-other') || p.id.includes('sec-water')))) {
      const match = p.id.match(/^bp-(.+?)-(sec-[a-z0-9-]+)-(\d{1,2})-(\d{4})$/);
      if (match) {
        p.customer_id = match[1];
        p.section_id = match[2];
        p.billing_month = parseInt(match[3], 10);
        p.billing_year = parseInt(match[4], 10);
      }
    }

    const key = `${p.customer_id}|${p.section_id}|${p.billing_month}|${p.billing_year}`;
    if (!map.has(key)) {
      map.set(key, p);
    } else {
      // Merge with existing duplicate
      const existing = map.get(key)!;
      existing.paid_amount = Math.max(existing.paid_amount || 0, p.paid_amount || 0);
      existing.current_unit = Math.max(existing.current_unit || 0, p.current_unit || 0);
      existing.previous_unit = Math.max(existing.previous_unit || 0, p.previous_unit || 0);
      existing.units_consumed = Math.max(existing.units_consumed || 0, p.units_consumed || 0);
      if ((p.bill_amount || 0) > 0) existing.bill_amount = p.bill_amount;
      if ((p.opening_balance || 0) > 0 && !existing.opening_balance) existing.opening_balance = p.opening_balance;
      const prevB = existing.opening_balance || 0;
      const thisM = Number(((existing.bill_amount || 0) + (existing.additional_charges || 0) - (existing.credits_or_adjustments || 0)).toFixed(2));
      existing.total_amount_due = Number((prevB + thisM).toFixed(2));
      existing.closing_balance = Math.max(0, Number((existing.total_amount_due - existing.paid_amount).toFixed(2)));
    }
  }

  return Array.from(map.values());
}

export async function getBillingPeriods(): Promise<BillingPeriod[]> {
  const local = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, []);
  if (local && local.length > 0) {
    const sanitized = sanitizeBillingPeriods(local);
    if (sanitized.length !== local.length || local.some(p => p.customer_id === 'cust')) {
      setStored(STORAGE_KEYS.BILLING_PERIODS, sanitized);
    }
    return sanitized;
  }
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', STORAGE_KEYS.BILLING_PERIODS)
        .maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        const sanitized = sanitizeBillingPeriods(data.value as BillingPeriod[]);
        setStored(STORAGE_KEYS.BILLING_PERIODS, sanitized);
        return sanitized;
      }
    } catch (e) {
      console.warn('Supabase getBillingPeriods error:', e);
    }
  }
  return INITIAL_BILLING_PERIODS;
}

export async function getBillingPeriodById(id: string): Promise<BillingPeriod | undefined> {
  const periods = await getBillingPeriods();
  return periods.find(p => p.id === id);
}

export async function updateBillingPeriodCharges(
  id: string,
  charges: {
    bill_amount?: number;
    opening_balance?: number;
    additional_charges?: number;
    credits_or_adjustments?: number;
    due_date?: string;
    paid_amount?: number;
    closing_balance?: number;
    current_unit?: number;
    previous_unit?: number;
    units_consumed?: number;
  },
  reason: string,
  actor: { id: string; name: string },
  context?: { customerId?: string; sectionId?: string; month?: number; year?: number }
): Promise<BillingPeriod | undefined> {
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let target = periods.find(p => p.id === id);
  if (!target && context?.customerId) {
    target = periods.find(p =>
      p.customer_id === context.customerId &&
      p.section_id === (context.sectionId || 'sec-elec-001') &&
      p.billing_month === (context.month || 10) &&
      p.billing_year === (context.year || 2026)
    );
  }

  const { device, device_info, timestamp } = getDeviceInfo();

  if (!target) {
    let customerId = context?.customerId || '';
    let sectionId = context?.sectionId || 'sec-elec-001';
    let parsedMonth = context?.month || 10;
    let parsedYear = context?.year || 2026;

    const match = id.match(/^bp-(cust-[A-Za-z0-9]+)-(sec-[a-z0-9-]+)-(\d+)-(\d+)$/);
    if (match) {
      customerId = match[1];
      sectionId = match[2];
      parsedMonth = parseInt(match[3], 10);
      parsedYear = parseInt(match[4], 10);
    }

    target = {
      id,
      customer_id: customerId,
      section_id: sectionId,
      billing_month: parsedMonth,
      billing_year: parsedYear,
      opening_balance: charges.opening_balance ?? 0,
      bill_amount: charges.bill_amount ?? 0,
      additional_charges: charges.additional_charges ?? 0,
      credits_or_adjustments: charges.credits_or_adjustments ?? 0,
      total_amount_due: 0,
      paid_amount: charges.paid_amount ?? 0,
      closing_balance: 0,
      due_date: `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-05`,
      payment_status: 'Pending',
      sync_device: device,
      sync_device_info: device_info,
      sync_timestamp: timestamp,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    periods.push(target);
  }

  const prevValues = {
    bill_amount: target.bill_amount,
    opening_balance: target.opening_balance,
    additional_charges: target.additional_charges,
    credits_or_adjustments: target.credits_or_adjustments,
    paid_amount: target.paid_amount,
    closing_balance: target.closing_balance,
    current_unit: target.current_unit,
    previous_unit: target.previous_unit,
    units_consumed: target.units_consumed,
  };

  if (charges.bill_amount !== undefined) target.bill_amount = charges.bill_amount;
  if (charges.opening_balance !== undefined) target.opening_balance = charges.opening_balance;
  if (charges.additional_charges !== undefined) target.additional_charges = charges.additional_charges;
  if (charges.credits_or_adjustments !== undefined) target.credits_or_adjustments = charges.credits_or_adjustments;
  if (charges.due_date) target.due_date = charges.due_date;
  else {
    const nm = target.billing_month === 12 ? 1 : target.billing_month + 1;
    const ny = target.billing_month === 12 ? target.billing_year + 1 : target.billing_year;
    target.due_date = `${ny}-${String(nm).padStart(2, '0')}-05`;
  }
  if (charges.paid_amount !== undefined) target.paid_amount = charges.paid_amount;
  if (charges.current_unit !== undefined) target.current_unit = charges.current_unit;
  if (charges.previous_unit !== undefined) target.previous_unit = charges.previous_unit;
  if (charges.units_consumed !== undefined) {
    target.units_consumed = charges.units_consumed;
  } else if (charges.current_unit !== undefined) {
    const prevU = target.previous_unit || 0;
    target.units_consumed = Math.max(0, charges.current_unit - prevU);
  }

  // Strict formula: Total Balance = Prev Balance + This Month
  // Current Balance = Total Balance - Pay
  const prevBal = target.opening_balance || 0;
  const thisM = Number(((target.bill_amount || 0) + (target.additional_charges || 0) - (target.credits_or_adjustments || 0)).toFixed(2));
  const calculatedTotalDue = Number((prevBal + thisM).toFixed(2));

  target.total_amount_due = calculatedTotalDue;
  if (charges.closing_balance !== undefined) {
    target.closing_balance = charges.closing_balance;
  } else {
    target.closing_balance = Number(Math.max(0, calculatedTotalDue - (target.paid_amount || 0)).toFixed(2));
  }

  target.payment_status = computePaymentStatus(target.total_amount_due, target.paid_amount, target.due_date);
  target.sync_device = device;
  target.sync_device_info = device_info;
  target.sync_timestamp = timestamp;
  target.updated_at = new Date().toISOString();

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  // If paid_amount was updated, also synchronize collections array
  if (charges.paid_amount !== undefined) {
    try {
      const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
      const matchingCols = collections.filter(
        c => c.status !== 'Reversed' && (
          c.billing_period_id === target.id ||
          (c.customer_id === target.customer_id && c.section_id === target.section_id)
        )
      );

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

      if (matchingCols.length > 0) {
        if (charges.paid_amount === 0) {
          matchingCols.forEach(c => {
            c.amount = 0;
            c.status = 'Corrected';
            c.notes = `Payment cleared to ₹0 (${actor.name})`;
            c.updated_by = actor.id;
            c.updated_by_name = actor.name;
            c.updated_at = now.toISOString();
          });
        } else {
          const otherSum = matchingCols.slice(1).reduce((s, c) => s + c.amount, 0);
          const primaryCol = matchingCols[0];
          primaryCol.amount = Math.max(0, Number((charges.paid_amount - otherSum).toFixed(2)));
          primaryCol.status = 'Confirmed';
          primaryCol.notes = `Payment adjusted to ₹${charges.paid_amount} (${actor.name})`;
          primaryCol.updated_by = actor.id;
          primaryCol.updated_by_name = actor.name;
          primaryCol.updated_at = now.toISOString();
        }
      } else if (charges.paid_amount > 0) {
        const receipt_number = `RCP-${dateStr.replace(/-/g, '')}-${1000 + collections.length + 1}`;
        collections.unshift({
          id: `col-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
          receipt_number,
          customer_id: target.customer_id,
          section_id: target.section_id,
          billing_period_id: target.id,
          amount: charges.paid_amount,
          payment_method: 'Cash',
          status: 'Confirmed',
          collection_date: dateStr,
          collection_time: timeStr,
          notes: `Payment recorded via charges update (${actor.name})`,
          sync_device: device,
          sync_device_info: device_info,
          sync_timestamp: timestamp,
          created_by: actor.id,
          created_by_name: actor.name,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
      }
      setStored(STORAGE_KEYS.COLLECTIONS, collections);
    } catch (e) {
      console.warn('Failed to sync collection on charges update:', e);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('billing_periods').upsert(target);
    if (error) {
      console.error('Supabase upsert failed for billing_period:', error);
    }
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'billing_period',
    entity_id: id,
    action_type: 'UPDATE',
    previous_values: prevValues,
    new_values: {
      bill_amount: target.bill_amount,
      additional_charges: target.additional_charges,
      paid_amount: target.paid_amount,
      closing_balance: target.closing_balance,
    },
    reason: reason || 'Updated monthly bill charges & balances',
  });

  // Broadcast updated billing_periods (and collections if paid_amount was changed) to all connected devices
  const keysToSync = charges.paid_amount !== undefined
    ? [STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.AUDIT_LOGS]
    : [STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS];
  await broadcastDataSync(keysToSync, actor?.name);

  try {
    await addLedgerHistoryEntry({
      customer_id: target.customer_id,
      section_id: target.section_id,
      current_unit: target.current_unit ?? 0,
      prev_unit: target.previous_unit ?? 0,
      units_consumed: target.units_consumed ?? 0,
      bill_amount: target.bill_amount,
      opening_balance: target.opening_balance,
      total_amount_due: target.total_amount_due,
      paid_amount: target.paid_amount,
      payment_method: '-',
      closing_balance: target.closing_balance,
      billing_month: target.billing_month,
      billing_year: target.billing_year,
      notes: reason || 'Updated monthly bill charges & balances',
      actor_name: actor.name,
    });
  } catch (err) {
    console.warn('Failed to record ledger history entry:', err);
  }

  return target;
}

export async function updateOwnerPaymentDirectly(
  customerId: string,
  sectionId: string,
  month: number,
  year: number,
  newPayAmount: number,
  actor: { id: string; name: string }
): Promise<BillingPeriod> {
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let target = periods.find(
    p => (p.customer_id === customerId || p.customer_id === customerId.replace(/^cust-/, '')) &&
         p.section_id === sectionId &&
         p.billing_month === month &&
         p.billing_year === year
  ) || periods.find(p => p.id === `bp-${customerId}-${sectionId}-${month}-${year}`);

  const { device, device_info, timestamp } = getDeviceInfo();
  const safePay = Math.max(0, Number(newPayAmount.toFixed(2)));

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

  if (!target) {
    const periodId = `bp-${customerId}-${sectionId}-${month}-${year}`;
    target = {
      id: periodId,
      customer_id: customerId,
      section_id: sectionId,
      billing_month: month,
      billing_year: year,
      opening_balance: 0,
      bill_amount: safePay,
      additional_charges: 0,
      credits_or_adjustments: 0,
      total_amount_due: safePay,
      paid_amount: safePay,
      closing_balance: 0,
      due_date: `${year}-${String(month).padStart(2, '0')}-05`,
      payment_status: 'Paid',
      sync_device: device,
      sync_device_info: device_info,
      sync_timestamp: timestamp,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    periods.push(target);
  } else {
    // Strict formula: Total Balance = Prev Balance + This Month
    // Current Balance = Total Balance - Pay
    const prevBal = target.opening_balance || 0;
    const thisM = Number(((target.bill_amount || 0) + (target.additional_charges || 0) - (target.credits_or_adjustments || 0)).toFixed(2));
    const totalDue = Number((prevBal + thisM).toFixed(2));

    target.paid_amount = safePay;
    target.total_amount_due = totalDue;
    target.closing_balance = Number(Math.max(0, totalDue - safePay).toFixed(2));

    target.payment_status = computePaymentStatus(target.total_amount_due, target.paid_amount, target.due_date);
    target.sync_device = device;
    target.sync_device_info = device_info;
    target.sync_timestamp = timestamp;
    target.updated_at = now.toISOString();
  }

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  // Synchronize collections array
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  const matchingCols = collections.filter(
    c => c.status !== 'Reversed' && (
      c.billing_period_id === target!.id ||
      (c.customer_id === customerId && c.section_id === sectionId)
    )
  );

  if (matchingCols.length > 0) {
    if (safePay === 0) {
      matchingCols.forEach(c => {
        c.amount = 0;
        c.status = 'Corrected';
        c.notes = `Owner reset payment to ₹0 (${actor.name})`;
        c.updated_by = actor.id;
        c.updated_by_name = actor.name;
        c.updated_at = now.toISOString();
      });
    } else {
      const otherSum = matchingCols.slice(1).reduce((s, c) => s + c.amount, 0);
      const primaryCol = matchingCols[0];
      primaryCol.amount = Math.max(0, Number((safePay - otherSum).toFixed(2)));
      primaryCol.status = 'Confirmed';
      primaryCol.notes = `Owner corrected payment to ₹${safePay} (${actor.name})`;
      primaryCol.updated_by = actor.id;
      primaryCol.updated_by_name = actor.name;
      primaryCol.updated_at = now.toISOString();
      primaryCol.collection_date = primaryCol.collection_date || dateStr;
    }
  } else if (safePay > 0) {
    const receipt_number = `RCP-${dateStr.replace(/-/g, '')}-${1000 + collections.length + 1}`;
    const newCollection: Collection = {
      id: `col-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
      receipt_number,
      customer_id: customerId,
      section_id: sectionId,
      billing_period_id: target.id,
      amount: safePay,
      payment_method: 'Cash',
      status: 'Confirmed',
      collection_date: dateStr,
      collection_time: timeStr,
      notes: `Payment entered directly by Owner (${actor.name})`,
      sync_device: device,
      sync_device_info: device_info,
      sync_timestamp: timestamp,
      created_by: actor.id,
      created_by_name: actor.name,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    collections.unshift(newCollection);
  }

  setStored(STORAGE_KEYS.COLLECTIONS, collections);

  // Broadcast to all connected devices and Supabase cloud
  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.AUDIT_LOGS], actor.name);

  // Ledger history entry for 2nd sheet
  try {
    await addLedgerHistoryEntry({
      customer_id: target.customer_id,
      section_id: target.section_id,
      current_unit: target.current_unit ?? 0,
      prev_unit: target.previous_unit ?? 0,
      units_consumed: target.units_consumed ?? 0,
      bill_amount: target.bill_amount,
      opening_balance: target.opening_balance,
      total_amount_due: target.total_amount_due,
      paid_amount: target.paid_amount,
      payment_method: matchingCols[0]?.payment_method || 'Cash',
      closing_balance: target.closing_balance,
      billing_month: target.billing_month,
      billing_year: target.billing_year,
      notes: `Owner modified paid amount to ₹${safePay}. Remaining balance: ₹${target.closing_balance}`,
      actor_name: actor.name,
    });
  } catch (err) {
    console.warn('Failed to record ledger history entry:', err);
  }

  // Audit log
  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'billing_period',
    entity_id: target.id,
    action_type: 'UPDATE',
    new_values: {
      paid_amount: target.paid_amount,
      closing_balance: target.closing_balance,
      total_amount_due: target.total_amount_due,
    },
    reason: `Owner modified paid amount to ₹${safePay} (Remaining due: ₹${target.closing_balance})`,
  });

  return target;
}

export async function updateRemainingDueDirectly(
  customerId: string,
  sectionId: string,
  month: number,
  year: number,
  newRemainingDue: number,
  reason: string,
  actor: { id: string; name: string }
): Promise<BillingPeriod> {
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let target = periods.find(
    p => (p.customer_id === customerId || p.customer_id === customerId.replace(/^cust-/, '')) &&
         p.section_id === sectionId &&
         p.billing_month === month &&
         p.billing_year === year
  ) || periods.find(p => p.id === `bp-${customerId}-${sectionId}-${month}-${year}`);

  const { device, device_info, timestamp } = getDeviceInfo();
  const safeDue = Math.max(0, Number(newRemainingDue.toFixed(2)));
  const prevClosing = target ? target.closing_balance : 0;

  if (!target) {
    const periodId = `bp-${customerId}-${sectionId}-${month}-${year}`;
    target = {
      id: periodId,
      customer_id: customerId,
      section_id: sectionId,
      billing_month: month,
      billing_year: year,
      opening_balance: safeDue,
      bill_amount: 0,
      additional_charges: 0,
      credits_or_adjustments: 0,
      total_amount_due: safeDue,
      paid_amount: 0,
      closing_balance: safeDue,
      due_date: `${year}-${String(month).padStart(2, '0')}-15`,
      payment_status: safeDue === 0 ? 'Paid' : 'Pending',
      sync_device: device,
      sync_device_info: device_info,
      sync_timestamp: timestamp,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    periods.push(target);
  } else {
    // Direct balance edit: update closing_balance and total_amount_due.
    target.closing_balance = safeDue;
    target.total_amount_due = Number((target.paid_amount + safeDue).toFixed(2));

    // Maintain strict formula: Prev Balance (opening_balance) + This Month (bill_amount) = Total Balance (total_amount_due)
    const thisMonthBill = Number(((target.bill_amount ?? 0) + (target.additional_charges ?? 0) - (target.credits_or_adjustments ?? 0)).toFixed(2));
    if (thisMonthBill > 0 && target.total_amount_due >= thisMonthBill) {
      target.opening_balance = Number((target.total_amount_due - thisMonthBill).toFixed(2));
    } else if (thisMonthBill > 0 && target.total_amount_due < thisMonthBill) {
      target.opening_balance = 0;
      target.bill_amount = target.total_amount_due;
    } else {
      target.opening_balance = target.total_amount_due;
    }

    target.payment_status = computePaymentStatus(target.total_amount_due, target.paid_amount, target.due_date);
    target.sync_device = device;
    target.sync_device_info = device_info;
    target.sync_timestamp = timestamp;
    target.updated_at = new Date().toISOString();
  }

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  // Broadcast to all connected devices and Supabase cloud (non-blocking for fast UI)
  broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS], actor?.name).catch(err => {
    console.warn('Sync broadcast warning:', err);
  });

  addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'billing_period',
    entity_id: target.id,
    action_type: 'UPDATE',
    previous_values: { closing_balance: prevClosing },
    new_values: { closing_balance: target.closing_balance, total_amount_due: target.total_amount_due, opening_balance: target.opening_balance },
    reason: reason || 'Directly edited remaining due',
  }).catch(e => console.warn('Audit log error:', e));

  addLedgerHistoryEntry({
    customer_id: target.customer_id,
    section_id: target.section_id,
    current_unit: target.current_unit ?? 0,
    prev_unit: target.previous_unit ?? 0,
    units_consumed: target.units_consumed ?? 0,
    bill_amount: target.bill_amount,
    opening_balance: target.opening_balance,
    total_amount_due: target.total_amount_due,
    paid_amount: target.paid_amount,
    payment_method: '-',
    closing_balance: target.closing_balance,
    billing_month: target.billing_month,
    billing_year: target.billing_year,
    notes: reason || 'Directly edited remaining due',
    actor_name: actor.name,
  }).catch(err => console.warn('Failed to record ledger history entry:', err));

  return target;
}

export async function updateLastMonthPaidDirectly(
  customerId: string,
  sectionId: string,
  prevMonth: number,
  prevYear: number,
  newPaidAmount: number,
  reason: string,
  actor: { id: string; name: string }
): Promise<BillingPeriod> {
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let target = periods.find(
    p => p.customer_id === customerId &&
         p.section_id === sectionId &&
         p.billing_month === prevMonth &&
         p.billing_year === prevYear
  );

  const { device, device_info, timestamp } = getDeviceInfo();
  const safePaid = Math.max(0, Number(newPaidAmount.toFixed(2)));
  const prevPaid = target ? target.paid_amount : 0;

  if (!target) {
    const periodId = `bp-${customerId}-${sectionId}-${prevMonth}-${prevYear}`;
    target = {
      id: periodId,
      customer_id: customerId,
      section_id: sectionId,
      billing_month: prevMonth,
      billing_year: prevYear,
      opening_balance: 0,
      bill_amount: safePaid,
      additional_charges: 0,
      credits_or_adjustments: 0,
      total_amount_due: safePaid,
      paid_amount: safePaid,
      closing_balance: 0,
      due_date: `${prevYear}-${prevMonth.toString().padStart(2, '0')}-15`,
      payment_status: 'Paid',
      sync_device: device,
      sync_device_info: device_info,
      sync_timestamp: timestamp,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    periods.push(target);
  } else {
    target.paid_amount = safePaid;
    if (safePaid > target.total_amount_due) {
      target.total_amount_due = safePaid;
      target.bill_amount = Math.max(0, target.total_amount_due - target.opening_balance - target.additional_charges + target.credits_or_adjustments);
    }
    target.closing_balance = Number(Math.max(0, target.total_amount_due - target.paid_amount).toFixed(2));
    target.payment_status = computePaymentStatus(target.total_amount_due, target.paid_amount, target.due_date);
    target.sync_device = device;
    target.sync_device_info = device_info;
    target.sync_timestamp = timestamp;
    target.updated_at = new Date().toISOString();
  }

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('billing_periods').upsert(target);
    if (error) {
      console.error('Supabase upsert failed for billing_period:', error);
    }
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'billing_period',
    entity_id: target.id,
    action_type: 'UPDATE',
    previous_values: { paid_amount: prevPaid },
    new_values: { paid_amount: target.paid_amount, closing_balance: target.closing_balance },
    reason: reason || 'Directly edited last month paid entry',
  });

  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS], actor?.name);

  return target;
}

function computePaymentStatus(totalDue: number, totalPaid: number, dueDate: string): PaymentStatus {
  if (totalPaid >= totalDue && totalDue > 0) return 'Paid';
  if (totalPaid > 0 && totalPaid < totalDue) return 'Partially Paid';
  const today = new Date().toISOString().slice(0, 10);
  if (today > dueDate) return 'Overdue';
  return 'Pending';
}

// Carry forward / Open new month workflow
export async function carryForwardMonth(
  targetMonth: number,
  targetYear: number,
  prevMonth: number,
  prevYear: number,
  defaultDueDay: number = 5,
  actor: { id: string; name: string }
): Promise<{ countCreated: number }> {
  const customers = await getCustomers();
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let countCreated = 0;

  const dueDay = defaultDueDay; // billing due date is 5th of month as requested
  const { device, device_info, timestamp } = getDeviceInfo();

  for (const customer of customers) {
    if (!customer.is_active) continue;

    for (const sectionId of customer.assigned_section_ids) {
      // 1. Find previous period: match by exact customerId or stripped customer_code
      let prevPeriod = periods.find(
        p => (p.customer_id === customer.id || p.customer_id === customer.customer_code || p.customer_id === customer.id.replace(/^cust-/, '')) &&
             p.section_id === sectionId &&
             p.billing_month === prevMonth &&
             p.billing_year === prevYear
      );

      // Fallback: If not found in exact prevMonth, find the latest available period before targetMonth/targetYear
      if (!prevPeriod) {
        const pastPeriods = periods.filter(
          p => (p.customer_id === customer.id || p.customer_id === customer.customer_code || p.customer_id === customer.id.replace(/^cust-/, '')) &&
               p.section_id === sectionId &&
               (p.billing_year < targetYear || (p.billing_year === targetYear && p.billing_month < targetMonth))
        ).sort((a, b) => (b.billing_year * 12 + b.billing_month) - (a.billing_year * 12 + a.billing_month));
        if (pastPeriods.length > 0) {
          prevPeriod = pastPeriods[0];
        }
      }

      // STRICT USER RULE:
      // 1) Last month's current balance (closing_balance) becomes new month's prev balance (opening_balance)
      const openingBalance = prevPeriod ? Math.max(0, prevPeriod.closing_balance) : 0.00;

      // 2) Last month's current unit becomes new month's previous unit
      const lastCurrentUnit = prevPeriod ? (prevPeriod.current_unit ?? 0) : 0;

      // Check if target period already exists
      let targetPeriod = periods.find(
        p => (p.customer_id === customer.id || p.customer_id === customer.customer_code || p.customer_id === customer.id.replace(/^cust-/, '')) &&
             p.section_id === sectionId &&
             p.billing_month === targetMonth &&
             p.billing_year === targetYear
      );

      if (!targetPeriod) {
        periods.push({
          id: `bp-${customer.id}-${sectionId}-${targetMonth}-${targetYear}`,
          customer_id: customer.id,
          section_id: sectionId,
          billing_month: targetMonth,
          billing_year: targetYear,
          opening_balance: openingBalance,
          bill_amount: 0.00,
          additional_charges: 0.00,
          credits_or_adjustments: 0.00,
          total_amount_due: openingBalance,
          paid_amount: 0.00,
          closing_balance: openingBalance,
          due_date: `${targetYear}-${targetMonth.toString().padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
          payment_status: openingBalance > 0 ? 'Pending' : 'Paid',
          current_unit: 0, // In new month, current unit is empty (0) until meter reading is entered
          previous_unit: lastCurrentUnit, // Carried forward from last month's current unit!
          units_consumed: 0,
          sync_device: device,
          sync_device_info: device_info,
          sync_timestamp: timestamp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        countCreated++;
      } else {
        // If targetPeriod already exists, carry forward last month values if not yet customized
        let modified = false;
        if (targetPeriod.previous_unit === 0 && lastCurrentUnit > 0) {
          targetPeriod.previous_unit = lastCurrentUnit;
          modified = true;
        }
        if (targetPeriod.opening_balance === 0 && openingBalance > 0 && (targetPeriod.paid_amount || 0) === 0) {
          targetPeriod.opening_balance = openingBalance;
          targetPeriod.total_amount_due = Number((openingBalance + (targetPeriod.bill_amount || 0)).toFixed(2));
          targetPeriod.closing_balance = Math.max(0, Number((targetPeriod.total_amount_due - (targetPeriod.paid_amount || 0)).toFixed(2)));
          targetPeriod.payment_status = targetPeriod.closing_balance > 0 ? 'Pending' : 'Paid';
          modified = true;
        }
        if (modified) {
          targetPeriod.sync_device = device;
          targetPeriod.sync_device_info = device_info;
          targetPeriod.sync_timestamp = timestamp;
          targetPeriod.updated_at = new Date().toISOString();
          countCreated++;
        }
      }
    }
  }

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'billing_period',
    entity_id: `batch-${targetMonth}-${targetYear}`,
    action_type: 'CREATE',
    new_values: { targetMonth, targetYear, periodsGenerated: countCreated },
    reason: `Generated monthly billing period for ${targetMonth}/${targetYear} with carried forward balances & meter units`,
  });

  // Broadcast to all staff devices and push updated state to Supabase system_settings in real time
  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS], actor?.name);

  return { countCreated };
}

// -------------------------------------------------------------
// COLLECTIONS / PAYMENTS
// -------------------------------------------------------------
export async function getCollections(): Promise<Collection[]> {
  const local = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);
  if (local && local.length > 0) return local;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', STORAGE_KEYS.COLLECTIONS)
        .maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        setStored(STORAGE_KEYS.COLLECTIONS, data.value);
        return data.value as Collection[];
      }
    } catch (e) {
      console.warn('Supabase getCollections error:', e);
    }
  }
  return INITIAL_COLLECTIONS;
}

export async function addCollection(
  paymentData: Omit<Collection, 'id' | 'receipt_number' | 'created_at' | 'updated_at' | 'status'>,
  actor: { id: string; name: string }
): Promise<Collection & { updatedPeriod?: BillingPeriod }> {
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);

  // Generate unique receipt number based on collection date (YYYYMMDD)
  const { device, device_info, timestamp } = getDeviceInfo();
  const collDate = paymentData.collection_date || new Date().toISOString().slice(0, 10);
  const dateForReceipt = collDate.replace(/-/g, '');
  const receiptNum = 1000 + collections.length + 1;
  const receipt_number = `RCP-${dateForReceipt}-${receiptNum}`;

  const now = new Date();
  const dateStr = collDate;
  const timeStr = paymentData.collection_time || now.toLocaleTimeString('en-US', { hour12: false });

  const newCollection: Collection = {
    ...paymentData,
    id: `col-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
    receipt_number,
    status: 'Confirmed',
    collection_date: dateStr,
    collection_time: timeStr,
    sync_device: device,
    sync_device_info: device_info,
    sync_timestamp: timestamp,
    created_by: actor.id,
    created_by_name: actor.name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Extract month and year from collection_date or billing_period_id
  let bMonth = new Date(collDate).getMonth() + 1;
  let bYear = new Date(collDate).getFullYear();
  const idMatch = paymentData.billing_period_id.match(/-(\d{1,2})-(\d{4})$/);
  if (idMatch) {
    bMonth = parseInt(idMatch[1], 10);
    bYear = parseInt(idMatch[2], 10);
  }

  // Find target period by exact ID or by customer_id + section_id + month + year
  let period = periods.find(p => 
    p.id === paymentData.billing_period_id ||
    (p.customer_id === paymentData.customer_id &&
     p.section_id === paymentData.section_id &&
     p.billing_month === bMonth &&
     p.billing_year === bYear)
  );

  if (!period) {
    const dueDay = 5;
    period = {
      id: paymentData.billing_period_id,
      customer_id: paymentData.customer_id,
      section_id: paymentData.section_id,
      billing_month: bMonth,
      billing_year: bYear,
      opening_balance: 0,
      bill_amount: 0,
      additional_charges: 0,
      credits_or_adjustments: 0,
      total_amount_due: 0,
      paid_amount: 0,
      closing_balance: 0,
      due_date: `${bYear}-${String(bMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
      payment_status: 'Pending',
      sync_device: device,
      sync_device_info: device_info,
      sync_timestamp: timestamp,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    periods.push(period);
  }

  const prevBal = period.opening_balance || 0;
  const thisM = Number(((period.bill_amount || 0) + (period.additional_charges || 0) - (period.credits_or_adjustments || 0)).toFixed(2));
  const calculatedTotalDue = Number((prevBal + thisM).toFixed(2));
  if (calculatedTotalDue > 0) {
    period.total_amount_due = calculatedTotalDue;
  }

  period.paid_amount = Number((period.paid_amount + newCollection.amount).toFixed(2));
  period.closing_balance = Number(Math.max(0, period.total_amount_due - period.paid_amount).toFixed(2));
  period.payment_status = computePaymentStatus(period.total_amount_due, period.paid_amount, period.due_date);
  period.sync_device = device;
  period.sync_device_info = device_info;
  period.sync_timestamp = timestamp;
  period.updated_at = new Date().toISOString();
  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  collections.unshift(newCollection);
  setStored(STORAGE_KEYS.COLLECTIONS, collections);

  const supabase = getSupabaseClient();
  if (supabase) {
    supabase.from('collections').insert(newCollection).then(() => {
      if (period) supabase.from('billing_periods').upsert(period);
    }).catch(e => console.warn('Supabase sync warning in addCollection:', e));
  }

  addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'collection',
    entity_id: newCollection.id,
    action_type: 'CREATE',
    new_values: {
      receipt_number,
      amount: newCollection.amount,
      method: newCollection.payment_method,
      reference: newCollection.transaction_reference,
      device: newCollection.sync_device,
    },
    reason: 'Recorded payment collection',
  }).catch(e => console.warn('Audit log warning:', e));

  // Broadcast updated billing_periods + collections to all connected devices (non-blocking)
  broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.AUDIT_LOGS], actor?.name).catch(e => {
    console.warn('Sync broadcast warning:', e);
  });

  if (period) {
    addLedgerHistoryEntry({
      customer_id: newCollection.customer_id,
      section_id: newCollection.section_id,
      current_unit: period.current_unit ?? 0,
      prev_unit: period.previous_unit ?? 0,
      units_consumed: period.units_consumed ?? 0,
      bill_amount: period.bill_amount,
      opening_balance: period.opening_balance,
      total_amount_due: period.total_amount_due,
      paid_amount: period.paid_amount,
      payment_method: newCollection.payment_method || 'Cash',
      closing_balance: period.closing_balance,
      billing_month: period.billing_month,
      billing_year: period.billing_year,
      notes: `Payment of ₹${newCollection.amount} (${newCollection.payment_method})`,
      actor_name: actor.name,
    }).catch(err => console.warn('Ledger history warning:', err));
  }

  const resultWithPeriod = { ...newCollection, updatedPeriod: period };
  return resultWithPeriod;
}

export async function updateCollection(
  id: string,
  updates: { amount?: number; notes?: string; transaction_reference?: string; payment_method?: any },
  reason: string,
  actor: { id: string; name: string }
): Promise<Collection | undefined> {
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  const target = collections.find(c => c.id === id);
  if (!target) return undefined;

  const prevValues = {
    amount: target.amount,
    payment_method: target.payment_method,
    transaction_reference: target.transaction_reference,
    notes: target.notes,
  };

  const amountDiff = updates.amount !== undefined ? updates.amount - target.amount : 0;

  // Apply updates
  if (updates.amount !== undefined) target.amount = updates.amount;
  if (updates.notes !== undefined) target.notes = updates.notes;
  if (updates.transaction_reference !== undefined) target.transaction_reference = updates.transaction_reference || undefined;
  if (updates.payment_method !== undefined) target.payment_method = updates.payment_method;

  target.updated_by = actor.id;
  target.updated_by_name = actor.name;
  target.updated_at = new Date().toISOString();
  target.status = 'Corrected';

  // Adjust billing period if amount changed
  if (amountDiff !== 0) {
    const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
    const period = periods.find(p => p.id === target.billing_period_id);
    if (period) {
      period.paid_amount = Number((period.paid_amount + amountDiff).toFixed(2));
      period.closing_balance = Number((period.total_amount_due - period.paid_amount).toFixed(2));
      period.payment_status = computePaymentStatus(period.total_amount_due, period.paid_amount, period.due_date);
      period.updated_at = new Date().toISOString();
      setStored(STORAGE_KEYS.BILLING_PERIODS, periods);
    }
  }

  setStored(STORAGE_KEYS.COLLECTIONS, collections);

  const supabase = getSupabaseClient();
   if (supabase) {
     try {
       const payload: any = {};
       if (updates.amount !== undefined) payload.amount = updates.amount;
       if (updates.notes !== undefined) payload.notes = updates.notes;
       if (updates.transaction_reference !== undefined) payload.transaction_reference = updates.transaction_reference || null;
       if (updates.payment_method !== undefined) payload.payment_method = updates.payment_method;
       await supabase.from('collections').update(payload).eq('id', id);
       const period = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS).find(p => p.id === target.billing_period_id);
       if (period) {
         await supabase.from('billing_periods').upsert(period);
       }
     } catch (e) {
       console.warn('Supabase sync error in updateCollection:', e);
     }
   }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'collection',
    entity_id: id,
    action_type: 'UPDATE',
    previous_values: prevValues,
    new_values: { amount: target.amount, payment_method: target.payment_method, notes: target.notes },
    reason: reason || 'Authorized payment modification',
  });

  await broadcastDataSync([STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS], actor?.name);

  return target;
}

export async function reverseCollection(
  id: string,
  reason: string,
  actor: { id: string; name: string }
): Promise<void> {
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  const target = collections.find(c => c.id === id);
  if (!target || target.status === 'Reversed') return;

  target.status = 'Reversed';
  target.updated_by = actor.id;
  target.updated_by_name = actor.name;
  target.updated_at = new Date().toISOString();
  setStored(STORAGE_KEYS.COLLECTIONS, collections);

  // Record Reversal entity
  const reversals = getStored<CollectionReversal[]>(STORAGE_KEYS.REVERSALS, []);
  const reversalRecord: CollectionReversal = {
    id: `rev-${Date.now().toString().slice(-6)}`,
    collection_id: id,
    amount: target.amount,
    reason,
    reversed_by: actor.id,
    reversed_by_name: actor.name,
    reversed_at: new Date().toISOString(),
  };
  reversals.unshift(reversalRecord);
  setStored(STORAGE_KEYS.REVERSALS, reversals);

  // Recalculate billing period
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  const period = periods.find(p => p.id === target.billing_period_id);
  if (period) {
    period.paid_amount = Math.max(0, Number((period.paid_amount - target.amount).toFixed(2)));
    period.closing_balance = Number((period.total_amount_due - period.paid_amount).toFixed(2));
    period.payment_status = computePaymentStatus(period.total_amount_due, period.paid_amount, period.due_date);
    period.updated_at = new Date().toISOString();
    setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('collections').update({ status: 'Reversed', updated_by: actor.id, updated_by_name: actor.name, updated_at: target.updated_at }).eq('id', id);
        await supabase.from('billing_periods').upsert(period);
      } catch (e) {
        console.warn('Supabase sync error in reverseCollection:', e);
      }
    }
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'collection',
    entity_id: id,
    action_type: 'REVERSE',
    previous_values: { status: 'Confirmed', amount: target.amount },
    new_values: { status: 'Reversed', reversal_id: reversalRecord.id },
    reason,
  });

  await broadcastDataSync([STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS, STORAGE_KEYS.REVERSALS], actor?.name);
}

// -------------------------------------------------------------
// CASH RECONCILIATION
// -------------------------------------------------------------
export async function getCashReconciliations(): Promise<CashReconciliation[]> {
  return getStored(STORAGE_KEYS.CASH_RECONCILIATION, INITIAL_CASH_RECONCILIATION);
}

export async function saveCashReconciliation(
  data: Omit<CashReconciliation, 'id' | 'created_at' | 'updated_at' | 'difference'>,
  actor: { id: string; name: string }
): Promise<CashReconciliation> {
  const list = getStored<CashReconciliation[]>(STORAGE_KEYS.CASH_RECONCILIATION, INITIAL_CASH_RECONCILIATION);
  const expected = data.opening_cash + data.cash_collected - data.cash_refunded - data.cash_handed_over;
  const difference = Number((data.actual_closing_cash - expected).toFixed(2));

  // Find existing for this employee and date
  const index = list.findIndex(r => r.employee_id === data.employee_id && r.reconciliation_date === data.reconciliation_date);

  const entry: CashReconciliation = {
    ...data,
    id: index !== -1 ? list[index].id : `cr-${Date.now().toString().slice(-6)}`,
    difference,
    created_at: index !== -1 ? list[index].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (index !== -1) {
    list[index] = entry;
  } else {
    list.unshift(entry);
  }
  setStored(STORAGE_KEYS.CASH_RECONCILIATION, list);

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'cash_reconciliation',
    entity_id: entry.id,
    action_type: index !== -1 ? 'UPDATE' : 'CREATE',
    new_values: { employee: data.employee_name, date: data.reconciliation_date, actual: data.actual_closing_cash, diff: difference },
    reason: 'Updated daily cash reconciliation entry',
  });

  return entry;
}

// -------------------------------------------------------------
// AUDIT LOGS
// -------------------------------------------------------------
export async function getAuditLogs(): Promise<AuditLog[]> {
  const local = getStored<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  if (local && local.length > 0) return local;
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', STORAGE_KEYS.AUDIT_LOGS)
        .maybeSingle();
      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        setStored(STORAGE_KEYS.AUDIT_LOGS, data.value);
        return data.value as AuditLog[];
      }
    } catch (e) {
      console.warn('Supabase getAuditLogs error:', e);
    }
  }
  return INITIAL_AUDIT_LOGS;
}

export async function addAuditLog(entry: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
  const logs = getStored<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  const newLog: AuditLog = {
    ...entry,
    id: `log-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString(),
  };
  logs.unshift(newLog);
  const trimmed = logs.slice(0, 500);
  setStored(STORAGE_KEYS.AUDIT_LOGS, trimmed);

  try {
    const { pushKeyToCloud } = await import('./syncService');
    await pushKeyToCloud(STORAGE_KEYS.AUDIT_LOGS, trimmed, entry.actor_name);
  } catch (e) {
    console.warn('[Audit] Cloud push error:', e);
  }
}

// -------------------------------------------------------------
// DATE RANGE BALANCE MONITORING (5th-to-5th billing cycle)
// DISABLED: Auto-close was incorrectly reverting balances after payments.
// All balance management is now done manually by Owner.
// -------------------------------------------------------------
export async function autoCloseExpiredBillingPeriods(_actor?: { id: string; name: string }): Promise<{ closedCount: number }> {
  // Auto-close is DISABLED to prevent overriding actual payments.
  // Owner manually manages billing periods.
  return { closedCount: 0 };
}

// Helper: schedule is kept for compatibility but does nothing now
export function scheduleBalanceMonitor(_intervalMs: number = 60000): () => void {
  // Auto-close monitoring is disabled — no background balance resets.
  return () => {};
}

// -------------------------------------------------------------
// SYSTEM SETTINGS
// -------------------------------------------------------------
export async function getSystemSettings(): Promise<SystemSettings> {
  return getStored(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
}

export async function updateSystemSettings(
  updates: Partial<SystemSettings>,
  actor: { id: string; name: string }
): Promise<SystemSettings> {
  const settings = getStored<SystemSettings>(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
  const updated = { ...settings, ...updates };
  setStored(STORAGE_KEYS.SETTINGS, updated);

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'settings',
    entity_id: 'app_settings',
    action_type: 'UPDATE',
    new_values: updates,
    reason: 'Updated company configuration settings',
  });

  return updated;
}

// -------------------------------------------------------------
// DASHBOARD METRICS CALCULATION (From actual database records)
// -------------------------------------------------------------
export async function getDashboardMetrics(targetMonth?: number, targetYear?: number): Promise<DashboardMetrics> {
  const periods = await getBillingPeriods();
  const collections = await getCollections();
  const customers = await getCustomers();

  let currentMonth = targetMonth || 10;
  let currentYear = targetYear || 2026;
  if (!targetMonth && periods.length > 0) {
    // Pick the month that has active records with bills/dues/payments
    const periodsWithBills = periods.filter(p => (p.bill_amount && p.bill_amount > 0) || (p.paid_amount && p.paid_amount > 0) || (p.closing_balance && p.closing_balance > 0));
    const pool = periodsWithBills.length > 0 ? periodsWithBills : periods;
    const sorted = [...pool].sort((a, b) => {
      const scoreA = (a.billing_year || 2026) * 100 + (a.billing_month || 1);
      const scoreB = (b.billing_year || 2026) * 100 + (b.billing_month || 1);
      return scoreB - scoreA;
    });
    currentMonth = sorted[0]?.billing_month || 10;
    currentYear = sorted[0]?.billing_year || 2026;
  }

  const today = new Date();
  const todayUtc = today.toISOString().slice(0, 10);
  const todayLocal = today.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const currentMonthPeriods = periods.filter(p => p.billing_month === currentMonth && p.billing_year === currentYear);
  
  // Total Outstanding balance: calculated from the latest period for each customer+section
  // Prevents double-counting balances across multiple months!
  const latestPeriodMap = new Map<string, BillingPeriod>();
  for (const p of periods) {
    const key = `${p.customer_id}_${p.section_id}`;
    const score = (p.billing_year || 2026) * 100 + (p.billing_month || 1);
    const existing = latestPeriodMap.get(key);
    if (!existing || score > ((existing.billing_year || 2026) * 100 + (existing.billing_month || 1))) {
      latestPeriodMap.set(key, p);
    }
  }
  const totalOutstanding = Array.from(latestPeriodMap.values())
    .reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);

  // Collections filter
  const confirmedCols = collections.filter(c => c.status === 'Confirmed');

  // Match collections made today (supports both UTC and local timezone dates)
  const totalCollectionToday = confirmedCols
    .filter(c => c.collection_date === todayUtc || c.collection_date === todayLocal)
    .reduce((sum, c) => sum + c.amount, 0);

  // Current month collections (matches active month, cycle periods, or current calendar month)
  const activeMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const calMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const currentPeriodIds = new Set(currentMonthPeriods.map(p => p.id));
  
  const currentMonthCols = confirmedCols.filter(c => {
    if (c.billing_period_id && currentPeriodIds.has(c.billing_period_id)) return true;
    if (!c.collection_date) return false;
    return c.collection_date.startsWith(activeMonthPrefix) || c.collection_date.startsWith(calMonthPrefix);
  });
  
  const totalCollectionThisMonth = currentMonthCols.reduce((sum, c) => sum + c.amount, 0);

  const totalCashThisMonth = currentMonthCols
    .filter(c => c.payment_method === 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalOnlineThisMonth = currentMonthCols
    .filter(c => c.payment_method !== 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  // Customer status breakdown for current active month
  let fullyPaidCount = 0;
  let partiallyPaidCount = 0;
  let overdueCount = 0;
  let pendingCount = 0;

  customers.forEach(cust => {
    const custPeriods = currentMonthPeriods.filter(p => p.customer_id === cust.id);
    if (custPeriods.length === 0) return;

    const allPaid = custPeriods.every(p => p.payment_status === 'Paid');
    const hasOverdue = custPeriods.some(p => p.payment_status === 'Overdue');
    const hasPartially = custPeriods.some(p => p.payment_status === 'Partially Paid');

    if (allPaid) {
      fullyPaidCount++;
    } else if (hasOverdue) {
      overdueCount++;
    } else if (hasPartially) {
      partiallyPaidCount++;
    } else {
      pendingCount++;
    }
  });

  return {
    totalOutstanding,
    totalCollectionToday,
    totalCollectionThisMonth,
    totalCashThisMonth,
    totalOnlineThisMonth,
    totalPendingCustomers: pendingCount,
    fullyPaidCustomers: fullyPaidCount,
    partiallyPaidCustomers: partiallyPaidCount,
    overdueCustomers: overdueCount,
    totalCustomers: customers.length,
  };
}

export async function bulkImportSection1(rows: any[], actor: { id: string; name: string }, month: number = 10, year: number = 2026): Promise<{ created: number }> {
  const sectionId = 'sec-elec-001';
  const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.name) continue;
    const prefix = 'A';
    const existing = customers.filter(c => (c.customer_code || '').startsWith(prefix)).map(c => c.customer_code);
    const maxNum = existing.reduce((m, code) => {
      const n = parseInt((code || '').replace(prefix, ''), 10);
      return !isNaN(n) && n > m ? n : m;
    }, 0);
    const code = prefix + (maxNum + 1 + i);
    const cid = 'cust-' + code;
    customers.unshift({ id: cid, customer_code: code, full_name: String(r.name).trim(), phone: String(r.phone || '0000000000').trim(), email: '', house_number: '', building_name: '', address: 'Indore', city: 'Indore', notes: 'Imported from Excel', is_active: true, assigned_section_ids: [sectionId], created_by: actor.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
    const thisMonth = Number(r.this_month || 0);
    const prevBal = Number(r.prev_balance || 0);
    const pay = Number(r.pay || 0);
    const curBal = Number(r.current_balance !== undefined ? r.current_balance : Math.max(0, prevBal + thisMonth - pay));
    const curU = Number(r.current_unit || 0);
    const prevU = Number(r.prev_unit || 0);
    const u = Math.max(0, curU - prevU);
    periods.push({ id: 'bp-' + cid + '-' + sectionId + '-' + month + '-' + year, customer_id: cid, section_id: sectionId, billing_month: month, billing_year: year, opening_balance: prevBal, bill_amount: thisMonth, additional_charges: 0, credits_or_adjustments: 0, total_amount_due: Number((prevBal + thisMonth).toFixed(2)), paid_amount: pay, closing_balance: curBal, due_date: year + '-' + String(month).padStart(2, '0') + '-05', payment_status: computePaymentStatus(Number((prevBal + thisMonth).toFixed(2)), pay, year + '-' + String(month).padStart(2, '0') + '-05'), current_unit: curU, previous_unit: prevU, units_consumed: u, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
    created++;
  }
  setStored(STORAGE_KEYS.CUSTOMERS, customers);
  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('customers').upsert(customers);
      await supabase.from('billing_periods').upsert(periods);
    } catch (e) {
      console.warn('Supabase bulkImportSection1 error:', e);
    }
  }
  await addAuditLog({ actor_user_id: actor.id, actor_name: actor.name, entity_type: 'section', entity_id: sectionId, action_type: 'CREATE', reason: 'Imported ' + created + ' records into Section 1 from Excel' });
  await broadcastDataSync([STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS], actor?.name);
  return { created };
}

// -------------------------------------------------------------
// OCTOBER-26 DATA RESET & IMPORT (from public JSON files)
// Deletes old Section 1 & 2 data, imports from D1.pdf / D2.pdf.
// Runs once, guarded by 'oct26_data_imported' flag in localStorage.
// -------------------------------------------------------------
export async function importOctober26Data(actor: { id: string; name: string }): Promise<{ s1: number; s2: number }> {
  const flag = getStored<Boolean>('oct26_data_imported', false);
  if (flag === true) return { s1: 0, s2: 0 };

  // Don't re-import if data already exists for these sections
  const existingCustomers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  const hasSection1Data = existingCustomers.some(c => (c.assigned_section_ids || []).includes('sec-elec-001'));
  const hasSection2Data = existingCustomers.some(c => (c.assigned_section_ids || []).includes('sec-water-002'));
  if (hasSection1Data && hasSection2Data) {
    setStored('oct26_data_imported', true);
    return { s1: 0, s2: 0 };
  }

  const S1_ID = 'sec-elec-001';
  const S2_ID = 'sec-water-002';

  // Fetch JSON from public folder
  const [s1Resp, s2Resp] = await Promise.all([
    fetch('/section1_data.json'),
    fetch('/section2_data.json'),
  ]);
  const s1Data = await s1Resp.json();
  const s2Data = await s2Resp.json();

  // Delete old data for both sections
  const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);

  const removeIds = new Set(
    customers
      .filter(c => (c.assigned_section_ids || []).includes(S1_ID) || (c.assigned_section_ids || []).includes(S2_ID))
      .map(c => c.id)
  );

  const remCustomers = customers.filter(c => !removeIds.has(c.id));
  const remPeriods = periods.filter(p => !removeIds.has(p.customer_id));
  const remCollections = collections.filter(c => !removeIds.has(c.customer_id));

  setStored(STORAGE_KEYS.CUSTOMERS, remCustomers);
  setStored(STORAGE_KEYS.BILLING_PERIODS, remPeriods);
  setStored(STORAGE_KEYS.COLLECTIONS, remCollections);

  const now = new Date().toISOString();
  let s1Created = 0;
  let s2Created = 0;

  async function importSection(sectionId: string, data: any[], targetSectionId: string) {
    let created = 0;
    const custList = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
    const periodList = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, []);
    const colList = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, []);

    for (const row of data) {
      try {
        const code = row.customer_code || 'UNK-' + Date.now();
        const cid = 'cust-' + code;
        const opening = Number(row.prev_balance || 0);
        const billAmt = Number(row.this_month || 0);
        const paidAmt = Number(row.pay || 0);
        const closing = Math.max(0, opening + billAmt - paidAmt);
        const totalDue = opening + billAmt;
        const curUnit = Number(row.current_unit || 0);
        const prevUnit = Number(row.previous_unit || 0);
        const units = Number(row.units_consumed || Math.max(0, curUnit - prevUnit));
        const pid = 'bp-' + cid + '-' + targetSectionId + '-10-2026';

        custList.push({
          id: cid,
          customer_code: code,
          full_name: row.full_name || 'Unknown',
          phone: '0000000000',
          email: '',
          house_number: '',
          building_name: '',
          address: 'Indore',
          city: 'Indore',
          notes: 'Imported from PDF October-26',
          is_active: true,
          assigned_section_ids: [targetSectionId],
          created_by: actor.id,
          created_at: now,
          updated_at: now,
        } as Customer);

        periodList.push({
          id: pid,
          customer_id: cid,
          section_id: targetSectionId,
          billing_month: 10,
          billing_year: 2026,
          opening_balance: opening,
          bill_amount: billAmt,
          additional_charges: 0,
          credits_or_adjustments: 0,
          total_amount_due: totalDue,
          paid_amount: paidAmt,
          closing_balance: closing,
          due_date: '2026-10-05',
          payment_status: closing <= 0 ? 'Paid' : 'Pending',
          current_unit: curUnit,
          previous_unit: prevUnit,
          units_consumed: units,
          created_at: now,
          updated_at: now,
        } as BillingPeriod);

        if (paidAmt > 0) {
          const rn = 1000 + colList.length + 1;
          colList.push({
            id: 'col-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substr(2, 4),
            receipt_number: 'RCP-202610-' + rn,
            customer_id: cid,
            billing_period_id: pid,
            section_id: targetSectionId,
            amount: paidAmt,
            payment_method: 'Cash',
            transaction_reference: undefined,
            notes: 'Imported from PDF October-26',
            status: 'Confirmed',
            collection_date: '2026-10-05',
            collection_time: '10:00:00',
            created_by: actor.id,
            created_by_name: actor.name,
            created_at: now,
            updated_at: now,
          } as Collection);
        }

        created++;
      } catch (e) {
        console.error('Import error ' + row.customer_code + ':', e);
      }
    }

    setStored(STORAGE_KEYS.CUSTOMERS, custList);
    setStored(STORAGE_KEYS.BILLING_PERIODS, periodList);
    setStored(STORAGE_KEYS.COLLECTIONS, colList);
    return created;
  }

  s1Created = await importSection(S1_ID, s1Data, S1_ID);
  s2Created = await importSection(S2_ID, s2Data, S2_ID);

  setStored('oct26_data_imported', true);

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'section',
    entity_id: 'bulk_import_oct26',
    action_type: 'CREATE',
    reason: 'October-26 data reset: imported ' + s1Created + ' Section 1 + ' + s2Created + ' Section 2 records from PDFs',
  });
  await broadcastDataSync([STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.AUDIT_LOGS]);

  return { s1: s1Created, s2: s2Created };
}


// -------------------------------------------------------------
// LEDGER HISTORY (2ND SHEET CONTINUOUS AUDIT TRAIL)
// -------------------------------------------------------------
export async function getLedgerHistory(customerId?: string, sectionId?: string): Promise<LedgerHistoryEntry[]> {
  let list = getStored<LedgerHistoryEntry[]>(STORAGE_KEYS.LEDGER_HISTORY, []);
  if (!list || list.length === 0) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', STORAGE_KEYS.LEDGER_HISTORY)
          .maybeSingle();
        if (!error && data?.value && Array.isArray(data.value)) {
          setStored(STORAGE_KEYS.LEDGER_HISTORY, data.value);
          list = data.value;
        }
      } catch (e) {
        console.warn('Supabase getLedgerHistory error:', e);
      }
    }
  }

  if (customerId) {
    list = list.filter(h => h.customer_id === customerId);
  }
  if (sectionId && sectionId !== 'all') {
    list = list.filter(h => h.section_id === sectionId);
  }
  return list;
}

export async function addLedgerHistoryEntry(
  entry: Omit<LedgerHistoryEntry, 'id' | 'timestamp' | 'date_time_str'> & {
    id?: string;
    timestamp?: string;
    date_time_str?: string;
  }
): Promise<LedgerHistoryEntry> {
  const history = getStored<LedgerHistoryEntry[]>(STORAGE_KEYS.LEDGER_HISTORY, []);
  const now = new Date();
  const date_time_str = entry.date_time_str || now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const newEntry: LedgerHistoryEntry = {
    id: entry.id || `hist-${entry.customer_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: entry.timestamp || now.toISOString(),
    date_time_str,
    customer_id: entry.customer_id,
    section_id: entry.section_id,
    current_unit: entry.current_unit,
    prev_unit: entry.prev_unit,
    units_consumed: entry.units_consumed,
    bill_amount: entry.bill_amount,
    opening_balance: entry.opening_balance,
    total_amount_due: entry.total_amount_due,
    paid_amount: entry.paid_amount,
    payment_method: entry.payment_method || '-',
    closing_balance: entry.closing_balance,
    billing_month: entry.billing_month,
    billing_year: entry.billing_year,
    notes: entry.notes || '',
    actor_name: entry.actor_name || 'Staff',
  };

  history.unshift(newEntry);
  setStored(STORAGE_KEYS.LEDGER_HISTORY, history);

  await broadcastDataSync([STORAGE_KEYS.LEDGER_HISTORY], entry.actor_name);
  return newEntry;
}
