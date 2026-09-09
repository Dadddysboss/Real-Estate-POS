import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, X, Users, DollarSign, PieChart, Trash2 } from 'lucide-react';
import {
  fetchPools, createPool,
  fetchInvestors, addInvestor, removeInvestor,
  distributeDividend, fetchDividendHistory, calculatePoolStats,
} from '../../services/investor.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface InvestorPoolsProps {
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const InvestorPools: React.FC<InvestorPoolsProps> = ({ currentUser }) => {
  const [pools, setPools] = useState<any[]>([]);
  const [selectedPool, setSelectedPool] = useState<any | null>(null);
  const [investors, setInvestors] = useState<any[]>([]);
  const [dividends, setDividends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [showInvestorForm, setShowInvestorForm] = useState(false);
  const [showDividendForm, setShowDividendForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pool form
  const [poolName, setPoolName] = useState('');
  const [targetCapital, setTargetCapital] = useState(0);
  const [description, setDescription] = useState('');
  const [poolStatus, setPoolStatus] = useState<'ACTIVE' | 'CLOSED' | 'COMPLETED'>('ACTIVE');

  // Investor form
  const [invName, setInvName] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invCnic, setInvCnic] = useState('');
  const [invAmount, setInvAmount] = useState(0);
  const [invEquity, setInvEquity] = useState(0);

  // Dividend form
  const [profitAmount, setProfitAmount] = useState(0);
  const [distDate, setDistDate] = useState(new Date().toISOString().split('T')[0]);
  const [distDesc, setDistDesc] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const poolsData = await fetchPools();
      setPools(poolsData);
      if (poolsData.length > 0 && !selectedPool) setSelectedPool(poolsData[0]);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load pools' });
    }
    setLoading(false);
  };

  const loadPoolData = async (poolId: string) => {
    try {
      const [invData, divData] = await Promise.all([
        fetchInvestors(poolId),
        fetchDividendHistory(poolId),
      ]);
      setInvestors(invData);
      setDividends(divData);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (selectedPool) loadPoolData(selectedPool.id); }, [selectedPool]);

  const resetPoolForm = () => {
    setPoolName(''); setTargetCapital(0); setDescription(''); setPoolStatus('ACTIVE');
  };

  const handleCreatePool = async () => {
    if (!poolName.trim() || targetCapital <= 0) {
      setMessage({ type: 'error', text: 'Pool name and target capital are required' });
      return;
    }
    try {
      await createPool(currentUser.id, currentUser.fullName, {
        pool_name: poolName.trim(),
        total_target_capital: targetCapital,
        description: description.trim(),
        status: poolStatus,
      });
      setMessage({ type: 'success', text: 'Pool created' });
      setShowPoolForm(false);
      resetPoolForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create pool' });
    }
  };

  const handleAddInvestor = async () => {
    if (!selectedPool || !invName.trim() || invAmount <= 0) {
      setMessage({ type: 'error', text: 'Investor name and amount are required' });
      return;
    }
    try {
      await addInvestor(currentUser.id, currentUser.fullName, {
        pool_id: selectedPool.id,
        investor_name: invName.trim(),
        phone_number: invPhone.trim(),
        cnic: invCnic.trim(),
        contributed_amount: invAmount,
        equity_percentage: invEquity,
      });
      setMessage({ type: 'success', text: 'Investor added' });
      setShowInvestorForm(false);
      setInvName(''); setInvPhone(''); setInvCnic('');
      setInvAmount(0); setInvEquity(0);
      await loadPoolData(selectedPool.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add investor' });
    }
  };

  const handleRemoveInvestor = async (invId: string) => {
    if (!window.confirm('Remove this investor?')) return;
    try {
      await removeInvestor(invId, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: 'Investor removed' });
      await loadPoolData(selectedPool!.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove investor' });
    }
  };

  const handleDistributeDividend = async () => {
    if (!selectedPool || profitAmount <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid profit amount' });
      return;
    }
    try {
      await distributeDividend(currentUser.id, currentUser.fullName, {
        pool_id: selectedPool.id,
        profit_amount: profitAmount,
        distribution_date: distDate,
        description: distDesc.trim(),
      });
      setMessage({ type: 'success', text: `Dividend of ${fmt(profitAmount)} distributed` });
      setShowDividendForm(false);
      setProfitAmount(0); setDistDesc('');
      await loadPoolData(selectedPool.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to distribute dividend' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading pools...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PieChart size={24} className="text-purple-400" /> Investor Pools & Dividend Distribution
          </h2>
          <p className="text-sm text-slate-400">Module 13 — Track pools, equity %, auto-dividend distribution</p>
        </div>
        <button onClick={() => { setShowPoolForm(true); resetPoolForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> New Pool
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Pool List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Investor Pools</h3>
          {pools.map((pool) => (
            <button key={pool.id} onClick={() => setSelectedPool(pool)}
              className={`w-full text-left glass-card glass-card-hover p-3 ${selectedPool?.id === pool.id ? 'ring-2 ring-purple-500/50' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-white text-sm">{pool.pool_name}</h4>
                  <p className="text-[10px] text-slate-500">{pool.total_raised}/{pool.total_target_capital} raised</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pool.status === 'COMPLETED' ? 'status-emerald' : pool.status === 'CLOSED' ? 'status-slate' : 'status-purple'}`}>
                  {pool.status}
                </span>
              </div>
              <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5">
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (pool.total_raised / pool.total_target_capital) * 100)}%` }} />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{pool.investor_count} investors</p>
            </button>
          ))}
          {pools.length === 0 && <div className="text-center text-slate-500 text-sm p-8">No pools created</div>}
        </div>

        {/* Pool Detail */}
        <div className="lg:col-span-3">
          {selectedPool ? (() => {
            const stats = calculatePoolStats(selectedPool, investors);
            return (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Target Capital</p>
                    <p className="text-base font-bold text-white mt-1 font-mono">{fmt(stats.target)}</p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Total Raised</p>
                    <p className="text-base font-bold text-purple-400 mt-1 font-mono">{fmt(stats.totalRaised)}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{stats.progress.toFixed(1)}% funded</p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Investors</p>
                    <p className="text-base font-bold text-sky-400 mt-1 font-mono">{stats.investorCount}</p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-slate-500"><Users size={12} /></div>
                  </div>
                </div>

                {/* Actions */}
                <div className="glass-card p-4 flex gap-3">
                  <button onClick={() => { setShowInvestorForm(true); }}
                    className="flex-1 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-semibold transition">
                    + Add Investor
                  </button>
                  <button onClick={() => { setShowDividendForm(true); }}
                    className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold transition">
                    💰 Distribute Profit
                  </button>
                </div>

                {/* Investors Table */}
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-950/60 text-slate-400">
                          <th className="py-3 px-4">Investor</th>
                          <th className="py-3 px-4 text-right">Contribution</th>
                          <th className="py-3 px-4 text-right">Equity %</th>
                          <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {investors.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 px-4">
                              <p className="font-medium text-white">{inv.investor_name}</p>
                              <p className="text-[10px] text-slate-500">{inv.phone_number}</p>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-white font-bold">{fmtNum(inv.contributed_amount)}</td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300">
                                {inv.equity_percentage}%
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <button onClick={() => handleRemoveInvestor(inv.id)}
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded" title="Remove">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {investors.length === 0 && (
                          <tr><td colSpan={4} className="py-6 text-center text-slate-500">No investors in this pool</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dividend History */}
                {dividends.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Dividend Distribution History</h3>
                    <div className="space-y-2">
                      {dividends.map((div) => (
                        <div key={div.id} className="flex items-center justify-between bg-slate-950/60 rounded-lg p-3 text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center">
                              <DollarSign size={12} className="text-emerald-400" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{div.description || 'Dividend Distribution'}</p>
                              <p className="text-[10px] text-slate-500">{div.distribution_date}</p>
                            </div>
                          </div>
                          <p className="font-mono font-bold text-emerald-400">{fmt(div.profit_amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="glass-card p-12 text-center text-slate-500">
              <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
              <p>Select a pool to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Pool Modal */}
      {showPoolForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowPoolForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create New Pool</h3>
              <button onClick={() => setShowPoolForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Pool Name *</label>
                <input type="text" value={poolName} onChange={(e) => setPoolName(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Capital *</label>
                <input type="number" min={0} value={targetCapital || ''} onChange={(e) => setTargetCapital(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                <select value={poolStatus} onChange={(e) => setPoolStatus(e.target.value as typeof poolStatus)} className="input-base">
                  <option value="ACTIVE">Active</option>
                  <option value="CLOSED">Closed</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowPoolForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleCreatePool} className="px-5 py-2 btn-primary text-xs">Create Pool</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Investor Modal */}
      {showInvestorForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowInvestorForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add Investor</h3>
              <button onClick={() => setShowInvestorForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Investor Name *</label>
                <input type="text" value={invName} onChange={(e) => setInvName(e.target.value)} className="input-base" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Phone</label>
                  <input type="text" value={invPhone} onChange={(e) => setInvPhone(e.target.value)} className="input-base" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">CNIC</label>
                  <input type="text" value={invCnic} onChange={(e) => setInvCnic(e.target.value)} className="input-base" placeholder="Optional" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Contributed Amount *</label>
                  <input type="number" min={0} value={invAmount || ''} onChange={(e) => setInvAmount(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Equity %</label>
                  <input type="number" min={0} max={100} step={0.01} value={invEquity || ''} onChange={(e) => setInvEquity(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowInvestorForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddInvestor} className="px-5 py-2 btn-primary text-xs">Add Investor</button>
            </div>
          </div>
        </div>
      )}

      {/* Distribute Dividend Modal */}
      {showDividendForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowDividendForm(false)}>
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-emerald-400">Distribute Dividend</h3>
              <button onClick={() => setShowDividendForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
                Will distribute proportionally based on each investor's equity %.
                Creates DigiKhata entries for notification.
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Total Profit Amount *</label>
                <input type="number" min={0} value={profitAmount || ''} onChange={(e) => setProfitAmount(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Distribution Date</label>
                <input type="date" value={distDate} onChange={(e) => setDistDate(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <input type="text" value={distDesc} onChange={(e) => setDistDesc(e.target.value)} className="input-base" placeholder="Q4 2026 dividends" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowDividendForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleDistributeDividend} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold">Distribute</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-PK');
export default InvestorPools;