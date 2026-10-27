import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  getSupabaseCredentials,
  setCustomSupabaseCredentials,
  testSupabaseConnection,
  isSupabaseConnected,
} from '../services/supabaseClient';
import { Database, X, CheckCircle2, ShieldCheck, Copy, Terminal, ExternalLink } from 'lucide-react';

export const SupabaseSetupModal: React.FC = () => {
  const { supabaseModalOpen, setSupabaseModalOpen, showToast, triggerDbRefresh } = useApp();
  const credentials = getSupabaseCredentials();

  const [url, setUrl] = useState(credentials.url);
  const [anonKey, setAnonKey] = useState(credentials.anonKey);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!supabaseModalOpen) return null;

  const isConnected = isSupabaseConnected();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomSupabaseCredentials(url, anonKey);
    showToast('Supabase connection configuration saved!');
    triggerDbRefresh();
  };

  const handleTest = async () => {
    if (!url.trim() || !anonKey.trim()) {
      showToast('Please provide both Project URL and Anon Key.', 'error');
      return;
    }

    setTesting(true);
    const res = await testSupabaseConnection(url, anonKey);
    setTesting(false);

    if (res.success) {
      showToast('Successfully connected to Supabase PostgreSQL!');
    } else {
      showToast(`Connection failed: ${res.message}`, 'error');
    }
  };

  const handleCopySchemaNotice = () => {
    navigator.clipboard.writeText(`psql -h db.supabase.co -U postgres -d postgres -f supabase/schema.sql`);
    setCopied(true);
    showToast('Migration command copied!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-600 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Supabase Database Integration</h3>
              <p className="text-xs text-emerald-100">Live PostgreSQL Database & Schema Architecture</p>
            </div>
          </div>
          <button onClick={() => setSupabaseModalOpen(false)} className="p-1 rounded-lg text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status box */}
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-950 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-xs">Complete PostgreSQL Schema & RLS Included</p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                The application runs with persistent storage, full audit trails, and financial integrity right now. To connect directly to your own Supabase Cloud project, simply enter your credentials below.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs focus:outline-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                Supabase Anon / Public Key
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                value={anonKey}
                onChange={e => setAnonKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs focus:outline-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs"
              >
                Save Credentials
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </form>

          {/* Schema setup steps */}
          <div className="pt-3 border-t border-slate-100">
            <span className="font-bold text-slate-800 block mb-1">1-Minute Setup in Supabase Dashboard:</span>
            <ol className="list-decimal pl-4 space-y-1 text-slate-600 text-[11px]">
              <li>Log in to your Supabase project at <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 underline">supabase.com</a></li>
              <li>Go to <strong>SQL Editor</strong> &gt; <strong>New Query</strong>.</li>
              <li>Paste the contents of <code>/supabase/schema.sql</code> and click <strong>Run</strong>.</li>
              <li>Copy your Project URL and Anon API key from <strong>Project Settings &gt; API</strong> and paste here.</li>
            </ol>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleCopySchemaNotice}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied CLI Command!' : 'Copy Schema Run Command'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={() => setSupabaseModalOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
