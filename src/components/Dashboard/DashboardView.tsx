import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  DashboardMetrics,
  Collection,
  Customer,
  BillingPeriod,
  CollectionSection,
  Profile,
} from '../../types';
import {
  getDashboardMetrics,
  getCollections,
  getCustomers,
  getBillingPeriods,
  getProfiles,
  getSections,
} from '../../services/databaseService';
import { getSupabaseClient } from '../../services/supabaseClient';
import { StatCards } from './StatCards';
import { SectionOverviewCards } from './SectionOverviewCards';
import { CollectionCharts } from './CollectionCharts';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Filter,
  Calendar,
  Receipt,
  Eye,
  PlusCircle,
  FileSpreadsheet,
  RotateCcw,
  Pencil,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const {
    dbVersion,
    openPaymentModal,
    openEditPaymentModal,
    openReversePaymentModal,
    openReceiptModal,
    openCustomerProfile,
    setActivePage,
  } = useApp();

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filters
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'this_month' | 'last_month' | 'custom'>('this_month');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all');
  const [selectedMethodFilter, setSelectedMethodFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPendingAbove500, setShowPendingAbove500] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, cols, custs, periods, secs, profs] = await Promise.all([
        getDashboardMetrics(),
        getCollections(),
        getCustomers(),
        getBillingPeriods(),
        getSections(),
        getProfiles(),
      ]);
      setMetrics(m);
      setCollections(cols);
      setCustomers(custs);
      setBillingPeriods(periods);
      setSections(secs);
      setProfiles(profs);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dbVersion]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key && (e.key.startsWith('col_db_') || e.key.includes('collections') || e.key.includes('billing') || e.key.includes('audit'))) {
        loadData();
      }
    };
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('money_collection_live_sync') : null;
    if (bc) {
      bc.onmessage = () => loadData();
    }

    const supabase = getSupabaseClient();
    let channel: any = null;
    if (supabase) {
      try {
        channel = supabase
          .channel('money_collection_dashboard_sync')
          .on('broadcast', { event: 'data_sync' }, (payload: any) => {
            const key = payload?.payload?.key;
            if (!key) {
              loadData();
              return;
            }
            if (key.includes('collections') || key.includes('billing') || key.includes('customers') || key.includes('audit')) {
              loadData();
            }
          })
          .subscribe();
      } catch (e) {
        console.warn('Dashboard supabase sync error:', e);
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      if (bc) bc.close();
      if (supabase && channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {}
      }
    };
  }, []);

  // Filtered collections for the table
  const filteredCollections = collections.filter(col => {
    if (selectedSectionFilter !== 'all' && col.section_id !== selectedSectionFilter) return false;
    if (selectedEmployeeFilter !== 'all' && col.created_by !== selectedEmployeeFilter) return false;
    if (selectedMethodFilter !== 'all' && col.payment_method !== selectedMethodFilter) return false;

    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateFilter === 'today' && col.collection_date !== today) return false;
    if (dateFilter === 'yesterday' && col.collection_date !== yest) return false;

    const cust = customers.find(c => c.id === col.customer_id);
    if (showPendingAbove500) {
      const custPeriods = billingPeriods.filter(p => p.customer_id === col.customer_id);
      const totalDue = custPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);
      if (totalDue < 500) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesReceipt = col.receipt_number.toLowerCase().includes(q);
      const matchesCustomer = cust ? cust.full_name.toLowerCase().includes(q) || cust.customer_code.toLowerCase().includes(q) : false;
      const matchesRef = col.transaction_reference?.toLowerCase().includes(q) || false;
      if (!matchesReceipt && !matchesCustomer && !matchesRef) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Date Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Billing & Collection Control Centre
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time verified collections for electricity, water, and society dues • Indore Jurisdiction
          </p>
        </div>

        {/* Date Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => { setDateFilter('today'); setShowPendingAbove500(false); }}
            className={`px-3 py-1.5 rounded-lg transition ${
              dateFilter === 'today' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => { setDateFilter('yesterday'); setShowPendingAbove500(false); }}
            className={`px-3 py-1.5 rounded-lg transition ${
              dateFilter === 'yesterday' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setDateFilter('week')}
            className={`px-3 py-1.5 rounded-lg transition ${
              dateFilter === 'week' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setDateFilter('this_month')}
            className={`px-3 py-1.5 rounded-lg transition ${
              dateFilter === 'this_month' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            This Month (Oct 2026)
          </button>
            <button
              onClick={() => setShowPendingAbove500(!showPendingAbove500)}
              className={`px-3 py-1.5 rounded-lg transition text-xs font-semibold ${showPendingAbove500 ? 'bg-rose-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Pending &gt; 499
            </button>
          </div>
      </div>

      {/* 1. Main Stat Cards */}
      {metrics && <StatCards metrics={metrics} />}

      {/* 2. Three Configurable Section Cards */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">Sections (1, 2, 3)</h2>
            <p className="text-xs text-slate-500">Tap any section to view its assigned residents & dues</p>
          </div>
          {isOwner && (
            <button
              onClick={() => setActivePage('settings')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Settings &rarr;
            </button>
          )}
        </div>
        <SectionOverviewCards
          sections={sections}
          customers={customers}
          billingPeriods={billingPeriods}
        />
      </div>

      {/* 3. Interactive Charts & Intelligence */}
      <CollectionCharts
        collections={collections}
        billingPeriods={billingPeriods}
        sections={sections}
        profiles={profiles}
      />

      {/* 4. Recent Collections Table with Quick Filters */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Header & Filters */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              Recent Collection Entries
            </h2>
            <p className="text-xs text-slate-500">
              Audit-verified financial logs with creator identity and instant thermal receipt printing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search receipt / resident..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500 w-44 sm:w-56"
              />
            </div>

            {/* Filter Section */}
            <select
              value={selectedSectionFilter}
              onChange={e => setSelectedSectionFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-blue-500"
            >
              <option value="all">All Sections</option>
              <option value="sec-elec-001">Section 1</option>
              <option value="sec-water-002">Section 2</option>
              <option value="sec-other-003">Section 3</option>
            </select>

            {/* Filter Employee */}
            <select
              value={selectedEmployeeFilter}
              onChange={e => setSelectedEmployeeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-blue-500"
            >
              <option value="all">All Field Admins</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>

            {/* Filter Method */}
            <select
              value={selectedMethodFilter}
              onChange={e => setSelectedMethodFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-700 focus:outline-blue-500"
            >
              <option value="all">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
        </div>

        {/* Collections Table */}
        {/* MOBILE VIEW: Touch Cards */}
        <div className="md:hidden divide-y divide-slate-100 p-3 space-y-2.5">
          {filteredCollections.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              No transactions match your active filters.
            </div>
          ) : (
            filteredCollections.slice(0, 8).map(col => {
              const cust = customers.find(c => c.id === col.customer_id);
              const sDisplayName = col.section_id.includes('elec') ? 'Section 1' : col.section_id.includes('water') ? 'Section 2' : 'Section 3';
              const isCash = col.payment_method === 'Cash';
              const isReversed = col.status === 'Reversed';

              return (
                <div key={col.id} className="bg-slate-50/70 rounded-xl p-3 border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-blue-600">{col.receipt_number}</span>
                    <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold uppercase ${
                      isReversed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {col.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <button
                        onClick={() => cust && openCustomerProfile(cust.id)}
                        className="font-bold text-slate-900 text-left block text-xs hover:text-blue-600"
                      >
                        {cust?.full_name || 'Resident'} <span className="font-mono text-[10px] text-blue-600 font-bold bg-blue-50 px-1 py-0.2 rounded ml-1">{cust?.customer_code}</span>
                      </button>
                      <span className="text-[10px] text-slate-500">
                        {sDisplayName} • {col.payment_method}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className={`font-extrabold text-sm ${isReversed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {formatCurrency(col.amount)}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {col.collection_date}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                    <span className="text-[10px] text-slate-500">Staff: {col.created_by_name?.split(' ')[0]}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openReceiptModal(col)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 font-bold text-[10px] hover:bg-slate-50"
                      >
                        Receipt
                      </button>
                      {!isReversed && (
                        <button
                          onClick={() => openEditPaymentModal(col)}
                          className="px-2 py-1 bg-white border border-slate-200 rounded text-amber-700 font-bold text-[10px]"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* DESKTOP VIEW: Full Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Resident</th>
                <th className="py-3 px-4">Section</th>
                <th className="py-3 px-4">Date & Time (IST)</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Staff</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCollections.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No transactions match your active filters.
                  </td>
                </tr>
              ) : (
                filteredCollections.slice(0, 10).map(col => {
                  const cust = customers.find(c => c.id === col.customer_id);
                  const sDisplayName = col.section_id.includes('elec') ? 'Section 1' : col.section_id.includes('water') ? 'Section 2' : 'Section 3';
                  const isCash = col.payment_method === 'Cash';
                  const isReversed = col.status === 'Reversed';

                  return (
                    <tr key={col.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">
                        {col.receipt_number}
                      </td>

                      <td className="py-3 px-4">
                        <button
                          onClick={() => cust && openCustomerProfile(cust.id)}
                          className="font-bold text-slate-900 hover:text-blue-600 transition text-left block"
                        >
                          {cust?.full_name || 'Resident'} <span className="font-mono text-[10px] text-blue-600 font-bold bg-blue-50 px-1 py-0.2 rounded ml-1">{cust?.customer_code}</span>
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {cust?.house_number}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-700">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-semibold">
                          {sDisplayName}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {col.collection_date} • {col.collection_time?.slice(0, 5)}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          isCash ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {col.payment_method}
                        </span>
                        {col.transaction_reference && (
                          <span className="block text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                            {col.transaction_reference}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {col.created_by_name || 'Admin'}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isReversed
                            ? 'bg-rose-100 text-rose-700'
                            : col.status === 'Corrected'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {col.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm">
                        {isReversed ? (
                          <span className="line-through text-slate-400">{formatCurrency(col.amount)}</span>
                        ) : (
                          formatCurrency(col.amount)
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openReceiptModal(col)}
                            title="View / Print Receipt"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>

                          {!isReversed && (
                            <button
                              onClick={() => openEditPaymentModal(col)}
                              title="Edit Entry"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {isOwner && !isReversed && (
                            <button
                              onClick={() => openReversePaymentModal(col)}
                              title="Reverse Transaction"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* View All Footer */}
        <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing latest entries out of {collections.length} verified records</span>
          <button
            onClick={() => setActivePage('transactions')}
            className="font-bold text-blue-600 hover:text-blue-700 transition"
          >
            View All Transactions &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
