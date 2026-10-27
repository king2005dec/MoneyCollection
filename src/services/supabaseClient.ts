import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables or custom local storage override
const LOCAL_STORAGE_KEY_URL = 'app_supabase_url';
const LOCAL_STORAGE_KEY_KEY = 'app_supabase_anon_key';

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wwremqgjkwhprambdlwc.supabase.co';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_UqPFp0hjCCKklqPZx8XzHA_5w93MP9r';

  const customUrl = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY_URL) : null;
  const customKey = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY_KEY) : null;

  return {
    url: customUrl || envUrl,
    anonKey: customKey || envKey,
  };
}

export function setCustomSupabaseCredentials(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    if (url && anonKey) {
      localStorage.setItem(LOCAL_STORAGE_KEY_URL, url.trim());
      localStorage.setItem(LOCAL_STORAGE_KEY_KEY, anonKey.trim());
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY_URL);
      localStorage.removeItem(LOCAL_STORAGE_KEY_KEY);
    }
    // Reinitialize client
    _supabaseClient = null;
  }
}

let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey || url === 'https://your-project.supabase.co' || anonKey === 'your-anon-key-here') {
    return null;
  }

  if (!_supabaseClient) {
    try {
      _supabaseClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return _supabaseClient;
}

export function isSupabaseConnected(): boolean {
  return getSupabaseClient() !== null;
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const testClient = createClient(url, anonKey);
    const { error } = await testClient.from('collection_sections').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Connected to Supabase project successfully!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Connection failed' };
  }
}
