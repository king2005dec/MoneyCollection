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
};

// Local storage helpers with fallback to initial seed
function getStored<T>(key: string, defaultData: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultData));
      return defaultData;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return defaultData;
  }
}

const syncBroadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('money_collection_live_sync') 
  : null;

export function notifySync(key?: string) {
  if (syncBroadcast) {
    try {
      syncBroadcast.postMessage({ key, timestamp: Date.now() });
    } catch (e) {
      // ignore
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Broadcast sync – pushes actual data payloads to all connected devices
// AppContext will register a sender function here after connecting
// ─────────────────────────────────────────────────────────────────────────────
type BroadcastSendFn = (key: string, data: unknown) => Promise<void>;
let _broadcastSender: BroadcastSendFn | null = null;

export function setBroadcastSender(fn: BroadcastSendFn | null): void {
  _broadcastSender = fn;
}

async function broadcastDataSync(changedKeys: string[]): Promise<void> {
  if (!_broadcastSender) return;
  for (const key of changedKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      await _broadcastSender(key, data);
    } catch (e) {
      console.warn('[Sync] broadcastDataSync error for key', key, e);
    }
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    notifySync(key);
  } catch (err) {
    console.error(`Error writing ${key} to storage:`, err);
  }
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
    const { count, error } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    if (!error && (count === 0 || count === null)) {
      const customers = getStored<Customer[]>(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
      const sections = getStored<CollectionSection[]>(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS);
      const profiles = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
      const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
      const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);

      await supabase.from('profiles').upsert(profiles);
      await supabase.from('collection_sections').upsert(sections);
      await supabase.from('customers').upsert(customers);
      await supabase.from('billing_periods').upsert(periods);
      await supabase.from('collections').upsert(collections);
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
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (!error && data && data.length > 0) return data;
  }
  let loaded = getStored<Profile[]>(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
  
  // Ensure all INITIAL_PROFILES (with correct usernames & passwords) are present and up to date
  let updated = false;
  INITIAL_PROFILES.forEach(initP => {
    const existingIndex = loaded.findIndex(p => p.id === initP.id || (p.username && initP.username && p.username.toLowerCase() === initP.username.toLowerCase()));
    if (existingIndex >= 0) {
      if (loaded[existingIndex].password !== initP.password || loaded[existingIndex].username !== initP.username || loaded[existingIndex].full_name !== initP.full_name) {
        loaded[existingIndex] = { ...loaded[existingIndex], username: initP.username, password: initP.password, role: initP.role, full_name: initP.full_name };
        updated = true;
      }
    } else {
      loaded.push(initP);
      updated = true;
    }
  });

  if (updated) {
    setStored(STORAGE_KEYS.PROFILES, loaded);
  }

  return loaded.map(p => ({
    ...p,
    assigned_sections: p.assigned_sections && p.assigned_sections.length > 0
      ? p.assigned_sections
      : (p.role === 'owner' ? ['Section 1', 'Section 2', 'Section 3'] : ['Section 1', 'Section 2']),
  }));
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
    await supabase.from('profiles').insert(newProfile);
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
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('collection_sections').select('*').order('created_at', { ascending: true });
    if (!error && data && data.length > 0) return data;
  }
  const loaded = getStored(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS);
  // Ensure legacy names are normalized to Section 1, Section 2, Section 3
  const normalized = loaded.map(s => {
    if (s.code === 'electricity') return { ...s, name: 'Section 1' };
    if (s.code === 'water') return { ...s, name: 'Section 2' };
    if (s.code === 'other') return { ...s, name: 'Section 3' };
    return s;
  });
  return normalized;
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
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        setStored(STORAGE_KEYS.CUSTOMERS, data);
        return data;
      }
    } catch (e) {
      console.warn('Supabase getCustomers error:', e);
    }
  }
  const loaded = getStored(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
  // Ensure every customer has proper Section 1=A, Section 2=B, Section 3=C ID
  return loaded.map((c, idx) => {
    if (c.customer_code && /^[ABC]\d+$/i.test(c.customer_code)) {
      return c;
    }
    const prefix = c.assigned_section_ids?.includes('sec-water-002')
      ? 'B'
      : c.assigned_section_ids?.includes('sec-other-003')
      ? 'C'
      : 'A';
    return {
      ...c,
      customer_code: `${prefix}${idx + 1}`,
    };
  });
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
  const customers = await getCustomers();
  return customers.find(c => c.id === id);
}

export async function createCustomer(
  customerData: Omit<Customer, 'id' | 'customer_code' | 'created_at' | 'updated_at'>,
  actor: { id: string; name: string }
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

  // Automatically create billing periods for the current month for each assigned section
  const currentMonth = 10;
  const currentYear = 2026;
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
      due_date: '2026-10-05',
      payment_status: 'Pending',
      current_unit: 0,
      previous_unit: 0,
      units_consumed: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  setStored(STORAGE_KEYS.BILLING_PERIODS, billingPeriods);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('customers').insert(newCustomer);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'customer',
    entity_id: newCustomer.id,
    action_type: 'CREATE',
    new_values: { code: customer_code, name: newCustomer.full_name, phone: newCustomer.phone },
    reason: `Registered new customer with ID ${customer_code}`,
  });

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
  const target = customers.find(c => c.id === id);
  if (!target) return;

  const remaining = customers.filter(c => c.id !== id);
  setStored(STORAGE_KEYS.CUSTOMERS, remaining);

  const billingPeriods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  const remainingPeriods = billingPeriods.filter(p => p.customer_id !== id);
  setStored(STORAGE_KEYS.BILLING_PERIODS, remainingPeriods);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('customers').delete().eq('id', id);
    await supabase.from('billing_periods').delete().eq('customer_id', id);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'customer',
    entity_id: id,
    action_type: 'DELETE',
    previous_values: { code: target.customer_code, name: target.full_name },
    reason: `Deleted resident ${target.full_name} (${target.customer_code})`,
  });
}

// -------------------------------------------------------------
// BILLING PERIODS
// -------------------------------------------------------------
export async function getBillingPeriods(): Promise<BillingPeriod[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('billing_periods').select('*').order('billing_year', { ascending: false }).order('billing_month', { ascending: false });
      if (!error && data && data.length > 0) {
        setStored(STORAGE_KEYS.BILLING_PERIODS, data);
        return data;
      }
    } catch (e) {
      console.warn('Supabase getBillingPeriods error:', e);
    }
  }
  return getStored(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
}

export async function getBillingPeriodById(id: string): Promise<BillingPeriod | undefined> {
  const periods = await getBillingPeriods();
  return periods.find(p => p.id === id);
}

export async function updateBillingPeriodCharges(
  id: string,
  charges: {
    bill_amount?: number;
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
  actor: { id: string; name: string }
): Promise<BillingPeriod | undefined> {
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  const target = periods.find(p => p.id === id);
  if (!target) return undefined;

  const prevValues = {
    bill_amount: target.bill_amount,
    additional_charges: target.additional_charges,
    credits_or_adjustments: target.credits_or_adjustments,
    paid_amount: target.paid_amount,
    closing_balance: target.closing_balance,
    current_unit: target.current_unit,
    previous_unit: target.previous_unit,
    units_consumed: target.units_consumed,
  };

  if (charges.bill_amount !== undefined) target.bill_amount = charges.bill_amount;
  if (charges.additional_charges !== undefined) target.additional_charges = charges.additional_charges;
  if (charges.credits_or_adjustments !== undefined) target.credits_or_adjustments = charges.credits_or_adjustments;
  if (charges.due_date) target.due_date = charges.due_date;
  if (charges.paid_amount !== undefined) target.paid_amount = charges.paid_amount;
  if (charges.current_unit !== undefined) target.current_unit = charges.current_unit;
  if (charges.previous_unit !== undefined) target.previous_unit = charges.previous_unit;
  if (charges.units_consumed !== undefined) {
    target.units_consumed = charges.units_consumed;
  } else if (charges.current_unit !== undefined) {
    const prevU = target.previous_unit || 0;
    target.units_consumed = Math.max(0, charges.current_unit - prevU);
  }

  if (charges.closing_balance !== undefined) {
    target.closing_balance = charges.closing_balance;
    target.total_amount_due = Number((target.paid_amount + target.closing_balance).toFixed(2));
  } else {
    // Recalculate totals
    target.total_amount_due = Number((target.opening_balance + target.bill_amount + target.additional_charges - target.credits_or_adjustments).toFixed(2));
    target.closing_balance = Number((target.total_amount_due - target.paid_amount).toFixed(2));
  }

  target.payment_status = computePaymentStatus(target.total_amount_due, target.paid_amount, target.due_date);
  target.updated_at = new Date().toISOString();

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('billing_periods').upsert(target);
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

  // Broadcast updated billing_periods to all connected devices
  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS]);

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
    p => p.customer_id === customerId &&
         p.section_id === sectionId &&
         p.billing_month === month &&
         p.billing_year === year
  );

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
      opening_balance: 0,
      bill_amount: safeDue,
      additional_charges: 0,
      credits_or_adjustments: 0,
      total_amount_due: safeDue,
      paid_amount: 0,
      closing_balance: safeDue,
      due_date: `${year}-${month.toString().padStart(2, '0')}-15`,
      payment_status: safeDue === 0 ? 'Paid' : 'Pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    periods.push(target);
  } else {
    target.closing_balance = safeDue;
    target.total_amount_due = Number((target.paid_amount + safeDue).toFixed(2));
    target.bill_amount = Math.max(
      0,
      Number((target.total_amount_due - target.opening_balance - target.additional_charges + target.credits_or_adjustments).toFixed(2))
    );
    target.payment_status = computePaymentStatus(target.total_amount_due, target.paid_amount, target.due_date);
    target.updated_at = new Date().toISOString();
  }

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('billing_periods').upsert(target);
  }

  await addAuditLog({
    actor_user_id: actor.id,
    actor_name: actor.name,
    entity_type: 'billing_period',
    entity_id: target.id,
    action_type: 'UPDATE',
    previous_values: { closing_balance: prevClosing },
    new_values: { closing_balance: target.closing_balance, total_amount_due: target.total_amount_due },
    reason: reason || 'Directly edited remaining due',
  });

  // Broadcast to all connected devices
  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS]);

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
    target.updated_at = new Date().toISOString();
  }

  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('billing_periods').upsert(target);
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

  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS]);

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

  const dueDate = `${targetYear}-${targetMonth.toString().padStart(2, '0')}-${defaultDueDay.toString().padStart(2, '0')}`;
  const dueDay = defaultDueDay; // billing due date is 5th of month as requested

  for (const customer of customers) {
    if (!customer.is_active) continue;

    for (const sectionId of customer.assigned_section_ids) {
      // Check if period already exists
      const exists = periods.some(
        p => p.customer_id === customer.id &&
             p.section_id === sectionId &&
             p.billing_month === targetMonth &&
             p.billing_year === targetYear
      );

      if (!exists) {
        // Find previous period closing balance - carry forward automatically
        const prevPeriod = periods.find(
          p => p.customer_id === customer.id &&
               p.section_id === sectionId &&
               p.billing_month === prevMonth &&
               p.billing_year === prevYear
        );

        const openingBalance = prevPeriod ? Math.max(0, prevPeriod.closing_balance) : 0.00;

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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        countCreated++;
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
    reason: `Generated monthly billing period for ${targetMonth}/${targetYear} with carried forward balances`,
  });

  return { countCreated };
}

// -------------------------------------------------------------
// COLLECTIONS / PAYMENTS
// -------------------------------------------------------------
export async function getCollections(): Promise<Collection[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('collections').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        setStored(STORAGE_KEYS.COLLECTIONS, data);
        return data;
      }
    } catch (e) {
      console.warn('Supabase getCollections error:', e);
    }
  }
  return getStored(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
}

export async function addCollection(
  paymentData: Omit<Collection, 'id' | 'receipt_number' | 'created_at' | 'updated_at' | 'status'>,
  actor: { id: string; name: string }
): Promise<Collection> {
  const collections = getStored<Collection[]>(STORAGE_KEYS.COLLECTIONS, INITIAL_COLLECTIONS);
  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);

  // Generate unique receipt number e.g. RCP-202610-1015
  const receiptNum = 1000 + collections.length + 1;
  const receipt_number = `RCP-202610-${receiptNum}`;

  const now = new Date();
  const dateStr = paymentData.collection_date || '2026-10-22';
  const timeStr = paymentData.collection_time || now.toLocaleTimeString('en-US', { hour12: false });

  const newCollection: Collection = {
    ...paymentData,
    id: `col-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
    receipt_number,
    status: 'Confirmed',
    collection_date: dateStr,
    collection_time: timeStr,
    created_by: actor.id,
    created_by_name: actor.name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Update or create billing period
  let period = periods.find(p => p.id === paymentData.billing_period_id);
  if (!period) {
    period = {
      id: paymentData.billing_period_id,
      customer_id: paymentData.customer_id,
      section_id: paymentData.section_id,
      billing_month: 10,
      billing_year: 2026,
      opening_balance: 0,
      bill_amount: 0,
      additional_charges: 0,
      credits_or_adjustments: 0,
      total_amount_due: 0,
      paid_amount: 0,
      closing_balance: 0,
      due_date: '2026-10-05',
      payment_status: 'Pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    periods.push(period);
  }

  period.paid_amount = Number((period.paid_amount + newCollection.amount).toFixed(2));
  if (period.total_amount_due < period.paid_amount) {
    period.total_amount_due = period.paid_amount;
  }
  period.closing_balance = Number(Math.max(0, period.total_amount_due - period.paid_amount).toFixed(2));
  period.payment_status = computePaymentStatus(period.total_amount_due, period.paid_amount, period.due_date);
  period.updated_at = new Date().toISOString();
  setStored(STORAGE_KEYS.BILLING_PERIODS, periods);

  collections.unshift(newCollection);
  setStored(STORAGE_KEYS.COLLECTIONS, collections);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('collections').insert(newCollection);
      if (period) {
        await supabase.from('billing_periods').upsert(period);
      }
    } catch (e) {
      console.warn('Supabase sync error in addCollection:', e);
    }
  }

  await addAuditLog({
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
    },
    reason: 'Recorded payment collection',
  });

  // Broadcast updated billing_periods + collections to all connected devices
  await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.AUDIT_LOGS]);

  return newCollection;
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

  await broadcastDataSync([STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS]);

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

  await broadcastDataSync([STORAGE_KEYS.COLLECTIONS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS, STORAGE_KEYS.REVERSALS]);
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
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (!error && data && data.length > 0) return data;
  }
  return getStored(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
}

export async function addAuditLog(entry: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
  const logs = getStored<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  const newLog: AuditLog = {
    ...entry,
    id: `log-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
    created_at: new Date().toISOString(),
  };
  logs.unshift(newLog);
  setStored(STORAGE_KEYS.AUDIT_LOGS, logs);

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('audit_logs').insert(newLog);
  }
}

// -------------------------------------------------------------
// DATE RANGE BALANCE MONITORING
// If current date exceeds balanceMonitorEndDate (MM/DD/YYYY),
// automatically revert closing_balance to opening_balance (previous balance)
// for all billing periods that still have an outstanding current balance.
// -------------------------------------------------------------
export async function autoCloseExpiredBillingPeriods(actor?: { id: string; name: string }): Promise<{ closedCount: number }> {
  const settings = await getSystemSettings();
  const endDateStr = settings.balanceMonitorEndDate;
  if (!endDateStr) return { closedCount: 0 };

  // Parse end date from MM/DD/YYYY
  const endParts = endDateStr.split('/');
  if (endParts.length !== 3) return { closedCount: 0 };
  const endMonth = parseInt(endParts[0], 10);
  const endDay = parseInt(endParts[1], 10);
  const endYear = parseInt(endParts[2], 10);
  if (isNaN(endMonth) || isNaN(endDay) || isNaN(endYear)) return { closedCount: 0 };

  const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59);
  const now = new Date();

  // Only act if current date exceeds end date
  if (now <= endDate) return { closedCount: 0 };

  const periods = getStored<BillingPeriod[]>(STORAGE_KEYS.BILLING_PERIODS, INITIAL_BILLING_PERIODS);
  let closedCount = 0;
  let changed = false;

  for (const period of periods) {
    if (period.closing_balance > 0 && period.closing_balance !== period.opening_balance) {
      const prevClosing = period.closing_balance;
      period.closing_balance = period.opening_balance; // revert to previous balance
      period.total_amount_due = Number((period.paid_amount + period.closing_balance).toFixed(2));
      period.payment_status = computePaymentStatus(period.total_amount_due, period.paid_amount, period.due_date);
      period.updated_at = new Date().toISOString();
      changed = true;
      closedCount++;

      await addAuditLog({
        actor_user_id: actor?.id || 'system',
        actor_name: actor?.name || 'System',
        entity_type: 'billing_period',
        entity_id: period.id,
        action_type: 'STATUS_CHANGE',
        previous_values: { closing_balance: prevClosing, payment_status: period.payment_status },
        new_values: { closing_balance: period.closing_balance, payment_status: period.payment_status },
        reason: `Auto-closed expired period (past end date ${endDateStr}): reverted current balance to previous balance`,
      });
    }
  }

  if (changed) {
    setStored(STORAGE_KEYS.BILLING_PERIODS, periods);
    await broadcastDataSync([STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS]);
  }

  return { closedCount };
}

// Helper: check and auto-close on every app load / periodic tick
export function scheduleBalanceMonitor(intervalMs: number = 60000): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const runCheck = async () => {
    try {
      await autoCloseExpiredBillingPeriods();
    } catch (e) {
      console.warn('[BalanceMonitor] auto-close check failed:', e);
    }
  };

  // Run immediately once
  runCheck();

  // Then poll at the given interval
  timer = setInterval(runCheck, intervalMs);

  return () => {
    if (timer) clearInterval(timer);
  };
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
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const periods = await getBillingPeriods();
  const collections = await getCollections();
  const customers = await getCustomers();

  // Current month based on today's date
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const todayStr = today.toISOString().slice(0, 10);
  const currentMonthPeriods = periods.filter(p => p.billing_month === currentMonth && p.billing_year === currentYear);
  
  // Total Outstanding balance across all billing periods
  const totalOutstanding = periods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);

  // Collections filter
  const confirmedCols = collections.filter(c => c.status === 'Confirmed');

  const totalCollectionToday = confirmedCols
    .filter(c => c.collection_date === todayStr)
    .reduce((sum, c) => sum + c.amount, 0);

  // Current month collections
  const currentMonthCols = confirmedCols.filter(c => c.collection_date.startsWith(`${currentYear}-${String(currentMonth).padStart(2, '0')}`));
  const totalCollectionThisMonth = currentMonthCols.reduce((sum, c) => sum + c.amount, 0);

  const totalCashThisMonth = currentMonthCols
    .filter(c => c.payment_method === 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalOnlineThisMonth = currentMonthCols
    .filter(c => c.payment_method !== 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  // Customer status breakdown for current month
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
  await broadcastDataSync([STORAGE_KEYS.CUSTOMERS, STORAGE_KEYS.BILLING_PERIODS, STORAGE_KEYS.AUDIT_LOGS]);
  return { created };
}

