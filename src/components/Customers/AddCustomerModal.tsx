import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { createCustomer, updateRemainingDueDirectly, updateBillingPeriodCharges } from '../../services/databaseService';
import { CollectionSection } from '../../types';
import { X, UserPlus, Check, Zap } from 'lucide-react';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: CollectionSection[];
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, sections }) => {
  const { currentUser } = useAuth();
  const { triggerDbRefresh, showToast } = useApp();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedSectionIds, setAssignedSectionIds] = useState<string[]>(['sec-elec-001']);
  
  // Initial Balance and Units requested by user
  const [initialBalance, setInitialBalance] = useState('');
  const [initialUnit, setInitialUnit] = useState('');
  
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleSection = (id: string) => {
    setAssignedSectionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      showToast('Please fill in required fields: Resident Name and Phone number.', 'error');
      return;
    }

    if (assignedSectionIds.length === 0) {
      showToast('Please assign at least one collection section.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Admin',
      };

      const created = await createCustomer(
        {
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: '',
          house_number: 'Flat 101',
          building_name: '',
          address: 'Main Society',
          city: 'Indore',
          assigned_section_ids: assignedSectionIds,
          is_active: true,
          created_by: actor.id,
        },
        actor
      );

      // If initial balance or unit specified, update billing periods for assigned sections
      const initBal = parseFloat(initialBalance);
      const initUnit = parseFloat(initialUnit);

      const currentMonth = 10;
      const currentYear = 2026;

      for (const secId of assignedSectionIds) {
        const periodId = `bp-${created.id}-${secId}-${currentMonth}-${currentYear}`;
        if (!isNaN(initBal) && initBal > 0) {
          await updateRemainingDueDirectly(
            created.id,
            secId,
            currentMonth,
            currentYear,
            initBal,
            'Initial balance added upon registration',
            actor
          );
        }
        if (!isNaN(initUnit) && initUnit > 0) {
          await updateBillingPeriodCharges(
            periodId,
            { current_unit: initUnit },
            'Initial meter unit added upon registration',
            actor
          );
        }
      }

      showToast(`Resident "${fullName}" (${created.customer_code}) created successfully!`);
      triggerDbRefresh();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to create customer', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Add New Resident</h3>
              <p className="text-[11px] text-slate-500">Simplified registration with initial balance &amp; meter</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {/* Full Name */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Resident Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Kumar"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-blue-600 font-semibold text-slate-900"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Mobile Number *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">+91</span>
              <input
                type="tel"
                required
                placeholder="9827012345"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-blue-600 font-mono font-bold text-slate-900"
              />
            </div>
          </div>

          {/* Initial Balance & Initial Unit */}
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
                value={initialBalance}
                onChange={e => setInitialBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-blue-600 font-bold text-rose-700"
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
                value={initialUnit}
                onChange={e => setInitialUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-blue-600 font-bold text-blue-700"
              />
            </div>
          </div>

          {/* Assigned Sections */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block font-bold text-slate-700 mb-1">
              Assigned Collection Section *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {sections.map(sec => {
                const isChecked = assignedSectionIds.includes(sec.id);
                return (
                  <div
                    key={sec.id}
                    onClick={() => toggleSection(sec.id)}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-bold cursor-pointer transition ${
                      isChecked
                        ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                      isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                    }`}>
                      {isChecked && <Check className="w-2.5 h-2.5" />}
                    </div>
                    <span>
                      {sec.code === 'electricity' ? 'Sec 1' : sec.code === 'water' ? 'Sec 2' : 'Sec 3'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs"
            >
              {submitting ? 'Registering...' : 'Add Resident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
