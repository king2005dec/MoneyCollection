import React from 'react';
import { CollectionSection, Customer, BillingPeriod } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useApp, NavPage } from '../../context/AppContext';
import { Layers, ArrowRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface SectionOverviewCardsProps {
  sections: CollectionSection[];
  customers: Customer[];
  billingPeriods: BillingPeriod[];
}

export const SectionOverviewCards: React.FC<SectionOverviewCardsProps> = ({
  sections,
  customers,
  billingPeriods,
}) => {
  const { setActivePage } = useApp();

  // Current month: October 2026
  const currentMonthPeriods = billingPeriods.filter(p => p.billing_month === 10 && p.billing_year === 2026);

  const getSectionStats = (sectionId: string) => {
    const assignedCustomers = customers.filter(c => c.assigned_section_ids.includes(sectionId) && c.is_active);
    const sectionPeriods = currentMonthPeriods.filter(p => p.section_id === sectionId);

    const totalDue = sectionPeriods.reduce((sum, p) => sum + p.total_amount_due, 0);
    const totalCollected = sectionPeriods.reduce((sum, p) => sum + p.paid_amount, 0);
    const totalPending = sectionPeriods.reduce((sum, p) => sum + Math.max(0, p.closing_balance), 0);

    const paidCount = sectionPeriods.filter(p => p.payment_status === 'Paid').length;
    const partialCount = sectionPeriods.filter(p => p.payment_status === 'Partially Paid').length;
    const pendingOverdueCount = sectionPeriods.filter(p => p.payment_status === 'Pending' || p.payment_status === 'Overdue').length;

    return {
      assignedCount: assignedCustomers.length,
      totalDue,
      totalCollected,
      totalPending,
      paidCount,
      partialCount,
      pendingOverdueCount,
    };
  };

  const getSectionDisplayName = (code: string, index: number) => {
    if (code === 'electricity') return 'Section 1';
    if (code === 'water') return 'Section 2';
    if (code === 'other') return 'Section 3';
    return `Section ${index + 1}`;
  };

  const getSectionPage = (code: string): NavPage => {
    switch (code) {
      case 'electricity':
        return 'section-electricity';
      case 'water':
        return 'section-water';
      default:
        return 'section-other';
    }
  };

  const getSectionAccent = (index: number) => {
    if (index === 0) return { bg: 'bg-blue-50 text-blue-700 border-blue-200', tag: 'Section 1' };
    if (index === 1) return { bg: 'bg-indigo-50 text-indigo-700 border-indigo-200', tag: 'Section 2' };
    return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', tag: 'Section 3' };
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
      {sections.map((section, idx) => {
        const stats = getSectionStats(section.id);
        const targetPage = getSectionPage(section.code);
        const displayName = getSectionDisplayName(section.code, idx);
        const accent = getSectionAccent(idx);

        return (
          <div
            key={section.id}
            onClick={() => setActivePage(targetPage)}
            className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-blue-400 transition cursor-pointer group active:scale-[0.99]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg border font-bold text-xs ${accent.bg}`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 group-hover:text-blue-600 transition text-sm sm:text-base">
                    {displayName}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {stats.assignedCount} Residents
                  </span>
                </div>
              </div>

              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition">
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-1.5 py-2.5 border-y border-slate-100 my-1 text-center bg-slate-50/50 rounded-lg">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 block">Due</span>
                <span className="text-xs font-bold text-slate-800">{formatCurrency(stats.totalDue)}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-emerald-600 block">Collected</span>
                <span className="text-xs font-bold text-emerald-700">{formatCurrency(stats.totalCollected)}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-rose-600 block">Pending</span>
                <span className="text-xs font-bold text-rose-700">{formatCurrency(stats.totalPending)}</span>
              </div>
            </div>

            {/* Status breakdown pills */}
            <div className="flex items-center justify-between text-[11px] pt-2 font-medium">
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>{stats.paidCount} Paid</span>
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <Clock className="w-3 h-3 text-amber-500" />
                <span>{stats.partialCount} Partial</span>
              </span>
              <span className="flex items-center gap-1 text-rose-700">
                <AlertCircle className="w-3 h-3 text-rose-500" />
                <span>{stats.pendingOverdueCount} Overdue</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
