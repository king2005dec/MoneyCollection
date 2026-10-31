import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Customer,
  BillingPeriod,
  CollectionSection,
  PaymentStatus,
  Collection,
} from '../../types';
import {
  getCustomers,
  getBillingPeriods,
  getCollections,
  getSections,
  updateBillingPeriodCharges,
  updateRemainingDueDirectly,
  addCollection,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  carryForwardMonth,
} from '../../services/databaseService';
import { formatCurrency } from '../../utils/formatters';
import { UpiQrViewModal } from '../Payments/UpiQrViewModal';
import { InvoiceModal } from '../Billing/InvoiceModal';
import {
  Search,
  Filter,
  Pencil,
  X,
  FileSpreadsheet,
  QrCode,
  PlusCircle,
  Trash2,
  Lock,
  ShieldCheck,
  UserCheck,
  Check,
  AlertCircle,
  Download,
  Clock,
} from 'lucide-react';

interface ExcelSpreadsheetViewProps {
  initialSectionCode?: 'electricity' | 'water' | 'other' | 'all';
  initialPendingOnly?: boolean;
  onClose?: () => void;
}

export const ExcelSpreadsheetView: React.FC<ExcelSpreadsheetViewProps> = ({
  initialSectionCode = 'electricity',
  initialPendingOnly = false,
  onClose,
}) => {
  const { isOwner, currentUser } = useAuth();
  const { dbVersion, triggerDbRefresh, showToast } = useApp();

  // Device timestamp helper for update confirmations
  const deviceTimeStr = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Track last update time for display
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
  const markUpdated = () => setLastUpdatedAt(deviceTimeStr());

  // Live device clock (updates every second)
  const [deviceTime, setDeviceTime] = useState<string>(deviceTimeStr());
  useEffect(() => {
    const timer = setInterval(() => setDeviceTime(deviceTimeStr()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showUpdateToast = (message: string) => {
    markUpdated();
    showToast(`${message} • ${deviceTimeStr()}`);
  };

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<BillingPeriod[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sections, setSections] = useState<CollectionSection[]>([]);
  const [loading, setLoading] = useState(true);

  // View state: Section tabs
  const [activeTab, setActiveTab] = useState<'sec-elec-001' | 'sec-water-002' | 'sec-other-003' | 'all'>(
    initialSectionCode === 'water'
      ? 'sec-water-002'
      : initialSectionCode === 'other'
      ? 'sec-other-003'
      : initialSectionCode === 'all'
      ? 'all'
      : 'sec-elec-001'
  );

  const [pendingAbove499, setPendingAbove499] = useState<boolean>(initialPendingOnly);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Delete Resident Modal state (replaces native window.confirm)
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<any | null>(null);
  const [deletingRow, setDeletingRow] = useState<boolean>(false);

  // Next Month Bill Modal State
  const [isNextMonthModalOpen, setIsNextMonthModalOpen] = useState<boolean>(false);
  const [generatingNextMonth, setGeneratingNextMonth] = useState<boolean>(false);

  // Invoice Download & Print Modal State
  const [invoiceModalData, setInvoiceModalData] = useState<{
    customer: Customer;
    period: BillingPeriod;
  } | null>(null);

  const openInvoiceModal = (customer: Customer, period: BillingPeriod) => {
    setInvoiceModalData({ customer, period });
  };

  useEffect(() => {
    if (initialPendingOnly !== undefined) {
      setPendingAbove499(initialPendingOnly);
    }
  }, [initialPendingOnly]);

  useEffect(() => {
    if (initialSectionCode) {
      setActiveTab(
        initialSectionCode === 'water'
          ? 'sec-water-002'
          : initialSectionCode === 'other'
          ? 'sec-other-003'
          : initialSectionCode === 'all'
          ? 'all'
          : 'sec-elec-001'
      );
    }
  }, [initialSectionCode]);

  // Fast cell editing state
  const [editingCell, setEditingCell] = useState<{
    customerId: string;
    sectionId: string;
    field: 'closing_balance' | 'name' | 'this_month' | 'prev_balance' | 'current_unit' | 'prev_unit';
    periodId?: string;
  } | null>(null);

  const [editValue, setEditValue] = useState<string>('');
  const [savingCell, setSavingCell] = useState<boolean>(false);

  // Date Range and Expansion States
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Record<string, boolean>>({});

  const toggleExpandCustomer = (id: string) => {
    setExpandedCustomerIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Quick Balance Update Modal
  const [balanceModalCustomer, setBalanceModalCustomer] = useState<{
    customer: Customer;
    period?: BillingPeriod;
    sectionId: string;
    thisMonth: number;
    prevBalance: number;
    totalBalance: number;
    pay: number;
    currentBalance: number;
    currentUnit: number;
    prevUnit: number;
  } | null>(null);

  const [modalPayAmount, setModalPayAmount] = useState<string>('');
  const [modalBalanceAmount, setModalBalanceAmount] = useState<string>('');
  const [modalReason, setModalReason] = useState<string>('');
  const [savingModal, setSavingModal] = useState<boolean>(false);

  // UPI Google Pay QR Modal State
  const [upiModalData, setUpiModalData] = useState<{
    customerName: string;
    customerCode: string;
    customerId: string;
    sectionId: string;
    periodId?: string;
    currentBalance: number;
    initialAmount?: number;
  } | null>(null);

  // Owner Add Resident Modal State
  const [isAddResidentOpen, setIsAddResidentOpen] = useState<boolean>(false);
  const [newResidentName, setNewResidentName] = useState<string>('');
  const [newResidentPhone, setNewResidentPhone] = useState<string>('');
  const [newResidentInitialBalance, setNewResidentInitialBalance] = useState<string>('');
  const [newResidentInitialUnit, setNewResidentInitialUnit] = useState<string>('');
  const [savingNewResident, setSavingNewResident] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [c, b, col, s] = await Promise.all([
          getCustomers(),
          getBillingPeriods(),
          getCollections(),
          getSections(),
        ]);
        setCustomers(c);
        setBillingPeriods(b);
        setCollections(col);
        setSections(s);
      } catch (err) {
        console.error('Failed to load data for Ledger view:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  // Section mapping
  const section1 = sections.find(s => s.code === 'electricity') || { id: 'sec-elec-001', name: 'Section 1' };

  // Current active section title
  const activeSectionName =
    activeTab === 'sec-elec-001'
      ? 'Section 1 (A)'
      : activeTab === 'sec-water-002'
      ? 'Section 2 (B)'
      : activeTab === 'sec-other-003'
      ? 'Section 3 (C)'
      : 'All Customers';

  // Memoized collection lookup: customer_id + month-key -> payment_method
  const collectionLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of collections) {
      if (!c.customer_id || !c.collection_date) continue;
      const key = `${c.customer_id}|${c.collection_date.slice(0, 7)}`; // YYYY-MM
      // Keep the latest confirmed collection per customer-month
      if (!map.has(key) || c.status === 'Confirmed') {
        map.set(key, String(c.payment_method || '-'));
      }
    }
    return map;
  }, [collections]);

  const getPaymentType = useCallback((customerId: string, month: number, year: number): string => {
    const key = `${customerId}|${year}-${String(month).padStart(2, '0')}`;
    return collectionLookup.get(key) || '-';
  }, [collectionLookup]);

  // Filter customers by active tab
  const relevantCustomers = customers.filter(c => {
    if (activeTab === 'all') return true;
    return c.assigned_section_ids.includes(activeTab);
  });

  // Build spreadsheet rows matching Google Sheets structure (memoized)
  const spreadsheetRows = useMemo(() => relevantCustomers.map(cust => {
    const targetSectionId = activeTab === 'all'
      ? (cust.assigned_section_ids[0] || section1.id)
      : activeTab;

    const period = billingPeriods.find(
      p => p.customer_id === cust.id &&
           p.section_id === targetSectionId &&
           p.billing_month === selectedMonth &&
           p.billing_year === selectedYear
    );

    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const prevPeriod = billingPeriods.find(
      p => p.customer_id === cust.id &&
           p.section_id === targetSectionId &&
           p.billing_month === prevMonth &&
           p.billing_year === prevYear
    );

    const prevBalance = period
      ? period.opening_balance
      : (prevPeriod ? Math.max(0, prevPeriod.closing_balance) : 0);

    const thisMonth = period
      ? (period.bill_amount + period.additional_charges - period.credits_or_adjustments)
      : 0;

    // Always recalculate totals from components to avoid stale/corrupted stored values
    const totalBalance = prevBalance + thisMonth;
    const pay = period ? period.paid_amount : 0;
    const currentBalance = Math.max(0, totalBalance - pay);

    // Meter readings
    const currentUnit = period?.current_unit ?? 0;
    const prevUnit = period?.previous_unit ?? 0;
    const unitsConsumed = period?.units_consumed ?? Math.max(0, currentUnit - prevUnit);

    return {
      customer: cust,
      period,
      targetSectionId,
      customerCode: cust.customer_code,
      name: cust.full_name,
      pay,
      thisMonth,
      prevBalance,
      totalBalance,
      currentBalance,
      currentUnit,
      prevUnit,
      unitsConsumed,
      isPaid: currentBalance <= 0,
      paymentStatus: period?.payment_status || (currentBalance <= 0 ? 'Paid' : 'Pending'),
    };
  }), [customers, billingPeriods, selectedMonth, selectedYear, activeTab, section1]);

  // Calculate totals (memoized)
  const totals = useMemo(() => {
    const totalPay = spreadsheetRows.reduce((sum, r) => sum + r.pay, 0);
    const totalThisMonth = spreadsheetRows.reduce((sum, r) => sum + r.thisMonth, 0);
    const totalPrevBalance = spreadsheetRows.reduce((sum, r) => sum + r.prevBalance, 0);
    const totalGrandBalance = spreadsheetRows.reduce((sum, r) => sum + r.totalBalance, 0);
    const totalCurrentBalance = spreadsheetRows.reduce((sum, r) => sum + r.currentBalance, 0);
    const totalPendingCustomersCount = spreadsheetRows.filter(r => r.currentBalance > 0).length;
    return {
      totalPay,
      totalThisMonth,
      totalPrevBalance,
      totalGrandBalance,
      totalCurrentBalance,
      totalPendingCustomersCount,
    };
  }, [spreadsheetRows]);

  // Apply filters: Search, Pending Only, & Date Range (memoized)
  const filteredRows = useMemo(() => {
    const filtered = spreadsheetRows.filter(row => {
      if (pendingAbove499 && row.currentBalance <= 499) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = row.name.toLowerCase().includes(q);
        const matchCode = row.customerCode.toLowerCase().includes(q);
        const matchHouse = row.customer.house_number?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchHouse) return false;
      }

      if (startDate || endDate) {
        const periodDate = row.period?.created_at ? row.period.created_at.slice(0, 10) : '2026-10-22';
        if (startDate && periodDate < startDate) return false;
        if (endDate && periodDate > endDate) return false;
      }

      return true;
    });

    // Natural sorting by ID (A1, A2... A30, B1, B2... C1...)
    return filtered.sort((a, b) => {
      const numA = parseInt(a.customerCode.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.customerCode.replace(/\D/g, ''), 10) || 0;
      if (a.customerCode.charAt(0) !== b.customerCode.charAt(0)) {
        return a.customerCode.localeCompare(b.customerCode);
      }
      return numA - numB;
    });
  }, [spreadsheetRows, pendingAbove499, searchQuery, startDate, endDate]);

  // Permission-aware cell click trigger
  const handleCellClick = (
    customerId: string,
    sectionId: string,
    field: 'closing_balance' | 'name' | 'this_month' | 'prev_balance' | 'current_unit' | 'prev_unit',
    currentVal: string | number,
    periodId?: string
  ) => {
    if (!isOwner && field === 'closing_balance') {
      showToast('Owner only: Direct balance edit is disabled. Staff use Action > Update.', 'info');
      return;
    }
    if (!isOwner && (field === 'name' || field === 'this_month' || field === 'prev_balance' || field === 'prev_unit')) {
      showToast('Only Owner can edit this field. Staff can edit Current Unit and record payments via Action > Update.', 'info');
      return;
    }

    setEditingCell({
      customerId,
      sectionId,
      field,
      periodId,
    });
    setEditValue(currentVal !== undefined && currentVal !== 0 ? currentVal.toString() : '');
  };

  // Quick Cell Save Handler
  const handleCellSave = async (
    customerId: string,
    sectionId: string,
    field: 'closing_balance' | 'name' | 'this_month' | 'prev_balance' | 'current_unit' | 'prev_unit'
  ) => {
    const actor = {
      id: currentUser?.id || 'usr-staff-001',
      name: currentUser?.full_name || (isOwner ? 'Owner' : 'Staff Collector'),
    };

    setSavingCell(true);
    try {
      if (field === 'name') {
        if (!isOwner) {
          showToast('Only Owner can edit resident name.', 'error');
          setEditingCell(null);
          return;
        }
        if (!editValue.trim()) {
          showToast('Name cannot be empty.', 'error');
          setEditingCell(null);
          return;
        }
        await updateCustomer(customerId, { full_name: editValue.trim() }, actor);
        showUpdateToast(`Updated resident name to "${editValue.trim()}"`);
        } else if (field === 'closing_balance') {
        // Staff or Owner updating remaining balance directly
        {
          const numVal = parseFloat(editValue);
          if (isNaN(numVal) || numVal < 0) {
            showToast('Please enter a valid positive balance.', 'error');
            setEditingCell(null);
            return;
          }
          await updateRemainingDueDirectly(
            customerId,
            sectionId,
            selectedMonth,
            selectedYear,
            numVal,
            'Balance updated directly from Ledger view',
            actor
          );
          showUpdateToast(`Balance synchronized to ${formatCurrency(numVal)}!`);
        }
        } else if (field === 'this_month') {
        if (!isOwner) {
          showToast('Only Owner can edit this month bill amount.', 'error');
          setEditingCell(null);
          return;
        }
        {
          const numVal = parseFloat(editValue);
          if (isNaN(numVal) || numVal < 0) {
            showToast('Please enter a valid amount.', 'error');
            setEditingCell(null);
            return;
          }
          const targetPeriod = billingPeriods.find(
            p => p.customer_id === customerId &&
                 p.section_id === sectionId &&
                 p.billing_month === selectedMonth &&
                 p.billing_year === selectedYear
          );
          if (targetPeriod) {
            await updateBillingPeriodCharges(
              targetPeriod.id,
              { bill_amount: numVal },
              `Owner updated monthly bill to ${numVal}`,
              actor
            );
            showUpdateToast(`Updated monthly bill to ${formatCurrency(numVal)}`);
          }
        }
        } else if (field === 'prev_balance') {
        if (!isOwner) {
          showToast('Only Owner can edit previous balance.', 'error');
          setEditingCell(null);
          return;
        }
        {
          const numVal = parseFloat(editValue);
          if (isNaN(numVal) || numVal < 0) {
            showToast('Please enter a valid amount.', 'error');
            setEditingCell(null);
            return;
          }
          const targetPeriod = billingPeriods.find(
            p => p.customer_id === customerId &&
                 p.section_id === sectionId &&
                 p.billing_month === selectedMonth &&
                 p.billing_year === selectedYear
          );
          if (targetPeriod) {
            await updateBillingPeriodCharges(
              targetPeriod.id,
              { opening_balance: numVal } as any,
              `Owner updated previous balance to ${numVal}`,
              actor
            );
            showUpdateToast(`Updated previous balance to ${formatCurrency(numVal)}`);
          }
        }
      } else if (field === 'current_unit') {
        if (!isOwner && !currentUser) {
          showToast('Permission required to edit meter reading.', 'error');
          setEditingCell(null);
          return;
        }
        {
          const numVal = parseFloat(editValue);
          if (isNaN(numVal) || numVal < 0) {
            showToast('Please enter a valid meter reading.', 'error');
            setEditingCell(null);
            return;
          }
          const targetPeriod = billingPeriods.find(
            p => p.customer_id === customerId &&
                 p.section_id === sectionId &&
                 p.billing_month === selectedMonth &&
                 p.billing_year === selectedYear
          );
          if (targetPeriod) {
            const prevU = targetPeriod.previous_unit || 0;
            const consumed = Math.max(0, numVal - prevU);
            
            let newBill = 0;
            if (consumed <= 79) {
              newBill = (consumed * 15) + 400;
            } else {
              newBill = consumed * 20;
            }

            await updateBillingPeriodCharges(
              targetPeriod.id,
              {
                current_unit: numVal,
                bill_amount: newBill,
              },
              `Updated meter reading to ${numVal} (Consumed: ${consumed} units)`,
              actor
            );
            showUpdateToast(`Updated meter to ${numVal} units (${consumed} units consumed → Bill: ${formatCurrency(newBill)})!`);
          } else {
            // Create/update period if missing
            await updateBillingPeriodCharges(
              `bp-${customerId}-${sectionId}-${selectedMonth}-${selectedYear}` as any,
              {
                current_unit: numVal,
              } as any,
              `Updated meter reading to ${numVal}`,
              actor
            );
            showUpdateToast(`Updated meter reading to ${numVal}!`);
          }
        }
        if (!isOwner) {
          showToast('Only Owner can edit previous meter readings.', 'error');
          setEditingCell(null);
          return;
        }
        {
          const numVal = parseFloat(editValue);
          if (isNaN(numVal) || numVal < 0) {
            showToast('Please enter a valid meter reading.', 'error');
            setEditingCell(null);
            return;
          }
          const targetPeriod = billingPeriods.find(
            p => p.customer_id === customerId &&
                 p.section_id === sectionId &&
                 p.billing_month === selectedMonth &&
                 p.billing_year === selectedYear
          );
          if (targetPeriod) {
            await updateBillingPeriodCharges(
              targetPeriod.id,
              { previous_unit: numVal },
              `Owner updated previous meter unit to ${numVal}`,
              actor
            );
            showUpdateToast(`Updated previous unit to ${numVal}`);
          }
        }
      }

      setEditingCell(null);
      markUpdated();
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update cell', 'error');
    } finally {
      setSavingCell(false);
    }
  };

  // Open modal for fast row update
  const openBalanceModal = (row: typeof spreadsheetRows[0]) => {
    setBalanceModalCustomer({
      customer: row.customer,
      period: row.period,
      sectionId: row.targetSectionId,
      thisMonth: row.thisMonth,
      prevBalance: row.prevBalance,
      totalBalance: row.totalBalance,
      pay: row.pay,
      currentBalance: row.currentBalance,
      currentUnit: row.currentUnit,
      prevUnit: row.prevUnit,
    });
    setModalPayAmount(row.pay > 0 ? row.pay.toString() : '');
    setModalBalanceAmount(row.currentBalance.toString());
    setModalReason('');
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceModalCustomer) return;

    setSavingModal(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-staff-001',
        name: currentUser?.full_name || (isOwner ? 'Owner' : 'Staff Collector'),
      };

      const payNum = parseFloat(modalPayAmount);

      if (isNaN(payNum) || payNum <= 0) {
        showToast('Please enter a valid payment amount to collect.', 'error');
        setSavingModal(false);
        return;
      }

      const periodId = balanceModalCustomer.period?.id || `bp-${balanceModalCustomer.customer.id}-${balanceModalCustomer.sectionId}-${selectedMonth}-${selectedYear}`;
      await addCollection(
        {
          customer_id: balanceModalCustomer.customer.id,
          section_id: balanceModalCustomer.sectionId,
          billing_period_id: periodId,
          amount: payNum,
          payment_method: 'Cash',
          collection_date: new Date().toISOString().slice(0, 10),
          collection_time: new Date().toTimeString().slice(0, 8),
          notes: modalReason.trim() || 'Payment collected via Action > Update',
          created_by: actor.id,
          created_by_name: actor.name,
        },
        actor
      );

      showUpdateToast(`Payment of ${formatCurrency(payNum)} recorded successfully for ${balanceModalCustomer.customer.full_name}! Remaining balance updated.`);
      setBalanceModalCustomer(null);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to record payment', 'error');
    } finally {
      setSavingModal(false);
    }
  };

  // UPI payment confirmed via Google Pay QR Modal
  const handleUpiPaymentConfirmed = async (paidAmount: number, utr: string) => {
    if (!upiModalData) return;
    const actor = {
      id: currentUser?.id || 'usr-staff-001',
      name: currentUser?.full_name || (isOwner ? 'Owner' : 'Staff Collector'),
    };

    const periodId = upiModalData.periodId || `bp-${upiModalData.customerId}-${upiModalData.sectionId}-${selectedMonth}-${selectedYear}`;
    try {
      await addCollection(
        {
          customer_id: upiModalData.customerId,
          section_id: upiModalData.sectionId,
          billing_period_id: periodId,
          amount: paidAmount,
          payment_method: 'UPI',
          collection_date: new Date().toISOString().slice(0, 10),
          collection_time: new Date().toTimeString().slice(0, 8),
          notes: `UPI QR payment received (Raj)${utr ? ` • UTR: ${utr}` : ''}`,
          created_by: actor.id,
          created_by_name: actor.name,
        },
        actor
      );
      showUpdateToast(`Received UPI payment of ${formatCurrency(paidAmount)} for ${upiModalData.customerName}!`);
      setUpiModalData(null);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to record UPI payment', 'error');
    }
  };

  // Export CSV / Excel Compatible Handler
  const handleExportCSV = () => {
    try {
      const headers = ['ID', 'Resident Name', 'Pay (Paid)', 'This Month Bill', 'Prev Balance', 'Total Balance', 'Current Balance', 'Current Unit', 'Prev Unit', 'Units Consumed', 'Status'];
      const csvRows = [headers.join(',')];

      filteredRows.forEach(row => {
        const values = [
          `"${row.customerCode}"`,
          `"${row.name.replace(/"/g, '""')}"`,
          row.pay,
          row.thisMonth,
          row.prevBalance,
          row.totalBalance,
          row.currentBalance,
          row.currentUnit,
          row.prevUnit,
          row.unitsConsumed,
          `"${row.paymentStatus}"`,
        ];
        csvRows.push(values.join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Ledger_${activeSectionName.replace(/\s+/g, '_')}_Oct_2026.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Ledger CSV exported successfully!');
    } catch (err: any) {
      showToast('Failed to export CSV', 'error');
    }
  };

  // Owner Delete Resident Confirmation Handler
  const openDeleteConfirm = (row: typeof spreadsheetRows[0]) => {
    if (!isOwner) {
      showToast('Only Owner can delete resident rows.', 'error');
      return;
    }
    setDeleteConfirmRow(row);
  };

  const handleConfirmDeleteRow = async () => {
    if (!deleteConfirmRow || !isOwner) return;
    setDeletingRow(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };
      await deleteCustomer(deleteConfirmRow.customer.id, actor);
      showToast(`Deleted resident ${deleteConfirmRow.name} (${deleteConfirmRow.customerCode}) from ledger.`);
      setDeleteConfirmRow(null);
      markUpdated();
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete resident', 'error');
    } finally {
      setDeletingRow(false);
    }
  };

  // Helper for month names
  const getMonthName = (m: number) => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return monthNames[m - 1] || `Month ${m}`;
  };

  // Target next month/year computation
  const targetNextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
  const targetNextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;

  // Generate Next Month's Bill Handler
  const handleGenerateNextMonthBill = async () => {
    if (!isOwner) {
      showToast('Only Owner can create next month billing cycle.', 'error');
      setIsNextMonthModalOpen(false);
      return;
    }
    setGeneratingNextMonth(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      const result = await carryForwardMonth(
        targetNextMonth,
        targetNextYear,
        selectedMonth,
        selectedYear,
        15,
        actor
      );

      setSelectedMonth(targetNextMonth);
      setSelectedYear(targetNextYear);
      setIsNextMonthModalOpen(false);
      showUpdateToast(`Created next month's billing cycle for ${getMonthName(targetNextMonth)} ${targetNextYear}! (${result.countCreated} records updated)`);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to generate next month bill', 'error');
    } finally {
      setGeneratingNextMonth(false);
    }
  };

  // Owner Add Resident / Row
  const handleSaveNewResident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      showToast('Only Owner can add new rows.', 'error');
      return;
    }
    if (!newResidentName.trim()) {
      showToast('Please enter resident full name.', 'error');
      return;
    }

    setSavingNewResident(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      const targetSecId = activeTab === 'all' ? 'sec-elec-001' : activeTab;
      const created = await createCustomer(
        {
          full_name: newResidentName.trim(),
          phone: newResidentPhone.trim() || '9876543210',
          email: '',
          assigned_section_ids: [targetSecId],
          house_number: 'Flat 101',
          building_name: '',
          address: 'Main Society',
          city: 'Indore',
          is_active: true,
          created_by: actor.id,
          notes: 'Added by Owner from Ledger view',
        },
        actor
      );

      // If initial balance or unit specified, update current billing period
      const initBal = parseFloat(newResidentInitialBalance);
      const initUnit = parseFloat(newResidentInitialUnit);

      if (!isNaN(initBal) && initBal > 0) {
        await updateRemainingDueDirectly(
          created.id,
          targetSecId,
          selectedMonth,
          selectedYear,
          initBal,
          'Initial balance added by owner',
          actor
        );
      }

      if (!isNaN(initUnit) && initUnit > 0) {
        const periodId = `bp-${created.id}-${targetSecId}-${selectedMonth}-${selectedYear}`;
        await updateBillingPeriodCharges(
          periodId,
          { current_unit: initUnit },
          'Initial meter unit added by owner',
          actor
        );
      }

      showUpdateToast(`Resident ${created.full_name} (${created.customer_code}) created successfully!`);
      setIsAddResidentOpen(false);
      setNewResidentName('');
      setNewResidentPhone('');
      setNewResidentInitialBalance('');
      setNewResidentInitialUnit('');
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to add resident', 'error');
    } finally {
      setSavingNewResident(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-xl overflow-hidden font-sans text-xs">
      {/* 1. Header: Clean "Ledger" without Excel wording or subtext */}
      <div className="bg-[#f8f9fa] border-b border-slate-300 p-3 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Ledger</span>
                  <span className="text-slate-300 font-light">•</span>
                  <span className="text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 font-bold text-xs">
                    {activeSectionName}
                  </span>
                  {isOwner ? (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Owner: Full Edit Enabled
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Staff: Balance Update Only
                    </span>
                  )}
                </h2>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="md:hidden text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {/* Device Date / Time */}
                <div className="text-[9px] font-mono text-slate-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span id="device-time">{deviceTime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar with Clickable Pending Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Total Due */}
            <div className="px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Due</span>
              <span className="font-extrabold text-slate-800 text-xs">{formatCurrency(totals.totalGrandBalance)}</span>
            </div>

            {/* Collected */}
            <div className="px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Paid (Pay)</span>
              <span className="font-extrabold text-emerald-800 text-xs">{formatCurrency(totals.totalPay)}</span>
            </div>

            {/* CLICKABLE PENDING BALANCE BOX (Toggles Pending > ₹499 Filter) */}
            <button
              type="button"
              onClick={() => setPendingAbove499(!pendingAbove499)}
              title="Click here to show only Pending Customers with Balance above ₹499!"
              className={`px-3 py-1.5 rounded-lg border text-left transition-all cursor-pointer relative shadow-xs ${
                pendingAbove499
                  ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400'
                  : 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100 active:scale-98'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase ${pendingAbove499 ? 'text-white' : 'text-rose-700'}`}>
                  Pending {'>'} ₹499
                </span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  pendingAbove499 ? 'bg-white text-rose-700' : 'bg-rose-200 text-rose-900'
                }`}>
                  {totals.totalPendingCustomersCount} Pending
                </span>
              </div>
              <span className={`font-black text-xs block ${pendingAbove499 ? 'text-white' : 'text-rose-700'}`}>
                {formatCurrency(totals.totalCurrentBalance)}
              </span>
              <span className="text-[9px] block opacity-90 underline font-semibold mt-0.5">
                {pendingAbove499 ? '✓ Filter Active: Pending above ₹499 (Click for All)' : '👉 Click to Filter Pending > ₹499'}
              </span>
            </button>
          </div>
        </div>

        {/* 2. Filter & Controls Toolbar */}
        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          {/* Section Selector Tabs like Excel Sheets */}
          <div className="flex items-center gap-1 bg-slate-200 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('sec-elec-001')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                activeTab === 'sec-elec-001'
                  ? 'bg-white text-emerald-800 shadow-xs border border-emerald-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Section 1 (A)
            </button>
            <button
              onClick={() => setActiveTab('sec-water-002')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                activeTab === 'sec-water-002'
                  ? 'bg-white text-blue-800 shadow-xs border border-blue-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Section 2 (B)
            </button>
            <button
              onClick={() => setActiveTab('sec-other-003')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                activeTab === 'sec-other-003'
                  ? 'bg-white text-purple-800 shadow-xs border border-purple-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Section 3 (C)
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Sections
            </button>
          </div>

          {/* Search, Pending Toggle & Owner Add Row */}
          <div className="flex items-center gap-2 flex-1 max-w-lg justify-end">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ID (A4) or Name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-emerald-600"
              />
            </div>

            {/* Quick Toggle Button for Pending > ₹499 */}
            <button
              type="button"
              onClick={() => setPendingAbove499(!pendingAbove499)}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                pendingAbove499
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{pendingAbove499 ? 'Pending' : 'Show All'}</span>{pendingAbove499 ? ' {>} ₹499' : ''}
            </button>

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="Export Ledger data to CSV / Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {/* Owner Add Next Month's Bill Button */}
            {isOwner && (
              <button
                type="button"
                onClick={() => setIsNextMonthModalOpen(true)}
                className="px-3 py-1.5 rounded-lg font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                title="Add next month's billing cycle & carry forward balances"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Next Month Bill</span>
              </button>
            )}

            {/* Owner Add Resident Row Button */}
            {isOwner && (
              <button
                type="button"
                onClick={() => setIsAddResidentOpen(true)}
                className="px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-xs transition"
                title="Add new customer / resident row"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Add Row</span>
              </button>
            )}
          </div>

          {/* Start Date, End Date & Month Cycle Filter Bar */}
          <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-3">
            {/* Month Cycle Selector */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              <span className="text-[10px] font-extrabold text-purple-700 uppercase">Billing Cycle:</span>
              <select
                value={`${selectedMonth}-${selectedYear}`}
                onChange={async e => {
                  const [m, y] = e.target.value.split('-').map(Number);
                  const prevM = m === 1 ? 12 : m - 1;
                  const prevY = m === 1 ? y - 1 : y;

                  const existingForMonth = billingPeriods.filter(
                    p => p.billing_month === m && p.billing_year === y
                  );

                  if (existingForMonth.length === 0) {
                    if (!isOwner) {
                      showToast(
                        'Billing cycle for this month has not been created yet. Only Owner can add next month bill.',
                        'info'
                      );
                      return;
                    }

                    try {
                      const actor = {
                        id: currentUser?.id || 'usr-owner-001',
                        name: currentUser?.full_name || 'Owner',
                      };
                      const result = await carryForwardMonth(m, y, prevM, prevY, 15, actor);
                      showUpdateToast(
                        `Auto-initialized billing cycle for ${getMonthName(m)} ${y}! Carried forward ${result.countCreated} resident records (prev balance + this month bill).`
                      );
                      triggerDbRefresh();
                    } catch (err: any) {
                      console.error('Auto carry-forward error:', err);
                    }
                  }

                  setSelectedMonth(m);
                  setSelectedYear(y);
                }}
                className="text-xs bg-purple-50 border border-purple-300 rounded px-2 py-0.5 text-purple-900 font-extrabold focus:outline-purple-600 cursor-pointer"
              >
                <option value="10-2026">October 2026</option>
                <option value="11-2026">November 2026</option>
                <option value="12-2026">December 2026</option>
                <option value="1-2027">January 2027</option>
                <option value="2-2027">February 2027</option>
                <option value="3-2027">March 2027</option>
                <option value="4-2027">April 2027</option>
                <option value="5-2027">May 2027</option>
                <option value="6-2027">June 2027</option>
                <option value="7-2027">July 2027</option>
                <option value="8-2027">August 2027</option>
                <option value="9-2027">September 2027</option>
                <option value="10-2027">October 2027</option>
                <option value="11-2027">November 2027</option>
                <option value="12-2027">December 2027</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              <span className="text-[10px] font-extrabold text-slate-600 uppercase">Start Date:</span>
              <input
                type="date"
                value={startDate}
                readOnly={!isOwner}
                onChange={e => {
                  if (!isOwner) {
                    showToast('Only Owner can update dates and date range filters.', 'info');
                    return;
                  }
                  setStartDate(e.target.value);
                }}
                className={`text-xs border border-slate-300 rounded px-2 py-0.5 font-bold focus:outline-emerald-600 ${
                  isOwner ? 'bg-slate-50 text-slate-900 cursor-pointer' : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
              <span className="text-[10px] font-extrabold text-slate-600 uppercase">End Date:</span>
              <input
                type="date"
                value={endDate}
                readOnly={!isOwner}
                onChange={e => {
                  if (!isOwner) {
                    showToast('Only Owner can update dates and date range filters.', 'info');
                    return;
                  }
                  setEndDate(e.target.value);
                }}
                className={`text-xs border border-slate-300 rounded px-2 py-0.5 font-bold focus:outline-emerald-600 ${
                  isOwner ? 'bg-slate-50 text-slate-900 cursor-pointer' : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  if (!isOwner) {
                    showToast('Only Owner can update dates and date range filters.', 'info');
                    return;
                  }
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Clear Dates
              </button>
            )}
            <span className="text-xs font-bold text-emerald-800 ml-auto bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              Calculation Range: {startDate && endDate ? `${startDate} to ${endDate}` : startDate ? `From ${startDate}` : endDate ? `Until ${endDate}` : 'All Dates (Current)'}
            </span>
          </div>
        </div>
      </div>



      {/* 3. The Spreadsheet Table */}
      <div className="overflow-x-auto max-h-[70vh] relative">
        <table className="w-full text-left border-collapse font-sans text-xs min-w-[1100px]">
          {/* Header Banners */}
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#d9ead3] text-emerald-950 border-b-2 border-emerald-400">
              <th colSpan={8} className="py-2.5 px-3 text-center text-xs sm:text-sm font-black tracking-wide uppercase border-r-2 border-emerald-500 bg-[#d9ead3] sticky top-0">
                {activeSectionName} • Collection &amp; Balances
              </th>
              <th colSpan={6} className="py-2.5 px-3 text-center text-xs sm:text-sm font-black tracking-wide uppercase bg-[#cfe2f3] text-blue-950 sticky top-0">
                Meter Readings &amp; Consumption (Units)
              </th>
            </tr>

            {/* Column Headers */}
            <tr className="bg-slate-100 text-slate-800 text-[11px] font-bold uppercase tracking-wider border-b border-slate-300">
              {/* Ledger Columns */}
              <th className="py-2 px-2.5 w-12 text-center border-r border-slate-300 bg-slate-200 sticky top-[37px]">ID</th>
              <th className="py-2 px-3 min-w-[140px] border-r border-slate-300 bg-slate-100 sticky top-[37px]">
                Name {isOwner && <span className="text-[9px] text-indigo-600 font-normal">(Edit)</span>}
              </th>
              <th className="py-2 px-3 text-right bg-[#e6f4ea] text-emerald-900 border-r border-slate-300 sticky top-[37px]">
                Pay (Paid)
              </th>
              <th className="py-2 px-3 text-right bg-[#fce8e6] text-rose-900 border-r border-slate-300 sticky top-[37px]">
                This Month {isOwner && <span className="text-[9px] text-indigo-600 font-normal">(Edit)</span>}
              </th>
              <th className="py-2 px-3 text-right bg-[#fff2cc] text-amber-900 border-r border-slate-300 sticky top-[37px]">
                Prev Balance {isOwner && <span className="text-[9px] text-indigo-600 font-normal">(Edit)</span>}
              </th>
              <th className="py-2 px-3 text-right border-r border-slate-300 font-extrabold bg-slate-100 sticky top-[37px]">
                Total Balance
              </th>
              <th className="py-2 px-3 text-right bg-rose-50 text-rose-950 font-black border-r border-slate-300 sticky top-[37px]">
                Current Balance
              </th>
              <th className="py-2 px-2.5 text-center border-r-2 border-emerald-400 min-w-[160px] bg-slate-100 sticky top-[37px]">
                Actions
              </th>

              {/* Meter Reading Columns */}
              <th className="py-2 px-2 text-center border-r border-slate-300 bg-blue-50 sticky top-[37px]">ID</th>
              <th className="py-2 px-3 min-w-[120px] border-r border-slate-300 bg-slate-100 sticky top-[37px]">Name</th>
              <th className="py-2 px-2.5 text-right border-r border-slate-300 bg-slate-100 sticky top-[37px]">
                Current Unit {isOwner && <span className="text-[9px] text-indigo-600 font-normal">(Edit)</span>}
              </th>
              <th className="py-2 px-2.5 text-right border-r border-slate-300 bg-slate-100 sticky top-[37px]">
                Prev Unit {isOwner && <span className="text-[9px] text-indigo-600 font-normal">(Edit)</span>}
              </th>
              <th className="py-2 px-2 text-center border-r border-slate-300 bg-blue-100 font-extrabold sticky top-[37px]">U (Units)</th>
              <th className="py-2 px-3 text-right bg-slate-100 sticky top-[37px]">Amount (₹)</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-12 text-center text-slate-400 font-medium text-xs">
                  No resident records match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => {
                const isEven = idx % 2 === 0;

                return (
                  <React.Fragment key={`${row.customer.id}-${row.targetSectionId}-${idx}`}>
                    <tr
                      className={`hover:bg-blue-50/50 transition-colors ${
                        isEven ? 'bg-white' : 'bg-slate-50/70'
                      }`}
                    >
                    {/* 1. ID: Colored badge (Green = Settled, Yellow = Pending) */}
                    {/* 1. ID: Colored badge (Green = Fully Paid, Red = Remaining Due / Adda) */}
                    <td className="py-2 px-2 text-center border-r border-slate-200">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-black tracking-tight shadow-2xs ${
                          row.currentBalance <= 0
                            ? 'bg-emerald-600 text-white'
                            : row.currentBalance > 499
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-600 text-white'
                        }`}
                        title={row.currentBalance <= 0 ? `${row.name} - Fully Paid (Settled)` : `${row.name} - Pending Balance: ₹${row.currentBalance}`}
                      >
                        {row.customerCode}
                      </span>
                    </td>

                    {/* 2. Name with down/right arrow '>' & expansion */}
                    <td
                      onClick={() => toggleExpandCustomer(row.customer.id)}
                      className="py-2 px-3 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap cursor-pointer hover:bg-blue-50 group relative"
                      title="Click name or '>' to view detail table"
                    >
                      {editingCell?.customerId === row.customer.id && editingCell?.field === 'name' ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellSave(row.customer.id, row.targetSectionId, 'name');
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-32 px-1.5 py-0.5 text-xs font-bold border-2 border-indigo-600 rounded bg-white"
                          />
                          <button
                            disabled={savingCell}
                            onClick={() => handleCellSave(row.customer.id, row.targetSectionId, 'name')}
                            className="p-1 bg-indigo-600 text-white rounded text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[10px]">
                              {expandedCustomerIds[row.customer.id] ? 'v' : '>'}
                            </span>
                            <span>{row.name}</span>
                          </div>
                          {isOwner && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleCellClick(row.customer.id, row.targetSectionId, 'name', row.name, row.period?.id);
                              }}
                              className="text-[10px] text-indigo-600 font-semibold hover:underline opacity-0 group-hover:opacity-100"
                              title="Edit Name"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 3. Pay (Paid Amount) - Read Only in Table, Updated via Action > Update */}
                    <td className="py-2 px-3 text-right font-black text-emerald-800 bg-[#e6f4ea]/70 border-r border-slate-200" title="Payment recorded via Action > Update">
                      <div className="flex items-center justify-end">
                        <span>{row.pay > 0 ? row.pay : 0}</span>
                      </div>
                    </td>

                    {/* 4. This Month Bill - Editable by Owner, Read-Only for Staff */}
                    <td
                      onClick={() => {
                        handleCellClick(row.customer.id, row.targetSectionId, 'this_month', row.thisMonth, row.period?.id);
                      }}
                      className={`py-2 px-3 text-right font-medium text-rose-950 bg-[#fce8e6]/60 border-r border-slate-200 group ${
                        isOwner ? 'cursor-pointer hover:bg-rose-100' : 'cursor-default'
                      }`}
                      title={isOwner ? 'Click to edit monthly bill' : 'Staff cannot edit bill (Owner only)'}
                    >
                      {editingCell?.customerId === row.customer.id && editingCell?.field === 'this_month' ? (
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellSave(row.customer.id, row.targetSectionId, 'this_month');
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1.5 py-0.5 text-xs font-bold border-2 border-rose-600 rounded bg-white text-right"
                          />
                          <button
                            disabled={savingCell}
                            onClick={() => handleCellSave(row.customer.id, row.targetSectionId, 'this_month')}
                            className="p-1 bg-rose-600 text-white rounded text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <span>{row.thisMonth > 0 ? row.thisMonth : ''}</span>
                          {isOwner && (
                            <Pencil className="w-2.5 h-2.5 text-rose-500 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      )}
                    </td>

                    {/* 5. Previous Balance - Editable by Owner, Read-Only for Staff */}
                    <td
                      onClick={() => {
                        handleCellClick(row.customer.id, row.targetSectionId, 'prev_balance', row.prevBalance, row.period?.id);
                      }}
                      className={`py-2 px-3 text-right font-medium text-amber-950 bg-[#fff2cc]/60 border-r border-slate-200 group ${
                        isOwner ? 'cursor-pointer hover:bg-amber-100' : 'cursor-default'
                      }`}
                      title={isOwner ? 'Click to edit previous balance' : 'Staff cannot edit prev balance (Owner only)'}
                    >
                      {editingCell?.customerId === row.customer.id && editingCell?.field === 'prev_balance' ? (
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellSave(row.customer.id, row.targetSectionId, 'prev_balance');
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1.5 py-0.5 text-xs font-bold border-2 border-amber-600 rounded bg-white text-right"
                          />
                          <button
                            disabled={savingCell}
                            onClick={() => handleCellSave(row.customer.id, row.targetSectionId, 'prev_balance')}
                            className="p-1 bg-amber-600 text-white rounded text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <span>{row.prevBalance > 0 ? row.prevBalance : ''}</span>
                          {isOwner && (
                            <Pencil className="w-2.5 h-2.5 text-amber-600 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      )}
                    </td>

                    {/* 6. Total Balance */}
                    <td className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200">
                      {row.totalBalance > 0 ? row.totalBalance : 0}
                    </td>

                    {/* 7. Current Balance (Pending Due) - Editable by Staff & Owner */}
                    <td
                      onClick={() => {
                        if (!isOwner) {
                          showToast('Owner only: Use Action > Update to record payment.', 'info');
                          return;
                        }
                        handleCellClick(row.customer.id, row.targetSectionId, 'closing_balance', row.currentBalance, row.period?.id);
                      }}
                      className={`py-2 px-3 text-right font-bold border-r border-slate-200 ${
                        isOwner
                          ? 'cursor-pointer hover:bg-rose-100 group'
                          : 'cursor-default opacity-70'
                      } ${
                        row.currentBalance > 0 ? 'text-rose-700 bg-rose-50/80' : 'text-slate-400'
                      }`}
                      title={isOwner ? 'Owner: Click to directly update remaining balance' : 'Staff cannot edit balance directly. Use Action > Update.'}
                    >
                      {editingCell?.customerId === row.customer.id && editingCell?.field === 'closing_balance' ? (
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellSave(row.customer.id, row.targetSectionId, 'closing_balance');
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-20 px-1.5 py-0.5 text-xs font-bold border-2 border-rose-600 rounded bg-white text-right"
                          />
                          <button
                            disabled={savingCell}
                            onClick={() => handleCellSave(row.customer.id, row.targetSectionId, 'closing_balance')}
                            className="p-1 bg-rose-600 text-white rounded text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <span>{row.currentBalance}</span>
                          <Pencil className="w-2.5 h-2.5 text-rose-500 opacity-0 group-hover:opacity-100" />
                        </div>
                      )}
                    </td>

                    {/* 8. Actions Column: Update, UPI QR, Invoice, and Delete (Owner) */}
                    <td className="py-2 px-2 text-center border-r-2 border-emerald-400">
                      <div className="flex items-center justify-center gap-1">
                        {/* Fast Balance Update Modal */}
                        <button
                          type="button"
                          onClick={() => openBalanceModal(row)}
                          title="Update Balance"
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded text-[10px] font-bold transition shadow-2xs cursor-pointer"
                        >
                          Update
                        </button>

                        {/* UPI QR Code Trigger */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUpiModalData({
                              customerName: row.name,
                              customerCode: row.customerCode,
                               customerId: row.customer.id,
                               sectionId: row.targetSectionId,
                               periodId: row.period?.id,
                              currentBalance: row.currentBalance,
                              initialAmount: row.currentBalance > 0 ? row.currentBalance : undefined,
                            });
                          }}
                          title="Open Raj UPI QR Code"
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 rounded text-[10px] font-bold transition shadow-2xs flex items-center gap-0.5 cursor-pointer"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>UPI</span>
                        </button>

                        {/* Download / Print Invoice Button */}
                        <button
                          type="button"
                          onClick={() => openInvoiceModal(row.customer, row.period || {
                            id: `bp-${row.customer.id}-${row.targetSectionId}-${selectedMonth}-${selectedYear}`,
                            customer_id: row.customer.id,
                            section_id: row.targetSectionId,
                            billing_month: selectedMonth,
                            billing_year: selectedYear,
                            opening_balance: row.prevBalance,
                            bill_amount: row.thisMonth,
                            additional_charges: 0,
                            credits_or_adjustments: 0,
                            total_amount_due: row.totalBalance,
                            paid_amount: row.pay,
                            closing_balance: row.currentBalance,
                            due_date: '2026-10-05',
                            payment_status: row.paymentStatus,
                            current_unit: row.currentUnit,
                            previous_unit: row.prevUnit,
                            units_consumed: row.unitsConsumed,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                          })}
                          title="Download or Print Invoice"
                          className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded text-[10px] font-bold transition shadow-2xs flex items-center gap-0.5 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Invoice</span>
                        </button>

                        {/* Owner Delete Row */}
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => openDeleteConfirm(row)}
                            title="Delete resident row (Owner only)"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Meter Columns */}
                    {/* 9. Meter ID */}
                    <td className="py-2 px-2 text-center border-r border-slate-200 bg-slate-50 font-mono text-[10px]">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black ${
                          row.currentBalance <= 0
                            ? 'bg-emerald-600 text-white'
                            : row.currentBalance > 499
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-600 text-white'
                        }`}
                      >
                        {row.customerCode}
                      </span>
                    </td>

                    {/* 10. Meter Name */}
                    <td className="py-2 px-3 text-slate-700 border-r border-slate-200 whitespace-nowrap">
                      {row.name}
                    </td>

                    {/* 11. Current Unit - Editable by Staff & Owner */}
                    <td
                      onClick={() => {
                        handleCellClick(row.customer.id, row.targetSectionId, 'current_unit', row.currentUnit, row.period?.id);
                      }}
                      className={`py-2 px-2.5 text-right font-bold text-slate-800 border-r border-slate-200 group cursor-pointer hover:bg-blue-50`}
                      title="Click to update meter reading"
                    >
                      {editingCell?.customerId === row.customer.id && editingCell?.field === 'current_unit' ? (
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellSave(row.customer.id, row.targetSectionId, 'current_unit');
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1.5 py-0.5 text-xs font-bold border-2 border-blue-600 rounded bg-white text-right"
                          />
                          <button
                            disabled={savingCell}
                            onClick={() => handleCellSave(row.customer.id, row.targetSectionId, 'current_unit')}
                            className="p-1 bg-blue-600 text-white rounded text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <span>{row.currentUnit > 0 ? row.currentUnit : ''}</span>
                          {isOwner && (
                            <Pencil className="w-2.5 h-2.5 text-blue-500 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      )}
                    </td>

                    {/* 12. Previous Unit - Editable by Owner, Read-Only for Staff */}
                    <td
                      onClick={() => {
                        handleCellClick(row.customer.id, row.targetSectionId, 'prev_unit', row.prevUnit, row.period?.id);
                      }}
                      className={`py-2 px-2.5 text-right text-slate-600 border-r border-slate-200 group ${
                        isOwner ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default'
                      }`}
                      title={isOwner ? 'Click to update previous unit' : 'Staff cannot edit previous unit (Owner only)'}
                    >
                      {editingCell?.customerId === row.customer.id && editingCell?.field === 'prev_unit' ? (
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            step="1"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCellSave(row.customer.id, row.targetSectionId, 'prev_unit');
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-16 px-1.5 py-0.5 text-xs font-bold border-2 border-blue-600 rounded bg-white text-right"
                          />
                          <button
                            disabled={savingCell}
                            onClick={() => handleCellSave(row.customer.id, row.targetSectionId, 'prev_unit')}
                            className="p-1 bg-blue-600 text-white rounded text-[10px]"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <span>{row.prevUnit > 0 ? row.prevUnit : ''}</span>
                          {isOwner && (
                            <Pencil className="w-2.5 h-2.5 text-blue-500 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      )}
                    </td>

                    {/* 13. Units Consumed (U) */}
                    <td className="py-2 px-2 text-center font-black bg-blue-50 text-blue-900 border-r border-slate-200">
                      {row.unitsConsumed > 0 ? row.unitsConsumed : ''}
                    </td>

                    {/* 14. Unit Amount */}
                    <td className="py-2 px-3 text-right font-medium text-slate-700">
                      {row.thisMonth > 0 ? row.thisMonth : ''}
                    </td>
                  </tr>

                  {/* Expanded Detail Sub-Table Row */}
                  {expandedCustomerIds[row.customer.id] && (
                    <tr className="bg-slate-50 border-b border-slate-300">
                      <td colSpan={14} className="p-3">
                        <div className="bg-white rounded-xl border border-slate-300 p-3 shadow-sm">
                          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-xs">Name :</span>
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">{row.name}</span>
                              <span className="text-slate-400">({row.customerCode})</span>
                            </div>
                            <button
                              onClick={() => toggleExpandCustomer(row.customer.id)}
                              className="text-xs text-slate-500 hover:text-slate-800 font-bold px-2 py-0.5 rounded bg-slate-100 cursor-pointer"
                            >
                              Close [x]
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse border border-slate-200">
                              <thead>
                                <tr className="bg-slate-100 text-slate-800 text-[11px] font-bold uppercase">
                                  <th className="p-2 border border-slate-200">DATE</th>
                                  <th className="p-2 border border-slate-200 text-right">CURRENT</th>
                                  <th className="p-2 border border-slate-200 text-right">PREV</th>
                                  <th className="p-2 border border-slate-200 text-right">UNIT</th>
                                  <th className="p-2 border border-slate-200 text-right">BILL</th>
                                  <th className="p-2 border border-slate-200 text-right">PREBALANCE BILL</th>
                                  <th className="p-2 border border-slate-200 text-right">TOTAL BILL</th>
                                  <th className="p-2 border border-slate-200 text-right bg-emerald-50 text-emerald-900">PAY</th>
                                  <th className="p-2 border border-slate-200 text-center">PAYMENT TYPE</th>
                                  <th className="p-2 border border-slate-200 text-right">CURRENT BALANCE</th>
                                  <th className="p-2 border border-slate-200 text-center w-24">INVOICE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const historyPeriods = billingPeriods
                                    .filter(p => p.customer_id === row.customer.id && (activeTab === 'all' || p.section_id === row.targetSectionId))
                                    .sort((a, b) => {
                                      if (a.billing_year !== b.billing_year) return a.billing_year - b.billing_year;
                                      return a.billing_month - b.billing_month;
                                    });

                                  if (historyPeriods.length === 0) {
                                    return (
                                      <tr className="bg-white hover:bg-slate-50">
                                        <td className="p-2 border border-slate-200 font-semibold">{`${selectedMonth}/1/${selectedYear}`}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-blue-700">{row.currentUnit}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-slate-600">{row.prevUnit}</td>
                                        <td className="p-2 border border-slate-200 text-right font-extrabold text-indigo-700">{row.unitsConsumed}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-rose-700">{formatCurrency(row.thisMonth)}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-amber-700">{formatCurrency(row.prevBalance)}</td>
                                        <td className="p-2 border border-slate-200 text-right font-extrabold text-slate-900">{formatCurrency(row.totalBalance)}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-emerald-700 bg-emerald-50/50">{formatCurrency(row.pay)}</td>
                                        <td className="p-2 border border-slate-200 text-center font-medium">
                                          {getPaymentType(row.customer.id, selectedMonth, selectedYear)}
                                        </td>
                                        <td className="p-2 border border-slate-200 text-right font-black text-rose-800">{formatCurrency(row.currentBalance)}</td>
                                        <td className="p-2 border border-slate-200 text-center">
                                          <button
                                            type="button"
                                            onClick={() => openInvoiceModal(row.customer, row.period || {
                                              id: `bp-${row.customer.id}-${row.targetSectionId}-${selectedMonth}-${selectedYear}`,
                                              customer_id: row.customer.id,
                                              section_id: row.targetSectionId,
                                              billing_month: selectedMonth,
                                              billing_year: selectedYear,
                                              opening_balance: row.prevBalance,
                                              bill_amount: row.thisMonth,
                                              additional_charges: 0,
                                              credits_or_adjustments: 0,
                                              total_amount_due: row.totalBalance,
                                              paid_amount: row.pay,
                                              closing_balance: row.currentBalance,
                                              due_date: '2026-10-05',
                                              payment_status: row.paymentStatus,
                                              current_unit: row.currentUnit,
                                              previous_unit: row.prevUnit,
                                              units_consumed: row.unitsConsumed,
                                              created_at: new Date().toISOString(),
                                              updated_at: new Date().toISOString(),
                                            })}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded text-[10px] font-bold transition shadow-2xs cursor-pointer"
                                            title="Download or Print Invoice"
                                          >
                                            <Download className="w-3 h-3" />
                                            <span>Invoice</span>
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return historyPeriods.map((hp, hIdx) => {
                                    const hpThisMonth = hp.bill_amount + hp.additional_charges - hp.credits_or_adjustments;
                                    const hpUnits = hp.units_consumed ?? Math.max(0, (hp.current_unit ?? 0) - (hp.previous_unit ?? 0));
                                    const dateStr = `${hp.billing_month}/1/${hp.billing_year}`;

                                    return (
                                      <tr key={hp.id || hIdx} className="bg-white hover:bg-slate-50 border-b border-slate-100">
                                        <td className="p-2 border border-slate-200 font-bold text-slate-800">{dateStr}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-blue-700">{hp.current_unit ?? 0}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-slate-600">{hp.previous_unit ?? 0}</td>
                                        <td className="p-2 border border-slate-200 text-right font-extrabold text-indigo-700">{hpUnits}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-rose-700">{formatCurrency(hpThisMonth)}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-amber-700">{formatCurrency(hp.opening_balance)}</td>
                                        <td className="p-2 border border-slate-200 text-right font-extrabold text-slate-900">{formatCurrency(hp.total_amount_due)}</td>
                                        <td className="p-2 border border-slate-200 text-right font-bold text-emerald-700 bg-emerald-50/50">{formatCurrency(hp.paid_amount)}</td>
                                        <td className="p-2 border border-slate-200 text-center font-medium">
                                          {getPaymentType(row.customer.id, hp.billing_month, hp.billing_year)}
                                        </td>
                                        <td className="p-2 border border-slate-200 text-right font-black text-rose-800">{formatCurrency(Math.max(0, hp.closing_balance))}</td>
                                        <td className="p-2 border border-slate-200 text-center">
                                          <button
                                            type="button"
                                            onClick={() => openInvoiceModal(row.customer, hp)}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 rounded text-[10px] font-bold transition shadow-2xs cursor-pointer"
                                            title="Download or Print Invoice"
                                          >
                                            <Download className="w-3 h-3" />
                                            <span>Invoice</span>
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {/* Grand Totals Footer */}
          <tfoot>
            <tr className="bg-slate-200 text-slate-900 font-black border-t-2 border-slate-400">
              <td colSpan={2} className="py-2.5 px-3 text-right uppercase tracking-wider text-xs border-r border-slate-300">
                Grand Total ({filteredRows.length} rows):
              </td>
              <td className="py-2.5 px-3 text-right text-rose-900 bg-rose-100 border-r border-slate-300 text-xs">
                {formatCurrency(totals.totalThisMonth)}
              </td>
              <td className="py-2.5 px-3 text-right text-amber-900 bg-amber-100 border-r border-slate-300 text-xs">
                {formatCurrency(totals.totalPrevBalance)}
              </td>
              <td className="py-2.5 px-3 text-right border-r border-slate-300 text-xs">
                {formatCurrency(totals.totalGrandBalance)}
              </td>
              <td className="py-2.5 px-3 text-right text-emerald-900 bg-emerald-100 border-r border-slate-300 text-xs">
                {formatCurrency(totals.totalPay)}
              </td>
              <td className="py-2.5 px-3 text-right text-rose-700 bg-rose-100 text-xs font-black border-r border-slate-300">
                {formatCurrency(totals.totalCurrentBalance)}
              </td>
              <td colSpan={7} className="py-2.5 px-3 text-slate-500 text-xs font-semibold">
                {isOwner
                  ? 'Owner mode: Click any cell to edit or click "+ Add Row" to add new residents.'
                  : 'Staff mode: You can update balance and record payments via Action > Update. Contact owner for meter/bill changes.'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. Staff/Owner Quick Balance & Payment Update Modal */}
      {balanceModalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 text-xs">
            {/* Header */}
            <div className="px-5 py-3.5 bg-blue-600 text-white flex items-center justify-between">
              <div>
                <span className="font-mono text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-bold">
                  {balanceModalCustomer.customer.customer_code}
                </span>
                <h3 className="font-extrabold text-sm mt-0.5">
                  Update Balance: {balanceModalCustomer.customer.full_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBalanceModalCustomer(null)}
                className="p-1 rounded text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveModal} className="p-5 space-y-3.5">
              {/* Ledger Preview Box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">This Month</span>
                  <span className="font-bold text-slate-800">{formatCurrency(balanceModalCustomer.thisMonth)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 block font-bold uppercase">Paid So Far</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(balanceModalCustomer.pay)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 block font-bold uppercase">Current Due</span>
                  <span className="font-black text-rose-700 text-sm">{formatCurrency(balanceModalCustomer.currentBalance)}</span>
                </div>
              </div>

              {/* UPI QR Quick Launch Button inside modal */}
              <button
                type="button"
                onClick={() => {
                  const cust = balanceModalCustomer;
                  setBalanceModalCustomer(null);
                  setUpiModalData({
                    customerName: cust.customer.full_name,
                    customerCode: cust.customer.customer_code,
                    customerId: cust.customer.id,
                    sectionId: cust.sectionId,
                    periodId: cust.period?.id,
                    currentBalance: cust.currentBalance,
                    initialAmount: cust.currentBalance > 0 ? cust.currentBalance : undefined,
                  });
                }}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xs transition"
              >
                <QrCode className="w-4 h-4" />
                <span>Show Raj UPI QR Code (Google Pay)</span>
              </button>

              {/* 1. Paid Amount (Pay) */}
              <div>
                <label className="block font-bold text-emerald-800 mb-1">
                  1. Payment Received Now (₹ Cash)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Enter amount paid"
                    value={modalPayAmount}
                    onChange={e => setModalPayAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 font-bold text-slate-900 rounded-lg border border-slate-300 focus:outline-emerald-600"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Staff can directly record cash collection
                </span>
              </div>

              {/* 2. Remaining Balance Info (Read-Only - View Only) */}
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black uppercase text-rose-900 block">
                      Remaining Balance Directly (₹)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Current balance due (View only)
                    </span>
                  </div>
                  <span className="text-lg font-black text-rose-700">
                    {formatCurrency(balanceModalCustomer.currentBalance)}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-rose-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Total Bill: <strong>{formatCurrency(balanceModalCustomer.totalBalance)}</strong></span>
                  <span>Paid So Far: <strong className="text-emerald-700">{formatCurrency(balanceModalCustomer.pay)}</strong></span>
                </div>
              </div>

              {/* 3. Reason */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Staff Remark / Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Doorstep collection / balance adjustment"
                  value={modalReason}
                  onChange={e => setModalReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-blue-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBalanceModalCustomer(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingModal}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs"
                >
                  {savingModal ? 'Updating...' : 'Save Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. UPI Google Pay QR Modal */}
      {upiModalData && (
        <UpiQrViewModal
          isOpen={!!upiModalData}
          onClose={() => setUpiModalData(null)}
          customerName={upiModalData.customerName}
          customerCode={upiModalData.customerCode}
          currentBalance={upiModalData.currentBalance}
          initialAmount={upiModalData.initialAmount}
          onPaymentConfirmed={handleUpiPaymentConfirmed}
        />
      )}

      {/* 6. Owner Add Resident / Row Modal */}
      {isAddResidentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 text-xs">
            <div className="px-5 py-3.5 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-white" />
                <h3 className="font-extrabold text-sm">Add New Resident Row</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddResidentOpen(false)}
                className="p-1 rounded text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewResident} className="p-5 space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Section Assignment
                </label>
                <input
                  type="text"
                  disabled
                  value={activeSectionName}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-600 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Resident Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newResidentName}
                  onChange={e => setNewResidentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-indigo-600 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={newResidentPhone}
                  onChange={e => setNewResidentPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-indigo-600 font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Initial Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newResidentInitialBalance}
                    onChange={e => setNewResidentInitialBalance(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-indigo-600 font-bold text-rose-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Initial Meter Unit
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    value={newResidentInitialUnit}
                    onChange={e => setNewResidentInitialUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-indigo-600 font-bold text-blue-700"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddResidentOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewResident}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-xs"
                >
                  {savingNewResident ? 'Saving...' : 'Add Resident Row'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Owner Delete Resident Modal (replaces browser confirm) */}
      {deleteConfirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 text-xs">
            <div className="px-5 py-3.5 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-white" />
                <h3 className="font-extrabold text-sm">Delete Resident Row</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmRow(null)}
                className="p-1 rounded text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-900">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-xs">Are you sure you want to delete this resident?</p>
                  <p className="text-[11px] text-rose-700 mt-1">
                    Resident: <strong className="text-rose-950">{deleteConfirmRow.name} ({deleteConfirmRow.customerCode})</strong>
                  </p>
                </div>
              </div>

              <p className="text-slate-600 text-xs leading-relaxed">
                This action will permanently delete this resident row and clear all associated billing history and meter readings.
              </p>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmRow(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingRow}
                  onClick={handleConfirmDeleteRow}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition shadow-xs cursor-pointer"
                >
                  {deletingRow ? 'Deleting...' : 'Delete Resident'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Owner Add Next Month's Bill Modal */}
      {isNextMonthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 text-xs">
            <div className="px-5 py-3.5 bg-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-white" />
                <h3 className="font-extrabold text-sm">Add Next Month's Billing Cycle</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNextMonthModalOpen(false)}
                className="p-1 rounded text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1 text-purple-900">
                <div className="flex items-center justify-between font-bold">
                  <span>Current Billing Period:</span>
                  <span className="text-purple-950">{getMonthName(selectedMonth)} {selectedYear}</span>
                </div>
                <div className="flex items-center justify-between font-extrabold text-sm text-purple-700 pt-1 border-t border-purple-200">
                  <span>Next Billing Cycle to Add:</span>
                  <span className="text-purple-900 bg-white px-2 py-0.5 rounded border border-purple-300">
                    {getMonthName(targetNextMonth)} {targetNextYear}
                  </span>
                </div>
              </div>

              <div className="text-slate-600 space-y-1.5 text-xs leading-relaxed">
                <p className="font-semibold text-slate-800">What happens when you add next month's bill?</p>
                <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
                  <li>Current ending balances will automatically carry forward as previous balances.</li>
                  <li>New billing period records will be generated for all active residents.</li>
                  <li>The ledger view will automatically switch to show {getMonthName(targetNextMonth)} {targetNextYear}.</li>
                </ul>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNextMonthModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={generatingNextMonth}
                  onClick={handleGenerateNextMonthBill}
                  className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {generatingNextMonth ? (
                    'Generating...'
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Generate {getMonthName(targetNextMonth)} {targetNextYear} Bills</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Invoice Download & Print Modal */}
      <InvoiceModal
        isOpen={invoiceModalData !== null}
        onClose={() => setInvoiceModalData(null)}
        customer={invoiceModalData?.customer || null}
        period={invoiceModalData?.period || null}
        sectionName={
          sections.find(s => s.id === (invoiceModalData?.period?.section_id || activeTab))?.name ||
          (activeTab === 'sec-elec-001'
            ? 'Section 1 - Electricity'
            : activeTab === 'sec-water-002'
            ? 'Section 2 - Water'
            : activeTab === 'sec-other-003'
            ? 'Section 3 - Maintenance & Other'
            : 'Section 1 - Electricity')
        }
      />
    </div>
  );
};
