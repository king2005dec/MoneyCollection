/**
 * syncService.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Unified Real-Time Sync & Cloud Backend for all 4 devices (Raj + 3 Staff)
 *
 * Backed by Supabase `system_settings` (Cloud Store) + Supabase Realtime Broadcast.
 * Works seamlessly across all devices, browsers, and mobile phones.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { getSupabaseClient } from './supabaseClient';

const CHANNEL_NAME = 'raj_collection_sync_v3';

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
  LEDGER_HISTORY:      'col_db_ledger_history_v1',
};

const ALL_KEYS = Object.values(SYNC_KEYS);

let _channel: any = null;
let _onRefresh: (() => void) | null = null;
let _showNotification: ((msg: string) => void) | null = null;
let _deviceId = typeof window !== 'undefined'
  ? (sessionStorage.getItem('col_device_id') || Math.random().toString(36).slice(2, 10))
  : 'server';

if (typeof window !== 'undefined') {
  sessionStorage.setItem('col_device_id', _deviceId);
}

// Track remote timestamps to prevent echo loops
const _lastSyncedTimestamps: Record<string, string> = {};

/**
 * Write to localStorage safely
 */
export function writeLocal(key: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[Sync] writeLocal error:', e);
  }
}

/**
 * Read from localStorage safely
 */
export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/**
 * Pull a specific key from Supabase cloud
 */
export async function pullKeyFromCloud<T = unknown>(key: string): Promise<T | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle();

    if (!error && data?.value !== undefined && data.value !== null) {
      if (data.updated_at) {
        _lastSyncedTimestamps[key] = data.updated_at;
      }
      writeLocal(key, data.value);
      return data.value as T;
    }
  } catch (e) {
    console.warn(`[Sync] pullKeyFromCloud error for ${key}:`, e);
  }
  return null;
}

/**
 * Pull all core data keys from Supabase cloud at once
 */
export async function pullAllFromCloud(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value, updated_at')
      .in('key', ALL_KEYS);

    if (!error && data && data.length > 0) {
      let anyUpdated = false;
      for (const row of data) {
        if (row.value !== undefined && row.value !== null) {
          const prevTs = _lastSyncedTimestamps[row.key];
          if (!prevTs || prevTs !== row.updated_at) {
            _lastSyncedTimestamps[row.key] = row.updated_at;
            writeLocal(row.key, row.value);
            anyUpdated = true;
          }
        }
      }
      return anyUpdated;
    }
  } catch (e) {
    console.warn('[Sync] pullAllFromCloud error:', e);
  }
  return false;
}

/**
 * Push data for a key to Supabase cloud and notify other devices
 */
export async function pushKeyToCloud(key: string, data: unknown, actorName?: string): Promise<void> {
  // 1. Save to local storage first (instant)
  writeLocal(key, data);

  // 2. Notify local tabs via BroadcastChannel
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('money_collection_live_sync');
      bc.postMessage({ key, timestamp: Date.now() });
      bc.close();
    } catch { /* ignore */ }
  }

  // 3. Save to Supabase cloud
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const nowStr = new Date().toISOString();
      _lastSyncedTimestamps[key] = nowStr;

      const { error } = await supabase.from('system_settings').upsert({
        key,
        value: data,
        updated_at: nowStr,
      });

      if (error) {
        console.warn(`[Sync] Supabase upsert error on ${key}:`, error.message);
      }
    } catch (e) {
      console.warn(`[Sync] Supabase push error on ${key}:`, e);
    }

    // 4. Send lightweight real-time broadcast to all 3 other devices
    if (_channel) {
      try {
        await _channel.send({
          type: 'broadcast',
          event: 'data_changed',
          payload: {
            key,
            actorName: actorName || 'Staff',
            deviceId: _deviceId,
            timestamp: Date.now(),
          },
        });
      } catch (e) {
        console.warn('[Sync] Broadcast send error:', e);
      }
    }
  }
}

/**
 * Called after any write operation (payments, balance edits, meter updates)
 */
export async function syncAfterWrite(changedKeys: string[], actorName?: string): Promise<void> {
  const supabase = getSupabaseClient();
  const nowStr = new Date().toISOString();

  // 1. Write locally and to Supabase for all changed keys
  for (const key of changedKeys) {
    const data = readLocal(key, null);
    if (data !== null) {
      writeLocal(key, data);
      if (supabase) {
        _lastSyncedTimestamps[key] = nowStr;
        try {
          await supabase.from('system_settings').upsert({
            key,
            value: data,
            updated_at: nowStr,
          });
        } catch (e) {
          console.warn(`[Sync] Supabase upsert error on ${key}:`, e);
        }
      }
    }
  }

  // 2. Notify other tabs on same device via BroadcastChannel
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('money_collection_live_sync');
      bc.postMessage({ keys: changedKeys, timestamp: Date.now() });
      bc.close();
    } catch { /* ignore */ }
  }

  // 3. Send single Supabase Realtime broadcast with all changed keys
  if (_channel) {
    try {
      await _channel.send({
        type: 'broadcast',
        event: 'data_changed',
        payload: {
          key: changedKeys[0] || 'all',
          keys: changedKeys,
          actorName: actorName || 'Staff',
          deviceId: _deviceId,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      console.warn('[Sync] Broadcast send error:', e);
    }
  }
}

/**
 * Initialize real-time sync listeners & polling
 */
export function initSync(
  onRefresh: () => void,
  showNotification?: (msg: string) => void
): () => void {
  _onRefresh = onRefresh;
  _showNotification = showNotification || null;

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[Sync] No Supabase client – offline mode only');
    return () => {};
  }

  // 1. Initial cloud fetch on startup
  pullAllFromCloud().then((updated) => {
    if (updated) {
      _onRefresh?.();
    }
  });

  // 2. Real-time Supabase Broadcast channel
  try {
    _channel = supabase
      .channel(CHANNEL_NAME, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'data_changed' }, async (msg: any) => {
        const { key, keys, actorName, deviceId } = msg?.payload || {};
        if (deviceId === _deviceId) return; // Don't process own broadcasts

        console.log(`[Sync] Live change received from ${actorName} on ${key || (keys && keys.join(','))}`);

        const incomingKeys: string[] = Array.isArray(keys) && keys.length > 0 ? keys : (key ? [key] : []);
        const toPull = new Set<string>(incomingKeys);

        // Core data bundle: always pull together so resident info & billing periods stay 100% in sync
        if (incomingKeys.some(k => k === SYNC_KEYS.CUSTOMERS || k === SYNC_KEYS.BILLING_PERIODS || k === SYNC_KEYS.COLLECTIONS || k === SYNC_KEYS.LEDGER_HISTORY)) {
          toPull.add(SYNC_KEYS.CUSTOMERS);
          toPull.add(SYNC_KEYS.BILLING_PERIODS);
          toPull.add(SYNC_KEYS.COLLECTIONS);
          toPull.add(SYNC_KEYS.LEDGER_HISTORY);
        }

        let anyUpdated = false;
        await Promise.all(Array.from(toPull).map(async (k) => {
          if (ALL_KEYS.includes(k)) {
            const res = await pullKeyFromCloud(k);
            if (res !== null) anyUpdated = true;
          }
        }));

        if (anyUpdated) {
          _onRefresh?.();

          if (actorName && _showNotification) {
            const friendlyKey =
              toPull.has(SYNC_KEYS.CUSTOMERS) ? 'Resident Info' :
              toPull.has(SYNC_KEYS.BILLING_PERIODS) ? 'Balances & Ledger' :
              toPull.has(SYNC_KEYS.COLLECTIONS) ? 'Payments' :
              toPull.has(SYNC_KEYS.LEDGER_HISTORY) ? 'Resident History' :
              toPull.has(SYNC_KEYS.AUDIT_LOGS) ? 'Activity Logs' : 'Data';
            _showNotification(`${actorName} updated ${friendlyKey} in real-time`);
          }
        }
      })
      .subscribe((status: string) => {
        console.log('[Sync] Realtime channel status:', status);
        if (status === 'SUBSCRIBED') {
          // Pull again to ensure nothing was missed during connection
          pullAllFromCloud().then((updated) => {
            if (updated) _onRefresh?.();
          });
        }
      });
  } catch (err) {
    console.warn('[Sync] Error setting up Realtime channel:', err);
  }

  // 3. Heartbeat polling every 4 seconds as a 100% reliable fallback
  // Ensures all 4 devices stay in sync even with flaky network or locked phone screens
  const pollInterval = setInterval(async () => {
    const updated = await pullAllFromCloud();
    if (updated) {
      _onRefresh?.();
    }
  }, 4000);

  // 4. Cross-tab sync on same machine
  const handleStorage = (e: StorageEvent) => {
    if (e.key && ALL_KEYS.includes(e.key)) {
      _onRefresh?.();
    }
  };
  window.addEventListener('storage', handleStorage);

  let bc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    bc = new BroadcastChannel('money_collection_live_sync');
    bc.onmessage = () => {
      _onRefresh?.();
    };
  }

  // Cleanup on unmount
  return () => {
    clearInterval(pollInterval);
    window.removeEventListener('storage', handleStorage);
    if (bc) bc.close();
    if (_channel && supabase) {
      supabase.removeChannel(_channel);
      _channel = null;
    }
    _onRefresh = null;
    _showNotification = null;
  };
}
