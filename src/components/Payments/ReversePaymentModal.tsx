import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { reverseCollection } from '../../services/databaseService';
import { formatCurrency } from '../../utils/formatters';
import { X, RotateCcw, AlertTriangle, ShieldAlert } from 'lucide-react';

export const ReversePaymentModal: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const { reversePaymentModal, closeReversePaymentModal, triggerDbRefresh, showToast } = useApp();
  const collection = reversePaymentModal.collection;

  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!reversePaymentModal.isOpen || !collection) return null;

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      showToast('Unauthorized: Only the Business Owner may reverse confirmed transactions.', 'error');
      return;
    }

    if (!reason.trim()) {
      showToast('A mandatory reason is required to void/reverse transactions.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      await reverseCollection(collection.id, reason.trim(), actor);
      showToast(`Transaction ${collection.receipt_number} reversed. Customer balance restored.`);
      triggerDbRefresh();
      closeReversePaymentModal();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reverse transaction', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-200 overflow-hidden my-6 animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-600 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Reverse / Void Transaction</h3>
              <p className="text-xs text-rose-100">Owner-authorized cancellation of payment entry</p>
            </div>
          </div>
          <button onClick={closeReversePaymentModal} className="p-1 rounded-lg text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleReverse} className="p-6 space-y-4">
          <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Owner Permission Enforced</span>
            </div>
            <p>
              Reversing this entry will mark receipt <strong>{collection.receipt_number}</strong> as void,
              re-add <strong>{formatCurrency(collection.amount)}</strong> to the resident's pending balance,
              and deduct it from today's collection reports.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Receipt:</span>
              <span className="font-mono font-bold text-slate-900">{collection.receipt_number}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-slate-500">Collected Amount:</span>
              <span className="font-extrabold text-slate-900 text-sm">{formatCurrency(collection.amount)}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-slate-500">Original Collector:</span>
              <span className="font-medium text-slate-800">{collection.created_by_name}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-1">
              Mandatory Reversal Reason *
            </label>
            <textarea
              rows={3}
              required
              placeholder="e.g. UPI bounced due to server timeout, customer refunded in cash, entry recorded by mistake."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-rose-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closeReversePaymentModal}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/25 disabled:opacity-50 flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{submitting ? 'Reversing...' : 'Authorize Reversal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
