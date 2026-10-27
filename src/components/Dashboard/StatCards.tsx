import React from 'react';
import { DashboardMetrics } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  IndianRupee,
  Layers,
  Users,
} from 'lucide-react';

interface StatCardsProps {
  metrics: DashboardMetrics;
}

export const StatCards: React.FC<StatCardsProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
      {/* 1. Total Outstanding Amount */}
      <div className="bg-white rounded-xl p-4 border border-rose-100 shadow-2xs relative overflow-hidden">
        <div className="flex items-center justify-between text-rose-600 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Outstanding</span>
          <div className="p-2 bg-rose-50 rounded-lg">
            <IndianRupee className="w-4 h-4 text-rose-600" />
          </div>
        </div>
        <div className="text-xl font-extrabold text-slate-900 tracking-tight">
          {formatCurrency(metrics.totalOutstanding)}
        </div>
        <div className="text-[11px] text-rose-700 font-medium mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
          <span>Across all billing periods</span>
        </div>
      </div>

      {/* 2. Total Collection Today */}
      <div className="bg-white rounded-xl p-4 border border-blue-100 shadow-2xs relative overflow-hidden">
        <div className="flex items-center justify-between text-blue-600 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Collected Today</span>
          <div className="p-2 bg-blue-50 rounded-lg">
            <Calendar className="w-4 h-4 text-blue-600" />
          </div>
        </div>
        <div className="text-xl font-extrabold text-slate-900 tracking-tight">
          {formatCurrency(metrics.totalCollectionToday)}
        </div>
        <div className="text-[11px] text-blue-700 font-medium mt-1">
          22 Oct 2026 (Live field sync)
        </div>
      </div>

      {/* 3. Total Collection This Month */}
      <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-2xs relative overflow-hidden">
        <div className="flex items-center justify-between text-emerald-600 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Collected This Month</span>
          <div className="p-2 bg-emerald-50 rounded-lg">
            <CreditCard className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
        <div className="text-xl font-extrabold text-slate-900 tracking-tight">
          {formatCurrency(metrics.totalCollectionThisMonth)}
        </div>
        <div className="text-[11px] text-emerald-700 font-medium mt-1">
          October 2026 total verified
        </div>
      </div>

      {/* 4. Cash vs Online Breakdown */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between text-slate-600 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cash vs Online (Month)</span>
          <div className="p-2 bg-amber-50 rounded-lg">
            <Coins className="w-4 h-4 text-amber-600" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Cash</div>
            <div className="text-sm font-bold text-amber-700">{formatCurrency(metrics.totalCashThisMonth)}</div>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Online/UPI</div>
            <div className="text-sm font-bold text-indigo-700">{formatCurrency(metrics.totalOnlineThisMonth)}</div>
          </div>
        </div>
      </div>

      {/* 5. Customer Status Breakdown */}
      <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between text-slate-600 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Health</span>
          <div className="p-2 bg-purple-50 rounded-lg">
            <Users className="w-4 h-4 text-purple-600" />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="text-center">
            <div className="font-bold text-emerald-600">{metrics.fullyPaidCustomers}</div>
            <div className="text-[10px] text-slate-500">Paid</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-amber-600">{metrics.partiallyPaidCustomers}</div>
            <div className="text-[10px] text-slate-500">Partial</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-rose-600">{metrics.overdueCustomers}</div>
            <div className="text-[10px] text-slate-500">Overdue</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-700">{metrics.totalPendingCustomers}</div>
            <div className="text-[10px] text-slate-500">Pending</div>
          </div>
        </div>
      </div>
    </div>
  );
};
