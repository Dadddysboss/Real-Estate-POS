import React, { useState, useEffect } from 'react';
import { Wallet, Plus, X, Trash2, DollarSign } from 'lucide-react';
import {
  fetchExpenses, recordExpense, deleteExpense,
  fetchAssets, addAsset, updateAssetBookValue,
  calculateExpenseSummary,
} from '../../services/overheads.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface OfficeOverheadsProps {
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const OfficeOverheads: React.FC<OfficeOverheadsProps> = ({ currentUser }) => {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'assets'>('expenses');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Expense form
  const [expenseCategory, setExpenseCategory] = useState('SALARIES');
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, _setRecurringFreq] = useState<'MONTHLY' | 'WEEKLY' | 'QUARTERLY' | 'ANNUALLY'>('MONTHLY');
  const [expenseMethod, setExpenseMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');

  // Asset form
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] = useState('EQUIPMENT');
  const [assetPrice, setAssetPrice] = useState(0);
  const [assetPurchaseDate, setAssetPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [usefulLife, setUsefulLife] = useState(5);
  const [salvageValue, setSalvageValue] = useState(0);
  const [depMethod, setDepMethod] = useState<'STRAIGHT_LINE' | 'DECLINING_BALANCE'>('STRAIGHT_LINE');

  const loadData = async () => {
    setLoading(true);
    try {
      const [expData, assetData] = await Promise.all([fetchExpenses(), fetchAssets()]);
      setExpenses(expData);
      setAssets(assetData);
      // Update book values
      assetData.forEach((a) => updateAssetBookValue(a.id));
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleRecordExpense = async () => {
    if (expenseAmount <= 0) {
      setMessage({ type: 'error', text: 'Amount must be greater than 0' });
      return;
    }
    try {
      await recordExpense(currentUser.id, currentUser.fullName, {
        category: expenseCategory,
        amount: expenseAmount,
        description: expenseDescription.trim(),
        date: expenseDate,
        recurring: isRecurring,
        recurring_frequency: isRecurring ? recurringFreq : null,
        payment_method: expenseMethod,
      });
      setMessage({ type: 'success', text: 'Expense recorded' });
      setShowExpenseForm(false);
      setExpenseAmount(0); setExpenseDescription('');
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record expense' });
    }
  };

  const handleDeleteExpense = async (expId: string) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await deleteExpense(expId, currentUser.id, currentUser.fullName, `Expense ${expId}`);
      setMessage({ type: 'success', text: 'Expense deleted' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const handleAddAsset = async () => {
    if (!assetName.trim() || assetPrice <= 0) {
      setMessage({ type: 'error', text: 'Asset name and price are required' });
      return;
    }
    try {
      await addAsset(currentUser.id, currentUser.fullName, {
        asset_name: assetName.trim(),
        category: assetCategory,
        purchase_price: assetPrice,
        purchase_date: assetPurchaseDate,
        useful_life_years: usefulLife,
        salvage_value: salvageValue,
        depreciation_method: depMethod,
      });
      setMessage({ type: 'success', text: 'Asset added' });
      setShowAssetForm(false);
      setAssetName(''); setAssetPrice(0); setSalvageValue(0);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add asset' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  const summary = calculateExpenseSummary(expenses);
  const totalAssetValue = assets.reduce((s, a) => s + a.current_book_value, 0);
  const totalDepreciation = assets.reduce((s, a) => s + (a.purchase_price - a.current_book_value), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet size={24} className="text-sky-400" /> Office Overheads & Fixed Assets
          </h2>
          <p className="text-sm text-slate-400">Module 15 — Expense tracking, asset depreciation & cost control</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAssetForm(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1">
            <DollarSign size={14} /> Add Asset
          </button>
          <button onClick={() => setShowExpenseForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
            <Plus size={16} /> Record Expense
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Expenses</p>
          <p className="text-base font-bold text-rose-400 mt-1 font-mono">{fmt(summary.total)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Recurring Costs</p>
          <p className="text-base font-bold text-sky-400 mt-1 font-mono">{fmt(summary.recurringTotal)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Asset Book Value</p>
          <p className="text-base font-bold text-emerald-400 mt-1 font-mono">{fmt(totalAssetValue)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Depreciation</p>
          <p className="text-base font-bold text-amber-400 mt-1 font-mono">{fmt(totalDepreciation)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <button onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${activeTab === 'expenses' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Expenses ({summary.count})
        </button>
        <button onClick={() => setActiveTab('assets')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${activeTab === 'assets' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Fixed Assets ({assets.length})
        </button>
      </div>

      {activeTab === 'expenses' ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Recurring</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4 text-slate-300">{(exp.date ?? '').slice(0, 10)}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">{exp.category}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-[200px] truncate">{exp.description || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-rose-400 font-bold">{fmtNum(exp.amount)}</td>
                    <td className="py-2.5 px-4">
                      {exp.recurring ? <span className="text-[10px] text-sky-400">{exp.recurring_frequency}</span> : <span className="text-[10px] text-slate-500">One-time</span>}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{exp.payment_method}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-slate-500">No expenses recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4 text-right">Purchase Price</th>
                  <th className="py-3 px-4 text-right">Book Value</th>
                  <th className="py-3 px-4 text-right">Depreciation</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Purchase Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {assets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-white">{asset.asset_name}</p>
                      <p className="text-[10px] text-slate-500">{asset.category} · {asset.useful_life_years}yr life</p>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-white">{fmtNum(asset.purchase_price)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-emerald-400">{fmtNum(asset.current_book_value)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-amber-400">{fmtNum(asset.purchase_price - asset.current_book_value)}</td>
                    <td className="py-2.5 px-4 text-slate-400">{asset.depreciation_method === 'STRAIGHT_LINE' ? 'Straight Line' : 'Declining Balance'}</td>
                    <td className="py-2.5 px-4 text-slate-300">{(asset.purchase_date ?? '').slice(0, 10)}</td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-500">No fixed assets registered</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Expense Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowExpenseForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Record Expense</h3>
              <button onClick={() => setShowExpenseForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="input-base">
                  {['SALARIES','RENT','ELECTRICITY','WATER','GAS','TELECOMMUNICATION','MAINTENANCE','OFFICE_SUPPLIES','TRANSPORT','MISCELLANEOUS'].map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Amount *</label>
                  <input type="number" min={0} value={expenseAmount || ''} onChange={(e) => setExpenseAmount(Number(e.target.value) || 0)} className="input-base font-mono" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="input-base" /></div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <input type="text" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} className="input-base" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Recurring</label>
                  <button onClick={() => setIsRecurring(!isRecurring)}
                    className={`w-full py-2 rounded-xl text-xs font-semibold ${isRecurring ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {isRecurring ? `Yes (${recurringFreq})` : 'No (One-time)'}
                  </button></div>
                <div><label className="text-xs text-slate-400 block mb-1">Payment Method</label>
                  <select value={expenseMethod} onChange={(e) => setExpenseMethod(e.target.value as typeof expenseMethod)} className="input-base">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select></div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowExpenseForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleRecordExpense} className="px-5 py-2 btn-primary text-xs">Record Expense</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Asset Modal */}
      {showAssetForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowAssetForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add Fixed Asset</h3>
              <button onClick={() => setShowAssetForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Asset Name *</label>
                  <input type="text" value={assetName} onChange={(e) => setAssetName(e.target.value)} className="input-base" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select value={assetCategory} onChange={(e) => setAssetCategory(e.target.value)} className="input-base">
                    {['EQUIPMENT','VEHICLE','COMPUTER','FURNITURE','MACHINERY','PROPERTY','OTHER'].map(c => (<option key={c} value={c}>{c}</option>))}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Purchase Price *</label>
                  <input type="number" min={0} value={assetPrice || ''} onChange={(e) => setAssetPrice(Number(e.target.value) || 0)} className="input-base font-mono" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Salvage Value</label>
                  <input type="number" min={0} value={salvageValue || ''} onChange={(e) => setSalvageValue(Number(e.target.value) || 0)} className="input-base font-mono" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Purchase Date</label>
                  <input type="date" value={assetPurchaseDate} onChange={(e) => setAssetPurchaseDate(e.target.value)} className="input-base" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Useful Life (yrs)</label>
                  <input type="number" min={1} value={usefulLife || ''} onChange={(e) => setUsefulLife(Number(e.target.value) || 0)} className="input-base font-mono" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Depreciation</label>
                  <select value={depMethod} onChange={(e) => setDepMethod(e.target.value as typeof depMethod)} className="input-base">
                    <option value="STRAIGHT_LINE">Straight Line</option>
                    <option value="DECLINING_BALANCE">Declining Balance</option>
                  </select></div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowAssetForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddAsset} className="px-5 py-2 btn-primary text-xs">Add Asset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-PK');
export default OfficeOverheads;