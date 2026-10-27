import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Collection, Customer, CollectionSection, SystemSettings } from '../../types';
import { getCustomerById, getSections, getSystemSettings } from '../../services/databaseService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { X, Printer, CheckCircle2, Zap, ShieldCheck, Download } from 'lucide-react';

export const ReceiptModal: React.FC = () => {
  const { receiptModal, closeReceiptModal } = useApp();
  const collection = receiptModal.collection;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [section, setSection] = useState<CollectionSection | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (!collection) return;

    const load = async () => {
      const [c, secs, sett] = await Promise.all([
        getCustomerById(collection.customer_id),
        getSections(),
        getSystemSettings(),
      ]);
      setCustomer(c || null);
      setSection(secs.find(s => s.id === collection.section_id) || null);
      setSettings(sett);
    };

    load();
  }, [collection]);

  if (!receiptModal.isOpen || !collection) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95">
        {/* Header bar (hidden during print) */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Official Payment Receipt
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Receipt</span>
            </button>
            <button onClick={closeReceiptModal} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper */}
        <div id="printable-receipt" className="p-6 bg-white text-slate-900 font-sans border-b border-slate-100">
          {/* Header */}
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            <div className="w-10 h-10 mx-auto rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold mb-2 shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <h2 className="text-base font-extrabold text-slate-950 uppercase tracking-tight">
              {settings?.business_name || 'Apex Utility Billing Services'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {settings?.business_address || 'Vijay Nagar, Indore (M.P.) - 452010'}
            </p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              Helpline: {settings?.business_phone || '+91 731 254 9900'}
            </p>
          </div>

          {/* Receipt Meta */}
          <div className="py-3 border-b border-slate-200 text-xs flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Receipt No.</span>
              <span className="font-mono font-bold text-blue-700">{collection.receipt_number}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Date & Time (IST)</span>
              <span className="font-medium text-slate-700">
                {collection.collection_date} • {collection.collection_time?.slice(0, 5)}
              </span>
            </div>
          </div>

          {/* Resident Details */}
          <div className="py-3 border-b border-slate-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Customer ID:</span>
              <span className="font-mono font-bold text-slate-900">{customer?.customer_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Customer Name:</span>
              <span className="font-bold text-slate-900">{customer?.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Address / Flat:</span>
              <span className="font-medium text-slate-800 text-right">
                {customer?.house_number}, {customer?.building_name || ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mobile:</span>
              <span className="font-mono text-slate-800">{customer?.phone}</span>
            </div>
          </div>

          {/* Payment Section & Items */}
          <div className="py-3 border-b border-slate-200 text-xs">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-500">Bill Section:</span>
              <span className="font-bold text-slate-900">
                {section?.code === 'electricity' ? 'Section 1' : section?.code === 'water' ? 'Section 2' : 'Section 3'}
              </span>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-500">Payment Channel:</span>
              <span className="font-semibold text-slate-900">{collection.payment_method}</span>
            </div>
            {collection.transaction_reference && (
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-500">UTR / Ref:</span>
                <span className="font-mono text-[11px] text-slate-700">{collection.transaction_reference}</span>
              </div>
            )}
            {collection.notes && (
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Remarks:</span>
                <span className="text-slate-700 italic">{collection.notes}</span>
              </div>
            )}
          </div>

          {/* Big Amount Stamp */}
          <div className="my-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-center relative overflow-hidden">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Amount Received
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {formatCurrency(collection.amount)}
            </div>

            <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Payment Confirmed</span>
            </div>
          </div>

          {/* Collector Signature & Footer */}
          <div className="pt-2 text-xs text-slate-500 flex justify-between items-end">
            <div>
              <span className="text-[10px] text-slate-400 block">Collected By:</span>
              <span className="font-bold text-slate-800">{collection.created_by_name || 'Field Officer'}</span>
              <span className="text-[10px] text-emerald-700 font-semibold block flex items-center gap-0.5">
                <ShieldCheck className="w-3 h-3" /> System Verified
              </span>
            </div>
            <div className="text-right">
              <div className="w-24 border-b border-slate-400 mb-1" />
              <span className="text-[10px] text-slate-400">Authorized Signature</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-400">
            Thank you for timely payment. This is a computer-generated receipt.
          </div>
        </div>

        {/* Footer actions (hidden in print) */}
        <div className="p-3 bg-slate-50 print:hidden flex items-center justify-between text-xs">
          <span className="text-slate-500">Supports standard & thermal paper printers</span>
          <button
            onClick={closeReceiptModal}
            className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
