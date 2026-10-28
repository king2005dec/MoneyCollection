import React, { createContext, useContext, useState, useEffect } from 'react';
import { CollectionSection, Customer, Collection } from '../types';
import { getSections, initLocalDatabase } from '../services/databaseService';
import { getSupabaseClient } from '../services/supabaseClient';

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
  }, []);

  const triggerDbRefresh = () => {
    setDbVersion(v => v + 1);
  };

  // Supabase Realtime live sync across devices / users
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const channel = supabase
        .channel('app_live_sync_all')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_periods' }, () => {
          triggerDbRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'collections' }, () => {
          triggerDbRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
          triggerDbRefresh();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          triggerDbRefresh();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Realtime channel subscribe error:', err);
    }
  }, []);

  // Multi-tab sync across windows/tabs
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      bc = new BroadcastChannel('money_collection_live_sync');
      bc.onmessage = () => {
        triggerDbRefresh();
      };
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('col_db_')) {
        triggerDbRefresh();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorage);
    };
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
