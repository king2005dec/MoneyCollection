import React, { useState } from 'react';
import { Collection, BillingPeriod, CollectionSection, Profile } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { BarChart2, PieChart, TrendingUp, Users, Wallet, Zap } from 'lucide-react';

interface CollectionChartsProps {
  collections: Collection[];
  billingPeriods: BillingPeriod[];
  sections: CollectionSection[];
  profiles: Profile[];
}

export const CollectionCharts: React.FC<CollectionChartsProps> = ({
  collections,
  billingPeriods,
  sections,
  profiles,
}) => {
  const [activeTab, setActiveTab] = useState<'trends' | 'distribution' | 'employees'>('trends');

  // Filter confirmed collections
  const confirmed = collections.filter(c => c.status === 'Confirmed');

  // 1. Cash vs Online Breakdown
  const cashTotal = confirmed
    .filter(c => c.payment_method === 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  const onlineTotal = confirmed
    .filter(c => c.payment_method !== 'Cash')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalCollected = cashTotal + onlineTotal;
  const cashPct = totalCollected > 0 ? Math.round((cashTotal / totalCollected) * 100) : 0;
  const onlinePct = 100 - cashPct;

  // 2. Section-Wise Collections
  const sectionBreakdown = sections.map(sec => {
    const total = confirmed
      .filter(c => c.section_id === sec.id)
      .reduce((sum, c) => sum + c.amount, 0);
    return {
      name: sec.name,
      code: sec.code,
      total,
      pct: totalCollected > 0 ? Math.round((total / totalCollected) * 100) : 0,
    };
  });

  // 3. Employee-Wise Collections
  const employeeBreakdown = profiles
    .filter(p => p.is_active)
    .map(p => {
      const empCollections = confirmed.filter(c => c.created_by === p.id);
      const cash = empCollections.filter(c => c.payment_method === 'Cash').reduce((sum, c) => sum + c.amount, 0);
      const online = empCollections.filter(c => c.payment_method !== 'Cash').reduce((sum, c) => sum + c.amount, 0);
      const total = cash + online;
      return {
        id: p.id,
        name: p.full_name,
        role: p.role,
        count: empCollections.length,
        cash,
        online,
        total,
      };
    })
    .sort((a, b) => b.total - a.total);

  // 4. Daily Collections in October 2026
  const days = [
    { date: '08 Oct', dayStr: '2026-10-08', cash: 0, online: 1500 },
    { date: '10 Oct', dayStr: '2026-10-10', cash: 500, online: 1900 },
    { date: '12 Oct', dayStr: '2026-10-12', cash: 0, online: 2550 },
    { date: '14 Oct', dayStr: '2026-10-14', cash: 1500, online: 0 },
    { date: '18 Oct', dayStr: '2026-10-18', cash: 0, online: 4100 },
    { date: '21 Oct', dayStr: '2026-10-21', cash: 8300, online: 0 },
    { date: '22 Oct (Today)', dayStr: '2026-10-22', cash: 3800, online: 3600 },
  ];

  const maxDayTotal = Math.max(...days.map(d => d.cash + d.online), 10000);

  // 5. Total Paid vs Total Pending in Billing Periods
  const currentMonthPeriods = billingPeriods.filter(p => p.billing_month === 10 && p.billing_year === 2026);
  const totalBilledDue = currentMonthPeriods.reduce((sum, p) => sum + p.total_amount_due, 0);
  const totalPaidInPeriod = currentMonthPeriods.reduce((sum, p) => sum + p.paid_amount, 0);
  const totalPendingInPeriod = currentMonthPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);
  const paidRatio = totalBilledDue > 0 ? Math.round((totalPaidInPeriod / totalBilledDue) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs">
      {/* Header and Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Financial Intelligence & Collection Trends
          </h2>
          <p className="text-xs text-slate-500">Live verified data across sections, field staff, and payment channels</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'trends' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Trend & Channel
          </button>
          <button
            onClick={() => setActiveTab('distribution')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'distribution' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Section & Status Ratio
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'employees' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Employee Leaderboard
          </button>
        </div>
      </div>

      {/* Tab 1: Daily Trend & Cash vs Online */}
      {activeTab === 'trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5">
          {/* Daily Bar Chart */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Daily Collection Breakdown (Cash vs Online)
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Cash
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Online (UPI/Bank)
                </span>
              </div>
            </div>

            <div className="h-48 flex items-end justify-between gap-3 pt-6 border-b border-slate-100 px-2">
              {days.map((item, idx) => {
                const dayTotal = item.cash + item.online;
                const totalHeightPct = Math.round((dayTotal / maxDayTotal) * 100);
                const cashPortion = dayTotal > 0 ? (item.cash / dayTotal) * totalHeightPct : 0;
                const onlinePortion = totalHeightPct - cashPortion;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Hover tooltip */}
                    <div className="absolute -top-12 bg-slate-900 text-white text-[11px] py-1 px-2 rounded shadow-md opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-20">
                      <div>Total: {formatCurrency(dayTotal)}</div>
                      <div className="text-amber-300">Cash: {formatCurrency(item.cash)}</div>
                      <div className="text-indigo-300">Online: {formatCurrency(item.online)}</div>
                    </div>

                    <div className="w-full max-w-[34px] flex flex-col justify-end h-full">
                      <div
                        style={{ height: `${onlinePortion}%` }}
                        className="bg-indigo-600 hover:bg-indigo-700 transition rounded-t-sm"
                      />
                      <div
                        style={{ height: `${cashPortion}%` }}
                        className="bg-amber-500 hover:bg-amber-600 transition"
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-500 mt-2 text-center whitespace-nowrap">
                      {item.date}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400 mt-2 px-1">
              <span>Showing peak collection days for October 2026</span>
              <span>All figures in INR (₹)</span>
            </div>
          </div>

          {/* Cash vs Online Donut / Ratio Card */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                <Wallet className="w-4 h-4 text-slate-600" />
                Payment Method Share
              </div>

              {/* Visual Split Bar */}
              <div className="h-5 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner mb-4">
                <div style={{ width: `${cashPct}%` }} className="bg-amber-500" title={`Cash: ${cashPct}%`} />
                <div style={{ width: `${onlinePct}%` }} className="bg-indigo-600" title={`Online: ${onlinePct}%`} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/70">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Cash Currency</div>
                      <div className="text-[10px] text-slate-500">Collected by field officers</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold text-slate-900">{formatCurrency(cashTotal)}</div>
                    <div className="text-[10px] font-bold text-amber-600">{cashPct}% share</div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/70">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Online & UPI</div>
                      <div className="text-[10px] text-slate-500">GPay, PhonePe, NEFT/IMPS</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold text-slate-900">{formatCurrency(onlineTotal)}</div>
                    <div className="text-[10px] font-bold text-indigo-600">{onlinePct}% share</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/70 text-[11px] text-slate-500 flex justify-between">
              <span>Total Collections Verified:</span>
              <span className="font-bold text-slate-900">{formatCurrency(totalCollected)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Section & Status Ratio */}
      {activeTab === 'distribution' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5">
          {/* Section Wise Breakdown */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />
              Section-Wise Collection Performance
            </h3>

            {sectionBreakdown.map((sec, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                  <span className="text-slate-800">{sec.name}</span>
                  <span className="text-slate-900">{formatCurrency(sec.total)} ({sec.pct}%)</span>
                </div>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${sec.pct}%` }}
                    className={`h-full ${
                      sec.code === 'electricity'
                        ? 'bg-amber-500'
                        : sec.code === 'water'
                        ? 'bg-blue-600'
                        : 'bg-emerald-600'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Paid vs Pending Ratio Card */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-blue-600" />
              October 2026 Billing Recovery Rate
            </h3>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between h-[170px]">
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">Total Billed Due: {formatCurrency(totalBilledDue)}</span>
                  <span className="text-emerald-700 font-extrabold">{paidRatio}% Recovered</span>
                </div>
                <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden flex shadow-inner">
                  <div style={{ width: `${paidRatio}%` }} className="bg-emerald-600" />
                  <div style={{ width: `${100 - paidRatio}%` }} className="bg-rose-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-200/60">
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-600">Total Paid (Month)</div>
                  <div className="text-sm font-bold text-slate-900">{formatCurrency(totalPaidInPeriod)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-rose-600">Remaining Pending</div>
                  <div className="text-sm font-bold text-slate-900">{formatCurrency(totalPendingInPeriod)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Employee Leaderboard */}
      {activeTab === 'employees' && (
        <div className="pt-5 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Field Employee</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Collections Made</th>
                <th className="py-2.5 px-3">Cash Handled</th>
                <th className="py-2.5 px-3">Online (UPI)</th>
                <th className="py-2.5 px-3 text-right">Total Recovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employeeBreakdown.map((emp, i) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-3 font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-[10px]">
                      {i + 1}
                    </span>
                    <span>{emp.name}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      emp.role === 'owner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {emp.role === 'owner' ? 'Owner' : 'Field Admin'}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-semibold text-slate-700">{emp.count} Entries</td>
                  <td className="py-3 px-3 text-amber-700 font-semibold">{formatCurrency(emp.cash)}</td>
                  <td className="py-3 px-3 text-indigo-700 font-semibold">{formatCurrency(emp.online)}</td>
                  <td className="py-3 px-3 text-right font-extrabold text-emerald-700">{formatCurrency(emp.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
