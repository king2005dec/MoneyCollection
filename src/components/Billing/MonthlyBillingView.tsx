import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { BillingPeriod, Customer, CollectionSection } from '../../types';
import {
  getBillingPeriods,
  getCustomers,
  getSections,
  carryForwardMonth,
  updateBillingPeriodCharges,
} from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, getMonthName } from '../../utils/formatters';
import {
  CalendarDays,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Pencil,
  ShieldCheck,
  Search,
} from 'lucide-react';

export const MonthlyBillingView: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const { dbVersion, triggerDbRefresh, showToast, openCustomerProfile } = useApp();

  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Month filters
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Generate new month workflow modal
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState<number>(11);
  const [targetYear, setTargetYear] = useState<number>(2026);
  const [prevMonth, setPrevMonth] = useState<number>(10);
  const [prevYear, setPrevYear] = useState<number>(2026);
  const [defaultDueDay, setDefaultDueDay] = useState<number>(15);
  const [generating, setGenerating] = useState<boolean>(false);

  // Edit charge inline modal
  const [editingPeriod, setEditingPeriod] = useState<BillingPeriod | null>(null);
  const [editBillAmount, setEditBillAmount] = useState<string>('');
  const [editAddCharges, setEditAddCharges] = useState<string>('');
  const [editPaidAmount, setEditPaidAmount] = useState<string>('');
  const [editClosingBalance, setEditClosingBalance] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [b, c, s] = await Promise.all([
          getBillingPeriods(),
          getCustomers(),
          getSections(),
        ]);
        setBillingPeriods(b);
        setCustomers(c);
        setSections(s);
      } catch (err) {
        console.error('Failed to load billing periods:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  const filteredPeriods = billingPeriods.filter(p => {
    if (p.billing_month !== selectedMonth || p.billing_year !== selectedYear) return false;
    if (selectedSectionId !== 'all' && p.section_id !== selectedSectionId) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const cust = customers.find(c => c.id === p.customer_id);
      const matchName = cust?.full_name.toLowerCase().includes(q) || false;
      const matchCode = cust?.customer_code.toLowerCase().includes(q) || false;
      const matchHouse = cust?.house_number.toLowerCase().includes(q) || false;
      if (!matchName && !matchCode && !matchHouse) return false;
    }

    return true;
  });

  const handleCarryForward = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      const result = await carryForwardMonth(
        targetMonth,
        targetYear,
        prevMonth,
        prevYear,
        defaultDueDay,
        actor
      );

      showToast(`Successfully opened ${getMonthName(targetMonth)} ${targetYear}! Generated ${result.countCreated} billing period records with carried-forward unpaid balances.`);
      setSelectedMonth(targetMonth);
      setSelectedYear(targetYear);
      setGenerateModalOpen(false);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate billing month', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEditCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPeriod) return;

    const bill = parseFloat(editBillAmount);
    const add = parseFloat(editAddCharges) || 0;
    const paid = parseFloat(editPaidAmount);
    const closing = parseFloat(editClosingBalance);

    if (isNaN(bill) || bill < 0) {
      showToast('Please enter a valid bill amount (₹0 or greater).', 'error');
      return;
    }

    setSavingEdit(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };

      await updateBillingPeriodCharges(
        editingPeriod.id,
        {
          bill_amount: bill,
          additional_charges: add,
          paid_amount: isNaN(paid) ? undefined : Math.max(0, paid),
          closing_balance: isNaN(closing) ? undefined : Math.max(0, closing),
        },
        editReason.trim() || 'Updated bill charges & balances',
        actor
      );

      showToast('Billing period charges & balances updated successfully!');
      setEditingPeriod(null);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update charges', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const openEditModal = (period: BillingPeriod) => {
    setEditingPeriod(period);
    setEditBillAmount(period.bill_amount.toString());
    setEditAddCharges(period.additional_charges.toString());
    setEditPaidAmount(period.paid_amount.toString());
    setEditClosingBalance(period.closing_balance.toString());
    setEditReason('');
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'Monthly Billing System' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-blue-600" />
            Monthly Billing & Balance Carry-Forward System
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Customer-section billing periods with opening balances, meter charges, and strict carry-forward logic
          </p>
        </div>

        {isOwner && (
          <button
            onClick={() => setGenerateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm shadow-blue-500/25 transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Open New Month Cycle</span>
          </button>
        )}
      </div>

      {/* Cycle Selector Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-700">Billing Cycle:</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-900"
          >
            <option value={9}>September</option>
            <option value={10}>October</option>
            <option value={11}>November</option>
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-900"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>

          <span className="font-bold text-slate-700 ml-2">Section:</span>
          <select
            value={selectedSectionId}
            onChange={e => setSelectedSectionId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-800"
          >
            <option value="all">All Sections</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search resident..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs w-48"
          />
        </div>
      </div>

      {/* Table of Billing Periods */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Card List (md:hidden) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredPeriods.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No billing periods found for {getMonthName(selectedMonth)} {selectedYear}.
              {isOwner && (
                <div className="mt-2">
                  <button
                    onClick={() => setGenerateModalOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold"
                  >
                    Generate {getMonthName(selectedMonth)} Cycle Now
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredPeriods.map(period => {
              const cust = customers.find(c => c.id === period.customer_id);
              const sec = sections.find(s => s.id === period.section_id);

              return (
                <div key={period.id} className="p-4 space-y-2.5 active:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        onClick={() => cust && openCustomerProfile(cust.id)}
                        className="font-bold text-slate-900 text-sm text-left block"
                      >
                        {cust?.full_name || 'Resident'}
                      </button>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        {cust?.customer_code} • {cust?.house_number}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                        {sec?.name || 'Section'}
                      </span>
                      <span className={`block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg p-2.5 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Total Due</span>
                      <span className="font-bold text-slate-900">{formatCurrency(period.total_amount_due)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Paid</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(period.paid_amount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Pending</span>
                      <span className={`font-extrabold ${period.closing_balance > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {formatCurrency(period.closing_balance)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>Due Date: <strong className="text-slate-700">{period.due_date || '—'}</strong></span>
                    <button
                      onClick={() => openEditModal(period)}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-blue-600 font-bold hover:bg-blue-50"
                    >
                      Edit Charges
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">Customer & ID</th>
                <th className="py-3 px-3.5">Section</th>
                <th className="py-3 px-3.5 text-right">Opening Balance</th>
                <th className="py-3 px-3.5 text-right">Bill Charges</th>
                <th className="py-3 px-3.5 text-right">Additional</th>
                <th className="py-3 px-3.5 text-right">Total Amount Due</th>
                <th className="py-3 px-3.5 text-right">Total Paid</th>
                <th className="py-3 px-3.5 text-right">Closing Balance</th>
                <th className="py-3 px-3.5">Due Date</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-center">Edit Charges</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPeriods.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No billing periods found for {getMonthName(selectedMonth)} {selectedYear}.
                    {isOwner && (
                      <div className="mt-2">
                        <button
                          onClick={() => setGenerateModalOpen(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold"
                        >
                          Generate {getMonthName(selectedMonth)} Cycle Now
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPeriods.map(period => {
                  const cust = customers.find(c => c.id === period.customer_id);
                  const sec = sections.find(s => s.id === period.section_id);

                  return (
                    <tr key={period.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3.5">
                        <button
                          onClick={() => cust && openCustomerProfile(cust.id)}
                          className="font-bold text-slate-900 hover:text-blue-600 transition text-left block"
                        >
                          {cust?.full_name || 'Resident'}
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {cust?.customer_code} • {cust?.house_number}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 font-semibold text-slate-800">
                        {sec?.name || 'Section'}
                      </td>

                      <td className="py-3.5 px-3.5 text-right text-slate-600 font-medium">
                        {formatCurrency(period.opening_balance)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right font-bold text-slate-900">
                        {formatCurrency(period.bill_amount)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right text-slate-500">
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
                          onClick={() => openEditModal(period)}
                          title="Edit Bill Charges"
                          className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate New Month Workflow Modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                <h3 className="font-extrabold text-base">Open New Monthly Billing Cycle</h3>
              </div>
              <button onClick={() => setGenerateModalOpen(false)} className="text-white/80 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCarryForward} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200/70 text-blue-900 space-y-1">
                <p className="font-bold">Carry-Forward Logic Guaranteed:</p>
                <p>
                  Unpaid closing balances from <strong>{getMonthName(prevMonth)} {prevYear}</strong> will carry forward
                  as the opening balances for <strong>{getMonthName(targetMonth)} {targetYear}</strong> without duplicate counting.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Month</label>
                  <select
                    value={targetMonth}
                    onChange={e => setTargetMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold"
                  >
                    <option value={11}>November</option>
                    <option value={12}>December</option>
                    <option value={1}>January</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Year</label>
                  <input
                    type="number"
                    value={targetYear}
                    onChange={e => setTargetYear(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Source Month for Previous Balances</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={prevMonth}
                    onChange={e => setPrevMonth(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white font-medium"
                  >
                    <option value={10}>October</option>
                    <option value={9}>September</option>
                  </select>
                  <input
                    type="number"
                    value={prevYear}
                    onChange={e => setPrevYear(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg border border-slate-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Bill Due Day</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={defaultDueDay}
                  onChange={e => setDefaultDueDay(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                />
                <span className="text-[10px] text-slate-400">e.g. 15th of the month</span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGenerateModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                >
                  {generating ? 'Carrying Forward...' : 'Generate New Cycle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Charge Modal */}
      {editingPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h3 className="font-extrabold text-base text-slate-900">
              Update Charges for Period
            </h3>

            <form onSubmit={handleSaveEditCharge} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Current Bill Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editBillAmount}
                    onChange={e => setEditBillAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Additional Charges (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAddCharges}
                    onChange={e => setEditAddCharges(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-emerald-700 mb-1">Paid Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPaidAmount}
                    onChange={e => setEditPaidAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-emerald-300 font-bold text-emerald-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-rose-700 mb-1">Remaining Due (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editClosingBalance}
                    onChange={e => setEditClosingBalance(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rose-300 font-bold text-rose-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Adjustment *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Meter reading updated or manual payment adjustment"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPeriod(null)}
                  className="px-4 py-2 border rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                >
                  {savingEdit ? 'Saving...' : 'Update & Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
