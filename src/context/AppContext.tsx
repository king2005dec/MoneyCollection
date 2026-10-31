import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { CollectionSection, Customer, Collection, BillingPeriod, AuditLog } from '../types';
import { getSections, initLocalDatabase, setBroadcastSender, scheduleBalanceMonitor, importOctober26Data } from '../services/databaseService';
import { getSupabaseClient } from '../services/supabaseClient';

// Keys to sync over broadcast
const SYNC_STORAGE_KEYS = {
  BILLING_PERIODS: 'col_db_billing_periods_v6',
  COLLECTIONS: 'col_db_collections_v6',
  AUDIT_LOGS: 'col_db_audit_logs_v1',
  CUSTOMERS: 'col_db_customers_v6',
  REVERSALS: 'col_db_reversals_v1',
  PROFILES: 'col_db_profiles_v1',
  SECTIONS: 'col_db_sections_v2',
  SETTINGS: 'col_db_settings_v1',
  CASH_RECONCILIATION: 'col_db_cash_recon_v1',
};

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

  // ────────────────────────────────────────────────────────────────────────────
  // REAL-TIME SYNC via Supabase Broadcast Channel
  // Works even if Supabase DB schema has wrong column types.
  // When any user saves a payment/balance update:
  //   1. Their app saves to localStorage
  //   2. Broadcasts the updated data over Supabase Broadcast
  //   3. ALL other devices receive the payload and write it to their localStorage
  //   4. triggerDbRefresh() causes them to re-render with the new data
  // ────────────────────────────────────────────────────────────────────────────
  const supabaseBroadcastRef = useRef<any>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const channel = supabase
        .channel('money_collection_broadcast_v2', {
          config: { broadcast: { self: false } }, // don't echo to sender
        })
        .on(
          'broadcast',
          { event: 'data_sync' },
          (payload: { payload?: { key?: string; data?: unknown } }) => {
            // Receive data from another device and write to our localStorage
            const { key, data } = payload?.payload || {};
            if (key && data) {
              try {
                localStorage.setItem(key, JSON.stringify(data));
              } catch (e) {
                console.warn('Failed to apply synced data:', e);
              }
            }
            triggerDbRefresh();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            supabaseBroadcastRef.current = channel;
            console.log('[Sync] Connected to Supabase broadcast channel');

            // Wire up the sender in databaseService so it can push data here
            setBroadcastSender(async (key: string, data: unknown) => {
              await (channel as any).send({
                type: 'broadcast',
                event: 'data_sync',
                payload: { key, data },
              });
            });
          }
        });

      return () => {
        setBroadcastSender(null); // detach sender
        supabase.removeChannel(channel);
        supabaseBroadcastRef.current = null;
      };
    } catch (err) {
      console.warn('Realtime broadcast subscribe error:', err);
    }
  }, []);

  // Multi-tab sync within same browser (localStorage storage event)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('col_db_')) {
        triggerDbRefresh();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // BroadcastChannel listener for same-tab sync from notifySync()
  useEffect(() => {
    const bc = typeof window !== 'undefined' && 'BroadcastChannel' in window
      ? new BroadcastChannel('money_collection_live_sync')
      : null;
    if (bc) {
      const handleMessage = (e: MessageEvent) => {
        if (e.data?.key && String(e.data.key).startsWith('col_db_')) {
          // Write received data to our localStorage (cross-tab / same-browser sync)
          if (e.data.data !== undefined) {
            try {
              localStorage.setItem(e.data.key, JSON.stringify(e.data.data));
            } catch (err) {
              console.warn('Failed to write synced data to localStorage:', err);
            }
          }
          triggerDbRefresh();
        }
      };
      bc.addEventListener('message', handleMessage);
      return () => {
        bc.removeEventListener('message', handleMessage);
        bc.close();
      };
    }
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
