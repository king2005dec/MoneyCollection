import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Customer,
  BillingPeriod,
  CollectionSection,
  PaymentMethod,
  Collection,
} from '../../types';
import {
  getCustomers,
  getBillingPeriods,
  getSections,
  getCollections,
  addCollection,
  updateRemainingDueDirectly,
  updateLastMonthPaidDirectly,
} from '../../services/databaseService';
import { formatCurrency } from '../../utils/formatters';
import {
  X,
  CreditCard,
  IndianRupee,
  CheckCircle2,
  Calendar,
  Clock,
  Coins,
  ShieldCheck,
  AlertCircle,
  FileCheck,
  History,
  Check,
  ArrowRight,
  Sparkles,
  Pencil,
  Save,
  QrCode,
  Copy,
} from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const AddPaymentModal: React.FC = () => {
  const { currentUser } = useAuth();
  const { paymentModal, closePaymentModal, triggerDbRefresh, showToast, openReceiptModal } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Form Fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [billingMonth, setBillingMonth] = useState<number>(10);
  const [billingYear, setBillingYear] = useState<number>(2026);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [collectionDate, setCollectionDate] = useState<string>('2026-10-22');
  const [collectionTime, setCollectionTime] = useState<string>('10:45');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Editable Remaining Due state
  const [isEditingRemainingDue, setIsEditingRemainingDue] = useState<boolean>(false);
  const [editRemainingDueValue, setEditRemainingDueValue] = useState<string>('');
  const [editRemainingDueReason, setEditRemainingDueReason] = useState<string>('');
  const [savingRemainingDue, setSavingRemainingDue] = useState<boolean>(false);

  // Editable Last Month Paid state
  const [isEditingLastMonthPaid, setIsEditingLastMonthPaid] = useState<boolean>(false);
  const [editLastMonthPaidValue, setEditLastMonthPaidValue] = useState<string>('');
  const [editLastMonthPaidReason, setEditLastMonthPaidReason] = useState<string>('');
  const [savingLastMonthPaid, setSavingLastMonthPaid] = useState<boolean>(false);

  useEffect(() => {
    if (!paymentModal.isOpen) return;

    const load = async () => {
      const [c, s, b, col] = await Promise.all([
        getCustomers(),
        getSections(),
        getBillingPeriods(),
        getCollections(),
      ]);
      setCustomers(c.filter(x => x.is_active));
      setSections(s);
      setBillingPeriods(b);
      setCollections(col);

      // Preselect if provided
      if (paymentModal.customerId) {
        setSelectedCustomerId(paymentModal.customerId);
        const cust = c.find(x => x.id === paymentModal.customerId);
        if (cust && cust.assigned_section_ids.length > 0) {
          const matchedSection = paymentModal.sectionId || cust.assigned_section_ids[0];
          setSelectedSectionId(matchedSection);
        }
      } else if (c.length > 0) {
        setSelectedCustomerId(c[0].id);
        if (c[0].assigned_section_ids.length > 0) {
          setSelectedSectionId(c[0].assigned_section_ids[0]);
        }
      }

      if (paymentModal.sectionId) {
        setSelectedSectionId(paymentModal.sectionId);
      }

      // Auto-update to live current date and time (Asia/Kolkata)
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      setCollectionDate(`${year}-${month}-${day}`);

      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCollectionTime(`${hours}:${minutes}`);

      // Reset inline editors
      setIsEditingRemainingDue(false);
      setIsEditingLastMonthPaid(false);
    };

    load();
  }, [paymentModal.isOpen, paymentModal.customerId, paymentModal.sectionId]);

  if (!paymentModal.isOpen) return null;

  const currentCustomer = customers.find(c => c.id === selectedCustomerId);
  // Filter sections assigned to this customer
  const customerSections = sections.filter(s => currentCustomer?.assigned_section_ids.includes(s.id));

  // Find relevant billing period
  const activeBillingPeriod = billingPeriods.find(
    p => p.customer_id === selectedCustomerId &&
         p.section_id === selectedSectionId &&
         p.billing_month === billingMonth &&
         p.billing_year === billingYear
  );

  const prevMonth = billingMonth === 1 ? 12 : billingMonth - 1;
  const prevYear = billingMonth === 1 ? billingYear - 1 : billingYear;
  const currentMonthName = MONTH_NAMES[billingMonth - 1] || 'Current Month';
  const prevMonthName = MONTH_NAMES[prevMonth - 1] || 'Previous Month';

  const prevBillingPeriod = billingPeriods.find(
    p => p.customer_id === selectedCustomerId &&
         p.section_id === selectedSectionId &&
         p.billing_month === prevMonth &&
         p.billing_year === prevYear
  );

  const prevPending = prevBillingPeriod ? Math.max(0, prevBillingPeriod.closing_balance) : 0;
  const totalDue = activeBillingPeriod ? activeBillingPeriod.total_amount_due : prevPending;
  const alreadyPaid = activeBillingPeriod ? activeBillingPeriod.paid_amount : 0;
  const remainingDue = activeBillingPeriod ? Math.max(0, activeBillingPeriod.closing_balance) : totalDue;

  // Last month paid details
  const prevMonthPaid = prevBillingPeriod ? prevBillingPeriod.paid_amount : 0;
  const prevMonthTotal = prevBillingPeriod ? prevBillingPeriod.total_amount_due : 0;
  const prevMonthClosing = prevBillingPeriod ? prevBillingPeriod.closing_balance : 0;

  // Search if previous month has recorded collection
  const prevCollection = collections.find(
    col => col.customer_id === selectedCustomerId &&
           col.section_id === selectedSectionId &&
           col.status === 'Confirmed' &&
           col.billing_period_id === prevBillingPeriod?.id
  );

  const numAmount = parseFloat(amountReceived) || 0;
  const newBalanceRemaining = Math.max(0, remainingDue - numAmount);
  const advanceAmount = numAmount > remainingDue ? numAmount - remainingDue : 0;

  // Selection state flags
  const isRemainingDueSelected = numAmount > 0 && Math.abs(numAmount - remainingDue) < 0.01;
  const isLastMonthPaidSelected = numAmount > 0 && prevMonthPaid > 0 && Math.abs(numAmount - prevMonthPaid) < 0.01 && !isRemainingDueSelected;
  const isCustomSelected = numAmount > 0 && !isRemainingDueSelected && !isLastMonthPaidSelected;

  const handleCustomerChange = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find(c => c.id === custId);
    if (cust && cust.assigned_section_ids.length > 0) {
      setSelectedSectionId(cust.assigned_section_ids[0]);
    }
    setIsEditingRemainingDue(false);
    setIsEditingLastMonthPaid(false);
  };

  const handleSelectRemainingDue = () => {
    if (remainingDue > 0) {
      setAmountReceived(remainingDue.toString());
    } else {
      setAmountReceived('0');
    }
  };

  const handleSelectLastMonthPaid = () => {
    if (prevMonthPaid > 0) {
      setAmountReceived(prevMonthPaid.toString());
    }
  };

  const handleSelectHalfDue = () => {
    if (remainingDue > 0) {
      setAmountReceived(Math.round(remainingDue / 2).toString());
    }
  };

  // Remaining Due Edit Handlers
  const startEditRemainingDue = () => {
    setEditRemainingDueValue(remainingDue.toString());
    setEditRemainingDueReason('');
    setIsEditingRemainingDue(true);
  };

  const saveEditRemainingDue = async () => {
    const val = parseFloat(editRemainingDueValue);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid remaining due amount (0 or greater).', 'error');
      return;
    }
    if (!selectedCustomerId || !selectedSectionId) {
      showToast('Please select a customer and section first.', 'error');
      return;
    }

    setSavingRemainingDue(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };
      const updated = await updateRemainingDueDirectly(
        selectedCustomerId,
        selectedSectionId,
        billingMonth,
        billingYear,
        val,
        editRemainingDueReason.trim() || 'Manual adjustment of remaining due in payment entry',
        actor
      );

      setBillingPeriods(prev => {
        const idx = prev.findIndex(p => p.id === updated.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [...prev, updated];
      });

      setIsEditingRemainingDue(false);
      triggerDbRefresh();
      showToast(`Remaining due updated to ${formatCurrency(val)}`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update remaining due', 'error');
    } finally {
      setSavingRemainingDue(false);
    }
  };

  // Last Month Paid Edit Handlers
  const startEditLastMonthPaid = () => {
    setEditLastMonthPaidValue(prevMonthPaid.toString());
    setEditLastMonthPaidReason('');
    setIsEditingLastMonthPaid(true);
  };

  const saveEditLastMonthPaid = async () => {
    const val = parseFloat(editLastMonthPaidValue);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid amount (0 or greater) for last month paid.', 'error');
      return;
    }
    if (!selectedCustomerId || !selectedSectionId) {
      showToast('Please select a customer and section first.', 'error');
      return;
    }

    setSavingLastMonthPaid(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };
      const updated = await updateLastMonthPaidDirectly(
        selectedCustomerId,
        selectedSectionId,
        prevMonth,
        prevYear,
        val,
        editLastMonthPaidReason.trim() || 'Manual update of last month paid entry',
        actor
      );

      setBillingPeriods(prev => {
        const idx = prev.findIndex(p => p.id === updated.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [...prev, updated];
      });

      setIsEditingLastMonthPaid(false);
      triggerDbRefresh();
      showToast(`Last month paid updated to ${formatCurrency(val)}`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update last month paid', 'error');
    } finally {
      setSavingLastMonthPaid(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevent duplicate submission

    if (!selectedCustomerId || !selectedSectionId) {
      showToast('Please select a customer and section.', 'error');
      return;
    }

    if (numAmount <= 0) {
      showToast('Payment amount must be greater than zero.', 'error');
      return;
    }

    if (paymentMethod !== 'Cash' && !transactionRef.trim()) {
      showToast('Transaction reference number (e.g. UPI / UTR #) is required for online payments.', 'error');
      return;
    }

    // Use active billing period ID or default period
    const periodId = activeBillingPeriod ? activeBillingPeriod.id : `bp-${selectedCustomerId}-${selectedSectionId}-${billingMonth}-${billingYear}`;

    setSubmitting(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };

      const newRecord = await addCollection(
        {
          customer_id: selectedCustomerId,
          section_id: selectedSectionId,
          billing_period_id: periodId,
          amount: numAmount,
          payment_method: paymentMethod,
          transaction_reference: transactionRef.trim() || undefined,
          collection_date: collectionDate,
          collection_time: collectionTime,
          notes: notes.trim() || undefined,
          created_by: actor.id,
          created_by_name: actor.name,
        },
        actor
      );

      showToast(`Payment of ${formatCurrency(numAmount)} recorded successfully! (Receipt ${newRecord.receipt_number})`);
      triggerDbRefresh();
      closePaymentModal();

      // Open printable receipt immediately for field convenience
      openReceiptModal(newRecord);
    } catch (err: any) {
      showToast(err?.message || 'Failed to record payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Record Payment / Collection Entry</h3>
              <p className="text-xs text-blue-100">Fast field collection form with editable ledger balance & instant receipt</p>
            </div>
          </div>
          <button onClick={closePaymentModal} className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Select Resident / Customer *
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => handleCustomerChange(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white font-semibold text-slate-900 focus:outline-blue-600"
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.customer_code} • {c.full_name} ({c.house_number}, {c.building_name || c.city})
                </option>
              ))}
            </select>
          </div>

          {/* Section & Billing Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Collection Section *
              </label>
              <select
                value={selectedSectionId}
                onChange={e => setSelectedSectionId(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white font-medium text-slate-800 focus:outline-blue-600"
              >
                {customerSections.length === 0 ? (
                  <option value="">No sections assigned</option>
                ) : (
                  customerSections.map(s => {
                    const sName = s.code === 'electricity' ? 'Section 1' : s.code === 'water' ? 'Section 2' : 'Section 3';
                    return <option key={s.id} value={s.id}>{sName}</option>;
                  })
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Billing Period *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={billingMonth}
                  onChange={e => {
                    setBillingMonth(Number(e.target.value));
                    setIsEditingRemainingDue(false);
                    setIsEditingLastMonthPaid(false);
                  }}
                  className="px-2 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-800"
                >
                  <option value={9}>September</option>
                  <option value={10}>October</option>
                  <option value={11}>November</option>
                </select>
                <select
                  value={billingYear}
                  onChange={e => {
                    setBillingYear(Number(e.target.value));
                    setIsEditingRemainingDue(false);
                    setIsEditingLastMonthPaid(false);
                  }}
                  className="px-2 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-800"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>
            </div>
          </div>

          {/* Overview Cards: Remaining Due & Last Month Paid (BOTH EDITABLE) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Remaining Due Card (With Inline Editor) */}
            <div className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
              remainingDue > 0 ? 'bg-rose-50/60 border-rose-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-rose-800 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    Remaining Due
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      remainingDue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {remainingDue > 0 ? 'Pending' : 'Settled'}
                    </span>
                    {!isEditingRemainingDue && (
                      <button
                        type="button"
                        onClick={startEditRemainingDue}
                        className="p-1 rounded-md text-slate-500 hover:text-rose-700 hover:bg-white border border-slate-200/80 transition shadow-2xs flex items-center gap-1 text-[10px] font-bold"
                        title="Edit Remaining Due Entry"
                      >
                        <Pencil className="w-3 h-3 text-rose-600" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>

                {isEditingRemainingDue ? (
                  <div className="my-2 p-2.5 bg-white rounded-lg border border-rose-300 shadow-xs space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        Edit Remaining Due (₹) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={editRemainingDueValue}
                          onChange={e => setEditRemainingDueValue(e.target.value)}
                          className="w-full pl-6 pr-2 py-1 text-sm font-black text-rose-700 rounded border border-slate-300 focus:outline-rose-600"
                        />
                      </div>
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Reason (e.g. discount, revision)"
                        value={editRemainingDueReason}
                        onChange={e => setEditRemainingDueReason(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 focus:outline-rose-600"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingRemainingDue(false)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingRemainingDue}
                        onClick={saveEditRemainingDue}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold transition shadow-xs flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        {savingRemainingDue ? 'Saving...' : 'Save Due'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight my-1">
                      {formatCurrency(remainingDue)}
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <p>
                        Total Bill: <strong className="text-slate-800">{formatCurrency(totalDue)}</strong>
                      </p>
                      <p>
                        Paid This Month: <strong className="text-emerald-700">{formatCurrency(alreadyPaid)}</strong>
                      </p>
                    </div>
                  </>
                )}
              </div>

              {!isEditingRemainingDue && remainingDue > 0 && (
                <button
                  type="button"
                  onClick={handleSelectRemainingDue}
                  className="mt-2.5 w-full py-1.5 px-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span>Pay Remaining Due ({formatCurrency(remainingDue)})</span>
                </button>
              )}
            </div>

            {/* 2. Last Month Paid Card (With Inline Editor) */}
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col justify-between transition-all">
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Last Month Paid
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      prevMonthPaid > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {prevMonthPaid > 0 ? 'Paid' : 'Unpaid'}
                    </span>
                    {!isEditingLastMonthPaid && (
                      <button
                        type="button"
                        onClick={startEditLastMonthPaid}
                        className="p-1 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-white border border-slate-200/80 transition shadow-2xs flex items-center gap-1 text-[10px] font-bold"
                        title="Edit Last Month Paid Entry"
                      >
                        <Pencil className="w-3 h-3 text-emerald-600" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>

                {isEditingLastMonthPaid ? (
                  <div className="my-2 p-2.5 bg-white rounded-lg border border-emerald-300 shadow-xs space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        Edit Last Month Paid ({prevMonthName}) (₹) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={editLastMonthPaidValue}
                          onChange={e => setEditLastMonthPaidValue(e.target.value)}
                          className="w-full pl-6 pr-2 py-1 text-sm font-black text-emerald-700 rounded border border-slate-300 focus:outline-emerald-600"
                        />
                      </div>
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Reason (e.g. offline receipt verified)"
                        value={editLastMonthPaidReason}
                        onChange={e => setEditLastMonthPaidReason(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 focus:outline-emerald-600"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingLastMonthPaid(false)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingLastMonthPaid}
                        onClick={saveEditLastMonthPaid}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition shadow-xs flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        {savingLastMonthPaid ? 'Saving...' : 'Save Paid'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight my-1">
                      {formatCurrency(prevMonthPaid)}
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <p>
                        Cycle: <strong className="text-slate-800">{prevMonthName} {prevYear}</strong>
                      </p>
                      <p>
                        {prevBillingPeriod ? (
                          <>Last Bill: <span className="text-slate-800 font-semibold">{formatCurrency(prevMonthTotal)}</span> • Status: <span className="font-semibold text-emerald-700">{prevBillingPeriod.payment_status}</span></>
                        ) : (
                          <span className="text-slate-500">No prior period record</span>
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {!isEditingLastMonthPaid && (
                prevMonthPaid > 0 ? (
                  <button
                    type="button"
                    onClick={handleSelectLastMonthPaid}
                    className="mt-2.5 w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>Pay Last Month ({formatCurrency(prevMonthPaid)})</span>
                  </button>
                ) : (
                  <div className="mt-2.5 py-1.5 px-2 text-center text-[11px] text-slate-500 bg-slate-100/80 rounded-lg font-medium">
                    No payment recorded in {prevMonthName}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Payment Amount Options Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Choose Payment Option *
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Tap to autofill amount
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Option: Remaining Due */}
              <button
                type="button"
                onClick={handleSelectRemainingDue}
                disabled={remainingDue <= 0}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  isRemainingDueSelected
                    ? 'border-blue-600 bg-blue-50/90 ring-2 ring-blue-500/30 shadow-xs'
                    : remainingDue <= 0
                    ? 'border-slate-200 bg-slate-50/50 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Remaining Due
                  </span>
                  {isRemainingDueSelected ? (
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                  )}
                </div>
                <div className="text-base font-black text-rose-700 mt-1.5">
                  {formatCurrency(remainingDue)}
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  Full pending balance
                </span>
              </button>

              {/* Option: Last Month Paid */}
              <button
                type="button"
                onClick={handleSelectLastMonthPaid}
                disabled={prevMonthPaid <= 0}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  isLastMonthPaidSelected
                    ? 'border-emerald-600 bg-emerald-50/90 ring-2 ring-emerald-500/30 shadow-xs'
                    : prevMonthPaid <= 0
                    ? 'border-slate-200 bg-slate-50/50 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                    <History className="w-3.5 h-3.5 text-emerald-600" /> Last Month Paid
                  </span>
                  {isLastMonthPaidSelected ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                  )}
                </div>
                <div className="text-base font-black text-emerald-700 mt-1.5">
                  {formatCurrency(prevMonthPaid)}
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {prevMonthPaid > 0 ? `${prevMonthName} payment amount` : 'No payment recorded'}
                </span>
              </button>

              {/* Option: Custom Amount */}
              <button
                type="button"
                onClick={() => {
                  if (isRemainingDueSelected || isLastMonthPaidSelected) {
                    setAmountReceived('');
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  isCustomSelected
                    ? 'border-purple-600 bg-purple-50/90 ring-2 ring-purple-500/30 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                    <IndianRupee className="w-3.5 h-3.5 text-purple-600" /> Custom Amount
                  </span>
                  {isCustomSelected ? (
                    <span className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-slate-300" />
                  )}
                </div>
                <div className="text-base font-black text-purple-700 mt-1.5">
                  {isCustomSelected ? formatCurrency(numAmount) : 'Custom'}
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  Enter custom value below
                </span>
              </button>
            </div>

            {/* Quick Fill Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Quick Fill:
              </span>
              {remainingDue > 0 && (
                <button
                  type="button"
                  onClick={handleSelectRemainingDue}
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                >
                  Full Due: {formatCurrency(remainingDue)}
                </button>
              )}
              {remainingDue > 20 && (
                <button
                  type="button"
                  onClick={handleSelectHalfDue}
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 transition-colors"
                >
                  50% Due: {formatCurrency(Math.round(remainingDue / 2))}
                </button>
              )}
              {prevMonthPaid > 0 && (
                <button
                  type="button"
                  onClick={handleSelectLastMonthPaid}
                  className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                >
                  Last Month: {formatCurrency(prevMonthPaid)}
                </button>
              )}
              {amountReceived && (
                <button
                  type="button"
                  onClick={() => setAmountReceived('')}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  Clear Amount
                </button>
              )}
            </div>
          </div>

          {/* Amount Received Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Amount Received Now (₹) *
              </label>
              {numAmount > 0 && (
                <span className="text-xs font-semibold">
                  {newBalanceRemaining > 0 ? (
                    <span className="text-amber-700">Remaining Due After Pay: <strong>{formatCurrency(newBalanceRemaining)}</strong></span>
                  ) : advanceAmount > 0 ? (
                    <span className="text-emerald-700">✓ Fully Settled + <strong>{formatCurrency(advanceAmount)} Advance</strong></span>
                  ) : (
                    <span className="text-emerald-700">✓ Fully Settled (Remaining Due: ₹0.00)</span>
                  )}
                </span>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">₹</span>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="Enter collection amount"
                value={amountReceived}
                onChange={e => setAmountReceived(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 text-base font-extrabold rounded-lg border-2 border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>

            {advanceAmount > 0 && (
              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                ✓ Includes {formatCurrency(advanceAmount)} advance payment credit for upcoming bills.
              </p>
            )}
          </div>

          {/* Payment Method & Reference Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white font-semibold text-slate-900 focus:outline-blue-600"
              >
                <option value="Cash">Cash (Physical Currency)</option>
                <option value="UPI">UPI (Google Pay / PhonePe QR)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Transaction / UTR Reference {paymentMethod !== 'Cash' && '*'}
              </label>
              <input
                type="text"
                placeholder={paymentMethod === 'Cash' ? 'Optional receipt book serial #' : 'e.g. UPI/26102298711/AXIS'}
                value={transactionRef}
                onChange={e => setTransactionRef(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-blue-600 font-mono"
              />
            </div>

            {/* UPI QR Code Display with live balance sync */}
            {paymentMethod === 'UPI' && (
              <div className="col-span-1 sm:col-span-2 p-3.5 bg-slate-50 border border-blue-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-blue-900 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    Google Pay QR Code (Scan to Pay)
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                    Amount Synced: {formatCurrency(numAmount > 0 ? numAmount : remainingDue)}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3.5">
                  <div className="w-48 h-auto bg-white p-2 rounded-xl shadow-xs border border-slate-200 shrink-0">
                    <img
                      src="/assets/aistudio/WhatsApp_Image_2026-10-24_at_1.22.05_AM_eb959bc9.jpeg"
                      alt="Raj UPI QR Code"
                      className="w-full h-auto object-contain rounded-lg"
                    />
                  </div>

                  <div className="flex-1 space-y-2 text-xs w-full">
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Beneficiary Name</span>
                      <span className="font-extrabold text-slate-900 text-sm">Raj</span>
                    </div>

                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">UPI ID</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">rajhaldaar189@okicici</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('rajhaldaar189@okicici');
                          showToast('UPI ID copied to clipboard!');
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>

                    <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 font-semibold">
                      ✓ Amount is synchronized directly with customer ledger balance.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Date and Time with Live Auto Update */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Collection Date & Time (IST) *
              </span>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const year = now.getFullYear();
                  const month = (now.getMonth() + 1).toString().padStart(2, '0');
                  const day = now.getDate().toString().padStart(2, '0');
                  setCollectionDate(`${year}-${month}-${day}`);
                  const hours = now.getHours().toString().padStart(2, '0');
                  const minutes = now.getMinutes().toString().padStart(2, '0');
                  setCollectionTime(`${hours}:${minutes}`);
                }}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 underline"
              >
                <Clock className="w-3 h-3" /> Auto-update to Now
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="date"
                  required
                  value={collectionDate}
                  onChange={e => setCollectionDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 font-medium text-slate-800"
                />
              </div>
              <div>
                <input
                  type="time"
                  value={collectionTime}
                  onChange={e => setCollectionTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 font-medium text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Field Notes / Remarks
            </label>
            <input
              type="text"
              placeholder="e.g. Handed cash at doorstep, promised balance on 28th."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-blue-600"
            />
          </div>

          {/* Collector Attribution Notice */}
          <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200/60 text-[11px] text-blue-900 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Attributed Collector: <strong>{currentUser?.full_name}</strong> ({currentUser?.role})</span>
            </span>
            <span className="text-[10px] text-blue-700 font-mono">Server Audit Protected</span>
          </div>

          {/* Submit Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closePaymentModal}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold shadow-md shadow-blue-500/25 disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Recording Payment...' : 'Confirm & Generate Receipt'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
