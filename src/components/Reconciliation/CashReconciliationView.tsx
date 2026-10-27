import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { CashReconciliation, Profile, Collection } from '../../types';
import {
  getCashReconciliations,
  getProfiles,
  getCollections,
  saveCashReconciliation,
} from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Coins,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ShieldCheck,
  Calendar,
  Wallet,
  ArrowRight,
} from 'lucide-react';

export const CashReconciliationView: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const { dbVersion, triggerDbRefresh, showToast } = useApp();

  const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal for new/update reconciliation
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [reconciliationDate, setReconciliationDate] = useState<string>('2026-10-22');
  const [openingCash, setOpeningCash] = useState<string>('500');
  const [cashCollected, setCashCollected] = useState<string>('0');
  const [cashRefunded, setCashRefunded] = useState<string>('0');
  const [cashHandedOver, setCashHandedOver] = useState<string>('0');
  const [actualClosingCash, setActualClosingCash] = useState<string>('500');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [r, p, cols] = await Promise.all([
          getCashReconciliations(),
          getProfiles(),
          getCollections(),
        ]);
        setReconciliations(r);
        setProfiles(p);
        setCollections(cols);

        // Preselect current user or first admin
        const initialEmp = p.find(x => x.id === currentUser?.id) || p[1] || p[0];
        if (initialEmp) {
          setSelectedEmployeeId(initialEmp.id);
        }
      } catch (err) {
        console.error('Failed to load reconciliations:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  // When selected employee or date changes, calculate actual cash collected automatically
  const handleAutoFillCash = () => {
    const empCashCols = collections.filter(
      c => c.created_by === selectedEmployeeId &&
           c.collection_date === reconciliationDate &&
           c.payment_method === 'Cash' &&
           (c.status === 'Confirmed' || c.status === 'Corrected')
    );
    const sum = empCashCols.reduce((acc, c) => acc + c.amount, 0);
    setCashCollected(sum.toString());
    setCashHandedOver(sum.toString());
    setActualClosingCash(openingCash);
  };

  const handleOpenModal = () => {
    handleAutoFillCash();
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const emp = profiles.find(p => p.id === selectedEmployeeId);
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };

      await saveCashReconciliation(
        {
          employee_id: selectedEmployeeId,
          employee_name: emp?.full_name,
          reconciliation_date: reconciliationDate,
          opening_cash: parseFloat(openingCash) || 0,
          cash_collected: parseFloat(cashCollected) || 0,
          cash_refunded: parseFloat(cashRefunded) || 0,
          cash_handed_over: parseFloat(cashHandedOver) || 0,
          expected_closing_cash: (parseFloat(openingCash) || 0) + (parseFloat(cashCollected) || 0) - (parseFloat(cashRefunded) || 0) - (parseFloat(cashHandedOver) || 0),
          actual_closing_cash: parseFloat(actualClosingCash) || 0,
          verified_by: isOwner ? actor.id : undefined,
          verified_by_name: isOwner ? actor.name : undefined,
          notes: notes.trim() || undefined,
        },
        actor
      );

      showToast(`Daily cash reconciliation saved for ${emp?.full_name}!`);
      setModalOpen(false);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save cash reconciliation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (entry: CashReconciliation) => {
    if (!isOwner) return;
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };
      await saveCashReconciliation(
        {
          ...entry,
          verified_by: actor.id,
          verified_by_name: actor.name,
        },
        actor
      );
      showToast('Reconciliation entry officially verified and sealed.');
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Verification failed', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'Daily Cash Reconciliation' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-amber-500" />
            Field Cash Handover & Daily Reconciliation
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Audit physical currency collected by employees, deposits into locker, and verify balance discrepancies
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm shadow-amber-500/25 transition"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Record Daily Cash Handover</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3.5">Reconciliation Date</th>
                <th className="py-3 px-3.5">Employee Name</th>
                <th className="py-3 px-3.5 text-right">Opening Cash</th>
                <th className="py-3 px-3.5 text-right">Cash Collected</th>
                <th className="py-3 px-3.5 text-right">Deposited / Handed Over</th>
                <th className="py-3 px-3.5 text-right">Expected Closing</th>
                <th className="py-3 px-3.5 text-right">Actual Closing</th>
                <th className="py-3 px-3.5 text-right">Difference</th>
                <th className="py-3 px-3.5">Verification</th>
                <th className="py-3 px-3.5">Notes</th>
                {isOwner && <th className="py-3 px-3.5 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reconciliations.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    No cash reconciliation entries yet.
                  </td>
                </tr>
              ) : (
                reconciliations.map(r => {
                  const isVerified = Boolean(r.verified_by);
                  const hasDiscrepancy = r.difference !== 0;

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        {r.reconciliation_date}
                      </td>

                      <td className="py-3.5 px-3.5 font-bold text-slate-800">
                        {r.employee_name || 'Staff'}
                      </td>

                      <td className="py-3.5 px-3.5 text-right text-slate-600">
                        {formatCurrency(r.opening_cash)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right font-bold text-amber-700">
                        {formatCurrency(r.cash_collected)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right font-bold text-emerald-700">
                        {formatCurrency(r.cash_handed_over)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right text-slate-800">
                        {formatCurrency(r.expected_closing_cash)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right font-extrabold text-slate-900">
                        {formatCurrency(r.actual_closing_cash)}
                      </td>

                      <td className="py-3.5 px-3.5 text-right">
                        <span className={`font-bold ${hasDiscrepancy ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {formatCurrency(r.difference)}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <ShieldCheck className="w-3 h-3" />
                            Verified by {r.verified_by_name?.split(' ')[0]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Pending Verification
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5 text-slate-500 max-w-xs truncate">
                        {r.notes || '—'}
                      </td>

                      {isOwner && (
                        <td className="py-3.5 px-3.5 text-center">
                          {!isVerified ? (
                            <button
                              onClick={() => handleVerify(r)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs"
                            >
                              Verify
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">Sealed</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reconciliation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-500 text-white">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                <h3 className="font-extrabold text-base">Record Daily Cash Handover</h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-white/80 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Field Staff *</label>
                  <select
                    value={selectedEmployeeId}
                    onChange={e => setSelectedEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-900"
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    value={reconciliationDate}
                    onChange={e => setReconciliationDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAutoFillCash}
                  className="text-amber-700 hover:text-amber-800 font-bold underline"
                >
                  ⚡ Auto-Calculate Today's Cash Records
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Opening Cash (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingCash}
                    onChange={e => setOpeningCash(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cash Collected (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cashCollected}
                    onChange={e => setCashCollected(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-amber-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cash Handed Over (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cashHandedOver}
                    onChange={e => setCashHandedOver(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Actual Closing Cash (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualClosingCash}
                    onChange={e => setActualClosingCash(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Verification Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Cash counted and deposited in office safe."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700"
                >
                  {submitting ? 'Saving...' : 'Submit Reconciliation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
