import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { X, Copy, Check, QrCode, Smartphone, CheckCircle2, ShieldCheck } from 'lucide-react';

interface UpiQrViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerCode?: string;
  currentBalance: number;
  initialAmount?: number;
  onPaymentConfirmed?: (paidAmount: number, utr: string) => Promise<void> | void;
}

export const UpiQrViewModal: React.FC<UpiQrViewModalProps> = ({
  isOpen,
  onClose,
  customerName,
  customerCode,
  currentBalance,
  initialAmount,
  onPaymentConfirmed,
}) => {
  const [payAmount, setPayAmount] = useState<string>('');
  const [utrNumber, setUtrNumber] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      // Default amount to either initialAmount or currentBalance
      const defaultAmt = initialAmount !== undefined && initialAmount > 0 ? initialAmount : currentBalance;
      setPayAmount(defaultAmt > 0 ? defaultAmt.toString() : '');
      setUtrNumber('');
      setCopiedUpi(false);
      setIsSubmitting(false);
    }
  }, [isOpen, currentBalance, initialAmount]);

  if (!isOpen) return null;

  const numPay = parseFloat(payAmount) || 0;
  const newRemainingBalance = Math.max(0, currentBalance - numPay);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText('rajhaldaar189@okicici');
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleConfirm = async () => {
    if (numPay <= 0) return;
    setIsSubmitting(true);
    try {
      if (onPaymentConfirmed) {
        await onPaymentConfirmed(numPay, utrNumber.trim());
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden my-4 animate-in fade-in zoom-in-95 text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm leading-tight">UPI Payment QR</h3>
              <p className="text-[11px] text-blue-100">
                {customerCode ? `${customerCode} • ` : ''}{customerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-3.5">
          {/* Real QR Code uploaded by user */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col items-center text-center">
            <div className="w-56 h-auto bg-white p-2 rounded-xl shadow-xs border border-slate-200 overflow-hidden">
              <img
                src="/assets/aistudio/WhatsApp_Image_2026-10-24_at_1.22.05_AM_eb959bc9.jpeg"
                alt="RAJ Haldar UPI QR Code"
                className="w-full h-auto object-contain rounded-lg"
              />
            </div>

            <div className="mt-2.5 w-full flex items-center justify-between px-2 py-1 bg-white rounded-lg border border-slate-200">
              <div className="text-left">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">UPI ID</span>
                <span className="font-mono font-bold text-slate-800 text-xs">rajhaldaar189@okicici</span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold flex items-center gap-1 transition"
              >
                {copiedUpi ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Amount Synced with Balance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                Amount to Collect (₹)
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Current Due: <strong>{formatCurrency(currentBalance)}</strong>
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">₹</span>
              <input
                type="number"
                step="1"
                min="1"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="Enter collection amount"
                className="w-full pl-7 pr-3 py-2 text-base font-black text-emerald-700 rounded-lg border-2 border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50/20"
              />
            </div>

            {/* Real-time Balance Synchronization Note */}
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-900">
                New Balance After Payment:
              </span>
              <span className={`text-xs font-black ${newRemainingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatCurrency(newRemainingBalance)}
                {newRemainingBalance === 0 && ' (Fully Cleared)'}
              </span>
            </div>
          </div>

          {/* UTR / Transaction Reference (Optional) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              UPI Reference / UTR Number (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. UPI/26102298711/AXIS"
              value={utrNumber}
              onChange={e => setUtrNumber(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:outline-blue-600"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={numPay <= 0 || isSubmitting}
              onClick={handleConfirm}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Recording...' : 'Payment Received'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
