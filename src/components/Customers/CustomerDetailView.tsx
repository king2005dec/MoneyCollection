import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Customer,
  BillingPeriod,
  Collection,
  CollectionSection,
  AuditLog,
} from '../../types';
import {
  getCustomerById,
  getBillingPeriods,
  getCollections,
  getSections,
  getAuditLogs,
  updateCustomer,
} from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, formatDateTime, formatDate, getMonthName } from '../../utils/formatters';
import {
  User,
  CreditCard,
  Calendar,
  Receipt,
  History,
  FileSpreadsheet,
  Zap,
  Droplets,
  Layers,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pencil,
  RotateCcw,
  Printer,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

export const CustomerDetailView: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const {
    selectedCustomerId,
    returnSectionPage,
    setActivePage,
    dbVersion,
    openPaymentModal,
    openEditPaymentModal,
    openReversePaymentModal,
    openReceiptModal,
    showToast,
    triggerDbRefresh,
  } = useApp();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'monthly' | 'payments' | 'activity'>('overview');
  const [loading, setLoading] = useState(true);

  // Monthly records filters
  const [filterSectionId, setFilterSectionId] = useState<string>('all');
  const [filterYear, setFilterYear] = useState<number>(2026);

  useEffect(() => {
    if (!selectedCustomerId) {
      setActivePage('customers');
      return;
    }

    const loadCustomerData = async () => {
      setLoading(true);
      try {
        const [c, periods, cols, secs, logs] = await Promise.all([
          getCustomerById(selectedCustomerId),
          getBillingPeriods(),
          getCollections(),
          getSections(),
          getAuditLogs(),
        ]);
        setCustomer(c || null);
        setBillingPeriods(periods.filter(p => p.customer_id === selectedCustomerId));
        setCollections(cols.filter(col => col.customer_id === selectedCustomerId));
        setSections(secs);
        setAuditLogs(logs.filter(l => l.entity_id === selectedCustomerId || cols.some(col => col.id === l.entity_id && col.customer_id === selectedCustomerId)));
      } catch (err) {
        console.error('Failed to load customer profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCustomerData();
  }, [selectedCustomerId, dbVersion]);

  if (!customer) {
    return <div className="p-8 text-center text-slate-500">Loading customer profile...</div>;
  }

  // Current month (October 2026) billing periods
  const currentMonthPeriods = billingPeriods.filter(p => p.billing_month === 10 && p.billing_year === 2026);
  // Previous month (September 2026) billing periods
  const prevMonthPeriods = billingPeriods.filter(p => p.billing_month === 9 && p.billing_year === 2026);

  const prevOutstanding = prevMonthPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);
  const currentMonthBill = currentMonthPeriods.reduce((sum, p) => sum + p.bill_amount + p.additional_charges, 0);
  const currentMonthPaid = currentMonthPeriods.reduce((sum, p) => sum + p.paid_amount, 0);
  const currentMonthRemaining = currentMonthPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);
  const totalOutstandingAll = billingPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);

  // Last payment
  const confirmedCols = collections.filter(c => c.status === 'Confirmed').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const lastPayment = confirmedCols[0] || null;

  // Filtered monthly records
  const filteredMonthly = billingPeriods.filter(p => {
    if (filterSectionId !== 'all' && p.section_id !== filterSectionId) return false;
    if (filterYear !== 0 && p.billing_year !== filterYear) return false;
    return true;
  }).sort((a, b) => {
    if (b.billing_year !== a.billing_year) return b.billing_year - a.billing_year;
    return b.billing_month - a.billing_month;
  });

  const assignedSections = sections.filter(s => customer.assigned_section_ids.includes(s.id));

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          returnSectionPage
            ? { label: returnSectionPage.includes('elec') ? 'Section 1' : returnSectionPage.includes('water') ? 'Section 2' : 'Section 3', page: returnSectionPage as any }
            : { label: 'All Customers', page: 'customers' },
          { label: customer.full_name },
        ]}
      />

      {/* Profile Header & Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-extrabold text-xl shadow-sm shadow-blue-500/20 shrink-0">
            {customer.full_name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {customer.full_name}
              </h1>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                {customer.customer_code}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                customer.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {customer.is_active ? 'Active Profile' : 'Inactive'}
              </span>
            </div>

            <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-y-1 gap-x-3">
              <span><strong>Phone:</strong> {customer.phone}</span>
              <span>•</span>
              <span><strong>Address:</strong> {customer.house_number}, {customer.building_name || ''} {customer.address}</span>
            </div>

            {/* Assigned Sections Pills */}
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Sections:</span>
              {assignedSections.map(s => {
                const sName = s.code === 'electricity' ? 'Section 1' : s.code === 'water' ? 'Section 2' : 'Section 3';
                return (
                  <span
                    key={s.id}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      s.code === 'electricity'
                        ? 'bg-blue-100 text-blue-800'
                        : s.code === 'water'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {sName}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Button: Add Payment */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openPaymentModal(customer.id)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm shadow-blue-500/25 transition"
          >
            <CreditCard className="w-4 h-4" />
            <span>Add Payment Now</span>
          </button>
        </div>
      </div>

      {/* Top Summary Cards (7 Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Prev Pending */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Prev Outstanding</span>
          <span className="text-sm sm:text-base font-extrabold text-slate-900">{formatCurrency(prevOutstanding)}</span>
        </div>

        {/* Current Month Bill */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Oct 2026 Bill</span>
          <span className="text-sm sm:text-base font-extrabold text-slate-900">{formatCurrency(currentMonthBill)}</span>
        </div>

        {/* Current Month Paid */}
        <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Paid This Month</span>
          <span className="text-sm sm:text-base font-extrabold text-emerald-700">{formatCurrency(currentMonthPaid)}</span>
        </div>

        {/* Current Month Remaining Due */}
        <div className="bg-white rounded-xl p-3 border border-rose-100 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">Remaining Due</span>
          <span className="text-sm sm:text-base font-extrabold text-rose-700">{formatCurrency(currentMonthRemaining)}</span>
        </div>

        {/* Total Outstanding Across All Billing Periods */}
        <div className="bg-white rounded-xl p-3 border border-rose-200 bg-rose-50/30 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">Total Outstanding</span>
          <span className="text-sm sm:text-base font-extrabold text-rose-800">{formatCurrency(totalOutstandingAll)}</span>
        </div>

        {/* Last Payment Details */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Last Payment</span>
          {lastPayment ? (
            <div>
              <span className="text-sm font-extrabold text-slate-900 block">{formatCurrency(lastPayment.amount)}</span>
              <span className="text-[10px] text-slate-500">{lastPayment.collection_date} ({lastPayment.payment_method})</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">None</span>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-xl shadow-2xs px-3 pt-2">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Tab A: Overview & Status
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'monthly'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Tab B: Monthly Records</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
              {billingPeriods.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'payments'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Tab C: Payment History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
              {collections.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'activity'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Tab D: Audit & Activity History</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-mono">
              {auditLogs.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Tab A: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Customer Profile Details Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Resident Master Information
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Customer ID</span>
                <span className="font-mono font-bold text-slate-900">{customer.customer_code}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Contact Phone</span>
                <span className="font-mono font-bold text-slate-900">{customer.phone}</span>
              </div>
              <div>
                <span className="text-slate-400 block">House / Flat</span>
                <span className="font-semibold text-slate-900">{customer.house_number}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Building / Colony</span>
                <span className="font-semibold text-slate-900">{customer.building_name || '—'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Full Locality Address</span>
                <span className="font-medium text-slate-700">{customer.address}, {customer.city}</span>
              </div>
              {customer.notes && (
                <div className="col-span-2 p-2.5 bg-amber-50 rounded-lg text-amber-900 border border-amber-200/60">
                  <span className="font-bold block text-[10px] uppercase">Field Notes:</span>
                  <span>{customer.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Current Month Ledger Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center justify-between">
              <span>Current Billing Period (October 2026)</span>
              <span className="text-xs font-bold text-blue-600">Active Cycle</span>
            </h3>

            <div className="space-y-2 text-xs">
              {currentMonthPeriods.map(period => {
                const sec = sections.find(s => s.id === period.section_id);
                return (
                  <div key={period.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{sec?.name || 'Section'}</span>
                        <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                          period.payment_status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : period.payment_status === 'Partially Paid'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {period.payment_status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Opening: {formatCurrency(period.opening_balance)} • Bill: {formatCurrency(period.bill_amount)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-extrabold text-sm text-slate-900">
                        Balance: {formatCurrency(period.closing_balance)}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        Paid: {formatCurrency(period.paid_amount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab B: Monthly Records */}
      {activeTab === 'monthly' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Filter Section:</span>
              <select
                value={filterSectionId}
                onChange={e => setFilterSectionId(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
              >
                <option value="all">All Assigned Sections</option>
                {assignedSections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Year:</span>
              <select
                value={filterYear}
                onChange={e => setFilterYear(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Month & Year</th>
                  <th className="py-3 px-3.5">Section</th>
                  <th className="py-3 px-3.5 text-right">Opening Pending</th>
                  <th className="py-3 px-3.5 text-right">Current Bill</th>
                  <th className="py-3 px-3.5 text-right">Additional</th>
                  <th className="py-3 px-3.5 text-right">Total Due</th>
                  <th className="py-3 px-3.5 text-right">Amount Paid</th>
                  <th className="py-3 px-3.5 text-right">Closing Balance</th>
                  <th className="py-3 px-3.5">Due Date</th>
                  <th className="py-3 px-3.5">Payment Status</th>
                  <th className="py-3 px-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMonthly.map(period => {
                  const sec = sections.find(s => s.id === period.section_id);
                  return (
                    <tr key={period.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        {getMonthName(period.billing_month)} {period.billing_year}
                      </td>
                      <td className="py-3.5 px-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                          {sec?.name || 'Section'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-right text-slate-600">
                        {formatCurrency(period.opening_balance)}
                      </td>
                      <td className="py-3.5 px-3.5 text-right font-medium text-slate-900">
                        {formatCurrency(period.bill_amount)}
                      </td>
                      <td className="py-3.5 px-3.5 text-right text-slate-600">
                        {formatCurrency(period.additional_charges)}
                      </td>
                      <td className="py-3.5 px-3.5 text-right font-bold text-slate-900">
                        {formatCurrency(period.total_amount_due)}
                      </td>
                      <td className="py-3.5 px-3.5 text-right font-bold text-emerald-700">
                        {formatCurrency(period.paid_amount)}
                      </td>
                      <td className="py-3.5 px-3.5 text-right">
                        <span className={`font-extrabold text-sm ${
                          period.closing_balance > 0 ? 'text-rose-700' : 'text-slate-400'
                        }`}>
                          {formatCurrency(period.closing_balance)}
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-slate-500 whitespace-nowrap">
                        {period.due_date}
                      </td>
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          period.payment_status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : period.payment_status === 'Partially Paid'
                            ? 'bg-amber-100 text-amber-800'
                            : period.payment_status === 'Overdue'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {period.payment_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3.5 text-center">
                        <button
                          onClick={() => openPaymentModal(customer.id, period.section_id, period.id)}
                          className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white font-bold text-[11px] transition"
                        >
                          Pay
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab C: Payment History */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4 text-right">Amount Received</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Collection Date & Time</th>
                  <th className="py-3 px-4">Collected By</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Receipt & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collections.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      No payments recorded yet for this resident.
                    </td>
                  </tr>
                ) : (
                  collections.map(col => {
                    const sec = sections.find(s => s.id === col.section_id);
                    const isReversed = col.status === 'Reversed';

                    return (
                      <tr key={col.id} className="hover:bg-slate-50 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600">
                          {col.receipt_number}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800">
                          {sec?.name || 'Section'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-extrabold text-sm">
                          {isReversed ? (
                            <span className="line-through text-slate-400">{formatCurrency(col.amount)}</span>
                          ) : (
                            <span className="text-emerald-700">{formatCurrency(col.amount)}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            col.payment_method === 'Cash' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {col.payment_method}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {col.transaction_reference || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {col.collection_date} • {col.collection_time?.slice(0, 5)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-800 font-medium">
                          {col.created_by_name || 'Admin'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isReversed ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {col.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openReceiptModal(col)}
                              title="Print Receipt"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
                            {!isReversed && (
                              <button
                                onClick={() => openEditPaymentModal(col)}
                                title="Edit Entry (Reason Mandatory)"
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {isOwner && !isReversed && (
                              <button
                                onClick={() => openReversePaymentModal(col)}
                                title="Reverse Transaction (Owner Only)"
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition"
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
        </div>
      )}

      {/* Tab D: Activity History */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            Immutable Audit Trail for {customer.full_name}
          </h3>

          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No activity logs recorded for this customer profile.
              </div>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 text-xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.2 rounded font-bold uppercase text-[10px] ${
                        log.action_type === 'CREATE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.action_type === 'UPDATE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.action_type}
                      </span>
                      <span className="font-semibold text-slate-800">{log.actor_name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>

                  <p className="font-medium text-slate-800 mt-1">{log.reason || 'Record updated'}</p>

                  {/* Previous vs New Values */}
                  {(log.previous_values || log.new_values) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[11px] font-mono">
                      {log.previous_values && (
                        <div className="p-2 rounded bg-rose-50 text-rose-900">
                          <span className="font-bold block text-[10px] uppercase">Previous:</span>
                          <pre className="whitespace-pre-wrap">{JSON.stringify(log.previous_values, null, 2)}</pre>
                        </div>
                      )}
                      {log.new_values && (
                        <div className="p-2 rounded bg-emerald-50 text-emerald-900">
                          <span className="font-bold block text-[10px] uppercase">New:</span>
                          <pre className="whitespace-pre-wrap">{JSON.stringify(log.new_values, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
