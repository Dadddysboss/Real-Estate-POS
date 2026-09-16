import React, { useState, useEffect } from 'react';
import { AuthGate } from './components/auth/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DataCacheProvider } from './contexts/DataCacheContext';
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
import { NotificationCenter } from './components/notifications/NotificationCenter';
import { getUnreadCount } from './db/unifiedAdapter';
import InstallmentEngine from './components/installment/InstallmentEngine';
import { ShieldCheck, Lock, Building2, LayoutDashboard, Warehouse, ShoppingBag, Users, LandPlot, CreditCard, Bell, Wifi, WifiOff, Database, UserCheck, AlertTriangle, Search, Plus, Settings as SettingsIcon, MessageSquare, Calculator } from 'lucide-react';
import { safeStr } from './db/dbSanitizer';

interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
}

// ─── RBAC: Role-Based Access Control ───────────────────────────────
type ModuleKey = string;

const ROLE_MODULES: Record<string, ModuleKey[]> = {
  ADMIN: [
    'dashboard', 'inventory', 'plazas', 'acquisition', 'cash-counter', 'crm',
    'sales', 'installments', 'digikhata', 'agents', 'investors', 'construction',
    'expenses', 'documents', 'audit', 'branches', 'whatsapp', 'tax', 'settings',
  ],
  MANAGER: [
    'dashboard', 'inventory', 'sales', 'construction', 'cash-counter',
    'digikhata', 'expenses', 'documents',
  ],
  SALES: [
    'dashboard', 'cash-counter', 'sales',
  ],
  ACCOUNTANT: [
    'dashboard', 'digikhata', 'expenses', 'tax', 'installments',
  ],
  VIEWER: [
    'dashboard', 'inventory', 'sales', 'cash-counter', 'digikhata',
    'expenses', 'documents', 'investors', 'construction',
  ],
};

function hasModuleAccess(role: string, moduleKey: string): boolean {
  const allowed = ROLE_MODULES[role] || ROLE_MODULES.VIEWER;
  return allowed.includes(moduleKey);
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
  const [activeModule, setActiveModule] = useState('dashboard');
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'syncing'>('online');
  const [branchId, setBranchId] = useState('BRANCH_MAIN');
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [, setSettingsVersion] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      const count = await getUnreadCount();
      setUnreadNotifs(count);
    }, 10000);
    getUnreadCount().then(setUnreadNotifs);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const cleanup = window.api.onSyncStatusUpdate((status: string) => {
      if (status === 'online' || status === 'offline' || status === 'syncing') {
        setSyncStatus(status);
      }
    });
    return cleanup;
  }, []);

  const handleAuthSuccess = (userData: { token: string; user: User }) => {
    setUser(userData.user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    setActiveModule('dashboard');
  };

  // Filter navigation by role
  const filteredNavigation = navigation.filter((item) => {
    const moduleKey = item.href.replace('#', '');
    return user ? hasModuleAccess(user.role, moduleKey) : false;
  });

  // Route guard: redirect to dashboard if module not allowed
  const safeSetActiveModule = (mod: string) => {
    if (user && hasModuleAccess(user.role, mod)) {
      setActiveModule(mod);
    } else {
      setActiveModule('dashboard');
    }
  };

  if (!isAuthenticated || !user) {
    return <ErrorBoundary module="Auth"><AuthGate onSuccess={handleAuthSuccess} /></ErrorBoundary>;
  }

  return (
    <DataCacheProvider>
    <ErrorBoundary module="App">
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-text">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-20 overflow-y-auto">
        {/* Logo / Brand */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 flex-shrink-0">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Building2 size={20} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-100 text-sm tracking-wide truncate">Dripp ERP</span>
            <span className="text-[11px] text-emerald-400 font-medium">DigiKhata Edition</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredNavigation.map((item) => {
            const isActive = activeModule === item.href.replace('#', '');
            return (
              <button
                key={item.name}
                onClick={() => safeSetActiveModule(item.href.replace('#', ''))}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 border border-emerald-500/40 text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className={`flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                  <item.icon size={20} />
                </div>
                <span className="font-semibold">{safeStr(item.name)}</span>
              </button>
            );
          })}
        </nav>

        {/* Sync Status & User */}
        <div className="p-4 border-t border-slate-800 space-y-3 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-xl ${syncStatus === 'online' ? 'bg-emerald-500/10' : syncStatus === 'syncing' ? 'bg-amber-500/10' : 'bg-rose-500/10'}`}>
              {syncStatus === 'online' && <Wifi className="text-emerald-400" size={16} />}
              {syncStatus === 'syncing' && <Database className="text-amber-400 animate-spin" size={16} />}
              {syncStatus === 'offline' && <WifiOff className="text-rose-400" size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">
                {syncStatus === 'online' && 'Turso Cloud Synced'}
                {syncStatus === 'syncing' && 'Syncing...'}
                {syncStatus === 'offline' && 'Offline Mode Active'}
              </p>
              <p className="text-[10px] text-slate-500">Local DB: IndexedDB + SQLite</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 p-2 bg-slate-950 rounded-xl">
            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ShieldCheck size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{safeStr(user?.fullName)}</p>
              <p className="text-[10px] text-slate-400 capitalize">{safeStr(user?.role).toLowerCase()}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Lock Terminal (Ctrl+L)"
            >
              <Lock size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-slate-950">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 border-b border-slate-800 bg-slate-900/90 px-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-bold text-white capitalize">{safeStr(activeModule)}</h1>
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

            {/* Notifications */}
            <button
              onClick={() => setNotifOpen(true)}
              className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Notifications"
            >
              <Bell size={20} />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
                  {unreadNotifs > 99 ? '99+' : String(unreadNotifs)}
                </span>
              )}
            </button>

            {/* Quick New Deal */}
            <button
              onClick={() => safeSetActiveModule('cash-counter')}
              className="hidden sm:flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-950/40"
            >
              <Plus size={16} />
              <span>New Deal</span>
            </button>
          </div>
        </header>

        {/* Module Content */}
        <main className="flex-1 min-w-0 overflow-y-auto p-6">
          {renderModuleContent(activeModule)}
        </main>
      </div>

      {/* Notification Center Drawer */}
      <ErrorBoundary module="Notifications">
        <NotificationCenter isOpen={notifOpen} onClose={() => {
          setNotifOpen(false);
          getUnreadCount().then(setUnreadNotifs);
        }} />
      </ErrorBoundary>
    </div>
    </ErrorBoundary>
    </DataCacheProvider>
  );

  function renderModuleContent(module: string) {
    const wrap = (el: React.ReactNode) => <ErrorBoundary module={module}>{el}</ErrorBoundary>;
    // Route guard: deny access to unauthorized modules
    if (!user || !hasModuleAccess(user.role, module)) {
      return wrap(<Dashboard branchId={branchId} />);
    }
    switch (module) {
      case 'dashboard':
        return wrap(<Dashboard branchId={branchId} onNavigate={setActiveModule} />);
      case 'inventory':
        return wrap(<PlotInventory branchId={branchId} currentUser={user!} />);
      case 'plazas':
        return wrap(<PlazaManagement branchId={branchId} currentUser={user!} />);
      case 'cash-counter':
        return wrap(<CashCounter branchId={branchId} currentUser={user!} />);
      case 'crm':
        return wrap(<CRMKanban />);
      case 'acquisition':
        return wrap(<LandAcquisitions currentUser={user!} />);
      case 'sales':
        return wrap(<SalesEngine branchId={branchId} currentUser={user!} />);
      case 'installments':
        return wrap(<InstallmentEngine />);
      case 'digikhata':
        return wrap(<DigiKhata currentUser={user!} />);
      case 'agents':
        return wrap(<AgentNetwork />);
      case 'investors':
        return wrap(<InvestorPools currentUser={user!} branchId={branchId} />);
      case 'construction':
        return wrap(<ConstructionTracker currentUser={user!} />);
      case 'expenses':
        return wrap(<OfficeOverheads currentUser={user!} />);
      case 'documents':
        return wrap(<LegalVault currentUser={user!} />);
      case 'audit':
        return wrap(<AccessControl currentUser={user!} />);
      case 'branches':
        return wrap(<BranchManager currentUser={user!} />);
      case 'whatsapp':
        return wrap(<WhatsAppGateway />);
      case 'tax':
        return wrap(<TaxCalculator currentUser={user!} />);
      case 'settings':
        return wrap(<Settings branchId={branchId} onBranchChange={setBranchId} onSettingsChange={() => setSettingsVersion(v => v + 1)} />);
      default:
        return wrap(<Dashboard branchId={branchId} />);
    }
  }
};

// ============== APP END ==============

export default App;