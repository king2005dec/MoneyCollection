import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/Dashboard/DashboardView';
import { SectionDetailView } from './components/Sections/SectionDetailView';
import { CustomerListView } from './components/Customers/CustomerListView';
import { CustomerDetailView } from './components/Customers/CustomerDetailView';
import { AllTransactionsView } from './components/Payments/AllTransactionsView';
import { PendingPaymentsView } from './components/Pending/PendingPaymentsView';
import { MonthlyBillingView } from './components/Billing/MonthlyBillingView';
import { EmployeeManagementView } from './components/Employees/EmployeeManagementView';
import { ReportsView } from './components/Reports/ReportsView';
import { ActivityLogsView } from './components/ActivityLogs/ActivityLogsView';
import { CashReconciliationView } from './components/Reconciliation/CashReconciliationView';
import { SettingsView } from './components/Settings/SettingsView';
import { LoginScreen } from './components/Auth/LoginScreen';

// Global Modals
import { AddPaymentModal } from './components/Payments/AddPaymentModal';
import { EditPaymentModal } from './components/Payments/EditPaymentModal';
import { ReversePaymentModal } from './components/Payments/ReversePaymentModal';
import { ReceiptModal } from './components/Payments/ReceiptModal';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, isLoading } = useAuth();
  const { activePage, toasts, dismissToast } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold text-slate-300">Loading Apex Collection Pro...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  const renderActiveView = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardView />;
      case 'section-electricity':
        return <SectionDetailView sectionCode="electricity" />;
      case 'section-water':
        return <SectionDetailView sectionCode="water" />;
      case 'section-other':
        return <SectionDetailView sectionCode="other" />;
      case 'customers':
        return <CustomerListView />;
      case 'customer-detail':
        return <CustomerDetailView />;
      case 'transactions':
        return <AllTransactionsView />;
      case 'pending':
        return <PendingPaymentsView />;
      case 'billing':
        return <MonthlyBillingView />;
      case 'employees':
        return <EmployeeManagementView />;
      case 'reports':
        return <ReportsView />;
      case 'activity-logs':
        return <ActivityLogsView />;
      case 'cash-reconciliation':
        return <CashReconciliationView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Fixed Navbar */}
      <Navbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />

      {/* Main Body Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Responsive Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-7xl mx-auto w-full">
          {renderActiveView()}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Modals */}
      <AddPaymentModal />
      <EditPaymentModal />
      <ReversePaymentModal />
      <ReceiptModal />
      <SupabaseSetupModal />

      {/* Global Toast Notifications */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(toast => {
          const isError = toast.type === 'error';
          const isInfo = toast.type === 'info';

          return (
            <div
              key={toast.id}
              className={`p-3.5 rounded-xl shadow-xl border flex items-center justify-between gap-3 text-xs pointer-events-auto transition-all transform translate-y-0 duration-200 animate-in fade-in slide-in-from-bottom-2 ${
                isError
                  ? 'bg-rose-900 text-white border-rose-800'
                  : isInfo
                  ? 'bg-blue-900 text-white border-blue-800'
                  : 'bg-slate-900 text-white border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {isError ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : isInfo ? (
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className="font-medium leading-relaxed">{toast.message}</span>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}
