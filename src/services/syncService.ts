/**
 * syncService.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Central real-time sync layer for all 4 devices (Owner + 3 Staff).
 *
 * HOW IT WORKS
 * ─────────────
 * 1. Every device subscribes to ONE shared Supabase Broadcast channel.
 * 2. After any write (payment, balance update, audit log), the writer:
 *      a. Saves to localStorage (instant local display)
 *      b. Upserts to Supabase DB  (persistent storage)
 *      c. Sends the updated rows over Broadcast (instant cross-device push)
 * 3. Receivers:
 *      a. Write received data to their localStorage
 *      b. Call triggerDbRefresh() → React re-renders instantly
 * 4. On new device connect → broadcasts a "state_request" event.
 *    Whoever is online responds with a "state_response" containing their full state.
 * 5. Every 30s, all devices pull from Supabase DB to stay in sync with
 *    any updates they might have missed (network drop, page hidden, etc.)
 *
 * CHANNEL: 'raj_collection_sync_v3'  (single shared channel for all devices)
 * EVENTS:
 *   data_sync        – push updated key → data to others
 *   state_request    – new device asking for full state
 *   state_response   – existing device sending back full state
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { getSupabaseClient } from './supabaseClient';

const CHANNEL_NAME = 'raj_collection_sync_v3';

// All localStorage keys that must be synced across devices
export const SYNC_KEYS = {
  BILLING_PERIODS:     'col_db_billing_periods_v6',
  COLLECTIONS:         'col_db_collections_v6',
  AUDIT_LOGS:          'col_db_audit_logs_v1',
  CUSTOMERS:           'col_db_customers_v6',
  PROFILES:            'col_db_profiles_v1',
  SECTIONS:            'col_db_sections_v2',
  REVERSALS:           'col_db_reversals_v1',
  CASH_RECONCILIATION: 'col_db_cash_recon_v1',
  SETTINGS:            'col_db_settings_v1',
};

const ALL_SYNC_KEYS = Object.values(SYNC_KEYS);

// ─── Module-level state ────────────────────────────────────────────────────────
let _channel: any = null;
let _onRefresh: (() => void) | null = null;
let _deviceId = '';

/** Write data to localStorage */
function writeLocal(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[Sync] writeLocal error:', e);
  }
}

/** Read all sync keys from localStorage as a plain object */
function readAllLocal(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALL_SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { out[key] = JSON.parse(raw); } catch { /* skip */ }
    }
  }
  return out;
}

/** Apply a full state snapshot received from another device */
function applySnapshot(snapshot: Record<string, unknown>): void {
  for (const [key, data] of Object.entries(snapshot)) {
    if (ALL_SYNC_KEYS.includes(key) && data) {
      writeLocal(key, data);
    }
  }
}

/** Merge arrays by id – keep newest updated_at per id */
function mergeArrays(local: unknown, remote: unknown): unknown {
  if (!Array.isArray(local) || !Array.isArray(remote)) return remote ?? local;
  const map = new Map<string, any>();
  for (const item of local) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of remote) {
    if (!item?.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      // Keep whichever was updated most recently
      const existingTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const remoteTs   = item.updated_at     ? new Date(item.updated_at).getTime()     : 0;
      if (remoteTs >= existingTs) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

/** Smart-merge a received snapshot: merge arrays, overwrite scalars */
function mergeSnapshot(snapshot: Record<string, unknown>): void {
  for (const [key, remoteData] of Object.entries(snapshot)) {
    if (!ALL_SYNC_KEYS.includes(key)) continue;
    const raw = localStorage.getItem(key);
    const localData = raw ? JSON.parse(raw) : null;
    const merged = mergeArrays(localData, remoteData);
    writeLocal(key, merged);
  }
}

// ─── Pull from Supabase DB ─────────────────────────────────────────────────────
export async function pullFromSupabase(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  let anyData = false;
  try {
    const [customers, billing, collections, profiles, sections, reversals, audit] = await Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('billing_periods').select('*'),
      supabase.from('collections').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('collection_sections').select('*'),
      supabase.from('collection_reversals').select('*').order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500),
    ]);

    if (customers.data?.length) { writeLocal(SYNC_KEYS.CUSTOMERS, customers.data); anyData = true; }
    if (billing.data?.length)   { writeLocal(SYNC_KEYS.BILLING_PERIODS, billing.data); anyData = true; }
    if (collections.data?.length) { writeLocal(SYNC_KEYS.COLLECTIONS, collections.data); anyData = true; }
    if (profiles.data?.length)  { writeLocal(SYNC_KEYS.PROFILES, profiles.data); anyData = true; }
    if (sections.data?.length)  { writeLocal(SYNC_KEYS.SECTIONS, sections.data); anyData = true; }
    if (reversals.data?.length) { writeLocal(SYNC_KEYS.REVERSALS, reversals.data); anyData = true; }
    if (audit.data?.length)     { writeLocal(SYNC_KEYS.AUDIT_LOGS, audit.data); anyData = true; }
  } catch (e) {
    console.warn('[Sync] pullFromSupabase error:', e);
  }
  return anyData;
}

// ─── Push a single key to Supabase DB ─────────────────────────────────────────
const TABLE_MAP: Record<string, string> = {
  [SYNC_KEYS.CUSTOMERS]:           'customers',
  [SYNC_KEYS.BILLING_PERIODS]:     'billing_periods',
  [SYNC_KEYS.COLLECTIONS]:         'collections',
  [SYNC_KEYS.PROFILES]:            'profiles',
  [SYNC_KEYS.SECTIONS]:            'collection_sections',
  [SYNC_KEYS.REVERSALS]:           'collection_reversals',
  [SYNC_KEYS.AUDIT_LOGS]:          'audit_logs',
};

export async function pushKeyToSupabase(key: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const table = TABLE_MAP[key];
  if (!table) return;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length === 0) return;
    // Upsert in batches of 100 to avoid payload limits
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
      if (error) console.warn(`[Sync] upsert error on ${table}:`, error.message);
    }
  } catch (e) {
    console.warn('[Sync] pushKeyToSupabase error:', e);
  }
}

// ─── Send data to other devices over Broadcast ────────────────────────────────
export async function broadcastKeys(keys: string[]): Promise<void> {
  if (!_channel) return;
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      await _channel.send({
        type: 'broadcast',
        event: 'data_sync',
        payload: { key, data, from: _deviceId },
      });
    } catch (e) {
      console.warn('[Sync] broadcast send error:', e);
    }
  }
}

// ─── Main public API ───────────────────────────────────────────────────────────

/**
 * Call this once on app startup.
 * @param onRefresh - callback to trigger React re-render (setDbVersion(v=>v+1))
 * @returns cleanup function to call on unmount
 */
export function initSync(onRefresh: () => void): () => void {
  _onRefresh = onRefresh;
  _deviceId = Math.random().toString(36).slice(2, 10);

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[Sync] No Supabase client – sync disabled');
    return () => {};
  }

  // ── Build channel ──
  _channel = supabase
    .channel(CHANNEL_NAME, {
      config: { broadcast: { self: false, ack: false } },
    })

    // 1. Receive targeted key update from another device
    .on('broadcast', { event: 'data_sync' }, (msg: any) => {
      const { key, data } = msg?.payload || {};
      if (key && data && ALL_SYNC_KEYS.includes(key)) {
        const raw = localStorage.getItem(key);
        const localData = raw ? JSON.parse(raw) : null;
        const merged = mergeArrays(localData, data);
        writeLocal(key, merged);
        _onRefresh?.();
      }
    })

    // 2. Someone new joined – they are asking for our full state
    .on('broadcast', { event: 'state_request' }, (msg: any) => {
      const requesterId = msg?.payload?.deviceId;
      if (!requesterId || requesterId === _deviceId) return;
      console.log('[Sync] State request from', requesterId);
      // Send them our full current state
      _channel?.send({
        type: 'broadcast',
        event: 'state_response',
        payload: {
          from: _deviceId,
          to: requesterId,
          snapshot: readAllLocal(),
        },
      });
    })

    // 3. Another device responded to our state request
    .on('broadcast', { event: 'state_response' }, (msg: any) => {
      const { to, snapshot } = msg?.payload || {};
      if (to !== _deviceId || !snapshot) return;
      console.log('[Sync] Received full state from', msg?.payload?.from);
      mergeSnapshot(snapshot);
      _onRefresh?.();
    })

    .subscribe(async (status: string) => {
      console.log('[Sync] Channel status:', status);
      if (status === 'SUBSCRIBED') {
        // Step 1: Try pulling from Supabase DB first
        const gotDbData = await pullFromSupabase();
        if (gotDbData) {
          _onRefresh?.();
        }

        // Step 2: Ask other online devices for their state (covers data not in DB)
        setTimeout(() => {
          _channel?.send({
            type: 'broadcast',
            event: 'state_request',
            payload: { deviceId: _deviceId },
          });
        }, 500);
      }
    });

  // ── Periodic re-pull from Supabase every 30s (catch missed updates) ──
  const pollInterval = setInterval(async () => {
    const got = await pullFromSupabase();
    if (got) _onRefresh?.();
  }, 30_000);

  // ── localStorage storage event (same browser, different tabs) ──
  const handleStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('col_db_')) _onRefresh?.();
  };
  window.addEventListener('storage', handleStorage);

  // ── Cleanup ──
  return () => {
    clearInterval(pollInterval);
    window.removeEventListener('storage', handleStorage);
    _channel = null;
    _onRefresh = null;
    supabase.removeAllChannels();
  };
}

/**
 * Call this after EVERY write operation (payment, balance update, etc.)
 * It broadcasts updated data to all devices AND upserts to Supabase DB.
 */
export async function syncAfterWrite(changedKeys: string[]): Promise<void> {
  // 1. Broadcast to all devices immediately (sub-second)
  await broadcastKeys(changedKeys);

  // 2. Persist to Supabase DB in background (no await – don't block UI)
  for (const key of changedKeys) {
    pushKeyToSupabase(key).catch(e =>
      console.warn('[Sync] background pushKeyToSupabase failed:', e)
    );
  }
}

