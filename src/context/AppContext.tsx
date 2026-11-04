import React, { createContext, useContext, useState, useEffect } from 'react';
import { CollectionSection, Customer, Collection } from '../types';
import { getSections, initLocalDatabase, setBroadcastSender, scheduleBalanceMonitor, importOctober26Data } from '../services/databaseService';
import { initSync } from '../services/syncService';

export type NavPage =
  | 'dashboard'
  | 'section-electricity'
  | 'section-water'
  | 'section-other'
  | 'customers'
  | 'customer-detail'
  | 'add-payment'
  | 'transactions'
  | 'pending'
  | 'employees'
  | 'reports'
  | 'activity-logs'
  | 'cash-reconciliation'
  | 'billing'
  | 'settings';

interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  customerId?: string;
  sectionId?: string;
  billingPeriodId?: string;
}

interface EditPaymentModalProps {
  isOpen: boolean;
  collection?: Collection;
}

interface ReversePaymentModalProps {
  isOpen: boolean;
  collection?: Collection;
}

interface ReceiptModalProps {
  isOpen: boolean;
  collection?: Collection;
}

interface AppContextType {
  activePage: NavPage;
  setActivePage: (page: NavPage) => void;
  selectedCustomerId: string | null;
  openCustomerProfile: (customerId: string, fromSection?: string) => void;
  returnSectionPage: string | null;
  sections: CollectionSection[];
  refreshSections: () => Promise<void>;
  dbVersion: number;
  triggerDbRefresh: () => void;
  currentBillingMonth: number;
  setCurrentBillingMonth: (m: number) => void;
  currentBillingYear: number;
  setCurrentBillingYear: (y: number) => void;
  
  // Modals
  paymentModal: PaymentModalProps;
  openPaymentModal: (customerId?: string, sectionId?: string, billingPeriodId?: string) => void;
  closePaymentModal: () => void;

  editPaymentModal: EditPaymentModalProps;
  openEditPaymentModal: (collection: Collection) => void;
  closeEditPaymentModal: () => void;

  reversePaymentModal: ReversePaymentModalProps;
  openReversePaymentModal: (collection: Collection) => void;
  closeReversePaymentModal: () => void;

  receiptModal: ReceiptModalProps;
  openReceiptModal: (collection: Collection) => void;
  closeReceiptModal: () => void;

  supabaseModalOpen: boolean;
  setSupabaseModalOpen: (open: boolean) => void;

  // Toasts
  toasts: ToastNotification[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [returnSectionPage, setReturnSectionPage] = useState<string | null>(null);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [dbVersion, setDbVersion] = useState<number>(0);
  const [currentBillingMonth, setCurrentBillingMonth] = useState<number>(10);
  const [currentBillingYear, setCurrentBillingYear] = useState<number>(2026);

  // Modals state
  const [paymentModal, setPaymentModal] = useState<PaymentModalProps>({ isOpen: false });
  const [editPaymentModal, setEditPaymentModal] = useState<EditPaymentModalProps>({ isOpen: false });
  const [reversePaymentModal, setReversePaymentModal] = useState<ReversePaymentModalProps>({ isOpen: false });
  const [receiptModal, setReceiptModal] = useState<ReceiptModalProps>({ isOpen: false });
  const [supabaseModalOpen, setSupabaseModalOpen] = useState<boolean>(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const refreshSections = async () => {
    try {
      const data = await getSections();
      setSections(data);
    } catch (err) {
      console.error('Failed to load sections:', err);
    }
  };

  useEffect(() => {
    initLocalDatabase();
    refreshSections();

    // One-time October-26 data reset & import from D1.pdf / D2.pdf
    importOctober26Data({ id: 'usr-owner-001', name: 'Raj' }).then(res => {
      if (res.s1 > 0 || res.s2 > 0) console.log('[Oct26 Import] Section 1:', res.s1, '| Section 2:', res.s2);
    });

    // Start the background balance monitor (auto-close expired periods)
    const stopMonitor = scheduleBalanceMonitor(60000);
    return () => {
      stopMonitor();
    };
  }, []);

  const triggerDbRefresh = () => {
    setDbVersion(v => v + 1);
  };

  // ─── REAL-TIME CROSS-DEVICE SYNC (Raj + 3 Staff) ───────────────────────────
  // Uses syncService backed by Supabase system_settings + Realtime Broadcast:
  //   • Supabase Cloud state: 100% persistent for all 4 devices
  //   • Realtime Broadcast: instant sub-second sync across devices
  //   • 4-second heartbeat polling: guaranteed fallback even with flaky connection
  //   • Shows live notification banner when another staff/owner makes updates
  useEffect(() => {
    const cleanup = initSync(
      () => triggerDbRefresh(),
      (msg: string) => showToast(msg, 'info')
    );
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCustomerProfile = (customerId: string, fromSection?: string) => {
    setSelectedCustomerId(customerId);
    if (fromSection) setReturnSectionPage(fromSection);
    setActivePage('customer-detail');
  };

  const openPaymentModal = (customerId?: string, sectionId?: string, billingPeriodId?: string) => {
    setPaymentModal({ isOpen: true, customerId, sectionId, billingPeriodId });
  };

  const closePaymentModal = () => {
    setPaymentModal({ isOpen: false });
  };

  const openEditPaymentModal = (collection: Collection) => {
    setEditPaymentModal({ isOpen: true, collection });
  };

  const closeEditPaymentModal = () => {
    setEditPaymentModal({ isOpen: false });
  };

  const openReversePaymentModal = (collection: Collection) => {
    setReversePaymentModal({ isOpen: true, collection });
  };

  const closeReversePaymentModal = () => {
    setReversePaymentModal({ isOpen: false });
  };

  const openReceiptModal = (collection: Collection) => {
    setReceiptModal({ isOpen: true, collection });
  };

  const closeReceiptModal = () => {
    setReceiptModal({ isOpen: false });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        activePage,
        setActivePage,
        selectedCustomerId,
        openCustomerProfile,
        returnSectionPage,
        sections,
        refreshSections,
        dbVersion,
        triggerDbRefresh,
        currentBillingMonth,
        setCurrentBillingMonth,
        currentBillingYear,
        setCurrentBillingYear,
        paymentModal,
        openPaymentModal,
        closePaymentModal,
        editPaymentModal,
        openEditPaymentModal,
        closeEditPaymentModal,
        reversePaymentModal,
        openReversePaymentModal,
        closeReversePaymentModal,
        receiptModal,
        openReceiptModal,
        closeReceiptModal,
        supabaseModalOpen,
        setSupabaseModalOpen,
        toasts,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
