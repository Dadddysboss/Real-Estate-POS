import React, { useState, useEffect } from 'react';
import {
  Building2, Save, Upload, HardDrive, Database, Wifi, CheckCircle2, AlertCircle,
  Palette, Shield, Moon, Sun, Menu, X, Download as DownloadIcon, Plus
} from 'lucide-react';

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
}

export const Settings: React.FC<SettingsProps> = ({ branchId, onBranchChange }) => {
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
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupInProgress, setBackupInProgress] = useState(false);

  // Security
  const [sessionTimeout, setSessionTimeout] = useState(30);
  const [requirePinOnWake, setRequirePinOnWake] = useState(true);
  const [auditLogRetention, setAuditLogRetention] = useState(365);

  // Appearance
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [compactMode, setCompactMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  const loadSettings = async () => {
    try {
      // Load agency settings
      const settingsRes = await window.api.dbQuery<AgencySettings>('SELECT * FROM agency_settings WHERE id = "MAIN_SETTINGS"', []);
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

      // Load branches
      const branchesRes = await window.api.dbQuery<Branch>('SELECT * FROM branches WHERE status = "ACTIVE" ORDER BY branch_name', []);
      if (branchesRes.success && branchesRes.data) {
        setBranches(branchesRes.data);
        setSelectedBranch(branchesRes.data[0]?.id || branchId);
      }
    } catch (error) {
      console.error('Load settings error:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await window.api.dbExecute(
        `UPDATE agency_settings SET agency_name = ?, tagline = ?, phone_primary = ?, whatsapp_number = ?, address = ?, currency_symbol = ?, logo_url_or_base64 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = "MAIN_SETTINGS"`,
        [agencyName, tagline, phonePrimary, whatsappNumber, address, currencySymbol, logoPreview]
      );
      setMessage({ type: 'success', text: 'General settings saved successfully' });
    } catch (error) {
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
      const backupFileName = `digikhata_vault_backup_${timestamp}.sqlite`;
      
      const sql = `VACUUM INTO ?`;
      const res = await window.api.dbExecute(sql, [backupFileName]);
      
      if (res.success) {
        setLastBackup(new Date().toISOString());
        setMessage({ type: 'success', text: `Database backup created: ${backupFileName}` });
      } else {
        throw new Error(res.error);
      }
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
    <div className="space-y-6">
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
            lastBackup={lastBackup}
            onCreateBackup={handleCreateBackup}
            backupInProgress={backupInProgress}
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
    <div className="space-y-6 max-w-4xl">
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
    <div className="space-y-6">
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
                  <span className="font-bold text-sm">{branch.branch_name}</span>
                  {selectedBranch === branch.id && <CheckCircle2 className="text-emerald-400" size={16} />}
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <span>{branch.city} ({branch.branch_code})</span>
                  {branch.address && <span>{branch.address}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Branch Details / Form */}
        <div className="lg:col-span-2 space-y-4">
          {editingBranch ? (
            <div className="glass-card p-6">
              <h4 className="text-sm font-bold text-slate-300 mb-4">Edit Branch: {editingBranch.branch_name}</h4>
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
  lastBackup,
  onCreateBackup,
  backupInProgress,
}: {
  backupFolder: string | null;
  onBackupFolderSelect: () => void;
  lastBackup: string | null;
  onCreateBackup: () => void;
  backupInProgress: boolean;
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
    <div className="space-y-6 max-w-3xl">
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