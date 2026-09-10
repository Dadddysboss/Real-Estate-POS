import React, { useState, useEffect, useCallback } from 'react';
import {
  HardHat, Plus, X, CheckCircle, Building2, DollarSign, Calendar,
  Hammer, AlertTriangle, Loader2,
  TrendingUp, Package, User,
} from 'lucide-react';

interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
}

interface ConstructionTrackerProps {
  currentUser: CurrentUser;
}

interface PlotRecord {
  id: string;
  branch_id: string;
  plot_number: string;
  society_name: string;
  block_phase: string;
  size_dimension: string;
  category: string;
  purchase_price: number;
  target_asking_price: number;
  status: string;
  construction_status?: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ConstructionExpense {
  id: string;
  plot_id: string;
  category?: string;
  material_type: string;
  item_name?: string;
  quantity: number;
  unit_price?: number;
  rate: number;
  total_amount: number;
  supplier_name: string;
  labor_name?: string;
  expense_date: string;
  created_by: string;
  created_at: string;
}

interface ExpenseForm {
  category: string;
  item_name: string;
  quantity: string;
  rate: string;
  supplier_name: string;
  labor_name: string;
  labor_daily_wage: string;
  labor_days: string;
  labor_workers: string;
  labor_payment_date: string;
  expense_date: string;
  notes: string;
}

const fmt = (n: number): string => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const emptyForm: ExpenseForm = {
  category: 'MATERIAL',
  item_name: '',
  quantity: '',
  rate: '',
  supplier_name: '',
  labor_name: '',
  labor_daily_wage: '',
  labor_days: '',
  labor_workers: '',
  labor_payment_date: new Date().toISOString().split('T')[0],
  expense_date: new Date().toISOString().split('T')[0],
  notes: '',
};

const EXPENSE_CATEGORIES = [
  { value: 'MATERIAL', label: 'Material Purchase' },
  { value: 'LABOR', label: 'Labor / Mazdoor' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'ELECTRICITY', label: 'Electricity / Water' },
  { value: 'MISC', label: 'Miscellaneous' },
];

export const ConstructionTracker: React.FC<ConstructionTrackerProps> = ({ currentUser: _currentUser }) => {
  const [plots, setPlots] = useState<PlotRecord[]>([]);
  const [expenses, setExpenses] = useState<Record<string, ConstructionExpense[]>>({});
  const [selectedPlot, setSelectedPlot] = useState<PlotRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>({ ...emptyForm });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailPlot, setDetailPlot] = useState<PlotRecord | null>(null);

  const fetchPlots = useCallback(async () => {
    try {
      const res = await window.api.dbQuery<PlotRecord>(
        `SELECT * FROM inventory_plots WHERE construction_status IN ('UNDER_CONSTRUCTION', 'UNDER_DEVELOPMENT') OR status = 'UNDER_DEVELOPMENT' ORDER BY updated_at DESC`,
        []
      );
      if (res.success && res.data) {
        setPlots(res.data);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to fetch plots' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to fetch plots' });
    }
  }, []);

  const fetchExpensesForPlot = useCallback(async (plotId: string) => {
    try {
      const res = await window.api.dbQuery<ConstructionExpense>(
        `SELECT * FROM construction_expenses WHERE plot_id = ? ORDER BY expense_date DESC, created_at DESC`,
        [plotId]
      );
      if (res.success && res.data) {
        setExpenses((prev) => ({ ...prev, [plotId]: res.data! }));
      }
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchPlots();
      setLoading(false);
    };
    init();
  }, [fetchPlots]);

  useEffect(() => {
    if (selectedPlot) {
      fetchExpensesForPlot(selectedPlot.id);
    }
  }, [selectedPlot, fetchExpensesForPlot]);

  const getPlotTotalSpent = (plotId: string): number => {
    const plotExpenses = expenses[plotId] || [];
    return plotExpenses.reduce((sum, e) => sum + (e.total_amount || 0), 0);
  };

  const totalPlotsUnderConstruction = plots.length;
  const totalSpentAllPlots = plots.reduce((sum, p) => sum + getPlotTotalSpent(p.id), 0);
  const totalBudgetAllPlots = plots.reduce((sum, p) => sum + p.target_asking_price, 0);

  const updateFormField = (field: keyof ExpenseForm, value: string) => {
    setExpenseForm((prev) => ({ ...prev, [field]: value }));
  };

  const calculateFormTotal = (): number => {
    if (expenseForm.category === 'LABOR') {
      const dailyWage = parseFloat(expenseForm.labor_daily_wage) || 0;
      const days = parseFloat(expenseForm.labor_days) || 0;
      const workers = parseFloat(expenseForm.labor_workers) || 1;
      return dailyWage * days * workers;
    }
    const qty = parseFloat(expenseForm.quantity) || 0;
    const rate = parseFloat(expenseForm.rate) || 0;
    return qty * rate;
  };

  const handleSubmitExpense = async () => {
    if (!selectedPlot) return;

    setSubmitting(true);
    try {
      const res = await window.api.dbExecute(
        `INSERT INTO construction_expenses (id, plot_id, category, material_type, item_name, quantity, unit_price, rate, total_amount, supplier_name, labor_name, expense_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          `CE_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          selectedPlot.id,
          expenseForm.category,
          expenseForm.category === 'LABOR' ? 'LABOR' : expenseForm.item_name || expenseForm.category,
          expenseForm.item_name || (expenseForm.category === 'LABOR' ? expenseForm.labor_name : ''),
          parseFloat(expenseForm.quantity) || (expenseForm.category === 'LABOR' ? (parseFloat(expenseForm.labor_days) || 0) * (parseFloat(expenseForm.labor_workers) || 1) : 1),
          parseFloat(expenseForm.rate) || (expenseForm.category === 'LABOR' ? parseFloat(expenseForm.labor_daily_wage) || 0 : 0),
          parseFloat(expenseForm.rate) || 0,
          parseFloat(expenseForm.quantity || '0') * parseFloat(expenseForm.rate || '0') || (expenseForm.category === 'LABOR' ? (parseFloat(expenseForm.labor_daily_wage) || 0) * (parseFloat(expenseForm.labor_days) || 0) * (parseFloat(expenseForm.labor_workers) || 1) : 0),
          expenseForm.supplier_name || expenseForm.labor_name || '',
          expenseForm.labor_name || '',
          expenseForm.expense_date,
        ]
      );

      if (res.success) {
        setMessage({ type: 'success', text: 'Expense recorded successfully' });
        setExpenseForm({ ...emptyForm });
        setShowExpenseForm(false);
        await fetchExpensesForPlot(selectedPlot.id);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to record expense' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record expenses' });
    }
    setSubmitting(false);
  };

  const handleMarkCompleted = async (plot: PlotRecord) => {
    if (!confirm(`Mark plot ${plot.plot_number} as READY FOR SALE?`)) return;

    try {
      const res = await window.api.dbExecute(
        `UPDATE inventory_plots SET construction_status = 'READY_FOR_SALE', status = 'AVAILABLE', updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), plot.id]
      );
      if (res.success) {
        setMessage({ type: 'success', text: `Plot ${plot.plot_number} marked as Ready for Sale` });
        setSelectedPlot(null);
        await fetchPlots();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to update plot status' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update plot status' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading construction data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HardHat size={24} className="text-amber-400" /> Construction Tracker
          </h2>
          <p className="text-sm text-slate-400">Track daily expenses for plots under construction</p>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <Building2 size={18} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500 tracking-wider">Plots Under Construction</p>
              <p className="text-xl font-bold text-white font-mono">{totalPlotsUnderConstruction}</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center">
              <DollarSign size={18} className="text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500 tracking-wider">Total Spent</p>
              <p className="text-xl font-bold text-rose-400 font-mono">{fmt(totalSpentAllPlots)}</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500 tracking-wider">Budget Remaining</p>
              <p className="text-xl font-bold text-emerald-400 font-mono">
                {fmt(Math.max(0, totalBudgetAllPlots - totalSpentAllPlots))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plot List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Plots Under Construction
          </h3>
          {plots.length === 0 ? (
            <div className="glass-card p-8 text-center text-slate-500 text-sm">
              <Hammer size={32} className="mx-auto mb-2 opacity-30" />
              No plots under construction
            </div>
          ) : (
            plots.map((plot) => {
              const totalSpent = getPlotTotalSpent(plot.id);
              const spentPct = plot.target_asking_price > 0
                ? Math.min(100, (totalSpent / plot.target_asking_price) * 100)
                : 0;

              return (
                <button
                  key={plot.id}
                  onClick={() => {
                    setSelectedPlot(plot);
                  }}
                  className={`w-full text-left glass-card glass-card-hover p-3 transition-all ${
                    selectedPlot?.id === plot.id ? 'ring-2 ring-amber-500/50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-white text-sm">
                        Plot {plot.plot_number}
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        {plot.society_name} · {plot.block_phase}
                      </p>
                      <p className="text-[10px] text-slate-500">{plot.size_dimension}</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        plot.construction_status === 'UNDER_CONSTRUCTION'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-orange-500/10 text-orange-400'
                      }`}
                    >
                      {plot.construction_status === 'UNDER_CONSTRUCTION' ? 'UNDER CONSTRUCTION' : 'UNDER DEVELOPMENT'}
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                    <span>{fmt(totalSpent)} spent</span>
                    <span>{spentPct.toFixed(0)}% of budget</span>
                  </div>
                  <div className="mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailPlot(plot); setShowDetailModal(true); fetchExpensesForPlot(plot.id); }}
                      className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 rounded-lg text-xs font-semibold transition"
                    >
                      View Details
                    </button>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Plot Detail / Expense View */}
        <div className="lg:col-span-2">
          {selectedPlot ? (
            <div className="space-y-6">
              {/* Plot Header */}
              <div className="glass-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Plot {selectedPlot.plot_number}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {selectedPlot.society_name} · {selectedPlot.block_phase} · {selectedPlot.size_dimension}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowExpenseForm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-semibold transition"
                    >
                      <Plus size={14} /> Add Daily Expense
                    </button>
                    <button
                      onClick={() => handleMarkCompleted(selectedPlot)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition"
                    >
                      <CheckCircle size={14} /> Mark Completed
                    </button>
                  </div>
                </div>

                {/* Plot Stats */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-slate-950/60 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-slate-500">Purchase Price</p>
                    <p className="text-sm font-bold text-white font-mono mt-1">
                      {fmt(selectedPlot.purchase_price)}
                    </p>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-slate-500">Target Price</p>
                    <p className="text-sm font-bold text-amber-400 font-mono mt-1">
                      {fmt(selectedPlot.target_asking_price)}
                    </p>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-slate-500">Total Spent</p>
                    <p className="text-sm font-bold text-rose-400 font-mono mt-1">
                      {fmt(getPlotTotalSpent(selectedPlot.id))}
                    </p>
                  </div>
                </div>

                {/* Budget Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Budget Usage</span>
                    <span>{fmt(getPlotTotalSpent(selectedPlot.id))} / {fmt(selectedPlot.target_asking_price)}</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, selectedPlot.target_asking_price > 0 ? (getPlotTotalSpent(selectedPlot.id) / selectedPlot.target_asking_price) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Expense History */}
              <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Package size={14} className="text-amber-400" />
                    Expense History
                    <span className="text-[10px] text-slate-500 font-normal ml-auto">
                      {(expenses[selectedPlot.id] || []).length} records
                    </span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950/60 text-slate-400">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Material</th>
                        <th className="py-3 px-4 text-right">Qty</th>
                        <th className="py-3 px-4 text-right">Rate</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4">Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(expenses[selectedPlot.id] || []).map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1 text-slate-300">
                              <Calendar size={10} className="text-slate-500" />
                              {exp.expense_date}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400">
                              {exp.material_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-white">{exp.quantity}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-300">{fmt(exp.rate)}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-400">
                            {fmt(exp.total_amount)}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1 text-slate-300">
                              <User size={10} className="text-slate-500" />
                              {exp.supplier_name || '—'}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(expenses[selectedPlot.id] || []).length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No expenses recorded yet. Click "Add Daily Expense" to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total Row */}
                {(expenses[selectedPlot.id] || []).length > 0 && (
                  <div className="p-4 border-t border-slate-800 bg-slate-950/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Total Expenses</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">
                        {fmt(getPlotTotalSpent(selectedPlot.id))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card p-12 text-center text-slate-500">
              <Hammer size={48} className="mx-auto mb-3 opacity-30" />
              <p>Select a plot to view expenses</p>
            </div>
          )}
        </div>
      </div>

      {/* Daily Expense Form Modal */}
      {showExpenseForm && selectedPlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
          onClick={() => setShowExpenseForm(false)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HardHat size={18} className="text-amber-400" />
                  Record Expense
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Plot {selectedPlot.plot_number} · {selectedPlot.society_name}
                </p>
              </div>
              <button onClick={() => setShowExpenseForm(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Category Selection */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category *</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => updateFormField('category', e.target.value)}
                  className="input-base"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* MATERIAL Fields */}
              {expenseForm.category !== 'LABOR' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Item Name</label>
                    <input
                      type="text"
                      value={expenseForm.item_name}
                      onChange={(e) => updateFormField('item_name', e.target.value)}
                      className="input-base"
                      placeholder="e.g., Sand, Cement, Bricks..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Quantity</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={expenseForm.quantity}
                        onChange={(e) => updateFormField('quantity', e.target.value)}
                        className="input-base font-mono"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Rate (Rs.)</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={expenseForm.rate}
                        onChange={(e) => updateFormField('rate', e.target.value)}
                        className="input-base font-mono"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Supplier Name</label>
                    <input
                      type="text"
                      value={expenseForm.supplier_name}
                      onChange={(e) => updateFormField('supplier_name', e.target.value)}
                      className="input-base"
                      placeholder="e.g., Khan Builders Supply"
                    />
                  </div>
                </div>
              )}

              {/* LABOR Fields */}
              {expenseForm.category === 'LABOR' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Labor Name / Mazdoor *</label>
                    <input
                      type="text"
                      value={expenseForm.labor_name}
                      onChange={(e) => updateFormField('labor_name', e.target.value)}
                      className="input-base"
                      placeholder="e.g., Ahmed Khan"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Daily Wage (Rs.)</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={expenseForm.labor_daily_wage}
                        onChange={(e) => updateFormField('labor_daily_wage', e.target.value)}
                        className="input-base font-mono"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Days</label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={expenseForm.labor_days}
                        onChange={(e) => updateFormField('labor_days', e.target.value)}
                        className="input-base font-mono"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Workers</label>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={expenseForm.labor_workers}
                        onChange={(e) => updateFormField('labor_workers', e.target.value)}
                        className="input-base font-mono"
                        placeholder="1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={expenseForm.labor_payment_date}
                      onChange={(e) => updateFormField('labor_payment_date', e.target.value)}
                      className="input-base"
                    />
                  </div>
                </div>
              )}

              {/* Date & Notes (always shown) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Expense Date *</label>
                  <input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => updateFormField('expense_date', e.target.value)}
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Notes</label>
                  <input
                    type="text"
                    value={expenseForm.notes}
                    onChange={(e) => updateFormField('notes', e.target.value)}
                    className="input-base"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {/* Form Total */}
              <div className="bg-slate-950/60 rounded-lg p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-400">Form Total</span>
                <span className="text-lg font-bold text-amber-400 font-mono">
                  {fmt(calculateFormTotal())}
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800 sticky bottom-0 bg-slate-900">
              <button
                onClick={() => setShowExpenseForm(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitExpense}
                disabled={submitting}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Package size={14} /> Save Expense
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plot Detail Modal */}
      {showDetailModal && detailPlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDetailModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-base font-bold text-white">{detailPlot.society_name || 'Plot'} — {detailPlot.plot_number}</h3>
                <p className="text-xs text-slate-400">{detailPlot.block_phase} | {detailPlot.size_dimension}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-white transition"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <DollarSign size={20} className="text-emerald-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-400">Total Spent</p>
                  <p className="font-bold text-emerald-400">{fmt(getPlotTotalSpent(detailPlot.id))}</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <Package size={20} className="text-sky-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-400">Materials</p>
                  <p className="font-bold text-sky-400">{(expenses[detailPlot.id] || []).filter(e => e.category !== 'LABOR').length} entries</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <User size={20} className="text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-400">Labor Entries</p>
                  <p className="font-bold text-amber-400">{(expenses[detailPlot.id] || []).filter(e => e.category === 'LABOR').length} entries</p>
                </div>
              </div>

              {/* Expense Timeline */}
              <div>
                <h4 className="text-sm font-bold text-white mb-3">Expense Timeline</h4>
                {(expenses[detailPlot.id] || []).length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No expenses recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {(expenses[detailPlot.id] || []).map((exp) => (
                      <div key={exp.id} className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          exp.category === 'LABOR' ? 'bg-amber-500/20' : 'bg-sky-500/20'
                        }`}>
                          {exp.category === 'LABOR' ? <User size={14} className="text-amber-400" /> : <Package size={14} className="text-sky-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white">{exp.material_type || exp.item_name || exp.category}</p>
                          <p className="text-[10px] text-slate-500">{exp.supplier_name || exp.labor_name || 'N/A'} — {exp.expense_date}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-emerald-400">{fmt(exp.total_amount)}</p>
                          <p className="text-[10px] text-slate-500">Qty: {exp.quantity} × {fmt(exp.unit_price ?? exp.rate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConstructionTracker;
