import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Collection, Customer, CollectionSection, Profile } from '../../types';
import { getCollections, getCustomers, getSections, getProfiles } from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, formatDateTime, exportToCSV } from '../../utils/formatters';
import {
  Receipt,
  Search,
  Filter,
  Download,
  Printer,
  Pencil,
  RotateCcw,
  FileSpreadsheet,
  Coins,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';

export const AllTransactionsView: React.FC = () => {
  const { isOwner } = useAuth();
  const {
    dbVersion,
    openReceiptModal,
    openEditPaymentModal,
    openReversePaymentModal,
    openCustomerProfile,
  } = useApp();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [adminFilter, setAdminFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cols, custs, secs, profs] = await Promise.all([
          getCollections(),
          getCustomers(),
          getSections(),
          getProfiles(),
        ]);
        setCollections(cols);
        setCustomers(custs);
        setSections(secs);
        setProfiles(profs);
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  // Filtered rows
  const filtered = collections.filter(c => {
    if (sectionFilter !== 'all' && c.section_id !== sectionFilter) return false;
    if (methodFilter !== 'all' && c.payment_method !== methodFilter) return false;
    if (adminFilter !== 'all' && c.created_by !== adminFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const cust = customers.find(x => x.id === c.customer_id);
      const matchReceipt = c.receipt_number.toLowerCase().includes(q);
      const matchCust = cust ? cust.full_name.toLowerCase().includes(q) || cust.customer_code.toLowerCase().includes(q) : false;
      const matchRef = c.transaction_reference?.toLowerCase().includes(q) || false;
      if (!matchReceipt && !matchCust && !matchRef) return false;
    }

    return true;
  });

  const totalAmount = filtered
    .filter(c => c.status === 'Confirmed' || c.status === 'Corrected')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalCash = filtered
    .filter(c => (c.status === 'Confirmed' || c.status === 'Corrected') && c.payment_method === 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalOnline = totalAmount - totalCash;

  const handleExportCSV = () => {
    const rows = filtered.map(c => {
      const cust = customers.find(x => x.id === c.customer_id);
      const sec = sections.find(s => s.id === c.section_id);
      return {
        'Receipt Number': c.receipt_number,
        'Customer ID': cust?.customer_code || '—',
        'Customer Name': cust?.full_name || '—',
        'Phone': cust?.phone || '—',
        'House Number': cust?.house_number || '—',
        'Section': sec?.name || '—',
        'Amount': c.amount,
        'Payment Method': c.payment_method,
        'Reference': c.transaction_reference || '',
        'Collection Date': c.collection_date,
        'Collection Time': c.collection_time,
        'Created By': c.created_by_name || '',
        'Status': c.status,
        'Notes': c.notes || '',
      };
    });

    exportToCSV('Collections_Transactions_Report', rows);
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'All Transactions' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-blue-600" />
            Complete Collection & Payment Journal
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Every transaction, cash handovers, UPI references, and authorized audit adjustments
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition"
        >
          <Download className="w-4 h-4" />
          <span>Export Filtered to CSV</span>
        </button>
      </div>

      {/* Top Total Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Volume Filtered</span>
          <span className="text-lg font-extrabold text-slate-900">{formatCurrency(totalAmount)}</span>
          <span className="text-[11px] text-slate-500 block">{filtered.length} total entries</span>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-amber-100 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Cash Collected</span>
          <span className="text-lg font-extrabold text-amber-700">{formatCurrency(totalCash)}</span>
          <span className="text-[11px] text-slate-500 block">Physical currency count</span>
        </div>
        <div className="bg-white rounded-xl p-3.5 border border-indigo-100 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Online / UPI Collected</span>
          <span className="text-lg font-extrabold text-indigo-700">{formatCurrency(totalOnline)}</span>
          <span className="text-[11px] text-slate-500 block">Electronic banking credits</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search receipt #, customer name, ID, or UTR..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
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

          {/* Method */}
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Channels</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Other Online Payment">Other Online</option>
          </select>

          {/* Admin */}
          <select
            value={adminFilter}
            onChange={e => setAdminFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Field Staff</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Corrected">Corrected</option>
            <option value="Reversed">Reversed</option>
          </select>
        </div>
      </div>

      {/* Transactions: Mobile Card View + Desktop Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Cards View (md:hidden) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No transactions match your active filters.
            </div>
          ) : (
            filtered.map(col => {
              const cust = customers.find(x => x.id === col.customer_id);
              const sec = sections.find(s => s.id === col.section_id);
              const isReversed = col.status === 'Reversed';

              return (
                <div key={col.id} className="p-4 space-y-2.5 active:bg-slate-50 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-600 text-xs">
                          {col.receipt_number}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isReversed
                            ? 'bg-rose-100 text-rose-800'
                            : col.status === 'Corrected'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {col.status}
                        </span>
                      </div>
                      <button
                        onClick={() => cust && openCustomerProfile(cust.id)}
                        className="font-bold text-slate-900 text-sm mt-1 text-left block"
                      >
                        {cust?.full_name || 'Resident'}
                      </button>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        {cust?.customer_code} • {cust?.house_number}
                      </span>
                    </div>

                    <div className="text-right">
                      {isReversed ? (
                        <span className="text-base font-extrabold line-through text-slate-400 block">
                          {formatCurrency(col.amount)}
                        </span>
                      ) : (
                        <span className="text-base font-extrabold text-slate-900 block">
                          {formatCurrency(col.amount)}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 inline-block mt-0.5">
                        {sec?.name || 'Section'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        col.payment_method === 'Cash' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-800'
                      }`}>
                        {col.payment_method}
                      </span>
                      <span className="text-[11px]">{col.collection_date}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openReceiptModal(col)}
                        className="px-2.5 py-1 rounded bg-blue-50 text-blue-600 font-bold text-xs"
                      >
                        Receipt
                      </button>
                      {!isReversed && (
                        <button
                          onClick={() => openEditPaymentModal(col)}
                          className="px-2 py-1 rounded hover:bg-slate-100 text-slate-600 text-xs"
                        >
                          Edit
                        </button>
                      )}
                      {isOwner && !isReversed && (
                        <button
                          onClick={() => openReversePaymentModal(col)}
                          className="px-2 py-1 rounded hover:bg-rose-50 text-rose-600 text-xs"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
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
                <th className="py-3 px-3.5">Receipt #</th>
                <th className="py-3 px-3.5">Resident</th>
                <th className="py-3 px-3.5">Section</th>
                <th className="py-3 px-3.5">Date & Time</th>
                <th className="py-3 px-3.5">Channel & Ref</th>
                <th className="py-3 px-3.5">Staff</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Amount</th>
                <th className="py-3 px-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No transactions match your active filters.
                  </td>
                </tr>
              ) : (
                filtered.map(col => {
                  const cust = customers.find(x => x.id === col.customer_id);
                  const sec = sections.find(s => s.id === col.section_id);
                  const isReversed = col.status === 'Reversed';

                  return (
                    <tr key={col.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3.5 font-mono font-bold text-blue-600">
                        {col.receipt_number}
                      </td>

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

                      <td className="py-3.5 px-3.5 font-medium text-slate-800">
                        {sec?.name || 'Section'}
                      </td>

                      <td className="py-3.5 px-3.5 text-slate-600 whitespace-nowrap">
                        {col.collection_date} • {col.collection_time?.slice(0, 5)}
                      </td>

                      <td className="py-3.5 px-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          col.payment_method === 'Cash' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {col.payment_method}
                        </span>
                        {col.transaction_reference && (
                          <div className="font-mono text-[10px] text-slate-400 truncate max-w-[120px]">
                            {col.transaction_reference}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5 font-medium text-slate-800 whitespace-nowrap">
                        {col.created_by_name || 'Admin'}
                      </td>

                      <td className="py-3.5 px-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isReversed
                            ? 'bg-rose-100 text-rose-800'
                            : col.status === 'Corrected'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {col.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-3.5 text-right font-extrabold text-sm whitespace-nowrap">
                        {isReversed ? (
                          <span className="line-through text-slate-400">{formatCurrency(col.amount)}</span>
                        ) : (
                          <span className="text-slate-900">{formatCurrency(col.amount)}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openReceiptModal(col)}
                            title="Print / View Receipt"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                          {!isReversed && (
                            <button
                              onClick={() => openEditPaymentModal(col)}
                              title="Edit Entry (Audit Required)"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {isOwner && !isReversed && (
                            <button
                              onClick={() => openReversePaymentModal(col)}
                              title="Reverse Transaction (Owner Only)"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition"
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
    </div>
  );
};
