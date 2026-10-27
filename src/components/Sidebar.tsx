import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp, NavPage } from '../context/AppContext';
import {
  LayoutDashboard,
  Zap,
  Droplets,
  Layers,
  Users,
  PlusCircle,
  Receipt,
  AlertCircle,
  UserCheck,
  BarChart3,
  History,
  Coins,
  Settings,
  X,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { isOwner, currentUser } = useAuth();
  const { activePage, setActivePage, openPaymentModal } = useApp();

  interface NavItem {
    id: NavPage | 'open-add-payment';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    ownerOnly?: boolean;
    badge?: string;
    badgeColor?: string;
    isAction?: boolean;
  }

  const primaryItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
  ];

  const sectionItems: NavItem[] = [
    {
      id: 'section-electricity',
      label: 'Section 1',
      icon: Layers,
      badgeColor: 'blue',
    },
    {
      id: 'section-water',
      label: 'Section 2',
      icon: Layers,
      badgeColor: 'indigo',
    },
    {
      id: 'section-other',
      label: 'Section 3',
      icon: Layers,
      badgeColor: 'emerald',
    },
  ];

  const operationsItems: NavItem[] = [
    {
      id: 'customers',
      label: 'All Customers',
      icon: Users,
    },
    {
      id: 'open-add-payment',
      label: 'Record Payment',
      icon: PlusCircle,
      isAction: true,
    },
    {
      id: 'transactions',
      label: 'All Transactions',
      icon: Receipt,
    },
    {
      id: 'pending',
      label: 'Pending Payments',
      icon: AlertCircle,
    },
    {
      id: 'billing',
      label: 'Monthly Billing Periods',
      icon: CalendarDays,
    },
    {
      id: 'cash-reconciliation',
      label: 'Cash Reconciliation',
      icon: Coins,
    },
  ];

  const managementItems: NavItem[] = [
    {
      id: 'employees',
      label: 'User Management',
      icon: UserCheck,
      ownerOnly: true,
      badge: 'Owner',
    },
    {
      id: 'reports',
      label: 'Reports & Exports',
      icon: BarChart3,
    },
    {
      id: 'activity-logs',
      label: 'Audit & Activity Logs',
      icon: History,
    },
    {
      id: 'settings',
      label: 'System Settings',
      icon: Settings,
      ownerOnly: true,
      badge: 'Owner',
    },
  ];

  const handleNavClick = (item: NavItem) => {
    if (item.isAction && item.id === 'open-add-payment') {
      openPaymentModal();
    } else {
      setActivePage(item.id as NavPage);
    }
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const renderNavGroup = (title: string, items: NavItem[]) => {
    return (
      <div className="mb-4">
        <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </div>
        <div className="space-y-0.5">
          {items.map(item => {
            if (item.ownerOnly && !isOwner) {
              return null; // Don't show owner-only to regular collection admins
            }

            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-blue-700 text-white' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-slate-200/90 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile close button header */}
        <div className="p-4 flex items-center justify-between border-b border-slate-100 lg:hidden">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Zap className="w-5 h-5 text-blue-600" />
            <span>Apex Billing Pro</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          {renderNavGroup('Overview', primaryItems)}
          {renderNavGroup('Sections', sectionItems)}
          {renderNavGroup('Billing & Collections', operationsItems)}
          {renderNavGroup('Reports & Audit', managementItems)}
        </div>

        {/* Footer info: User Role & Business tag */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/70 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-[11px] ${
              isOwner ? 'bg-purple-600' : 'bg-blue-600'
            }`}>
              {isOwner ? <ShieldCheck className="w-3.5 h-3.5" /> : currentUser?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="truncate">
              <div className="font-bold text-slate-900 truncate text-[11px]">
                {currentUser?.full_name || 'Active Operator'}
              </div>
              <div className="text-[10px] text-slate-500 capitalize">
                {currentUser?.role === 'owner' ? 'Owner / Super Admin' : 'Collection Admin'}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
