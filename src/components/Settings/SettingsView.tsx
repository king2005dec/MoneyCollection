import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { SystemSettings, CollectionSection } from '../../types';
import {
  getSystemSettings,
  updateSystemSettings,
  getSections,
  updateSectionName,
} from '../../services/databaseService';
import {
  getSupabaseCredentials,
  setCustomSupabaseCredentials,
  testSupabaseConnection,
} from '../../services/supabaseClient';
import { Breadcrumbs } from '../Breadcrumbs';
import {
  Settings,
  Save,
  Database,
  Building,
  Phone,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Zap,
  Droplets,
  Layers,
  FileCode,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const { dbVersion, triggerDbRefresh, refreshSections, showToast, setActivePage } = useApp();

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [defaultDueDay, setDefaultDueDay] = useState<number>(15);
  const [receiptPrefix, setReceiptPrefix] = useState('RCP');
  const [allowAdvance, setAllowAdvance] = useState(true);

  // Section names
  const [elecName, setElecName] = useState('');
  const [waterName, setWaterName] = useState('');
  const [otherName, setOtherName] = useState('');

  // Supabase Credentials
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sett, secs] = await Promise.all([getSystemSettings(), getSections()]);
        setSettings(sett);
        setSections(secs);

        setBusinessName(sett.business_name);
        setBusinessPhone(sett.business_phone);
        setBusinessAddress(sett.business_address);
        setDefaultDueDay(sett.default_due_day);
        setReceiptPrefix(sett.receipt_prefix);
        setAllowAdvance(sett.allow_advance_payments);

        const elec = secs.find(s => s.code === 'electricity');
        const water = secs.find(s => s.code === 'water');
        const other = secs.find(s => s.code === 'other');

        if (elec) setElecName(elec.name);
        if (water) setWaterName(water.name);
        if (other) setOtherName(other.name);

        const creds = getSupabaseCredentials();
        setSupabaseUrl(creds.url);
        setSupabaseKey(creds.anonKey);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  if (!isOwner) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">
          System configuration, section renaming, and Supabase database settings are restricted exclusively to the Business Owner.
        </p>
      </div>
    );
  }

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      await updateSystemSettings(
        {
          business_name: businessName.trim(),
          business_phone: businessPhone.trim(),
          business_address: businessAddress.trim(),
          default_due_day: defaultDueDay,
          receipt_prefix: receiptPrefix.trim(),
          allow_advance_payments: allowAdvance,
        },
        actor
      );

      showToast('Company settings updated successfully!');
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update settings', 'error');
    }
  };

  const handleSaveSectionNames = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      const elec = sections.find(s => s.code === 'electricity');
      const water = sections.find(s => s.code === 'water');
      const other = sections.find(s => s.code === 'other');

      if (elec && elecName.trim() && elecName !== elec.name) {
        await updateSectionName(elec.id, elecName.trim(), actor);
      }
      if (water && waterName.trim() && waterName !== water.name) {
        await updateSectionName(water.id, waterName.trim(), actor);
      }
      if (other && otherName.trim() && otherName !== other.name) {
        await updateSectionName(other.id, otherName.trim(), actor);
      }

      showToast('Section names updated! Historical billing records preserved safely.');
      await refreshSections();
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update section names', 'error');
    }
  };

  const handleSaveSupabaseCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomSupabaseCredentials(supabaseUrl, supabaseKey);
    showToast('Supabase connection parameters updated!');
    triggerDbRefresh();
  };

  const handleTestConnection = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      showToast('Please enter both Supabase URL and Anon Key.', 'error');
      return;
    }

    setTestingConnection(true);
    const result = await testSupabaseConnection(supabaseUrl, supabaseKey);
    setTestingConnection(false);

    if (result.success) {
      showToast('Connected to Supabase PostgreSQL successfully!');
    } else {
      showToast(`Connection error: ${result.message}`, 'error');
    }
  };

  const handleCopySchemaSql = () => {
    navigator.clipboard.writeText(`-- View /supabase/schema.sql in the project workspace for full SQL migration`);
    setCopiedSql(true);
    showToast('SQL migration command copied to clipboard!');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'System Settings' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-purple-600" />
            Owner Configuration & Section Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Configure business information, rename billing sections without breaking historical ledgers, and manage Supabase database
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActivePage('employees')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Add / Manage Users</span>
          </button>
          <span className="px-3 py-1.5 rounded-lg bg-purple-100 text-purple-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Owner Access
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Company Information */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
            <Building className="w-5 h-5 text-blue-600" />
            Business & Receipt Identity
          </h2>

          <form onSubmit={handleSaveCompanySettings} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                Company / Agency Name *
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-blue-600 font-semibold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Helpline / Contact Phone
                </label>
                <input
                  type="text"
                  value={businessPhone}
                  onChange={e => setBusinessPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Default Billing Due Day
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={defaultDueDay}
                  onChange={e => setDefaultDueDay(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                Office Address (Printed on Receipts)
              </label>
              <input
                type="text"
                value={businessAddress}
                onChange={e => setBusinessAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  disabled
                  value="INR (₹) - Indian Rupee"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Display Timezone
                </label>
                <input
                  type="text"
                  disabled
                  value="Asia/Kolkata (IST)"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 font-bold"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition"
              >
                Save Business Profile
              </button>
            </div>
          </form>
        </div>

        {/* 2. Three Configurable Section Names */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Layers className="w-5 h-5 text-blue-600" />
              Configure Section 1, Section 2 & Section 3
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Customize or manage Section 1, Section 2, and Section 3 headers and invoices while preserving all ledger balances.
            </p>
          </div>

          <form onSubmit={handleSaveSectionNames} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-500" />
                Section 1 Name
              </label>
              <input
                type="text"
                required
                value={elecName}
                onChange={e => setElecName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-bold focus:outline-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-500" />
                Section 2 Name
              </label>
              <input
                type="text"
                required
                value={waterName}
                onChange={e => setWaterName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-bold focus:outline-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-500" />
                Section 3 Name
              </label>
              <input
                type="text"
                required
                value={otherName}
                onChange={e => setOtherName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-bold focus:outline-purple-500"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm transition"
              >
                Update Section Names
              </button>
            </div>
          </form>
        </div>

        {/* 3. Supabase Cloud Connection & SQL Migrations */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              Supabase PostgreSQL Database & SQL Schema Migrations
            </h2>
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-bold">
              RLS Secured & Stored Procedures Enabled
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* Credentials form */}
            <form onSubmit={handleSaveSupabaseCredentials} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Supabase Anon Public API Key
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                >
                  Save Credentials
                </button>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg"
                >
                  {testingConnection ? 'Testing Connection...' : 'Test Connection'}
                </button>
              </div>
            </form>

            {/* SQL Schema Details Box */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-blue-600" />
                  Pre-configured Database Schema
                </span>
                <span className="font-mono text-[10px] text-slate-400">supabase/schema.sql</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                The complete PostgreSQL schema including table structures for <code>profiles</code>, <code>collection_sections</code>, <code>customers</code>, <code>billing_periods</code>, <code>collections</code>, <code>collection_reversals</code>, <code>audit_logs</code>, and <code>cash_reconciliation</code> is prepared in <code>/supabase/schema.sql</code>.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCopySchemaSql}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-bold text-[11px]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSql ? 'Copied!' : 'Copy SQL Schema Path'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
