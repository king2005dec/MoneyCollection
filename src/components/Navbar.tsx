import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { isSupabaseConnected } from '../services/supabaseClient';
import {
  ShieldCheck,
  UserCheck,
  PlusCircle,
  ChevronDown,
  Layers,
  Menu,
} from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { currentUser, availableProfiles, isOwner, logout } = useAuth();
  const { openPaymentModal, setSupabaseModalOpen, setActivePage } = useApp();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const supabaseReady = isSupabaseConnected();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-2xs">
      <div className="px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        {/* Left: Mobile menu toggle + Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg lg:hidden hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900">
                Collection PRO
              </span>
              <span className="hidden sm:inline-block ml-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Billing System
              </span>
            </div>
          </div>
        </div>

        {/* Right side tools */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Add Payment Button */}
          <button
            onClick={() => openPaymentModal()}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs px-3 sm:px-4 py-2 rounded-lg shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Pay</span>
          </button>

          {/* Active Operator Switcher */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white ${
                isOwner ? 'bg-purple-600' : 'bg-blue-600'
              }`}>
                {currentUser?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-slate-900 leading-tight">
                  {currentUser?.full_name?.split(' ')[0]}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {isOwner ? 'Owner' : 'Staff'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {userDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95"
                onClick={() => setUserDropdownOpen(false)}
              >
                <div className="px-3 py-1.5 border-b border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Switch Account
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border-b border-slate-100">
                  <div className="font-bold text-slate-900">{currentUser?.full_name}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">Role: {isOwner ? 'Owner (Full Access)' : 'Staff (Assigned Sections)'}</div>
                </div>

                <div className="p-2 border-t border-slate-100 bg-slate-50 space-y-1.5">
                  {isOwner && (
                    <button
                      onClick={() => setActivePage('employees')}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>+ Add User / Manage Sections</span>
                    </button>
                  )}
                  <button
                    onClick={logout}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <span>Sign Out (Logout)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
