import React, { useState, useEffect } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { Dashboard } from './components/dashboard/Dashboard';
import { CashCounter } from './components/dashboard/CashCounter';
import { PlotInventory } from './components/inventory/PlotInventory';
import { PlazaManagement } from './components/plazas/PlazaManagement';
import CRMKanban from './components/crm/CRMKanban';
import { LandAcquisitions } from './components/acquisitions/LandAcquisitions';
import { DigiKhata } from './components/digikhata/DigiKhata';

import { SalesEngine } from './components/sales/SalesEngine';
import AgentNetwork from './components/agents/AgentNetwork';
import { BranchManager } from './components/branches/BranchManager';
import { WhatsAppGateway } from './components/whatsapp/WhatsAppGateway';
import { TaxCalculator } from './components/tax/TaxCalculator';
import { AccessControl } from './components/access/AccessControl';
import { LegalVault } from './components/legal/LegalVault';
import { OfficeOverheads } from './components/overheads/OfficeOverheads';
import { ConstructionTracker } from './components/construction/ConstructionTracker';
import { InvestorPools } from './components/investors/InvestorPools';
import { Settings } from './components/settings/Settings';
import InstallmentEngine from './components/installment/InstallmentEngine';
import { ShieldCheck, Lock, Building2, LayoutDashboard, Warehouse, ShoppingBag, Users, LandPlot, CreditCard, ChevronLeft, Menu, Bell, Wifi, WifiOff, Database, UserCheck, AlertTriangle, Search, Plus, Settings as SettingsIcon, MessageSquare, Calculator } from 'lucide-react';

interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '#dashboard' },
  { name: 'Inventory', icon: Warehouse, href: '#inventory' },
  { name: 'Plazas', icon: Building2, href: '#plazas' },
  { name: 'Acquisitions', icon: LandPlot, href: '#acquisition' },
  { name: 'Cash Counter', icon: CreditCard, href: '#cash-counter' },
  { name: 'CRM & Leads', icon: Users, href: '#crm' },
  { name: 'Sales Engine', icon: ShoppingBag, href: '#sales' },
  { name: 'Installments', icon: CreditCard, href: '#installments' },
  { name: 'DigiKhata', icon: LandPlot, href: '#digikhata' },
  { name: 'Agents', icon: UserCheck, href: '#agents' },
  { name: 'Investors', icon: Users, href: '#investors' },
  { name: 'Construction', icon: Warehouse, href: '#construction' },
  { name: 'Expenses', icon: CreditCard, href: '#expenses' },
  { name: 'Documents', icon: ShieldCheck, href: '#documents' },
  { name: 'Audit Log', icon: AlertTriangle, href: '#audit' },
  { name: 'Branches', icon: Building2, href: '#branches' },
  { name: 'WhatsApp', icon: MessageSquare, href: '#whatsapp' },
  { name: 'Tax Calc', icon: Calculator, href: '#tax' },
  { name: 'Settings', icon: SettingsIcon, href: '#settings' },
];

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'syncing'>('online');
  const [branchId, setBranchId] = useState('BRANCH_MAIN');

  useEffect(() => {
    window.api.onSyncStatusUpdate((status: string) => {
      if (status === 'online' || status === 'offline' || status === 'syncing') {
        setSyncStatus(status);
      }
    });
  }, []);

  const handleAuthSuccess = (userData: { token: string; user: User }) => {
    setUser(userData.user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
  };

  if (!isAuthenticated || !user) {
    return <AuthGate onSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 h-screen bg-slate-900/80 backdrop-blur-2xl border-r border-slate-800 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="flex flex-col h-full">
          {/* Logo / Brand */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                <Building2 size={20} />
              </div>
              {sidebarOpen && (
                <div className="overflow-hidden">
                  <h1 className="text-sm font-bold text-white">Dripp ERP</h1>
                  <p className="text-[10px] text-slate-400">DigiKhata Edition</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = activeModule === item.href.replace('#', '');
              return (
                <button
                  key={item.name}
                  onClick={() => setActiveModule(item.href.replace('#', ''))}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    isActive
                      ? 'bg-emerald-500/10 border border-emerald-500/40 text-white'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className={`flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                    <item.icon size={20} />
                  </div>
                  {sidebarOpen && <span className={isActive ? 'font-semibold' : 'font-medium'}>{item.name}</span>}
                </button>
              );
            })}
          </nav>

          {/* Sync Status & User */}
          <div className="p-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-xl ${syncStatus === 'online' ? 'bg-emerald-500/10' : syncStatus === 'syncing' ? 'bg-amber-500/10' : 'bg-rose-500/10'}`}>
                {syncStatus === 'online' && <Wifi className="text-emerald-400" size={16} />}
                {syncStatus === 'syncing' && <Database className="text-amber-400 animate-spin" size={16} />}
                {syncStatus === 'offline' && <WifiOff className="text-rose-400" size={16} />}
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">
                    {syncStatus === 'online' && 'Turso Cloud Synced'}
                    {syncStatus === 'syncing' && 'Syncing...'}
                    {syncStatus === 'offline' && 'Offline Mode Active'}
                  </p>
                  <p className="text-[10px] text-slate-500">Local DB: IndexedDB + SQLite</p>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3 p-2 bg-slate-950 rounded-xl">
              <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <ShieldCheck size={16} />
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                title="Lock Terminal (Ctrl+L)"
              >
                <Lock size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-2xl border-b border-slate-800">
          <div className="flex items-center justify-between h-16 px-6">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-bold text-white capitalize">{activeModule}</h1>
              <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 bg-slate-800 rounded">v1.0.0</span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Global Search */}
              <div className="relative hidden md:block">
                <input
                  type="text"
                  placeholder="Search plots, leads, parties, transactions..."
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white w-80 focus:outline-none focus:border-emerald-500"
                />
                <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
              </div>

              {/* Quick Actions */}
              <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Notifications">
                <Bell size={20} />
              </button>

              {/* Quick New Deal */}
              <button className="hidden sm:flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-950/40">
                <Plus size={16} />
                <span>New Deal</span>
              </button>
            </div>
          </div>
        </header>

        {/* Module Content */}
        <div className="p-6">
          {renderModuleContent(activeModule)}
        </div>
      </main>
    </div>
  );

  function renderModuleContent(module: string) {
    switch (module) {
      case 'dashboard':
        return <Dashboard branchId={branchId} />;
      case 'inventory':
        return <PlotInventory branchId={branchId} currentUser={user!} />;
      case 'plazas':
        return <PlazaManagement branchId={branchId} currentUser={user!} />;
      case 'cash-counter':
        return <CashCounter branchId={branchId} currentUser={user!} />;
      case 'crm':
        return <CRMKanban />;
      case 'acquisition':
        return <LandAcquisitions currentUser={user!} />;
      case 'sales':
        return <SalesEngine branchId={branchId} currentUser={user!} />;
      case 'installments':
        return <InstallmentEngine />;
      case 'digikhata':
        return <DigiKhata currentUser={user!} />;
      case 'agents':
        return <AgentNetwork />;
      case 'investors':
        return <InvestorPools currentUser={user!} />;
      case 'construction':
        return <ConstructionTracker currentUser={user!} />;
      case 'expenses':
        return <OfficeOverheads currentUser={user!} />;
      case 'documents':
        return <LegalVault currentUser={user!} />;
      case 'audit':
        return <AccessControl currentUser={user!} />;
      case 'branches':
        return <BranchManager currentUser={user!} />;
      case 'whatsapp':
        return <WhatsAppGateway />;
      case 'tax':
        return <TaxCalculator currentUser={user!} />;
      case 'settings':
        return <Settings branchId={branchId} onBranchChange={setBranchId} />;
      default:
        return <Dashboard branchId={branchId} />;
    }
  }
};

// ============== APP END ==============

export default App;