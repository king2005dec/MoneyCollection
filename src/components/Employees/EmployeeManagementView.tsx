import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Profile, Collection, AuditLog } from '../../types';
import {
  getProfiles,
  getCollections,
  getAuditLogs,
  createEmployee,
  toggleEmployeeStatus,
  updateEmployeeSections,
  deleteEmployee,
} from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  UserCheck,
  UserPlus,
  ShieldCheck,
  Coins,
  CreditCard,
  History,
  Power,
  Trash2,
  X,
  Mail,
  Phone,
  User,
  ShieldAlert,
  Layers,
  Check,
  Pencil,
  CheckCircle2,
} from 'lucide-react';

const AVAILABLE_SECTIONS = ['Section 1', 'Section 2', 'Section 3'] as const;

export const EmployeeManagementView: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const { dbVersion, triggerDbRefresh, showToast } = useApp();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Add User Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'collection_admin' | 'owner'>('collection_admin');
  const [selectedSections, setSelectedSections] = useState<string[]>(['Section 1', 'Section 2', 'Section 3']);
  const [submitting, setSubmitting] = useState(false);

  // Edit Sections Modal State
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editSections, setEditSections] = useState<string[]>([]);
  const [savingSections, setSavingSections] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [p, cols, logs] = await Promise.all([
          getProfiles(),
          getCollections(),
          getAuditLogs(),
        ]);
        setProfiles(p);
        setCollections(cols);
        setAuditLogs(logs);
      } catch (err) {
        console.error('Failed to load user data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  if (!isOwner) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">
          User management and section authorization is restricted exclusively to the Business Owner account.
        </p>
      </div>
    );
  }

  const todayStr = '2026-10-22';
  const confirmedCols = collections.filter(c => c.status === 'Confirmed' || c.status === 'Corrected');

  const employeeStats = profiles.map(p => {
    const empCols = confirmedCols.filter(c => c.created_by === p.id);
    const todayCols = empCols.filter(c => c.collection_date === todayStr);
    const monthCols = empCols.filter(c => c.collection_date.startsWith('2026-10'));

    const todayTotal = todayCols.reduce((sum, c) => sum + c.amount, 0);
    const monthTotal = monthCols.reduce((sum, c) => sum + c.amount, 0);
    const monthCash = monthCols.filter(c => c.payment_method === 'Cash').reduce((sum, c) => sum + c.amount, 0);
    const monthOnline = monthCols.filter(c => c.payment_method !== 'Cash').reduce((sum, c) => sum + c.amount, 0);

    // Audit logs for creations & updates
    const createdLogsCount = auditLogs.filter(l => l.actor_user_id === p.id && l.action_type === 'CREATE').length;
    const updatedLogsCount = auditLogs.filter(l => l.actor_user_id === p.id && l.action_type === 'UPDATE').length;
    const reversalCount = auditLogs.filter(l => l.actor_user_id === p.id && l.action_type === 'REVERSE').length;

    // Last activity
    const userLogs = auditLogs
      .filter(l => l.actor_user_id === p.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastActivity = userLogs[0] ? userLogs[0].created_at : p.created_at;

    return {
      profile: p,
      todayTotal,
      monthTotal,
      monthCash,
      monthOnline,
      txCount: empCols.length,
      createdCount: createdLogsCount,
      updatedCount: updatedLogsCount,
      reversalCount,
      lastActivity,
    };
  });

  const handleToggleStatus = async (p: Profile) => {
    if (p.id === currentUser?.id) {
      showToast('You cannot deactivate your own active owner account.', 'error');
      return;
    }

    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };
      await toggleEmployeeStatus(p.id, !p.is_active, actor);
      showToast(`${p.full_name} status updated to ${!p.is_active ? 'Active' : 'Deactivated'}.`);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update user status', 'error');
    }
  };

  const handleDeleteUser = async (p: Profile) => {
    if (p.role === 'owner') {
      showToast('Cannot delete owner account.', 'error');
      return;
    }
    if (p.id === currentUser?.id) {
      showToast('You cannot delete your own account.', 'error');
      return;
    }
    const confirmDelete = window.confirm(`Are you sure you want to delete user "${p.full_name}"?`);
    if (!confirmDelete) return;

    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };
      await deleteEmployee(p.id, actor);
      showToast(`Deleted user "${p.full_name}" successfully.`);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete user', 'error');
    }
  };

  const handleToggleAddSection = (sec: string) => {
    if (selectedSections.includes(sec)) {
      if (selectedSections.length === 1) {
        showToast('User must have at least one assigned section.', 'error');
        return;
      }
      setSelectedSections(selectedSections.filter(s => s !== sec));
    } else {
      setSelectedSections([...selectedSections, sec]);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      showToast('Please provide full name and email address.', 'error');
      return;
    }

    if (selectedSections.length === 0) {
      showToast('Please select at least one section (Section 1, Section 2, or Section 3).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      await createEmployee(
        {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          role,
          is_active: true,
          assigned_sections: selectedSections,
        },
        actor
      );

      showToast(`User "${fullName}" created with access to: ${selectedSections.join(', ')}`);
      setFullName('');
      setEmail('');
      setPhone('');
      setSelectedSections(['Section 1', 'Section 2', 'Section 3']);
      setAddModalOpen(false);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to create user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditSectionsModal = (p: Profile) => {
    setEditingProfile(p);
    setEditSections(p.assigned_sections && p.assigned_sections.length > 0 ? [...p.assigned_sections] : ['Section 1', 'Section 2', 'Section 3']);
  };

  const handleToggleEditSection = (sec: string) => {
    if (editSections.includes(sec)) {
      if (editSections.length === 1) {
        showToast('User must have at least one assigned section.', 'error');
        return;
      }
      setEditSections(editSections.filter(s => s !== sec));
    } else {
      setEditSections([...editSections, sec]);
    }
  };

  const handleSaveSections = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    if (editSections.length === 0) {
      showToast('Select at least one section.', 'error');
      return;
    }

    setSavingSections(true);
    try {
      const actor = {
        id: currentUser?.id || 'usr-owner-001',
        name: currentUser?.full_name || 'Owner',
      };

      await updateEmployeeSections(editingProfile.id, editSections, actor);
      showToast(`Updated section permissions for ${editingProfile.full_name}!`);
      setEditingProfile(null);
      triggerDbRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update sections', 'error');
    } finally {
      setSavingSections(false);
    }
  };

  const getSectionBadgeStyle = (sec: string) => {
    if (sec === 'Section 1') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (sec === 'Section 2') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-purple-50 text-purple-700 border-purple-200';
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'Owner Tools' }, { label: 'User Management' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-purple-600" />
              Owner User & Staff Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold uppercase tracking-wider">
              Owner Controls
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Add users and assign access permissions to <strong>Section 1</strong>, <strong>Section 2</strong>, and <strong>Section 3</strong>.
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedSections(['Section 1', 'Section 2', 'Section 3']);
            setAddModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm shadow-purple-500/25 transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {employeeStats.map(({ profile, todayTotal, monthTotal, monthCash, monthOnline, txCount, createdCount, updatedCount, reversalCount, lastActivity }) => {
          const isProfOwner = profile.role === 'owner';
          const assigned = profile.assigned_sections && profile.assigned_sections.length > 0
            ? profile.assigned_sections
            : ['Section 1', 'Section 2', 'Section 3'];

          return (
            <div
              key={profile.id}
              className={`bg-white rounded-2xl border p-5 shadow-2xs transition relative overflow-hidden ${
                profile.is_active ? 'border-slate-200' : 'border-slate-300 bg-slate-50/60 opacity-80'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-base text-white shadow-xs ${
                    isProfOwner ? 'bg-purple-600' : 'bg-blue-600'
                  }`}>
                    {profile.full_name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-900 text-base">{profile.full_name}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isProfOwner ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isProfOwner ? 'Owner' : 'Collection Staff'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                      <span>{profile.email}</span>
                      {profile.phone && <span>• {profile.phone}</span>}
                    </div>
                  </div>
                </div>

                {/* Deactivate/Activate & Delete buttons */}
                {!isProfOwner && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleStatus(profile)}
                      title={profile.is_active ? 'Deactivate Account' : 'Activate Account'}
                      className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                        profile.is_active
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{profile.is_active ? 'Deactivate' : 'Activate'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteUser(profile)}
                      title="Delete User"
                      className="p-2 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Assigned Section Badges */}
              <div className="mb-3 p-3 bg-slate-50/90 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Assigned Sections:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {assigned.map(sec => (
                      <span
                        key={sec}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getSectionBadgeStyle(sec)}`}
                      >
                        {sec}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => openEditSectionsModal(profile)}
                  className="self-start sm:self-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 transition flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3 text-slate-400" />
                  <span>Edit Sections</span>
                </button>
              </div>

              {/* Collections Metrics Box */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-center mb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Today</span>
                  <span className="text-xs font-extrabold text-slate-900">{formatCurrency(todayTotal)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-600 block">Cash (Month)</span>
                  <span className="text-xs font-bold text-amber-700">{formatCurrency(monthCash)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-indigo-600 block">Online (Month)</span>
                  <span className="text-xs font-bold text-indigo-700">{formatCurrency(monthOnline)}</span>
                </div>
              </div>

              {/* Total Recovered & Activity Stats */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">Total Collections This Month:</span>
                  <span className="font-extrabold text-sm text-emerald-700">{formatCurrency(monthTotal)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 text-slate-600">
                  <span>Transactions Recorded:</span>
                  <span className="font-bold text-slate-900">{txCount} receipts ({createdCount} created, {updatedCount} modified)</span>
                </div>
                {reversalCount > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 text-slate-600">
                    <span>Reversals Authorized:</span>
                    <span className="font-bold text-rose-600">{reversalCount} void actions</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 text-[11px] text-slate-400">
                  <span>Last Activity:</span>
                  <span>{formatDateTime(lastActivity)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Add User with Section 1, Section 2, Section 3 */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-600 text-white">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                <h3 className="font-extrabold text-base">Add New User</h3>
              </div>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikas Sharma"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-semibold focus:outline-purple-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Email Address (Login ID) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="vikas@collectionpro.in"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-purple-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 98264 55667"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono focus:outline-purple-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wide mb-1">
                  User Role *
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-bold text-slate-800"
                >
                  <option value="collection_admin">Collection Admin (Field Officer)</option>
                  <option value="owner">Co-Owner (Full Administrative Access)</option>
                </select>
              </div>

              {/* Section 1, Section 2, Section 3 Options */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-bold text-slate-800 uppercase tracking-wide">
                    Assign Sections (Permissions) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSections.length === 3) {
                        setSelectedSections(['Section 1']);
                      } else {
                        setSelectedSections(['Section 1', 'Section 2', 'Section 3']);
                      }
                    }}
                    className="text-[11px] text-purple-600 hover:text-purple-700 font-bold"
                  >
                    {selectedSections.length === 3 ? 'Clear Others' : 'Select All 3'}
                  </button>
                </div>

                <div className="space-y-2">
                  {AVAILABLE_SECTIONS.map(sec => {
                    const isChecked = selectedSections.includes(sec);
                    return (
                      <label
                        key={sec}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                          isChecked
                            ? 'bg-purple-50/70 border-purple-300 text-purple-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleAddSection(sec)}
                            className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                          />
                          <span className="font-extrabold text-sm text-slate-900">{sec}</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          sec === 'Section 1' ? 'bg-blue-100 text-blue-800' :
                          sec === 'Section 2' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {isChecked ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  The user will only be allowed to view ledgers and collect payments for selected sections.
                </p>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold rounded-xl shadow-xs transition"
                >
                  {submitting ? 'Creating User...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Assigned Sections for Existing User */}
      {editingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-600 text-white">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                <h3 className="font-extrabold text-base">Edit Section Access</h3>
              </div>
              <button
                onClick={() => setEditingProfile(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSections} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">User Account</span>
                <span className="font-bold text-slate-900 text-sm block">{editingProfile.full_name}</span>
                <span className="text-slate-500 text-xs font-mono">{editingProfile.email}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-800 uppercase tracking-wide mb-2">
                  Select Allowed Sections *
                </label>
                <div className="space-y-2">
                  {AVAILABLE_SECTIONS.map(sec => {
                    const isChecked = editSections.includes(sec);
                    return (
                      <label
                        key={sec}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                          isChecked
                            ? 'bg-purple-50/70 border-purple-300 text-purple-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleEditSection(sec)}
                            className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                          />
                          <span className="font-extrabold text-sm text-slate-900">{sec}</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          sec === 'Section 1' ? 'bg-blue-100 text-blue-800' :
                          sec === 'Section 2' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {isChecked ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="px-4 py-2 border rounded-xl text-slate-600 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSections}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold rounded-xl shadow-xs transition"
                >
                  {savingSections ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
