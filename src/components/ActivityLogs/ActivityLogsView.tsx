import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { AuditLog, Profile, AuditActionType } from '../../types';
import { getAuditLogs, getProfiles } from '../../services/databaseService';
import { Breadcrumbs } from '../Breadcrumbs';
import { formatDateTime, exportToCSV } from '../../utils/formatters';
import {
  History,
  Search,
  Filter,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
} from 'lucide-react';

export const ActivityLogsView: React.FC = () => {
  const { isOwner } = useAuth();
  const { dbVersion } = useApp();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [adminFilter, setAdminFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [l, p] = await Promise.all([getAuditLogs(), getProfiles()]);
        setLogs(l);
        setProfiles(p);
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dbVersion]);

  const filteredLogs = logs.filter(log => {
    if (adminFilter !== 'all' && log.actor_user_id !== adminFilter) return false;
    if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
    if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchReason = log.reason?.toLowerCase().includes(q) || false;
      const matchActor = log.actor_name.toLowerCase().includes(q);
      const matchEntity = log.entity_id.toLowerCase().includes(q);
      if (!matchReason && !matchActor && !matchEntity) return false;
    }

    return true;
  });

  const handleExportCSV = () => {
    const rows = filteredLogs.map(l => ({
      'Log ID': l.id,
      'Timestamp (IST)': l.created_at,
      'Action': l.action_type,
      'Entity Type': l.entity_type,
      'Entity ID': l.entity_id,
      'Actor User ID': l.actor_user_id,
      'Actor Name': l.actor_name,
      'Reason / Note': l.reason || '',
      'Previous Values': l.previous_values ? JSON.stringify(l.previous_values) : '',
      'New Values': l.new_values ? JSON.stringify(l.new_values) : '',
    }));
    exportToCSV('Audit_Trail_Report', rows);
  };

  const getActionBadge = (type: AuditActionType) => {
    switch (type) {
      case 'CREATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">CREATE</span>;
      case 'UPDATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">UPDATE</span>;
      case 'REVERSE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800">REVERSE</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800">{type}</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[{ label: 'Audit & Activity Logs' }]} />

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            Immutable Audit Trail & Operator Activity Log
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Every creation, authorized value change, and reversal is permanently logged with timestamps and authenticated operator ID
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Log (CSV)</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search reason, operator name, or entity ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Operator */}
          <select
            value={adminFilter}
            onChange={e => setAdminFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Operators</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>

          {/* Action */}
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Action Types</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="REVERSE">REVERSE</option>
            <option value="STATUS_CHANGE">STATUS CHANGE</option>
          </select>

          {/* Entity Type */}
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700"
          >
            <option value="all">All Entities</option>
            <option value="collection">Collections</option>
            <option value="customer">Customers</option>
            <option value="billing_period">Billing Periods</option>
            <option value="employee">Employees</option>
            <option value="settings">Settings</option>
          </select>
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No audit records match your query.
          </div>
        ) : (
          filteredLogs.map(log => {
            return (
              <div key={log.id} className="p-4 hover:bg-slate-50 transition text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-2">
                    {getActionBadge(log.action_type)}
                    <span className="font-bold text-slate-900">{log.actor_name}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500 font-mono text-[11px] uppercase">
                      {log.entity_type} #{log.entity_id}
                    </span>
                  </div>

                  <span className="font-mono text-slate-400 text-[11px] whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </span>
                </div>

                {log.reason && (
                  <p className="font-medium text-slate-800 mb-2">
                    {log.reason}
                  </p>
                )}

                {/* Pre/Post Values Diff */}
                {(log.previous_values || log.new_values) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 font-mono text-[11px]">
                    {log.previous_values && (
                      <div className="p-2 rounded bg-rose-50 border border-rose-100 text-rose-900">
                        <span className="text-[10px] font-bold uppercase text-rose-700 block mb-0.5">
                          Previous Values:
                        </span>
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.previous_values, null, 2)}</pre>
                      </div>
                    )}
                    {log.new_values && (
                      <div className="p-2 rounded bg-emerald-50 border border-emerald-100 text-emerald-900">
                        <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-0.5">
                          New Values:
                        </span>
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.new_values, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
