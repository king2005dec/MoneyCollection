import React from 'react';
import { Customer, BillingPeriod } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { X, Printer, Download, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  period: BillingPeriod | null;
  sectionName?: string;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  customer,
  period,
  sectionName = 'Section 1 Electricity & Utility',
}) => {
  if (!isOpen || !customer || !period) return null;

  const currentUnit = period.current_unit ?? 0;
  const previousUnit = period.previous_unit ?? 0;
  const unitsConsumed = period.units_consumed ?? Math.max(0, currentUnit - previousUnit);

  const billAmount = period.bill_amount ?? 0;
  const prevBalance = period.opening_balance ?? 0;
  const totalBill = period.total_amount_due ?? (billAmount + prevBalance);
  const paidAmount = period.paid_amount ?? 0;
  const currentBalance = period.closing_balance ?? Math.max(0, totalBill - paidAmount);

  const isPaid = currentBalance <= 0;
  const isPartial = paidAmount > 0 && currentBalance > 0;

  const invoiceNumber = `INV-${period.billing_year}${period.billing_month.toString().padStart(2, '0')}-${customer.customer_code}`;
  const billingMonthName = new Date(period.billing_year, period.billing_month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice - ${customer.customer_code} - ${customer.full_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; max-width: 650px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 15px; margin-bottom: 20px; }
    .title { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
    .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 15px; }
    .table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .table th, .table td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
    .table th { background: #f8fafc; font-weight: 700; }
    .text-right { text-align: right; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 11px; }
    .badge-paid { background: #dcfce7; color: #15803d; }
    .badge-due { background: #ffe4e6; color: #be123c; }
    .badge-part { background: #fef3c7; color: #b45309; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Raj Utility Billing & Collection</div>
    <div class="sub">${sectionName} • Monthly Invoice</div>
  </div>
  <div class="meta">
    <div>
      <strong>Customer:</strong> ${customer.full_name} (${customer.customer_code})<br>
      <strong>Phone:</strong> ${customer.phone || 'N/A'}<br>
      <strong>Address:</strong> ${customer.address || customer.house_number || 'Indore'}
    </div>
    <div style="text-align: right;">
      <strong>Invoice #:</strong> ${invoiceNumber}<br>
      <strong>Period:</strong> ${billingMonthName}<br>
      <strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Units / Details</th>
        <th class="text-right">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Electricity Meter Reading</td>
        <td class="text-right">Current: ${currentUnit} | Prev: ${previousUnit}</td>
        <td class="text-right">${unitsConsumed} Units</td>
      </tr>
      <tr>
        <td>Current Month Bill</td>
        <td class="text-right">Consumption charges</td>
        <td class="text-right">₹${billAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Previous Unpaid Balance (Prebalance)</td>
        <td class="text-right">Carried forward</td>
        <td class="text-right">₹${prevBalance.toFixed(2)}</td>
      </tr>
      <tr style="font-weight: bold; background: #f8fafc;">
        <td colspan="2">TOTAL BILL PAYABLE</td>
        <td class="text-right">₹${totalBill.toFixed(2)}</td>
      </tr>
      <tr style="color: #15803d; font-weight: bold;">
        <td colspan="2">Amount Paid (Pay)</td>
        <td class="text-right">₹${paidAmount.toFixed(2)}</td>
      </tr>
      <tr style="color: #be123c; font-size: 15px; font-weight: 800; background: #fff1f2;">
        <td colspan="2">NET BALANCE DUE</td>
        <td class="text-right">₹${currentBalance.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin: 15px 0;">
    Status: 
    <span class="badge ${isPaid ? 'badge-paid' : isPartial ? 'badge-part' : 'badge-due'}">
      ${isPaid ? 'PAID IN FULL' : isPartial ? 'PARTIALLY PAID' : 'PENDING PAYMENT'}
    </span>
  </div>

  <div class="footer">
    Thank you for your prompt payment. Owner: Raj • For inquiries, contact management.
  </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice_${customer.customer_code}_${period.billing_month}_${period.billing_year}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-4 animate-in fade-in zoom-in-95 print:shadow-none print:border-none print:max-w-none print:my-0">
        {/* Modal Controls (hidden during print) */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Tax Invoice / Bill Slip
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              title="Download HTML Invoice"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-xs"
              title="Print Invoice"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div id="printable-invoice" className="p-6 text-slate-900 text-xs font-sans">
          {/* Header */}
          <div className="text-center pb-4 border-b-2 border-dashed border-slate-300">
            <h1 className="text-lg font-black text-slate-950 uppercase tracking-tight">
              Raj Utility Billing &amp; Collection
            </h1>
            <p className="text-xs font-semibold text-blue-700 mt-0.5">
              {sectionName}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Owner: Raj • Helpline: +91 98260 11001
            </p>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-4 py-3 border-b border-slate-200 text-[11px]">
            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">Billed To:</span>
              <p className="font-extrabold text-sm text-slate-900">{customer.full_name}</p>
              <p className="font-mono font-bold text-blue-700">ID: {customer.customer_code}</p>
              <p className="text-slate-600">{customer.phone}</p>
              {customer.address && <p className="text-slate-500 text-[10px]">{customer.address}</p>}
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-bold uppercase block text-[10px]">Invoice Details:</span>
              <p className="font-mono font-bold text-slate-800 text-[11px]">{invoiceNumber}</p>
              <p className="font-bold text-slate-700">Billing Period: {billingMonthName}</p>
              <p className="text-slate-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          {/* Meter Details */}
          <div className="my-3 p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 block mb-1.5">
              Meter Readings &amp; Consumption
            </span>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <span className="text-[10px] text-slate-500 block">Previous Unit</span>
                <span className="font-bold text-slate-800 text-sm">{previousUnit}</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <span className="text-[10px] text-slate-500 block">Current Unit</span>
                <span className="font-bold text-blue-700 text-sm">{currentUnit}</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <span className="text-[10px] text-slate-500 block">Consumed</span>
                <span className="font-black text-indigo-700 text-sm">{unitsConsumed} Units</span>
              </div>
            </div>
          </div>

          {/* Bill Table */}
          <table className="w-full text-xs border-collapse border border-slate-200 my-3">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                <th className="p-2 border border-slate-200 text-left">Bill Particulars</th>
                <th className="p-2 border border-slate-200 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-slate-200 font-medium">
                  Current Month Bill ({billingMonthName})
                </td>
                <td className="p-2 border border-slate-200 text-right font-bold text-rose-700">
                  {formatCurrency(billAmount)}
                </td>
              </tr>
              <tr>
                <td className="p-2 border border-slate-200 font-medium">
                  Previous Unpaid Balance (Prebalance Bill)
                </td>
                <td className="p-2 border border-slate-200 text-right font-bold text-amber-700">
                  {formatCurrency(prevBalance)}
                </td>
              </tr>
              <tr className="bg-slate-50 font-black">
                <td className="p-2 border border-slate-200 text-slate-900">TOTAL BILL AMOUNT</td>
                <td className="p-2 border border-slate-200 text-right text-slate-950 font-black">
                  {formatCurrency(totalBill)}
                </td>
              </tr>
              <tr className="bg-emerald-50/60 font-bold text-emerald-800">
                <td className="p-2 border border-slate-200">Amount Paid (Pay)</td>
                <td className="p-2 border border-slate-200 text-right font-black">
                  {formatCurrency(paidAmount)}
                </td>
              </tr>
              <tr className="bg-rose-50 font-black text-rose-900">
                <td className="p-2 border border-slate-200 text-sm">CURRENT BALANCE DUE</td>
                <td className="p-2 border border-slate-200 text-right text-base text-rose-700">
                  {formatCurrency(currentBalance)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Status Banner */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5">
              {isPaid ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  PAID IN FULL
                </span>
              ) : isPartial ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  PARTIALLY PAID
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5" />
                  PAYMENT PENDING
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">
              Computer-generated Invoice
            </span>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-slate-400 mt-5 pt-3 border-t border-slate-100">
            Thank you for timely payment • Owner: Raj
          </div>
        </div>
      </div>
    </div>
  );
};
