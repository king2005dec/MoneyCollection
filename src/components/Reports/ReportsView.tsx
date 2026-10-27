import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Collection,
  Customer,
  BillingPeriod,
  CollectionSection,
  Profile,
  CashReconciliation,
  AuditLog,
} from '../../types';
import {
  getCollections,
  getCustomers,
  getBillingPeriods,
  getSections,
  getProfiles,
  getCashReconciliations,
  getAuditLogs,
} from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, formatDateTime, exportToCSV, getMonthName } from '../../utils/formatters';
import {
  BarChart3,
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  Coins,
  CreditCard,
  Users,
} from 'lucide-react';

type ReportType =
  | 'daily_collection'
  | 'monthly_collection'
  | 'month_comparison'
  | 'section_wise'
  | 'employee_wise'
  | 'cash_collection'
  | 'online_collection'
  | 'pending_payments'
  | 'customer_ledger'
  | 'cash_recon'
  | 'audit_report';

export const ReportsView: React.FC = () => {
  const { isOwner } = useAuth();
  const { dbVersion } = useApp();

  const [activeReport, setActiveReport] = useState<ReportType>('daily_collection');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cashRecons, setCashRecons] = useState<CashReconciliation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cols, custs, periods, secs, profs, cr, logs] = await Promise.all([
          getCollections(),
          getCustomers(),
          getBillingPeriods(),
          getSections(),
          getProfiles(),
          getCashReconciliations(),
          getAuditLogs(),
        ]);
        setCollections(cols);
        setCustomers(custs);
        setBillingPeriods(periods);
        setSections(secs);
        setProfiles(profs);
        setCashRecons(cr);
        setAuditLogs(logs);
      } catch (err) {
        console.error('Failed to load report data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  const confirmedCols = collections.filter(c => c.status === 'Confirmed' || c.status === 'Corrected');

  // Report Generator Logic
  const generateReportData = () => {
    switch (activeReport) {
      case 'daily_collection': {
        const targetDate = '2026-10-22';
        const rows = confirmedCols.filter(c => c.collection_date === targetDate);
        return {
          title: 'Daily Collection Report (22 Oct 2026)',
          headers: ['Receipt #', 'Customer', 'Section', 'Payment Method', 'Amount', 'Collector', 'Reference'],
          data: rows.map(r => {
            const cust = customers.find(c => c.id === r.customer_id);
            const sec = sections.find(s => s.id === r.section_id);
            return {
              'Receipt #': r.receipt_number,
              'Customer': cust ? `${cust.full_name} (${cust.customer_code})` : 'Resident',
              'Section': sec?.name || 'Section',
              'Payment Method': r.payment_method,
              'Amount': r.amount,
              'Collector': r.created_by_name || 'Admin',
              'Reference': r.transaction_reference || '—',
            };
          }),
          total: rows.reduce((s, r) => s + r.amount, 0),
        };
      }

      case 'monthly_collection': {
        const rows = confirmedCols.filter(c => c.collection_date.startsWith(`${selectedYear}-${selectedMonth.toString().padStart(2, '0')}`));
        return {
          title: `Monthly Collection Report (${getMonthName(selectedMonth)} ${selectedYear})`,
          headers: ['Receipt #', 'Customer', 'Section', 'Date', 'Payment Method', 'Amount', 'Collector'],
          data: rows.map(r => {
            const cust = customers.find(c => c.id === r.customer_id);
            const sec = sections.find(s => s.id === r.section_id);
            return {
              'Receipt #': r.receipt_number,
              'Customer': cust?.full_name || 'Resident',
              'Section': sec?.name || 'Section',
              'Date': r.collection_date,
              'Payment Method': r.payment_method,
              'Amount': r.amount,
              'Collector': r.created_by_name || 'Admin',
            };
          }),
          total: rows.reduce((s, r) => s + r.amount, 0),
        };
      }

      case 'month_comparison': {
        const sepCols = confirmedCols.filter(c => c.collection_date.startsWith('2026-09'));
        const octCols = confirmedCols.filter(c => c.collection_date.startsWith('2026-10'));
        const sepTotal = sepCols.reduce((s, c) => s + c.amount, 0);
        const octTotal = octCols.reduce((s, c) => s + c.amount, 0);
        return {
          title: 'Last Month vs Current Month Comparison (September vs October 2026)',
          headers: ['Billing Month', 'Total Collections', 'Transactions Count', 'Cash Share', 'Online Share'],
          data: [
            {
              'Billing Month': 'September 2026',
              'Total Collections': sepTotal,
              'Transactions Count': sepCols.length,
              'Cash Share': sepCols.filter(c => c.payment_method === 'Cash').reduce((s, c) => s + c.amount, 0),
              'Online Share': sepCols.filter(c => c.payment_method !== 'Cash').reduce((s, c) => s + c.amount, 0),
            },
            {
              'Billing Month': 'October 2026 (Current)',
              'Total Collections': octTotal,
              'Transactions Count': octCols.length,
              'Cash Share': octCols.filter(c => c.payment_method === 'Cash').reduce((s, c) => s + c.amount, 0),
              'Online Share': octCols.filter(c => c.payment_method !== 'Cash').reduce((s, c) => s + c.amount, 0),
            },
          ],
          total: octTotal,
        };
      }

      case 'section_wise': {
        const rows = sections.map(sec => {
          const secCols = confirmedCols.filter(c => c.section_id === sec.id);
          const total = secCols.reduce((s, c) => s + c.amount, 0);
          const cash = secCols.filter(c => c.payment_method === 'Cash').reduce((s, c) => s + c.amount, 0);
          const online = secCols.filter(c => c.payment_method !== 'Cash').reduce((s, c) => s + c.amount, 0);
          return {
            'Section Name': sec.name,
            'Total Collections': total,
            'Cash Amount': cash,
            'Online (UPI) Amount': online,
            'Total Transactions': secCols.length,
          };
        });
        return {
          title: 'Section-Wise Collection Report',
          headers: ['Section Name', 'Total Collections', 'Cash Amount', 'Online (UPI) Amount', 'Total Transactions'],
          data: rows,
          total: rows.reduce((s, r) => s + r['Total Collections'], 0),
        };
      }

      case 'employee_wise': {
        const rows = profiles.map(p => {
          const empCols = confirmedCols.filter(c => c.created_by === p.id);
          const total = empCols.reduce((s, c) => s + c.amount, 0);
          const cash = empCols.filter(c => c.payment_method === 'Cash').reduce((s, c) => s + c.amount, 0);
          const online = empCols.filter(c => c.payment_method !== 'Cash').reduce((s, c) => s + c.amount, 0);
          return {
            'Employee Name': p.full_name,
            'Role': p.role === 'owner' ? 'Owner' : 'Field Admin',
            'Total Collected': total,
            'Cash Collected': cash,
            'Online Collected': online,
            'Receipts Issued': empCols.length,
          };
        });
        return {
          title: 'Employee-Wise Collection Report',
          headers: ['Employee Name', 'Role', 'Total Collected', 'Cash Collected', 'Online Collected', 'Receipts Issued'],
          data: rows,
          total: rows.reduce((s, r) => s + r['Total Collected'], 0),
        };
      }

      case 'cash_collection': {
        const rows = confirmedCols.filter(c => c.payment_method === 'Cash');
        return {
          title: 'Cash Collection & Physical Currency Report',
          headers: ['Receipt #', 'Customer', 'Section', 'Date', 'Cash Amount', 'Collector'],
          data: rows.map(r => {
            const cust = customers.find(c => c.id === r.customer_id);
            const sec = sections.find(s => s.id === r.section_id);
            return {
              'Receipt #': r.receipt_number,
              'Customer': cust?.full_name || 'Resident',
              'Section': sec?.name || 'Section',
              'Date': r.collection_date,
              'Cash Amount': r.amount,
              'Collector': r.created_by_name || 'Admin',
            };
          }),
          total: rows.reduce((s, r) => s + r.amount, 0),
        };
      }

      case 'online_collection': {
        const rows = confirmedCols.filter(c => c.payment_method !== 'Cash');
        return {
          title: 'Online (UPI & Bank Transfer) Collection Report',
          headers: ['Receipt #', 'Customer', 'Method', 'UTR / Ref', 'Date', 'Amount', 'Collector'],
          data: rows.map(r => {
            const cust = customers.find(c => c.id === r.customer_id);
            return {
              'Receipt #': r.receipt_number,
              'Customer': cust?.full_name || 'Resident',
              'Method': r.payment_method,
              'UTR / Ref': r.transaction_reference || '—',
              'Date': r.collection_date,
              'Amount': r.amount,
              'Collector': r.created_by_name || 'Admin',
            };
          }),
          total: rows.reduce((s, r) => s + r.amount, 0),
        };
      }

      case 'pending_payments': {
        const rows = billingPeriods.filter(p => p.closing_balance > 0).map(p => {
          const cust = customers.find(c => c.id === p.customer_id);
          const sec = sections.find(s => s.id === p.section_id);
          return {
            'Customer Code': cust?.customer_code || '',
            'Customer Name': cust?.full_name || '',
            'Phone': cust?.phone || '',
            'Section': sec?.name || '',
            'Billing Period': `${getMonthName(p.billing_month)} ${p.billing_year}`,
            'Total Due': p.total_amount_due,
            'Paid Amount': p.paid_amount,
            'Closing Pending': p.closing_balance,
            'Status': p.payment_status,
          };
        });
        return {
          title: 'Pending & Overdue Balances Report',
          headers: ['Customer Code', 'Customer Name', 'Phone', 'Section', 'Billing Period', 'Total Due', 'Paid Amount', 'Closing Pending', 'Status'],
          data: rows,
          total: rows.reduce((s, r) => s + r['Closing Pending'], 0),
        };
      }

      case 'customer_ledger': {
        const rows = customers.map(cust => {
          const custPeriods = billingPeriods.filter(p => p.customer_id === cust.id);
          const totalDue = custPeriods.reduce((s, p) => s + p.total_amount_due, 0);
          const totalPaid = custPeriods.reduce((s, p) => s + p.paid_amount, 0);
          const balance = custPeriods.reduce((s, p) => s + Math.max(0, p.closing_balance), 0);
          return {
            'Customer ID': cust.customer_code,
            'Resident Name': cust.full_name,
            'Phone': cust.phone,
            'Flat / House': cust.house_number,
            'Total Billed Due': totalDue,
            'Total Paid To Date': totalPaid,
            'Net Outstanding Balance': balance,
          };
        });
        return {
          title: 'Comprehensive Customer Ledger Report',
          headers: ['Customer ID', 'Resident Name', 'Phone', 'Flat / House', 'Total Billed Due', 'Total Paid To Date', 'Net Outstanding Balance'],
          data: rows,
          total: rows.reduce((s, r) => s + r['Net Outstanding Balance'], 0),
        };
      }

      case 'cash_recon': {
        return {
          title: 'Daily Cash Reconciliation & Handover Report',
          headers: ['Date', 'Employee', 'Opening Cash', 'Cash Collected', 'Handed Over', 'Actual Closing', 'Difference', 'Verified By'],
          data: cashRecons.map(r => ({
            'Date': r.reconciliation_date,
            'Employee': r.employee_name || 'Staff',
            'Opening Cash': r.opening_cash,
            'Cash Collected': r.cash_collected,
            'Handed Over': r.cash_handed_over,
            'Actual Closing': r.actual_closing_cash,
            'Difference': r.difference,
            'Verified By': r.verified_by_name || 'Pending',
          })),
          total: cashRecons.reduce((s, r) => s + r.cash_collected, 0),
        };
      }

      case 'audit_report': {
        return {
          title: 'Transaction Audit & Compliance Report',
          headers: ['Timestamp', 'Action', 'Operator', 'Entity', 'Reason'],
          data: auditLogs.map(l => ({
            'Timestamp': l.created_at,
            'Action': l.action_type,
            'Operator': l.actor_name,
            'Entity': `${l.entity_type} #${l.entity_id}`,
            'Reason': l.reason || '—',
          })),
          total: auditLogs.length,
        };
      }
    }
  };

  const report = generateReportData();

  const handleExport = () => {
    exportToCSV(activeReport, report.data);
  };

  const reportsList: { id: ReportType; label: string }[] = [
    { id: 'daily_collection', label: '1. Daily Collection Report' },
    { id: 'monthly_collection', label: '2. Monthly Collection Report' },
    { id: 'month_comparison', label: '3. Last Month vs Current Month' },
    { id: 'section_wise', label: '4. Section-Wise Report' },
    { id: 'employee_wise', label: '5. Employee-Wise Report' },
    { id: 'cash_collection', label: '6. Cash Collection Report' },
    { id: 'online_collection', label: '7. Online (UPI) Report' },
    { id: 'pending_payments', label: '8. Pending Payments Report' },
    { id: 'customer_ledger', label: '9. Customer Ledger' },
    { id: 'cash_recon', label: '10. Cash Reconciliation Report' },
    { id: 'audit_report', label: '11. Transaction Audit Report' },
  ];

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'Reports & Exports' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            Financial Reports & CSV Exports
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            11 institutional collection reports ready to inspect, filter, and export into Microsoft Excel or Google Sheets
          </p>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition"
        >
          <Download className="w-4 h-4" />
          <span>Export This Report (CSV)</span>
        </button>
      </div>

      {/* Report Selector Pills */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs overflow-x-auto">
        <div className="flex flex-nowrap items-center gap-1.5 min-w-max text-xs font-semibold">
          {reportsList.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveReport(item.id)}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                activeReport === item.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Report Header & Metric */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{report.title}</h2>
          <p className="text-xs text-slate-500">{report.data.length} records computed from verified database transactions</p>
        </div>

        <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 text-right">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Report Aggregate</span>
          <span className="text-lg font-extrabold text-slate-900">
            {typeof report.total === 'number' && activeReport !== 'audit_report'
              ? formatCurrency(report.total)
              : `${report.total} Entries`}
          </span>
        </div>
      </div>

      {/* Report Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                {report.headers.map((h, idx) => (
                  <th key={idx} className="py-3 px-3.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.data.length === 0 ? (
                <tr>
                  <td colSpan={report.headers.length} className="py-12 text-center text-slate-400">
                    No data available for this report.
                  </td>
                </tr>
              ) : (
                report.data.map((row: any, rIdx: number) => (
                  <tr key={rIdx} className="hover:bg-slate-50 transition">
                    {report.headers.map((h, cIdx) => {
                      const val = row[h];
                      const isMoney = typeof val === 'number' && (h.includes('Amount') || h.includes('Total') || h.includes('Cash') || h.includes('Online') || h.includes('Due') || h.includes('Balance') || h.includes('Paid') || h.includes('Pending') || h.includes('Closing'));

                      return (
                        <td key={cIdx} className="py-3 px-3.5 whitespace-nowrap">
                          {isMoney ? (
                            <span className="font-bold text-slate-900">{formatCurrency(val)}</span>
                          ) : (
                            <span className="text-slate-800">{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
