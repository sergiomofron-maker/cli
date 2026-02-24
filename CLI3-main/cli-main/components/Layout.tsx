import React from 'react';
import { Calendar as CalendarIcon, ShoppingCart, LogOut, Archive } from 'lucide-react';
import { mockDb } from '../services/mockDb';

interface LayoutProps {
  activeTab: 'calendar' | 'shopping' | 'inventory';
  setActiveTab: (tab: 'calendar' | 'shopping' | 'inventory') => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ activeTab, setActiveTab, onLogout, children }) => {
  const handleLogout = async () => {
    await mockDb.auth.signOut();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto shadow-2xl relative">
      <header className="bg-white px-4 py-3 border-b flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-lg font-bold text-orange-600 flex items-center gap-2">
          📋 CyL
        </h1>
        <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600">
          <LogOut size={20} />
        </button>
      </header>

      <main className="min-h-[calc(100vh-130px)]">{children}</main>

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around py-3 pb-safe z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex flex-col items-center gap-1 w-1/3 ${
            activeTab === 'calendar' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <CalendarIcon size={22} strokeWidth={activeTab === 'calendar' ? 2.5 : 2} />
          <span className="text-xs font-medium">Calendario</span>
        </button>

        <button
          onClick={() => setActiveTab('shopping')}
          className={`flex flex-col items-center gap-1 w-1/3 ${
            activeTab === 'shopping' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <ShoppingCart size={22} strokeWidth={activeTab === 'shopping' ? 2.5 : 2} />
          <span className="text-xs font-medium">Compra</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center gap-1 w-1/3 ${
            activeTab === 'inventory' ? 'text-orange-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Archive size={22} strokeWidth={activeTab === 'inventory' ? 2.5 : 2} />
          <span className="text-xs font-medium">Inventario</span>
        </button>
      </nav>
    </div>
  );
};

export default Layout;
