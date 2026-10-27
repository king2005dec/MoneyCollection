import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Customer, BillingPeriod, CollectionSection, Profile, Collection } from '../../types';
import {
  getCustomers,
  getBillingPeriods,
  getSections,
  getProfiles,
  getCollections,
} from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, formatDate, getMonthName } from '../../utils/formatters';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  CreditCard,
  Eye,
  Calendar,
  Zap,
} from 'lucide-react';

export const PendingPaymentsView: React.FC = () => {
  const { isOwner } = useAuth();
  const { dbVersion, openCustomerProfile, openPaymentModal } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'partially_paid' | 'overdue' | 'pending'>('all');
  const [monthFilter, setMonthFilter] = useState<'all' | '10' | '9'>('10');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [c, b, s, p, cols] = await Promise.all([
          getCustomers(),
          getBillingPeriods(),
          getSections(),
          getProfiles(),
          getCollections(),
        ]);
        setCustomers(c);
        setBillingPeriods(b);
        setSections(s);
        setProfiles(p);
        setCollections(cols);
      } catch (err) {
        console.error('Failed to load pending payments:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  // Build rows: periods that have an outstanding closing_balance > 0
  const pendingPeriods = billingPeriods.filter(p => p.closing_balance > 0);

  const todayStr = '2026-10-22';

  const rows = pendingPeriods.map(period => {
    const cust = customers.find(c => c.id === period.customer_id);
    const sec = sections.find(s => s.id === period.section_id);

    // Calculate days overdue
    let daysOverdue = 0;
    if (period.due_date && todayStr > period.due_date) {
      const dueD = new Date(period.due_date);
      const currD = new Date(todayStr);
      const diffTime = Math.abs(currD.getTime() - dueD.getTime());
      daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Last payment for this customer & section
    const custCols = collections
      .filter(c => c.customer_id === period.customer_id && c.section_id === period.section_id && c.status === 'Confirmed')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastCol = custCols[0] || null;

    // Assigned field admin (based on created_by of customer or default)
    const admin = profiles.find(p => p.id === cust?.created_by) || profiles[1] || null;

    return {
      period,
      customer: cust,
      section: sec,
      daysOverdue,
      lastPaymentDate: lastCol ? lastCol.collection_date : 'No payment yet',
      adminName: admin ? admin.full_name : 'Staff',
      adminId: admin ? admin.id : '',
    };
  });

  // Filter rows
  const filtered = rows.filter(r => {
    if (!r.customer) return false;

    // Status filter
    if (statusFilter === 'partially_paid' && r.period.payment_status !== 'Partially Paid') return false;
    if (statusFilter === 'overdue' && r.period.payment_status !== 'Overdue') return false;
    if (statusFilter === 'pending' && r.period.payment_status !== 'Pending') return false;

    // Month filter
    if (monthFilter !== 'all' && r.period.billing_month.toString() !== monthFilter) return false;

    // Section filter
    if (sectionFilter !== 'all' && r.period.section_id !== sectionFilter) return false;

    // Employee filter
    if (employeeFilter !== 'all' && r.adminId !== employeeFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.customer.full_name.toLowerCase().includes(q);
      const matchPhone = r.customer.phone.includes(q);
      const matchCode = r.customer.customer_code.toLowerCase().includes(q);
      const matchAddr = (r.customer.house_number + ' ' + (r.customer.building_name || '')).toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchCode && !matchAddr) return false;
    }

    return true;
  });

  const totalOutstandingSum = filtered.reduce((sum, r) => sum + r.period.closing_balance, 0);

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'Pending Payments' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-rose-600" />
            Pending & Overdue Balances
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time arrears tracking with overdue days count and one-click quick payment recording
          </p>
        </div>

        <div className="bg-rose-50 border border-rose-200/80 rounded-xl px-4 py-2.5 text-right">
          <span className="text-[10px] uppercase font-bold text-rose-600 block">Total Arrears Filtered</span>
          <span className="text-xl font-extrabold text-rose-700">{formatCurrency(totalOutstandingSum)}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, phone, flat #, or ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Arrears</option>
            <option value="overdue">Overdue Only</option>
            <option value="partially_paid">Partially Paid Only</option>
            <option value="pending">Pending Cycle Only</option>
          </select>

          {/* Month */}
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="10">Current Month (October)</option>
            <option value="9">Previous Month (September)</option>
            <option value="all">All Billing Cycles</option>
          </select>

          {/* Section */}
          <select
            value={sectionFilter}
            onChange={e => setSectionFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Sections</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Employee */}
          <select
            value={employeeFilter}
            onChange={e => setEmployeeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Field Staff</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Pending Accounts: Mobile Card View + Desktop Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Cards (md:hidden) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No pending dues found matching your filters.
            </div>
          ) : (
            filtered.map(row => {
              const isOverdue = row.period.payment_status === 'Overdue';
              return (
                <div
                  key={row.period.id}
                  className="p-4 space-y-2.5 active:bg-slate-50 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{row.customer?.full_name}</span>
                        <span className="font-mono text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">
                          {row.customer?.customer_code}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 block">
                        {row.customer?.house_number} • {row.customer?.phone}
                      </span>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 shrink-0">
                      {row.section?.name || 'Section'}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Pending Balance</span>
                      <span className="text-base font-extrabold text-rose-600">
                        {formatCurrency(row.period.closing_balance)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">
                        Due: {row.period.due_date || '—'}
                      </span>
                      {isOverdue && row.daysOverdue > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                          <AlertCircle className="w-3 h-3" /> {row.daysOverdue}d overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => openPaymentModal(row.customer!.id, row.section?.id, row.period.id)}
                      className="flex-1 py-2 rounded-lg bg-blue-600 active:bg-blue-700 text-white font-bold text-xs shadow-xs text-center"
                    >
                      Collect Now
                    </button>
                    <button
                      onClick={() => openCustomerProfile(row.customer!.id)}
                      className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-medium text-xs"
                    >
                      Ledger
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">Customer ID</th>
                <th className="py-3 px-3.5">Resident & Address</th>
                <th className="py-3 px-3.5">Contact</th>
                <th className="py-3 px-3.5">Section</th>
                <th className="py-3 px-3.5">Month</th>
                <th className="py-3 px-3.5 text-right">Total Due</th>
                <th className="py-3 px-3.5 text-right">Paid</th>
                <th className="py-3 px-3.5 text-right">Remaining Pending</th>
                <th className="py-3 px-3.5">Due Date & Overdue</th>
                <th className="py-3 px-3.5">Last Payment</th>
                <th className="py-3 px-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No pending dues found matching your filters. Great job on collections!
                  </td>
                </tr>
              ) : (
                filtered.map(row => {
                  const isOverdue = row.period.payment_status === 'Overdue';

                  return (
                    <tr
                      key={row.period.id}
                      className="hover:bg-rose-50/30 transition cursor-pointer"
                      onClick={() => openCustomerProfile(row.customer!.id)}
                    >
                      <td className="py-3.5 px-3.5 font-mono font-bold text-blue-600">
                        {row.customer?.customer_code}
                      </td>

                      <td className="py-3.5 px-3.5">
                        <span className="font-bold text-slate-900 block">{row.customer?.full_name}</span>
                        <span className="text-[10px] text-slate-500">
                          {row.customer?.house_number}, {row.customer?.building_name || ''}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 font-mono text-slate-700 whitespace-nowrap">
                        {row.customer?.phone}
                      </td>

                      <td className="py-3.5 px-3.5 font-semibold text-slate-800">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-bold">
                          {row.section?.name || 'Section'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 text-slate-700 whitespace-nowrap">
                        {getMonthName(row.period.billing_month)} {row.period.billing_year}
                      </td>

                      <td className="py-3.5 px-3.5 text-right font-bold text-slate-800">
                        {formatCurrency(row.period.total_amount_due)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right text-emerald-700 font-semibold">
                        {formatCurrency(row.period.paid_amount)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right">
                        <span className="font-extrabold text-sm text-rose-700">
                          {formatCurrency(row.period.closing_balance)}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="text-slate-700">{row.period.due_date}</div>
                        {isOverdue && row.daysOverdue > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                            <AlertCircle className="w-3 h-3" /> {row.daysOverdue} days overdue
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                        {row.lastPaymentDate}
                      </td>

                      <td className="py-3.5 px-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openPaymentModal(row.customer!.id, row.section?.id, row.period.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition"
                        >
                          Collect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length} pending bill accounts</span>
          <span className="italic">Click any row to open the complete customer ledger</span>
        </div>
      </div>
    </div>
  );
};
