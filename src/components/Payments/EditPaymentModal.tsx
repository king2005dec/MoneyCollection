import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { updateCollection } from '../../services/databaseService';
import { formatCurrency } from '../../utils/formatters';
import { PaymentMethod } from '../../types';
import { X, Pencil, AlertCircle, CheckCircle2 } from 'lucide-react';

export const EditPaymentModal: React.FC = () => {
  const { currentUser } = useAuth();
  const { editPaymentModal, closeEditPaymentModal, triggerDbRefresh, showToast } = useApp();
  const collection = editPaymentModal.collection;

  const [amount, setAmount] = useState<string>(collection ? collection.amount.toString() : '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(collection ? collection.payment_method : 'Cash');
  const [transactionRef, setTransactionRef] = useState<string>(collection?.transaction_reference || '');
  const [notes, setNotes] = useState<string>(collection?.notes || '');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Sync state when collection changes
  React.useEffect(() => {
    if (collection) {
      setAmount(collection.amount.toString());
      setPaymentMethod(collection.payment_method);
      setTransactionRef(collection.transaction_reference || '');
      setNotes(collection.notes || '');
      setReason('');
    }
  }, [collection]);

  if (!editPaymentModal.isOpen || !collection) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid amount greater than zero.', 'error');
      return;
    }

    if (!reason.trim()) {
      showToast('A mandatory reason is required to modify confirmed financial entries.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };

      await updateCollection(
        collection.id,
        {
          amount: numAmount,
          payment_method: paymentMethod,
          transaction_reference: transactionRef.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        reason.trim(),
        actor
      );

      showToast(`Payment receipt ${collection.receipt_number} updated successfully! Audit log created.`);
      triggerDbRefresh();
      closeEditPaymentModal();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update payment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-500 text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl">
              <Pencil className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Edit Collection Entry #{collection.receipt_number}</h3>
              <p className="text-xs text-amber-100">Mandatory audit justification required for financial adjustments</p>
            </div>
          </div>
          <button onClick={closeEditPaymentModal} className="p-1 rounded-lg text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Original Collection</span>
            <div className="flex justify-between items-center mt-1">
              <span>Date: <strong>{collection.collection_date}</strong></span>
              <span>Original Amount: <strong className="text-slate-900">{formatCurrency(collection.amount)}</strong></span>
              <span>Collector: <strong>{collection.created_by_name}</strong></span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Corrected Amount (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold rounded-lg border border-slate-200 focus:outline-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-800"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI (Google Pay / PhonePe)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Reference / UTR
              </label>
              <input
                type="text"
                value={transactionRef}
                onChange={e => setTransactionRef(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Remarks
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200"
            />
          </div>

          {/* Mandatory Reason for Change */}
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/80">
            <label className="block text-xs font-extrabold text-amber-900 uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Reason for Change (Mandatory for Audit Trail) *
            </label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Corrected amount as per physical carbon receipt book; typo by field officer."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-amber-300 bg-white focus:outline-amber-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closeEditPaymentModal}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-500/25 disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Updating...' : 'Save & Audit Update'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
