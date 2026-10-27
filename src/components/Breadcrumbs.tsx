import React from 'react';
import { useApp, NavPage } from '../context/AppContext';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  page?: NavPage;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  const { setActivePage } = useApp();

  return (
    <nav className="flex items-center space-x-1.5 text-xs text-slate-500 mb-4 overflow-x-auto whitespace-nowrap py-1">
      <button
        onClick={() => setActivePage('dashboard')}
        className="flex items-center gap-1 hover:text-blue-600 transition"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Dashboard</span>
      </button>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={index}>
            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            {item.page && !isLast ? (
              <button
                onClick={() => setActivePage(item.page!)}
                className="hover:text-blue-600 font-medium transition"
              >
                {item.label}
              </button>
            ) : (
              <span className={isLast ? 'font-semibold text-slate-900 truncate max-w-[200px]' : ''}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
