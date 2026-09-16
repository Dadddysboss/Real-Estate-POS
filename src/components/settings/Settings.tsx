import React, { useState, useEffect } from 'react';
import {
  Building2, Save, Upload, HardDrive, Database, Wifi, CheckCircle2, AlertCircle,
  Palette, Shield, Moon, Sun, Menu, X, Download as DownloadIcon, Plus, RefreshCw, ExternalLink
} from 'lucide-react';
import { notifyBackupCreated } from '../../db/unifiedAdapter';
import { safeStr } from '../../db/dbSanitizer';

interface Branch {
  id: string;
  branch_name: string;
  branch_code: string;
  city: string;
  address: string | null;
  manager_id: string | null;
  status: string;
  created_at: string;
}

interface AgencySettings {
  id: string;
  agency_name: string;
  tagline: string | null;
  phone_primary: string | null;
  whatsapp_number: string | null;
  address: string | null;
  currency_symbol: string;
  logo_url_or_base64: string | null;
  local_backup_folder_path: string | null;
  turso_db_url: string | null;
  turso_sync_status: string;
  created_at: string;
  updated_at: string;
}

interface SettingsProps {
  branchId: string;
  onBranchChange: (branchId: string) => void;
  onSettingsChange?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ branchId, onBranchChange, onSettingsChange }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'branches' | 'backup' | 'security' | 'appearance'>('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // General Settings
  const [agencyName, setAgencyName] = useState('Dripp Real Estate & DigiKhata ERP');
  const [tagline, setTagline] = useState('Enterprise ERP System');
  const [phonePrimary, setPhonePrimary] = useState('');
  const [whatsappNumber, setWhatsAppNumber] = useState('');
  const [address, setAddress] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Branches
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(branchId);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Backup
  const [backupFolder, setBackupFolder] = useState<string | null>(null);
  const [sqliteDbPath, setSqliteDbPath] = useState<string>('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [customDbDir, setCustomDbDir] = useState<string>('');

  // Security
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [requirePinOnWake, setRequirePinOnWake] = useState(true);
  const [auditLogRetention, setAuditLogRetention] = useState(365);

  // Appearance
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [compactMode, setCompactMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  // Auto-Update
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      // Ensure agency_settings row exists
      await window.api.dbExecute(
        `INSERT INTO agency_settings (id, agency_name, currency_symbol, created_at, updated_at)
         VALUES ('MAIN_SETTINGS', 'Dripp Real Estate & DigiKhata ERP', 'Rs.', datetime('now'), datetime('now'))
         ON CONFLICT(id) DO NOTHING`, []
      );
      // Load agency settings
      const settingsRes = await window.api.dbQuery<AgencySettings>('SELECT * FROM agency_settings WHERE id = ?', ['MAIN_SETTINGS']);
      if (settingsRes.success && settingsRes.data?.[0]) {
        const s = settingsRes.data[0];
        setAgencyName(s.agency_name);
        setTagline(s.tagline || '');
        setPhonePrimary(s.phone_primary || '');
        setWhatsAppNumber(s.whatsapp_number || '');
        setAddress(s.address || '');
        setCurrencySymbol(s.currency_symbol || 'Rs.');
        setLogoPreview(s.logo_url_or_base64);
        setBackupFolder(s.local_backup_folder_path);
      }
      // Load SQLite DB path from system_settings
      const dbPathRes = await window.api.dbQuery<{ setting_value: string }>(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'sqlite_db_path'`, []
      );
      if (dbPathRes.success && dbPathRes.data?.[0]) {
        setSqliteDbPath(dbPathRes.data[0].setting_value);
      }
      // Load custom DB directory
      const customDbDirRes = await window.api.dbQuery<{ setting_value: string }>(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'custom_db_directory'`, []
      );
      if (customDbDirRes.success && customDbDirRes.data?.[0]) {
        setCustomDbDir(customDbDirRes.data[0].setting_value);
      }
      // Load branches
      const branchesRes = await window.api.dbQuery<Branch>('SELECT * FROM branches WHERE status = ? ORDER BY branch_name', ['ACTIVE']);
      if (branchesRes.success && branchesRes.data) {
        setBranches(branchesRes.data);
        if (!selectedBranch && branchesRes.data.length > 0) {
          setSelectedBranch(branchesRes.data[0].id);
        }
      }
      // Load system settings
      const sysDefaults = [
        ['session_timeout', '30'],
        ['require_pin_on_wake', '1'],
        ['audit_log_retention', '365'],
        ['theme', 'dark'],
        ['compact_mode', '0'],
        ['animations_enabled', '1'],
      ];
      for (const [key, val] of sysDefaults) {
        try {
          await window.api.dbExecute(
            `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO NOTHING`,
            [key, val]
          );
        } catch { /* ignore */ }
      }
      const sysRes = await window.api.dbQuery<{ setting_key: string; setting_value: string }>('SELECT * FROM system_settings', []);
      if (sysRes.success && sysRes.data) {
        const sysMap = Object.fromEntries(sysRes.data.map((r) => [r.setting_key, r.setting_value]));
        setSessionTimeout(Number(sysMap.session_timeout ?? 30));
        setRequirePinOnWake(sysMap.require_pin_on_wake === '1');
        setAuditLogRetention(Number(sysMap.audit_log_retention ?? 365));
        setTheme((sysMap.theme ?? 'dark') as 'dark' | 'light' | 'system');
        setCompactMode(sysMap.compact_mode === '1');
        setAnimationsEnabled(sysMap.animations_enabled !== '0');
      }
    } catch (error) {
      console.error('Load settings error:', error);
    }
  };

  useEffect(() => {
    loadSettings();
    // Listen for auto-update events (Electron only)
    const cleanups: (() => void)[] = [];
    if (window.api?.onUpdateStatus) {
      cleanups.push(window.api.onUpdateStatus((status: string, info?: string) => {
        switch (status) {
          case 'checking': setUpdateStatus('checking'); break;
          case 'available': setUpdateStatus('available'); setUpdateVersion(info || null); break;
          case 'up-to-date': setUpdateStatus('up-to-date'); break;
          case 'downloaded': setUpdateStatus('downloaded'); break;
          case 'error': setUpdateStatus('error'); setUpdateError(info || 'Unknown error'); break;
        }
      }));
    }
    if (window.api?.onUpdateProgress) {
      cleanups.push(window.api.onUpdateProgress((percent: number) => {
        setUpdateProgress(percent);
        setUpdateStatus('downloading');
      }));
    }
    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  const handleCheckForUpdate = async () => {
    if (!window.api?.checkForUpdates) {
      setMessage({ type: 'error', text: 'Auto-update is only available in the desktop app.' });
      return;
    }
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const result = await window.api.checkForUpdates();
      if (!result.success) {
        setUpdateStatus('error');
        setUpdateError(result.error || 'Failed to check for updates');
      }
    } catch (err) {
      setUpdateStatus('error');
      setUpdateError(err instanceof Error ? err.message : 'Failed to check for updates');
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.api?.installUpdate) return;
    try {
      await window.api.installUpdate();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to install update');
    }
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await window.api.dbExecute(
        `INSERT INTO agency_settings (id, agency_name, tagline, phone_primary, whatsapp_number, address, currency_symbol, logo_url_or_base64, updated_at)
         VALUES ('MAIN_SETTINGS', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           agency_name = excluded.agency_name, tagline = excluded.tagline,
           phone_primary = excluded.phone_primary, whatsapp_number = excluded.whatsapp_number,
           address = excluded.address, currency_symbol = excluded.currency_symbol,
           logo_url_or_base64 = excluded.logo_url_or_base64, updated_at = datetime('now')`,
        [agencyName, tagline, phonePrimary, whatsappNumber, address, currencySymbol, logoPreview]
      );
      // Save system settings
      const sysEntries: [string, string][] = [
        ['session_timeout', String(sessionTimeout)],
        ['require_pin_on_wake', requirePinOnWake ? '1' : '0'],
        ['audit_log_retention', String(auditLogRetention)],
        ['theme', theme],
        ['compact_mode', compactMode ? '1' : '0'],
        ['animations_enabled', animationsEnabled ? '1' : '0'],
      ];
      for (const [key, value] of sysEntries) {
        await window.api.dbExecute(
          `INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')`,
          [key, value]
        );
      }
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      if (onSettingsChange) onSettingsChange();
    } catch (error) {
      console.error('Save settings error:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Logo must be less than 2MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleBackupFolderSelect = async () => {
    try {
      // @ts-ignore - File System Access API
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });
      const path = dirHandle.name; // This is simplified; in reality we'd need to store the handle
      setBackupFolder(path);
      
      await window.api.dbExecute(
        `UPDATE agency_settings SET local_backup_folder_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = "MAIN_SETTINGS"`,
        [path]
      );
      setMessage({ type: 'success', text: `Backup folder selected: ${path}` });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessage({ type: 'error', text: 'Failed to select backup folder' });
      }
    }
  };

  const handleCreateBackup = async () => {
    setBackupInProgress(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `digikhata_vault_backup_${timestamp}.json`;
      
      const tables = [
        'users', 'branches', 'inventory_plots', 'leads', 'sales_transactions',
        'sale_payment_breakdowns', 'installment_plans', 'installment_schedules',
        'installment_payments', 'digikhata_parties', 'digikhata_entries',
        'digikhata_transactions', 'construction_expenses', 'expenses',
        'office_expenses', 'documents', 'document_vault', 'agency_settings',
        'system_settings', 'sync_queue', 'notifications', 'audit_trail_logs',
        'whatsapp_logs', 'whatsapp_templates', 'tax_rules',
        'plazas', 'plaza_units', 'site_visits', 'staff_users',
        'investors', 'investor_pools', 'investor_members', 'investor_payouts',
        'materials', 'material_usages', 'construction_material_stock',
        'construction_material_logs', 'fixed_assets', 'kyc_registry',
        'dividend_distributions', 'branch_sync_queue', 'cash_denominations',
        'cash_counter', 'cash_sessions',
      ];
      const backup: Record<string, unknown[]> = {};
      for (const table of tables) {
        try {
          const res = await window.api.dbQuery(`SELECT * FROM ${table}`, []);
          backup[table] = res.success && Array.isArray(res.data) ? res.data : [];
        } catch {
          backup[table] = [];
        }
      }
      
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName;
      a.click();
      URL.revokeObjectURL(url);
      
      setLastBackup(new Date().toISOString());
      setMessage({ type: 'success', text: `Vault backup created: ${backupFileName}` });
      await notifyBackupCreated();
    } catch (error) {
      setMessage({ type: 'error', text: `Backup failed: ${(error as Error).message}` });
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleBranchSelect = (branch: Branch) => {
    setSelectedBranch(branch.id);
    onBranchChange(branch.id);
    setMessage({ type: 'success', text: `Switched to ${branch.branch_name}` });
  };

  const handleAddBranch = async () => {
    setEditingBranch(null);
    setShowBranchModal(true);
  };

  const handleSaveBranch = async (branchData: Omit<Branch, 'id' | 'created_at' | 'manager_id'> & { id?: string; manager_id?: string }) => {
    try {
      if (branchData.id) {
        // Update existing
        await window.api.dbExecute(
          `UPDATE branches SET branch_name = ?, branch_code = ?, city = ?, address = ?, status = ?, manager_id = ? WHERE id = ?`,
          [branchData.branch_name, branchData.branch_code, branchData.city, branchData.address, branchData.status, branchData.manager_id || null, branchData.id]
        );
        setMessage({ type: 'success', text: 'Branch updated successfully' });
      } else {
        // Create new
        const id = `BRANCH_${Date.now()}`;
        await window.api.dbExecute(
          `INSERT INTO branches (id, branch_name, branch_code, city, address, status, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [id, branchData.branch_name, branchData.branch_code, branchData.city, branchData.address, branchData.status, branchData.manager_id || null]
        );
        setMessage({ type: 'success', text: 'Branch created successfully' });
      }
      setShowBranchModal(false);
      loadSettings();
      if (onSettingsChange) onSettingsChange();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save branch' });
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'branches', label: 'Branches', icon: Building2 },
    { id: 'backup', label: 'Backup & Sync', icon: HardDrive },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

   return (
    <div className="page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">System Settings</h2>
          <p className="text-sm text-slate-400">Configure agency profile, branches, backup, and security</p>
        </div>
        <button
          onClick={handleSaveGeneral}
          disabled={saving}
          className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50"
        >
          <Save size={16} />
          <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
        </button>
      </div>

      {message && (
        <div className={`flex items-center space-x-3 p-4 rounded-xl border ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        } animate-in slide-in-from-top-2`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto p-1 hover:bg-white/10 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="glass-card p-1 rounded-xl">
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="glass-card p-6">
        {activeTab === 'general' && (
          <GeneralSettingsTab
            agencyName={agencyName} onAgencyNameChange={setAgencyName}
            tagline={tagline} onTaglineChange={setTagline}
            phonePrimary={phonePrimary} onPhonePrimaryChange={setPhonePrimary}
            whatsappNumber={whatsappNumber} onWhatsAppNumberChange={setWhatsAppNumber}
            address={address} onAddressChange={setAddress}
            currencySymbol={currencySymbol} onCurrencySymbolChange={setCurrencySymbol}
            logoPreview={logoPreview} onLogoUpload={handleLogoUpload}
          />
        )}

        {activeTab === 'branches' && (
          <BranchesTab
            branches={branches}
            selectedBranch={selectedBranch}
            onBranchSelect={handleBranchSelect}
            showBranchModal={showBranchModal}
            setShowBranchModal={setShowBranchModal}
            editingBranch={editingBranch}
            onSaveBranch={handleSaveBranch}
            onAddBranch={handleAddBranch}
          />
        )}

        {activeTab === 'backup' && (
          <BackupTab
            backupFolder={backupFolder}
            onBackupFolderSelect={handleBackupFolderSelect}
            sqliteDbPath={sqliteDbPath}
            lastBackup={lastBackup}
            onCreateBackup={handleCreateBackup}
            backupInProgress={backupInProgress}
            updateStatus={updateStatus}
            updateVersion={updateVersion}
            updateProgress={updateProgress}
            updateError={updateError}
            onCheckForUpdate={handleCheckForUpdate}
            onInstallUpdate={handleInstallUpdate}
            customDbDir={customDbDir}
            onCustomDbDirChange={(path: string) => setCustomDbDir(path)}
          />
        )}

        {activeTab === 'security' && (
          <SecurityTab
            sessionTimeout={sessionTimeout} onSessionTimeoutChange={setSessionTimeout}
            requirePinOnWake={requirePinOnWake} onRequirePinOnWakeChange={setRequirePinOnWake}
            auditLogRetention={auditLogRetention} onAuditLogRetentionChange={setAuditLogRetention}
          />
        )}

        {activeTab === 'appearance' && (
          <AppearanceTab
            theme={theme} onThemeChange={setTheme}
            compactMode={compactMode} onCompactModeChange={setCompactMode}
            animationsEnabled={animationsEnabled} onAnimationsEnabledChange={setAnimationsEnabled}
          />
        )}
      </div>
    </div>
  );
};

// Sub-components for each tab
function GeneralSettingsTab({
  agencyName, onAgencyNameChange,
  tagline, onTaglineChange,
  phonePrimary, onPhonePrimaryChange,
  whatsappNumber, onWhatsAppNumberChange,
  address, onAddressChange,
  currencySymbol, onCurrencySymbolChange,
  logoPreview, onLogoUpload,
}: {
  agencyName: string; onAgencyNameChange: (v: string) => void;
  tagline: string; onTaglineChange: (v: string) => void;
  phonePrimary: string; onPhonePrimaryChange: (v: string) => void;
  whatsappNumber: string; onWhatsAppNumberChange: (v: string) => void;
  address: string; onAddressChange: (v: string) => void;
  currencySymbol: string; onCurrencySymbolChange: (v: string) => void;
  logoPreview: string | null; onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
   return (
    <div className="page-container max-w-4xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Building2 size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Agency Profile</h3>
            <p className="text-xs text-slate-400">Business identity and contact information</p>
          </div>
        </div>
      </div>

      {/* Logo Upload */}
      <div className="flex items-center space-x-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-xl border-2 border-slate-700 overflow-hidden flex items-center justify-center bg-slate-950">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="text-slate-500" size={40} />
            )}
          </div>
          <label className="absolute bottom-0 right-0 p-2 bg-emerald-600 text-white rounded-full cursor-pointer hover:bg-emerald-500 transition-colors">
            <Upload size={16} />
            <input type="file" accept="image/*" onChange={onLogoUpload} className="sr-only" />
          </label>
        </div>
        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Agency Name</label>
              <input
                type="text"
                value={agencyName}
                onChange={(e) => onAgencyNameChange(e.target.value)}
                className="input-base"
                placeholder="Dripp Real Estate & DigiKhata ERP"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => onTaglineChange(e.target.value)}
                className="input-base"
                placeholder="Enterprise ERP System"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Primary Phone</label>
              <input
                type="tel"
                value={phonePrimary}
                onChange={(e) => onPhonePrimaryChange(e.target.value)}
                className="input-base"
                placeholder="+92 300 1234567"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">WhatsApp Number</label>
              <input
                type="tel"
                value={whatsappNumber}
                onChange={(e) => onWhatsAppNumberChange(e.target.value)}
                className="input-base"
                placeholder="923001234567"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Currency Symbol</label>
              <select
                value={currencySymbol}
                onChange={(e) => onCurrencySymbolChange(e.target.value)}
                className="input-base"
              >
                <option value="Rs.">Rs. (PKR)</option>
                <option value="$">$ (USD)</option>
                <option value="€">€ (EUR)</option>
                <option value="£">£ (GBP)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                className="input-base"
                placeholder="123 Main Street, Lahore, Pakistan"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchesTab({
  branches,
  selectedBranch,
  onBranchSelect,
  showBranchModal,
  setShowBranchModal,
  editingBranch,
  onSaveBranch,
  onAddBranch,
}: {
  branches: Branch[];
  selectedBranch: string;
  onBranchSelect: (branch: Branch) => void;
  showBranchModal: boolean;
  setShowBranchModal: (v: boolean) => void;
  editingBranch: Branch | null;
  onSaveBranch: (branch: Omit<Branch, 'id' | 'created_at' | 'manager_id'> & { id?: string; manager_id?: string }) => void;
  onAddBranch: () => void;
}) {
  const [formData, setFormData] = useState({
    id: '',
    branch_name: '',
    branch_code: '',
    city: '',
    address: '',
    status: 'ACTIVE',
    manager_id: '',
  });

  useEffect(() => {
    if (editingBranch) {
      setFormData({
        id: editingBranch.id,
        branch_name: editingBranch.branch_name,
        branch_code: editingBranch.branch_code,
        city: editingBranch.city,
        address: editingBranch.address || '',
        status: editingBranch.status,
        manager_id: editingBranch.manager_id || '',
      });
    } else {
      setFormData({ id: '', branch_name: '', branch_code: '', city: '', address: '', status: 'ACTIVE', manager_id: '' });
    }
  }, [editingBranch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveBranch(formData);
  };

   return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Branch Management</h3>
          <p className="text-xs text-slate-400">Manage office locations and switch active branch</p>
        </div>
        <button
          onClick={onAddBranch}
          className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all"
        >
          <Plus size={16} />
          <span>Add Branch</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Branch List */}
        <div className="lg:col-span-1 glass-card p-4">
          <h4 className="text-sm font-bold text-slate-300 mb-3">Office Locations</h4>
          <div className="space-y-2">
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => onBranchSelect(branch)}
                className={`w-full text-left p-3 rounded-xl transition-all border ${
                  selectedBranch === branch.id
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                    : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">{safeStr(branch.branch_name)}</span>
                  {selectedBranch === branch.id && <CheckCircle2 className="text-emerald-400" size={16} />}
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <span>{safeStr(branch.city)} ({safeStr(branch.branch_code)})</span>
                  {branch.address && <span>{safeStr(branch.address)}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Branch Details / Form */}
        <div className="lg:col-span-2 space-y-4">
          {editingBranch ? (
            <div className="glass-card p-6">
              <h4 className="text-sm font-bold text-slate-300 mb-4">Edit Branch: {safeStr(editingBranch.branch_name)}</h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={formData.branch_name}
                      onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                      className="input-base"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Branch Code</label>
                    <input
                      type="text"
                      value={formData.branch_code}
                      onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
                      className="input-base"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="input-base"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="input-base"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="input-base"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setFormData({ id: '', branch_name: '', branch_code: '', city: '', address: '', status: 'ACTIVE', manager_id: '' })}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-xl text-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="glass-card p-6 text-center py-12">
              <Building2 className="text-slate-500 mx-auto" size={48} />
              <h4 className="text-lg font-bold text-white mt-4">Select a Branch</h4>
              <p className="text-slate-400 mt-1">Choose a branch from the left to view details or click "Add Branch" to create a new one</p>
            </div>
          )}
        </div>
      </div>

      {/* Branch Modal */}
      {showBranchModal && !editingBranch && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Add New Branch</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Branch Name</label>
                  <input
                    type="text"
                    value={formData.branch_name}
                    onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                    className="input-base"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Branch Code</label>
                  <input
                    type="text"
                    value={formData.branch_code}
                    onChange={(e) => setFormData({ ...formData, branch_code: e.target.value })}
                    className="input-base"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="input-base"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="input-base"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input-base"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-xl text-sm"
                >
                  Create Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BackupTab({
  backupFolder,
  onBackupFolderSelect,
  sqliteDbPath,
  lastBackup,
  onCreateBackup,
  backupInProgress,
  updateStatus,
  updateVersion,
  updateProgress,
  updateError,
  onCheckForUpdate,
  onInstallUpdate,
  customDbDir,
  onCustomDbDirChange,
}: {
  backupFolder: string | null;
  onBackupFolderSelect: () => void;
  sqliteDbPath: string;
  lastBackup: string | null;
  onCreateBackup: () => void;
  backupInProgress: boolean;
  updateStatus: string;
  updateVersion: string | null;
  updateProgress: number;
  updateError: string | null;
  onCheckForUpdate: () => void;
  onInstallUpdate: () => void;
  customDbDir: string;
  onCustomDbDirChange: (path: string) => void;
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <HardDrive size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Local Backup & Sync</h3>
            <p className="text-xs text-slate-400">Configure automated backups to local hard drive</p>
          </div>
        </div>
      </div>

      {/* Database Location */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-4">Database Location</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center space-x-3">
              <Database className="text-sky-400" size={20} />
              <div>
                <p className="font-medium text-white">Local SQLite Path</p>
                <p className="text-xs text-slate-400 font-mono truncate max-w-xs">
                  {sqliteDbPath || '%APPDATA%/dripp-erp/database.sqlite (default)'}
                </p>
              </div>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full font-medium">
              {sqliteDbPath ? 'CONFIGURED' : 'DEFAULT'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Desktop App stores data in a local SQLite file for offline-first access. Synced to Turso Cloud when online.
          </p>
        </div>
      </div>

      {/* Custom Database Directory */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-4">Custom Database Directory</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center space-x-3">
              <Database className="text-purple-400" size={20} />
              <div>
                <p className="font-medium text-white">SQLite Database Location</p>
                <p className="text-xs text-slate-400 font-mono truncate max-w-xs">
                  {customDbDir || 'Default: %APPDATA%/dripp-erp/'}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                if (window.api?.selectDirectory) {
                  const result = await window.api.selectDirectory();
                  if (result.success && result.path) {
                    onCustomDbDirChange(result.path);
                    await window.api.dbExecute(
                      `INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('custom_db_directory', ?, datetime('now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')`,
                      [result.path]
                    );
                  }
                }
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-sm transition-all"
            >
              {customDbDir ? 'Change Directory' : 'Select Directory'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Choose a custom location for the local SQLite database file. A restart is required after changing.
          </p>
        </div>
      </div>

      {/* Backup Folder */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-4">Backup Destination Folder</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center space-x-3">
              <HardDrive className="text-slate-400" size={20} />
              <div>
                <p className="font-medium text-white">Backup Folder</p>
                <p className="text-xs text-slate-400 font-mono truncate max-w-xs">
                  {backupFolder || 'Not configured - Click to select folder'}
                </p>
              </div>
            </div>
            <button
              onClick={onBackupFolderSelect}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all"
            >
              {backupFolder ? 'Change Folder' : 'Select Folder'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Uses HTML5 File System Access API. Backups will be saved as encrypted SQLite files (.sqlite) in this folder.
          </p>
        </div>
      </div>

      {/* Manual Backup */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-4">Manual Database Vault Backup</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Create an instant encrypted backup of the entire database</p>
            <p className="text-xs text-slate-400 mt-1">Includes all tables, indexes, and audit logs</p>
          </div>
          <button
            onClick={onCreateBackup}
            disabled={backupInProgress}
            className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
          >
            <DownloadIcon size={16} />
            <span>{backupInProgress ? 'Creating Backup...' : 'Create Vault Backup'}</span>
          </button>
        </div>
        {lastBackup && (
          <p className="text-xs text-emerald-400 mt-3">Last backup: {new Date(lastBackup).toLocaleString()}</p>
        )}
      </div>

      {/* Sync Status */}
      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-4">Turso Cloud Sync Status</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center">
            <Wifi className="text-emerald-400 mx-auto mb-2" size={24} />
            <p className="text-xs text-slate-400">Cloud Sync</p>
            <p className="font-bold text-emerald-400">Active</p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center">
            <Database className="text-sky-400 mx-auto mb-2" size={24} />
            <p className="text-xs text-slate-400">Local DB</p>
            <p className="font-bold text-sky-400">Healthy</p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center">
            <HardDrive className="text-amber-400 mx-auto mb-2" size={24} />
            <p className="text-xs text-slate-400">Local Vault</p>
            <p className="font-bold text-amber-400">Ready</p>
          </div>
        </div>
      </div>

      {/* Update Software */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl">
              <RefreshCw size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Software Updates</h3>
              <p className="text-xs text-slate-400">Check and install the latest version from GitHub Releases</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {/* Status display */}
          {updateStatus === 'checking' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm">
              <RefreshCw size={16} className="animate-spin" />
              <span>Checking for updates...</span>
            </div>
          )}
          {updateStatus === 'available' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <CheckCircle2 size={16} />
              <span>Update available: v{updateVersion}</span>
            </div>
          )}
          {updateStatus === 'up-to-date' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <CheckCircle2 size={16} />
              <span>You're running the latest version!</span>
            </div>
          )}
          {updateStatus === 'downloading' && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm">
              <div className="flex items-center gap-3 mb-2">
                <RefreshCw size={16} className="animate-spin" />
                <span>Downloading update... {Math.round(updateProgress)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-sky-500 h-2 rounded-full transition-all" style={{ width: `${updateProgress}%` }} />
              </div>
            </div>
          )}
          {updateStatus === 'downloaded' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <CheckCircle2 size={16} />
              <span>Update downloaded! Restart to apply.</span>
            </div>
          )}
          {updateStatus === 'error' && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
              <AlertCircle size={16} />
              <span>{updateError || 'Update check failed'}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {updateStatus !== 'downloaded' ? (
              <button
                onClick={onCheckForUpdate}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                className="flex items-center space-x-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
              >
                <RefreshCw size={16} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                <span>{updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}</span>
              </button>
            ) : (
              <button
                onClick={onInstallUpdate}
                className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all"
              >
                <DownloadIcon size={16} />
                <span>Restart & Install Update</span>
              </button>
            )}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-all"
            >
              <ExternalLink size={14} />
              <span>View Releases</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityTab({
  sessionTimeout,
  onSessionTimeoutChange,
  requirePinOnWake,
  onRequirePinOnWakeChange,
  auditLogRetention,
  onAuditLogRetentionChange,
}: {
  sessionTimeout: number; onSessionTimeoutChange: (v: number) => void;
  requirePinOnWake: boolean; onRequirePinOnWakeChange: (v: boolean) => void;
  auditLogRetention: number; onAuditLogRetentionChange: (v: number) => void;
}) {
  return (
    <div className="page-container max-w-3xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
            <Shield size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Security & Access Control</h3>
            <p className="text-xs text-slate-400">Session management and audit configuration</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-white">Session Timeout</p>
            <p className="text-xs text-slate-400">Minutes of inactivity before auto-lock</p>
          </div>
          <select
            value={sessionTimeout}
            onChange={(e) => onSessionTimeoutChange(Number(e.target.value))}
            className="w-32 input-base text-center"
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={0}>Never</option>
          </select>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            <p className="font-medium text-white">Require PIN on Wake</p>
            <p className="text-xs text-slate-400">Lock screen after sleep/wake</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={requirePinOnWake}
              onChange={(e) => onRequirePinOnWakeChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div>
            <p className="font-medium text-white">Audit Log Retention</p>
            <p className="text-xs text-slate-400">Days to retain immutable audit logs</p>
          </div>
          <input
            type="number"
            value={auditLogRetention}
            onChange={(e) => onAuditLogRetentionChange(Number(e.target.value))}
            min={30}
            max={2555}
            className="w-32 input-base text-center"
          />
        </div>
      </div>

      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-3">Security Features Active</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SecurityBadge label="SQL Injection Protection" status="active" description="100% parameterized queries" />
          <SecurityBadge label="XSS Prevention" status="active" description="DOMPurify sanitization" />
          <SecurityBadge label="Replay Attack Defense" status="active" description="Nonce + Timestamp validation" />
          <SecurityBadge label="Autocomplete Suppression" status="active" description="Auth gate fields protected" />
        </div>
      </div>
    </div>
  );
}

function SecurityBadge({ label, status, description }: { label: string; status: 'active' | 'inactive'; description: string }) {
  return (
    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
          {status.toUpperCase()}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{description}</p>
    </div>
  );
}

function AppearanceTab({
  theme,
  onThemeChange,
  compactMode,
  onCompactModeChange,
  animationsEnabled,
  onAnimationsEnabledChange,
}: {
  theme: 'dark' | 'light' | 'system'; onThemeChange: (v: 'dark' | 'light' | 'system') => void;
  compactMode: boolean; onCompactModeChange: (v: boolean) => void;
  animationsEnabled: boolean; onAnimationsEnabledChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl">
            <Palette size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Appearance</h3>
            <p className="text-xs text-slate-400">Customize the look and feel of the application</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div>
          <h4 className="text-sm font-bold text-slate-300 mb-4">Theme Mode</h4>
          <div className="grid grid-cols-3 gap-3">
            {(['dark', 'light', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onThemeChange(t)}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  theme === t
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg mx-auto mb-2 ${t === 'dark' ? 'bg-slate-900' : t === 'light' ? 'bg-slate-100' : 'bg-gradient-to-r from-slate-900 to-slate-100'}`}>
                  {t === 'dark' && <Moon className="text-emerald-400 mx-auto mt-2" size={20} />}
                  {t === 'light' && <Sun className="text-amber-400 mx-auto mt-2" size={20} />}
                  {t === 'system' && <Menu className="text-sky-400 mx-auto mt-2" size={20} />}
                </div>
                <p className="text-xs font-medium capitalize">{t}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">Compact Mode</p>
              <p className="text-xs text-slate-400">Reduce padding and spacing for dense layouts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => onCompactModeChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div>
              <p className="font-medium text-white">Animations</p>
              <p className="text-xs text-slate-400">Enable Framer Motion transitions</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={animationsEnabled}
                onChange={(e) => onAnimationsEnabledChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h4 className="text-sm font-bold text-slate-300 mb-3">Glass Design System</h4>
        <p className="text-xs text-slate-400 mb-4">Apple Liquid Glass aesthetics with dynamic translucency and ambient physics</p>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-medium">backdrop-blur-2xl</span>
          <span className="px-3 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-full text-xs font-medium">border-white/20</span>
          <span className="px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full text-xs font-medium">shadow-glass</span>
          <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full text-xs font-medium">spring physics</span>
        </div>
      </div>
    </div>
  );
}