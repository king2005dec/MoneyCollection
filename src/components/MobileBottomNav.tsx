import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Layers,
  Users,
  PlusCircle,
  Receipt,
  AlertCircle,
} from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const { activePage, setActivePage, openPaymentModal } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 lg:hidden shadow-lg safe-area-bottom">
      <div className="grid grid-cols-5 h-16 items-center px-1">
        {/* 1. Dashboard */}
        <button
          onClick={() => setActivePage('dashboard')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activePage === 'dashboard' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Dashboard</span>
        </button>

        {/* 2. Section 1 */}
        <button
          onClick={() => setActivePage('section-electricity')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activePage === 'section-electricity' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers className="w-5 h-5 mb-0.5 text-blue-500" />
          <span className="text-[10px]">Section 1</span>
        </button>

        {/* 3. CENTER ACTION: Quick Pay */}
        <button
          onClick={() => openPaymentModal()}
          className="flex flex-col items-center justify-center -mt-5 transition group"
        >
          <div className="w-12 h-12 rounded-full bg-blue-600 group-active:scale-95 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 border-2 border-white">
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold text-blue-600 mt-0.5">Pay</span>
        </button>

        {/* 4. Section 2 & 3 */}
        <button
          onClick={() => setActivePage('section-water')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activePage === 'section-water' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers className="w-5 h-5 mb-0.5 text-indigo-500" />
          <span className="text-[10px]">Section 2</span>
        </button>

        {/* 5. Customers */}
        <button
          onClick={() => setActivePage('customers')}
          className={`flex flex-col items-center justify-center py-1 transition ${
            activePage === 'customers' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Customers</span>
        </button>
      </div>
    </nav>
  );
};
