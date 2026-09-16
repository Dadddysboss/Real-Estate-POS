import React, { useState, useEffect } from 'react';
import { Building2, Plus, X, MapPin, Phone, Mail, User, ChevronRight } from 'lucide-react';
import { fetchBranches, createBranch, updateBranchStatus, generateBranchCode } from '../../services/branch.service';
import { safeStr } from '../../db/dbSanitizer';

interface CurrentUser { id: string; username: string; fullName: string; role?: string; }

interface BranchManagerProps {
  currentUser: CurrentUser;
}

export const BranchManager: React.FC<BranchManagerProps> = ({ currentUser }) => {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [branchName, setBranchName] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [managerName, setManagerName] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchBranches();
      setBranches(data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load branches' });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateBranch = async () => {
    if (!branchName.trim() || !managerName.trim()) {
      setMessage({ type: 'error', text: 'Branch name and manager are required' });
      return;
    }
    try {
      const code = generateBranchCode(branchName);
      await createBranch(currentUser.id, currentUser.fullName, {
        branch_code: code,
        branch_name: branchName.trim(),
        address: address.trim(),
        phone_number: phoneNumber.trim(),
        email: email.trim() || null,
        manager_name: managerName.trim(),
        is_active: true,
      });
      setMessage({ type: 'success', text: `Branch created (${code})` });
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create branch' });
    }
  };

  const handleToggleStatus = async (branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    if (!branch) return;
    try {
      await updateBranchStatus(branchId, !branch.is_active, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: `Branch ${!branch.is_active ? 'activated' : 'deactivated'}` });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
    }
  };

  const resetForm = () => {
    setBranchName(''); setAddress(''); setPhoneNumber(''); setEmail(''); setManagerName('');
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading branches...</div>;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 size={24} className="text-purple-400" /> Multi-Branch & Franchise Management
          </h2>
          <p className="text-sm text-slate-400">Module 18 — Branch operations, sync queue, centralized control</p>
        </div>
        <button onClick={() => { setShowForm(true); resetForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> Add Branch
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Branches</p>
          <p className="text-lg font-bold text-white mt-1">{branches.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Active Branches</p>
          <p className="text-lg font-bold text-sky-400 mt-1 font-mono">{branches.filter(b => b.is_active).length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Inactive Branches</p>
          <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">{branches.filter(b => !b.is_active).length}</p>
        </div>
      </div>

      {/* Branch List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((branch) => (
          <div key={branch.id}
            role="button"
            tabIndex={0}
            className="glass-card glass-card-hover p-5 cursor-pointer hover:ring-2 hover:ring-purple-500/30 transition-all"
            onClick={() => setSelectedBranch(branch)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedBranch(branch); } }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <Building2 size={20} className="text-purple-400" />
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={branch.is_active} onChange={() => handleToggleStatus(branch.id)}
                    className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
                <ChevronRight size={16} className="text-purple-400" />
              </div>
            </div>
            <h3 className="font-bold text-white">{safeStr(branch.branch_name)}</h3>
            <p className="text-xs text-slate-500 mt-1">Code: {safeStr(branch.branch_code)}</p>
            <p className="text-xs text-slate-400 mt-2">Manager: {safeStr(branch.manager_name)}</p>
            <p className="text-xs text-slate-400">{safeStr(branch.address)}</p>
            <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2">
              <div className="text-center">
                <p className="text-[10px] text-slate-500">Phone</p>
                <p className="text-sm font-bold text-sky-400">{safeStr(branch.phone_number) || '—'}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500">Status</p>
                <p className={`text-sm font-bold ${branch.is_active ? 'text-emerald-400' : 'text-rose-400'}`}>{branch.is_active ? 'Active' : 'Inactive'}</p>
              </div>
            </div>
          </div>
        ))}
        {branches.length === 0 && <div className="md:col-span-2 lg:col-span-3 text-center text-slate-500 py-12">No branches registered</div>}
      </div>

      {/* Add Branch Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add New Branch</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Branch Name *</label>
                <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)} className="input-base" placeholder="e.g., Gulberg Branch" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Manager Name *</label>
                <input type="text" value={managerName} onChange={(e) => setManagerName(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Address</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="input-base" placeholder="Full address..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Phone Number</label>
                  <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="input-base" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-base" placeholder="Optional" /></div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleCreateBranch} className="px-5 py-2 btn-primary text-xs">Create Branch</button>
            </div>
          </div>
        </div>
      )}
      {/* Branch Detail Modal */}
      {selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setSelectedBranch(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Building2 size={20} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{safeStr(selectedBranch.branch_name)}</h3>
                  <p className="text-xs text-slate-400">Code: {safeStr(selectedBranch.branch_code)}</p>
                </div>
              </div>
              <button onClick={() => setSelectedBranch(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <User size={14} className="text-slate-500" />
                   <span>{safeStr(selectedBranch.manager_name) || 'No manager'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Phone size={14} className="text-slate-500" />
                  <span>{safeStr(selectedBranch.phone_number) || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300 col-span-2">
                  <MapPin size={14} className="text-slate-500" />
                  <span>{safeStr(selectedBranch.address) || 'No address'}</span>
                </div>
                {selectedBranch.email && (
                  <div className="flex items-center gap-2 text-sm text-slate-300 col-span-2">
                    <Mail size={14} className="text-slate-500" />
                    <span>{safeStr(selectedBranch.email)}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase">Status</p>
                  <p className={`text-sm font-bold mt-1 ${selectedBranch.is_active ? 'text-emerald-400' : 'text-rose-400'}`}>{selectedBranch.is_active ? 'Active' : 'Inactive'}</p>
                </div>
                <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase">Total Plots</p>
                  <p className="text-sm font-bold text-sky-400 mt-1">{selectedBranch.total_plots ?? 0}</p>
                </div>
                <div className="bg-slate-950/60 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 uppercase">Revenue</p>
                  <p className="text-sm font-bold text-emerald-400 mt-1">Rs. {Math.round(selectedBranch.total_revenue ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setSelectedBranch(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Close</button>
              <button onClick={() => { handleToggleStatus(selectedBranch.id); setSelectedBranch(null); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${selectedBranch.is_active ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
                {selectedBranch.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchManager;