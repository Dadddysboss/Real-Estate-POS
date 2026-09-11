import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Plus, X, DollarSign, PieChart, Trash2,
  LandPlot, Building2, Map, RefreshCw,
} from 'lucide-react';
import {
  fetchPools, createPool, deletePool,
  fetchInvestors, addInvestor, removeInvestor,
  distributeDividend, fetchDividendHistory, calculatePoolStats,
  recordPayout, fetchPayouts, fetchPoolROI,
  type ProjectType,
} from '../../services/investor.service';

interface CurrentUser { id: string; username: string; fullName: string; }
interface InvestorPoolsProps { currentUser: CurrentUser; }

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
const fmtNum = (n: number) => Math.round(n).toLocaleString('en-PK');

const PROJECT_TYPE_OPTIONS: { value: ProjectType; label: string; icon: React.ReactNode }[] = [
  { value: 'LAND', label: 'Land', icon: <LandPlot size={12} /> },
  { value: 'PLAZA', label: 'Plaza', icon: <Building2 size={12} /> },
  { value: 'SOCIETY', label: 'Society', icon: <Map size={12} /> },
  { value: 'MIXED', label: 'Mixed', icon: <PieChart size={12} /> },
];

const PROJECT_TYPE_BADGE: Record<string, string> = {
  LAND: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  PLAZA: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  SOCIETY: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  MIXED: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

export const InvestorPools: React.FC<InvestorPoolsProps> = ({ currentUser }) => {
  const [pools, setPools] = useState<any[]>([]);
  const [selectedPool, setSelectedPool] = useState<any | null>(null);
  const [investors, setInvestors] = useState<any[]>([]);
  const [dividends, setDividends] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [poolROI, setPoolROI] = useState({ totalInvested: 0, totalDistributed: 0, roiPercentage: 0, distributionCount: 0 });
  const [loading, setLoading] = useState(true);
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [showInvestorForm, setShowInvestorForm] = useState(false);
  const [showDividendForm, setShowDividendForm] = useState(false);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutInvestor, setPayoutInvestor] = useState<any>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [poolName, setPoolName] = useState('');
  const [poolProjectType, setPoolProjectType] = useState<ProjectType>('LAND');
  const [targetCapital, setTargetCapital] = useState(0);
  const [description, setDescription] = useState('');
  const [poolStatus, setPoolStatus] = useState<'ACTIVE' | 'CLOSED' | 'COMPLETED'>('ACTIVE');

  const [invName, setInvName] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invCnic, setInvCnic] = useState('');
  const [invAmount, setInvAmount] = useState(0);
  const [invEquity, setInvEquity] = useState(0);

  const [profitAmount, setProfitAmount] = useState(0);
  const [distDate, setDistDate] = useState(new Date().toISOString().split('T')[0]);
  const [distDesc, setDistDesc] = useState('');

  const [payoutAmount, setPayoutAmount] = useState(0);
  const [payoutMode, setPayoutMode] = useState('CASH');
  const [payoutNotes, setPayoutNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const poolsData = await fetchPools();
      setPools(poolsData);
      setSelectedPool((prev: any) => {
        if (!prev && poolsData.length > 0) return poolsData[0];
        if (prev) {
          const updated = poolsData.find((p) => p.id === prev.id);
          return updated || prev;
        }
        return null;
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load pools' });
    }
    setLoading(false);
  }, []);

  const loadPoolData = useCallback(async (poolId: string) => {
    try {
      const [invData, divData, payoutData, roiData] = await Promise.all([
        fetchInvestors(poolId),
        fetchDividendHistory(poolId),
        fetchPayouts(poolId),
        fetchPoolROI(poolId),
      ]);
      setInvestors(invData);
      setDividends(divData);
      setPayouts(payoutData);
      setPoolROI(roiData);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load pool data' });
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (selectedPool) loadPoolData(selectedPool.id); }, [selectedPool, loadPoolData]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const resetPoolForm = () => {
    setPoolName(''); setPoolProjectType('LAND'); setTargetCapital(0);
    setDescription(''); setPoolStatus('ACTIVE');
  };

  const handleCreatePool = async () => {
    if (!poolName.trim() || targetCapital <= 0) {
      setMessage({ type: 'error', text: 'Pool name and target capital are required' });
      return;
    }
    try {
      await createPool(currentUser.id, currentUser.fullName, {
        pool_name: poolName.trim(),
        project_type: poolProjectType,
        total_target_capital: targetCapital,
        description: description.trim(),
        status: poolStatus,
      });
      setMessage({ type: 'success', text: 'Pool created successfully' });
      setShowPoolForm(false);
      resetPoolForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to create pool: ${err instanceof Error ? err.message : 'Database error'}` });
    }
  };

  const handleDeletePool = async (poolId: string, poolName: string) => {
    if (!window.confirm(`Delete pool "${poolName}"? This action cannot be undone.`)) return;
    try {
      await deletePool(poolId, currentUser.id, currentUser.fullName, poolName);
      setMessage({ type: 'success', text: 'Pool deleted' });
      setSelectedPool(null);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete pool' });
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
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add investor' });
    }
  };

  const handleRemoveInvestor = async (invId: string) => {
    if (!window.confirm('Remove this investor?')) return;
    try {
      await removeInvestor(invId, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: 'Investor removed' });
      if (selectedPool) {
        await loadPoolData(selectedPool.id);
        await loadData();
      }
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

  const handleRecordPayout = async () => {
    if (!selectedPool || !payoutInvestor || payoutAmount <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid payout amount' });
      return;
    }
    try {
      await recordPayout(currentUser.id, currentUser.fullName, {
        pool_id: selectedPool.id,
        investor_id: payoutInvestor.id,
        amount: payoutAmount,
        payment_mode: payoutMode,
        notes: payoutNotes.trim(),
      });
      setMessage({ type: 'success', text: `Payout of ${fmt(payoutAmount)} recorded for ${payoutInvestor.investor_name}` });
      setShowPayoutForm(false);
      setPayoutAmount(0); setPayoutNotes('');
      setPayoutInvestor(null);
      await loadPoolData(selectedPool.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record payout' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading pools...</div>;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <PieChart size={24} className="text-purple-400" /> Investor Pools & Dividend Distribution
          </h2>
          <p className="text-sm text-slate-400">Module 13 — Track pools, equity %, auto-dividend distribution</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => { setShowPoolForm(true); resetPoolForm(); }}
            className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
            <Plus size={16} /> New Pool
          </button>
        </div>
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
          {pools.map((pool) => {
            const projType = pool.project_type || 'LAND';
            return (
              <button key={pool.id} onClick={() => setSelectedPool(pool)}
                className={`w-full text-left glass-card glass-card-hover p-3 ${selectedPool?.id === pool.id ? 'ring-2 ring-purple-500/50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white text-sm truncate">{pool.pool_name}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${PROJECT_TYPE_BADGE[projType] || PROJECT_TYPE_BADGE.LAND}`}>
                        {projType}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {fmt(pool.total_raised || 0)}/{fmt(pool.total_target_capital)}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pool.status === 'COMPLETED' ? 'status-emerald' : pool.status === 'CLOSED' ? 'status-slate' : 'status-purple'}`}>
                    {pool.status}
                  </span>
                </div>
                <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((pool.total_raised || 0) / (pool.total_target_capital || 1)) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-slate-500">{pool.investor_count || 0} investors</p>
                  {selectedPool?.id === pool.id && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeletePool(pool.id, pool.pool_name); }}
                      className="p-0.5 text-slate-500 hover:text-rose-400 transition" title="Delete pool">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </button>
            );
          })}
          {pools.length === 0 && <div className="text-center text-slate-500 text-sm p-8">No pools created yet</div>}
        </div>

        {/* Pool Detail */}
        <div className="lg:col-span-3">
          {selectedPool ? (() => {
            const stats = calculatePoolStats(selectedPool, investors);
            const totalEquity = investors.reduce((s, inv) => s + (inv.equity_percentage || 0), 0);
            return (
              <div className="space-y-6">
                {/* Pool Header */}
                <div className="glass-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedPool.pool_name}</h3>
                      <p className="text-xs text-slate-400">{selectedPool.description || 'No description'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded border ${PROJECT_TYPE_BADGE[selectedPool.project_type || 'LAND']}`}>
                        {selectedPool.project_type || 'LAND'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedPool.status === 'COMPLETED' ? 'status-emerald' : selectedPool.status === 'CLOSED' ? 'status-slate' : 'status-purple'}`}>
                        {selectedPool.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="stat-card">
                    <span className="stat-card-label">Target Capital</span>
                    <span className="stat-card-value text-sm">{fmt(stats.target)}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card-label">Total Raised</span>
                    <span className="stat-card-value text-sm text-purple-400">{fmt(stats.totalRaised)}</span>
                    <span className="stat-card-sub">{stats.progress.toFixed(1)}% funded</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card-label">Investors</span>
                    <span className="stat-card-value text-sm text-sky-400">{stats.investorCount}</span>
                    <span className="stat-card-sub">Total Equity: {stats.totalEquity.toFixed(1)}%</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card-label">ROI / Distributions</span>
                    <span className="stat-card-value text-sm text-emerald-400">{poolROI.roiPercentage.toFixed(1)}%</span>
                    <span className="stat-card-sub">{poolROI.distributionCount} distributions | {fmt(stats.totalPayouts)} paid</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="glass-card p-3 flex flex-wrap gap-2">
                  <button onClick={() => setShowInvestorForm(true)}
                    className="flex-1 min-w-[120px] py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-semibold transition">
                    + Add Investor
                  </button>
                  <button onClick={() => setShowDividendForm(true)}
                    className="flex-1 min-w-[120px] py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold transition">
                    Distribute Profit
                  </button>
                </div>

                {/* Equity % Breakdown */}
                {investors.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Equity % Breakdown</h3>
                    <div className="space-y-2">
                      {investors.map((inv) => {
                        const equityPct = totalEquity > 0 ? ((inv.equity_percentage || 0) / totalEquity * 100) : 0;
                        const dividendShare = stats.totalRaised > 0 ? (inv.contributed_amount / stats.totalRaised) : 0;
                        return (
                          <div key={inv.id} className="bg-slate-950/60 rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-white text-sm truncate">{inv.investor_name}</p>
                                <p className="text-[10px] text-slate-500">
                                  Invested: {fmt(inv.contributed_amount)} | Stated Equity: {inv.equity_percentage}%
                                </p>
                              </div>
                              <div className="text-right ml-3">
                                <p className="text-[10px] text-slate-500">Pool Share</p>
                                <p className="text-xs font-bold text-purple-300">{equityPct.toFixed(1)}%</p>
                              </div>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5">
                              <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${Math.min(100, equityPct)}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-500">Total Payouts: {fmt(inv.total_payout_received || 0)}</span>
                              <span className="text-slate-500">Profit Ratio: {(dividendShare * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Investors Table */}
                <div className="glass-card overflow-hidden">
                  <div className="p-3 border-b border-slate-800/60">
                    <h3 className="text-sm font-bold text-white">Investors ({investors.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-950/60 text-slate-400">
                          <th className="py-2.5 px-4">Investor</th>
                          <th className="py-2.5 px-4 text-right">Contribution</th>
                          <th className="py-2.5 px-4 text-right">Equity %</th>
                          <th className="py-2.5 px-4 text-right">Pool Share</th>
                          <th className="py-2.5 px-4 text-right">Payouts</th>
                          <th className="py-2.5 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {investors.map((inv) => {
                          const share = totalEquity > 0 ? ((inv.equity_percentage || 0) / totalEquity * 100) : 0;
                          return (
                            <tr key={inv.id} className="hover:bg-slate-900/40">
                              <td className="py-2.5 px-4">
                                <p className="font-medium text-white">{inv.investor_name}</p>
                                <p className="text-[10px] text-slate-500">{inv.phone_number || '-'}</p>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-white font-bold">{fmtNum(inv.contributed_amount)}</td>
                              <td className="py-2.5 px-4 text-right">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300">
                                  {inv.equity_percentage}%
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right text-[10px] text-slate-400">{share.toFixed(1)}%</td>
                              <td className="py-2.5 px-4 text-right font-mono text-emerald-400 text-[10px]">
                                {fmt(inv.total_payout_received || 0)}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => { setPayoutInvestor(inv); setPayoutAmount(0); setPayoutNotes(''); setShowPayoutForm(true); }}
                                    className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded transition" title="Record Payout">
                                    <DollarSign size={12} />
                                  </button>
                                  <button onClick={() => handleRemoveInvestor(inv.id)}
                                    className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded transition" title="Remove">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {investors.length === 0 && (
                          <tr><td colSpan={6} className="py-6 text-center text-slate-500">No investors in this pool</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payout Ledger */}
                {payouts.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Payout Ledger ({payouts.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-950/60 text-slate-400">
                            <th className="py-2 px-3">Investor</th>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Mode</th>
                            <th className="py-2 px-3">Notes</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {payouts.map((pay) => (
                            <tr key={pay.id} className="hover:bg-slate-900/40">
                              <td className="py-2 px-3 font-medium text-white">{pay.investor_name || 'Investor'}</td>
                              <td className="py-2 px-3 text-slate-400">{pay.payout_date?.split('T')[0] || pay.payout_date || '-'}</td>
                              <td className="py-2 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                                  {pay.payment_mode || 'CASH'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-500 max-w-[120px] truncate">{pay.notes || '-'}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">{fmt(pay.amount_paid)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Dividend History */}
                {dividends.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Dividend Distribution History ({dividends.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-950/60 text-slate-400">
                            <th className="py-2 px-3">Investor</th>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Description</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {dividends.map((div) => (
                            <tr key={div.id} className="hover:bg-slate-900/40">
                              <td className="py-2 px-3 font-medium text-white">{div.investor_name}</td>
                              <td className="py-2 px-3 text-slate-400">{div.distribution_date || '-'}</td>
                              <td className="py-2 px-3 text-slate-500">Pool dividend distribution</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">{fmt(div.profit_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                <input type="text" value={poolName} onChange={(e) => setPoolName(e.target.value)} className="input-base" placeholder="e.g. DHA Phase 8 Investment" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Project Type *</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROJECT_TYPE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setPoolProjectType(opt.value)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        poolProjectType === opt.value
                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}>
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Total Target Capital *</label>
                <input type="number" min={0} value={targetCapital || ''} onChange={(e) => setTargetCapital(Number(e.target.value) || 0)} className="input-base font-mono" placeholder="e.g. 5000000" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base" placeholder="Pool objectives, timeline, etc." />
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
                <input type="text" value={invName} onChange={(e) => setInvName(e.target.value)} className="input-base" placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Phone</label>
                  <input type="text" value={invPhone} onChange={(e) => setInvPhone(e.target.value)} className="input-base" placeholder="03XX-XXXXXXX" />
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
                  {selectedPool && invAmount > 0 && selectedPool.total_target_capital > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Auto-equity: {((invAmount / selectedPool.total_target_capital) * 100).toFixed(2)}% of target
                    </p>
                  )}
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
              </div>
              {investors.length > 0 && (
                <div className="bg-slate-950/60 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-slate-500 font-semibold">Distribution Preview</p>
                  {profitAmount > 0 && investors.map((inv) => {
                    const totalEq = investors.reduce((s, i) => s + (i.equity_percentage || 0), 0);
                    const share = totalEq > 0 ? Math.round((profitAmount * (inv.equity_percentage || 0)) / totalEq) : 0;
                    return (
                      <div key={inv.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">{inv.investor_name} ({inv.equity_percentage}%)</span>
                        <span className="font-mono text-emerald-400">{fmt(share)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Record Payout Modal */}
      {showPayoutForm && payoutInvestor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowPayoutForm(false)}>
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-emerald-400">Record Payout</h3>
              <button onClick={() => setShowPayoutForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-950/60 rounded-xl p-3">
                <p className="text-xs text-slate-500">Investor</p>
                <p className="text-sm font-bold text-white">{payoutInvestor.investor_name}</p>
                <p className="text-[10px] text-slate-500">
                  Equity: {payoutInvestor.equity_percentage}% | Invested: {fmt(payoutInvestor.contributed_amount)} | Received: {fmt(payoutInvestor.total_payout_received || 0)}
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Payout Amount *</label>
                <input type="number" min={0} value={payoutAmount || ''} onChange={(e) => setPayoutAmount(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Payment Mode</label>
                <select value={payoutMode} onChange={(e) => setPayoutMode(e.target.value)} className="input-base">
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                <input type="text" value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} className="input-base" placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowPayoutForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleRecordPayout} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold">Record Payout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvestorPools;
