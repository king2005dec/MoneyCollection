import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Customer, BillingPeriod, CollectionSection } from '../../types';
import { getCustomers, getBillingPeriods, getSections } from '../../services/databaseService';
import { AddCustomerModal } from './AddCustomerModal';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency } from '../../utils/formatters';
import {
  Users,
  Search,
  PlusCircle,
  Eye,
  CreditCard,
  Layers,
  FileSpreadsheet,
  LayoutGrid,
} from 'lucide-react';
import { ExcelSpreadsheetView } from '../Excel/ExcelSpreadsheetView';

export const CustomerListView: React.FC = () => {
  const { isOwner } = useAuth();
  const { dbVersion, openCustomerProfile, openPaymentModal } = useApp();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode: default to 'excel' on desktop, 'list' on mobile
  const [viewMode, setViewMode] = useState<'excel' | 'list'>(
    window.innerWidth < 768 ? 'list' : 'excel'
  );

  // Modals & Filters
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [c, b, s] = await Promise.all([
          getCustomers(),
          getBillingPeriods(),
          getSections(),
        ]);
        setCustomers(c);
        setBillingPeriods(b);
        setSections(s);
      } catch (err) {
        console.error('Failed to load customers:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  const getSectionName = (secId: string) => {
    if (secId.includes('elec')) return 'Section 1';
    if (secId.includes('water')) return 'Section 2';
    return 'Section 3';
  };

  // Compute total pending across all periods for each customer
  const customerRows = customers.map(cust => {
    const custPeriods = billingPeriods.filter(p => p.customer_id === cust.id);
    const totalPending = custPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);
    const currentMonthPeriods = custPeriods.filter(p => p.billing_month === 10 && p.billing_year === 2026);

    let status = 'Pending';
    if (currentMonthPeriods.length > 0) {
      if (currentMonthPeriods.every(p => p.payment_status === 'Paid')) status = 'Paid';
      else if (currentMonthPeriods.some(p => p.payment_status === 'Overdue')) status = 'Overdue';
      else if (currentMonthPeriods.some(p => p.payment_status === 'Partially Paid')) status = 'Partially Paid';
    }

    return {
      customer: cust,
      totalPending,
      status,
      assignedSections: cust.assigned_section_ids.map(id => getSectionName(id)),
    };
  });

  // Filter
  const filteredRows = customerRows.filter(row => {
    if (sectionFilter !== 'all' && !row.customer.assigned_section_ids.includes(sectionFilter)) return false;
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = row.customer.full_name.toLowerCase().includes(q);
      const matchPhone = row.customer.phone.includes(q);
      const matchCode = row.customer.customer_code.toLowerCase().includes(q);
      const matchAddr = (row.customer.house_number + ' ' + (row.customer.building_name || '') + ' ' + row.customer.address).toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchCode && !matchAddr) return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'All Customers' }]} />

      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Residents & Customers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Master directory across Section 1, Section 2, and Section 3
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Add Customer</span>
          </button>
        </div>
      </div>

      {viewMode === 'excel' ? (
        <ExcelSpreadsheetView initialSectionCode="all" />
      ) : (
        <>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, phone, flat #, or ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Section Filter */}
          <select
            value={sectionFilter}
            onChange={e => setSectionFilter(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Sections</option>
            <option value="sec-elec-001">Section 1</option>
            <option value="sec-water-002">Section 2</option>
            <option value="sec-other-003">Section 3</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-2 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Status</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partial</option>
            <option value="Pending">Pending</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* MOBILE BASE UI: Touch-friendly Card List */}
      <div className="md:hidden space-y-2.5">
        {filteredRows.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-slate-400 text-xs border border-slate-200">
            No residents found matching your search.
          </div>
        ) : (
          filteredRows.map(row => (
            <div
              key={row.customer.id}
              onClick={() => openCustomerProfile(row.customer.id)}
              className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-2 active:bg-slate-50 transition cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                      {row.customer.customer_code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm">{row.customer.full_name}</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {row.customer.house_number}, {row.customer.building_name || row.customer.city} • {row.customer.phone}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  row.status === 'Paid'
                    ? 'bg-emerald-100 text-emerald-800'
                    : row.status === 'Partially Paid'
                    ? 'bg-amber-100 text-amber-800'
                    : row.status === 'Overdue'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {row.status}
                </span>
              </div>

              {/* Sections badges */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-wrap gap-1">
                  {row.assignedSections.map((secName, i) => (
                    <span key={i} className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                      {secName}
                    </span>
                  ))}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Pending</span>
                  <span className={`font-bold text-xs ${row.totalPending > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                    {formatCurrency(row.totalPending)}
                  </span>
                </div>
              </div>

              {/* Action Buttons for Mobile */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => openPaymentModal(row.customer.id)}
                  className="flex-1 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>+ Pay</span>
                </button>
                <button
                  onClick={() => openCustomerProfile(row.customer.id)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg"
                >
                  Profile
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP UI: Clean Table */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Customer ID</th>
                <th className="py-3 px-4">Resident Full Name</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4">Assigned Sections</th>
                <th className="py-3 px-4 text-right">Total Outstanding</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No customers found. Click "+ Add Customer" to register residents.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  return (
                    <tr
                      key={row.customer.id}
                      onClick={() => openCustomerProfile(row.customer.id)}
                      className="hover:bg-blue-50/40 transition cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">
                          {row.customer.customer_code}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-900">
                        {row.customer.full_name}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {row.customer.phone}
                      </td>

                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {row.customer.house_number}, {row.customer.building_name || row.customer.city}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {row.assignedSections.map((secName, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                              {secName}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-xs">
                        <span className={row.totalPending > 0 ? 'text-rose-700' : 'text-slate-400'}>
                          {formatCurrency(row.totalPending)}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.status === 'Partially Paid'
                            ? 'bg-amber-100 text-amber-800'
                            : row.status === 'Overdue'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openPaymentModal(row.customer.id)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition"
                          >
                            Pay
                          </button>
                          <button
                            onClick={() => openCustomerProfile(row.customer.id)}
                            className="p-1 rounded text-slate-500 hover:bg-slate-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
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
        </>
      )}

      {/* Add Customer Modal */}
      <AddCustomerModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        sections={sections}
      />
    </div>
  );
};
