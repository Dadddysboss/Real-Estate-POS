import React, { useState, useEffect } from 'react';
import { Shield, Users, X, Key, AlertTriangle, Lock, CheckCircle, Eye } from 'lucide-react';
import { fetchStaff, addStaff, updateStaffRole, setPinCode, fetchAuditLogs, searchAuditLogs } from '../../services/accessControl.service';

interface CurrentUser { id: string; username: string; fullName: string; role?: string; }

interface AccessControlProps {
  currentUser: CurrentUser;
}

export const AccessControl: React.FC<AccessControlProps> = ({ currentUser }) => {
  const [staff, setStaff] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [targetStaff, setTargetStaff] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'staff' | 'audit'>('staff');
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Staff form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'SALES' | 'ACCOUNTANT' | 'VIEWER'>('VIEWER');
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Pin form
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [staffData, auditData] = await Promise.all([fetchStaff(), fetchAuditLogs(100)]);
      setStaff(staffData);
      setAuditLogs(auditData);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
    }
    setLoading(false);
  };

  const searchAuditData = async () => {
    if (searchTerm.trim()) {
      try {
        const data = await searchAuditLogs(searchTerm.trim());
        setAuditLogs(data);
      } catch (err) { console.error(err); }
    } else {
      await loadData();
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (activeTab === 'audit') searchAuditData(); }, [searchTerm]);

  const handleAddStaff = async () => {
    if (!username.trim() || !fullName.trim() || !password.trim()) {
      setMessage({ type: 'error', text: 'Username, name, and password are required' });
      return;
    }
    try {
      await addStaff(currentUser.id, currentUser.fullName, {
        username: username.trim(),
        password,
        full_name: fullName.trim(),
        role,
        branch_id: branchId || null,
        is_active: isActive,
        pin_code: null,
      });
      setMessage({ type: 'success', text: 'Staff user created' });
      setShowStaffForm(false);
      resetStaffForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create staff' });
    }
  };

  const handleUpdateRole = async (staffId: string, newRole: typeof role, status: boolean) => {
    try {
      await updateStaffRole(staffId, newRole, status, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: `User ${status ? 'activated' : 'deactivated'}` });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
    }
  };

  const handleSetPin = async () => {
    if (!targetStaff || !newPin.trim()) {
      setMessage({ type: 'error', text: 'Enter a new PIN' });
      return;
    }
    try {
      await setPinCode(targetStaff.id, currentPin || null, newPin.trim(), currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: 'PIN code set successfully' });
      setShowPinForm(false);
      setTargetStaff(null);
      setNewPin('');
      setCurrentPin('');
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to set PIN' });
    }
  };

  const resetStaffForm = () => {
    setUsername(''); setPassword(''); setFullName(''); setRole('VIEWER'); setBranchId(''); setIsActive(true);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  const activeUsers = staff.filter(s => s.is_active).length;
  const adminCount = staff.filter(s => s.role === 'ADMIN').length;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield size={24} className="text-emerald-400" /> Staff Access Control & Audit
          </h2>
          <p className="text-sm text-slate-400">Module 17 — Role-based permissions, PIN authentication, tamper-proof logs</p>
        </div>
        <button onClick={() => { setShowStaffForm(true); resetStaffForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Users size={16} /> Add Staff User
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Staff</p>
          <p className="text-lg font-bold text-white mt-1">{staff.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Active Users</p>
          <p className="text-lg font-bold text-emerald-400 mt-1">{activeUsers}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Admins</p>
          <p className="text-lg font-bold text-purple-400 mt-1">{adminCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <button onClick={() => setActiveTab('staff')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${activeTab === 'staff' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Staff Management ({staff.length})
        </button>
        <button onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${activeTab === 'audit' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Audit Logs ({auditLogs.length})
        </button>
      </div>

      {activeTab === 'staff' ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4 font-mono text-slate-300">{s.username}</td>
                    <td className="py-2.5 px-4 font-medium text-white">{s.full_name}</td>
                    <td className="py-2.5 px-4">
                      <select value={s.role} onChange={(e) => handleUpdateRole(s.id, e.target.value as any, s.is_active)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300">
                        {['ADMIN','MANAGER','SALES','ACCOUNTANT','VIEWER'].map(r => (<option key={r} value={r}>{r}</option>))}
                      </select>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{s.branch_id || 'Head Office'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <label className="inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={s.is_active} onChange={(e) => handleUpdateRole(s.id, s.role, e.target.checked)}
                          className="sr-only peer" />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button onClick={() => { setTargetStaff(s); setShowPinForm(true); }}
                        className="p-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded" title="Set PIN">
                        <Key size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No staff users</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-card">
          <div className="p-4 border-b border-slate-800">
            <input type="text" placeholder="Search audit logs..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white" />
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="border-b border-slate-800/60 p-3 hover:bg-slate-900/40">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${log.action_type === 'CREATE' ? 'bg-emerald-500/20 text-emerald-400' : log.action_type === 'DELETE' ? 'bg-rose-500/20 text-rose-400' : 'bg-sky-500/20 text-sky-400'}`}>
                    {log.action_type === 'CREATE' ? <CheckCircle size={14} /> : log.action_type === 'DELETE' ? <AlertTriangle size={14} /> : <Eye size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300">
                      <span className="font-bold text-white">{log.user_name}</span>
                      {' '}<span className="text-slate-400">{log.action_type}</span> in <span className="text-purple-400 font-mono">{log.module_name}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{log.description || '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1">{(log.created_at ?? '').slice(0, 19)}</p>
                  </div>
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && <div className="p-6 text-center text-slate-500">No audit logs found</div>}
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showStaffForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowStaffForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add Staff User</h3>
              <button onClick={() => setShowStaffForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Username *</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-base" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Full Name *</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-base" /></div>
              </div>
              <div><label className="text-xs text-slate-400 block mb-1">Password *</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-base" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="input-base">
                    {['ADMIN','MANAGER','SALES','ACCOUNTANT','VIEWER'].map(r => (<option key={r} value={r}>{r}</option>))}
                  </select></div>
                <div><label className="text-xs text-slate-400 block mb-1">Branch ID</label>
                  <input type="text" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input-base" placeholder="Optional" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                Active immediately
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowStaffForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddStaff} className="px-5 py-2 btn-primary text-xs">Create User</button>
            </div>
          </div>
        </div>
      )}

      {/* Set PIN Modal */}
      {showPinForm && targetStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowPinForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><Lock size={18} /> Set PIN Code</h3>
              <button onClick={() => setShowPinForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 text-xs text-sky-300">
                Setting PIN for <strong>{targetStaff.full_name}</strong> ({targetStaff.username}).
                PIN enables quick biometric-style login.
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">New PIN (4-6 digits)</label>
                <input type="password" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="input-base font-mono text-center tracking-widest" placeholder="••••" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowPinForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleSetPin} className="px-5 py-2 btn-primary text-xs">Set PIN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessControl;