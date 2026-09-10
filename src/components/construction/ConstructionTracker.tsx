import React, { useState, useEffect, useCallback } from 'react';
import {
  HardHat, Plus, X, CheckCircle, Building2, DollarSign, Calendar,
  Hammer, AlertTriangle, Loader2,
  TrendingUp, Package, User, Trash2, ToggleLeft, ToggleRight,
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
  sand_price: number;
  bajri_price: number;
  srya_price: number;
  truck_price: number;
  cement_price: number;
  bricks_price: number;
  labor_details: string;
  total_amount: number;
  expense_date: string;
  notes: string;
  created_at: string;
}

interface LaborEntry {
  name: string;
  phone: string;
  duration: string;
  payment: number;
  work: string;
}

interface ExpenseFormState {
  sand_price: string;
  bajri_price: string;
  srya_price: string;
  truck_price: string;
  cement_price: string;
  bricks_price: string;
  include_labor: boolean;
  laborers: LaborEntry[];
  expense_date: string;
  notes: string;
}

const fmt = (n: number): string => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const emptyLaborer = (): LaborEntry => ({
  name: '',
  phone: '',
  duration: '',
  payment: 0,
  work: '',
});

const emptyForm: ExpenseFormState = {
  sand_price: '',
  bajri_price: '',
  srya_price: '',
  truck_price: '',
  cement_price: '',
  bricks_price: '',
  include_labor: false,
  laborers: [emptyLaborer()],
  expense_date: new Date().toISOString().split('T')[0],
  notes: '',
};

const MATERIAL_FIELDS = [
  { key: 'sand_price' as const, label: 'Sand (Rait)', color: 'amber' },
  { key: 'bajri_price' as const, label: 'Crushed Stone (Bajri)', color: 'slate' },
  { key: 'srya_price' as const, label: 'Steel Rebar (Srya)', color: 'sky' },
  { key: 'truck_price' as const, label: 'Truck / Transport Rent', color: 'orange' },
  { key: 'cement_price' as const, label: 'Cement', color: 'purple' },
  { key: 'bricks_price' as const, label: 'Bricks (Eent)', color: 'rose' },
];

function parseLaborDetails(raw: string | null | undefined): LaborEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ConstructionTracker: React.FC<ConstructionTrackerProps> = ({ currentUser: _currentUser }) => {
  const [plots, setPlots] = useState<PlotRecord[]>([]);
  const [expenses, setExpenses] = useState<Record<string, ConstructionExpense[]>>({});
  const [selectedPlot, setSelectedPlot] = useState<PlotRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({ ...emptyForm });
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

  const getMaterialTotal = (): number => {
    return MATERIAL_FIELDS.reduce((sum, f) => sum + (parseFloat(expenseForm[f.key]) || 0), 0);
  };

  const getLaborTotal = (): number => {
    if (!expenseForm.include_labor) return 0;
    return expenseForm.laborers.reduce((sum, l) => sum + (l.payment || 0), 0);
  };

  const calculateFormTotal = (): number => getMaterialTotal() + getLaborTotal();

  const updateFormField = (field: keyof ExpenseFormState, value: unknown) => {
    setExpenseForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateLaborer = (index: number, field: keyof LaborEntry, value: string | number) => {
    setExpenseForm((prev) => {
      const laborers = [...prev.laborers];
      laborers[index] = { ...laborers[index], [field]: value };
      return { ...prev, laborers };
    });
  };

  const addLaborer = () => {
    setExpenseForm((prev) => ({ ...prev, laborers: [...prev.laborers, emptyLaborer()] }));
  };

  const removeLaborer = (index: number) => {
    setExpenseForm((prev) => {
      if (prev.laborers.length <= 1) return prev;
      const laborers = prev.laborers.filter((_, i) => i !== index);
      return { ...prev, laborers };
    });
  };

  const handleSubmitExpense = async () => {
    if (!selectedPlot) return;
    const total = calculateFormTotal();
    if (total <= 0) {
      setMessage({ type: 'error', text: 'Enter at least one material price or labor payment.' });
      return;
    }

    setSubmitting(true);
    try {
      const laborDetails = expenseForm.include_labor
        ? JSON.stringify(expenseForm.laborers.filter((l) => l.name.trim() || l.payment > 0))
        : '';

      const res = await window.api.dbExecute(
        `INSERT INTO construction_expenses (id, plot_id, sand_price, bajri_price, srya_price, truck_price, cement_price, bricks_price, labor_details, total_amount, expense_date, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          `CE_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          selectedPlot.id,
          parseFloat(expenseForm.sand_price) || 0,
          parseFloat(expenseForm.bajri_price) || 0,
          parseFloat(expenseForm.srya_price) || 0,
          parseFloat(expenseForm.truck_price) || 0,
          parseFloat(expenseForm.cement_price) || 0,
          parseFloat(expenseForm.bricks_price) || 0,
          laborDetails,
          total,
          expenseForm.expense_date,
          expenseForm.notes.trim(),
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

  const renderExpenseRow = (exp: ConstructionExpense) => {
    const laborers = parseLaborDetails(exp.labor_details);
    const materialTotal = (exp.sand_price || 0) + (exp.bajri_price || 0) + (exp.srya_price || 0) + (exp.truck_price || 0) + (exp.cement_price || 0) + (exp.bricks_price || 0);
    const laborTotal = laborers.reduce((s, l) => s + (l.payment || 0), 0);

    const materialParts: string[] = [];
    if (exp.sand_price) materialParts.push(`Sand: ${fmt(exp.sand_price)}`);
    if (exp.bajri_price) materialParts.push(`Bajri: ${fmt(exp.bajri_price)}`);
    if (exp.srya_price) materialParts.push(`Srya: ${fmt(exp.srya_price)}`);
    if (exp.truck_price) materialParts.push(`Truck: ${fmt(exp.truck_price)}`);
    if (exp.cement_price) materialParts.push(`Cement: ${fmt(exp.cement_price)}`);
    if (exp.bricks_price) materialParts.push(`Bricks: ${fmt(exp.bricks_price)}`);

    return (
      <tr key={exp.id} className="hover:bg-slate-900/40">
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1 text-slate-300">
            <Calendar size={10} className="text-slate-500" />
            {exp.expense_date}
          </div>
        </td>
        <td className="py-2.5 px-4">
          {materialParts.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {materialParts.map((p, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/10 text-sky-400">{p}</span>
              ))}
            </div>
          ) : (
            <span className="text-slate-500 text-[10px]">—</span>
          )}
        </td>
        <td className="py-2.5 px-4">
          {laborers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {laborers.filter(l => l.name.trim()).map((l, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400">{l.name}: {fmt(l.payment)}</span>
              ))}
            </div>
          ) : (
            <span className="text-slate-500 text-[10px]">—</span>
          )}
        </td>
        <td className="py-2.5 px-4 text-right font-mono text-sky-400">{fmt(materialTotal)}</td>
        <td className="py-2.5 px-4 text-right font-mono text-amber-400">{fmt(laborTotal)}</td>
        <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-400">{fmt(exp.total_amount)}</td>
        <td className="py-2.5 px-4 text-xs text-slate-400">{exp.notes || '—'}</td>
      </tr>
    );
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
                  onClick={() => setSelectedPlot(plot)}
                  className={`w-full text-left glass-card glass-card-hover p-3 transition-all ${
                    selectedPlot?.id === plot.id ? 'ring-2 ring-amber-500/50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-white text-sm">Plot {plot.plot_number}</h4>
                      <p className="text-[10px] text-slate-500">{plot.society_name} · {plot.block_phase}</p>
                      <p className="text-[10px] text-slate-500">{plot.size_dimension}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      plot.construction_status === 'UNDER_CONSTRUCTION'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-orange-500/10 text-orange-400'
                    }`}>
                      {plot.construction_status === 'UNDER_CONSTRUCTION' ? 'UNDER CONSTRUCTION' : 'UNDER DEVELOPMENT'}
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5">
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${spentPct}%` }} />
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
                    <h3 className="text-lg font-bold text-white">Plot {selectedPlot.plot_number}</h3>
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
                    <p className="text-sm font-bold text-white font-mono mt-1">{fmt(selectedPlot.purchase_price)}</p>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-slate-500">Target Price</p>
                    <p className="text-sm font-bold text-amber-400 font-mono mt-1">{fmt(selectedPlot.target_asking_price)}</p>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-3">
                    <p className="text-[10px] uppercase text-slate-500">Total Spent</p>
                    <p className="text-sm font-bold text-rose-400 font-mono mt-1">{fmt(getPlotTotalSpent(selectedPlot.id))}</p>
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
                      style={{ width: `${Math.min(100, selectedPlot.target_asking_price > 0 ? (getPlotTotalSpent(selectedPlot.id) / selectedPlot.target_asking_price) * 100 : 0)}%` }}
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
                        <th className="py-3 px-4">Materials</th>
                        <th className="py-3 px-4">Labor</th>
                        <th className="py-3 px-4 text-right">Material Rs.</th>
                        <th className="py-3 px-4 text-right">Labor Rs.</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(expenses[selectedPlot.id] || []).map((exp) => renderExpenseRow(exp))}
                      {(expenses[selectedPlot.id] || []).length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
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

      {/* ═══════════════ NEW EXPENSE FORM MODAL ═══════════════ */}
      {showExpenseForm && selectedPlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowExpenseForm(false)}>
          <div
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HardHat size={18} className="text-amber-400" />
                  Record Daily Expense
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
              {/* ─── Material Prices ─── */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Package size={14} className="text-sky-400" /> Material Prices
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {MATERIAL_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] text-slate-500 block mb-1">{f.label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">Rs.</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={expenseForm[f.key]}
                          onChange={(e) => updateFormField(f.key, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 select-text"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                  <span className="text-xs font-semibold text-slate-400">Material Subtotal</span>
                  <span className="text-sm font-bold text-sky-400 font-mono">{fmt(getMaterialTotal())}</span>
                </div>
              </div>

              {/* ─── Labor Toggle ─── */}
              <div>
                <button
                  onClick={() => updateFormField('include_labor', !expenseForm.include_labor)}
                  className="flex items-center gap-3 w-full p-3 rounded-xl border border-slate-800 hover:border-amber-500/30 transition-all"
                >
                  {expenseForm.include_labor ? (
                    <ToggleRight size={24} className="text-amber-400" />
                  ) : (
                    <ToggleLeft size={24} className="text-slate-500" />
                  )}
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">Include Labor Expenses</p>
                    <p className="text-[10px] text-slate-500">Add Mazdoor / Mistri Dehari entries</p>
                  </div>
                  {expenseForm.include_labor && (
                    <span className="ml-auto text-xs font-bold text-amber-400 font-mono">{fmt(getLaborTotal())}</span>
                  )}
                </button>
              </div>

              {/* ─── Dynamic Labor Section ─── */}
              {expenseForm.include_labor && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <User size={14} className="text-amber-400" /> Labor Entries
                  </h4>
                  {expenseForm.laborers.map((laborer, idx) => (
                    <div key={idx} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500">Worker #{idx + 1}</span>
                        {expenseForm.laborers.length > 1 && (
                          <button onClick={() => removeLaborer(idx)} className="p-1 text-rose-400/60 hover:text-rose-400 rounded-lg transition">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">Name (Mistri/Mazdoor)</label>
                          <input
                            type="text"
                            value={laborer.name}
                            onChange={(e) => updateLaborer(idx, 'name', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 select-text"
                            placeholder="e.g. Ali Mistri"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">Phone Number</label>
                          <input
                            type="tel"
                            value={laborer.phone}
                            onChange={(e) => updateLaborer(idx, 'phone', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 select-text"
                            placeholder="0300-1234567"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">Work Duration</label>
                          <input
                            type="text"
                            value={laborer.duration}
                            onChange={(e) => updateLaborer(idx, 'duration', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 select-text"
                            placeholder="e.g. 9AM-5PM or 8 Hours"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1">Payment (Rs.)</label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={laborer.payment || ''}
                            onChange={(e) => updateLaborer(idx, 'payment', Number(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500 select-text"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">Work Description</label>
                        <input
                          type="text"
                          value={laborer.work}
                          onChange={(e) => updateLaborer(idx, 'work', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 select-text"
                          placeholder="e.g. Wall plaster / Roofing"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addLaborer}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/30 text-amber-400 rounded-xl text-xs font-semibold transition w-full justify-center"
                  >
                    <Plus size={14} /> Add Another Laborer
                  </button>
                </div>
              )}

              {/* ─── Date & Notes ─── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Expense Date *</label>
                  <input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => updateFormField('expense_date', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 select-text"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Notes</label>
                  <input
                    type="text"
                    value={expenseForm.notes}
                    onChange={(e) => updateFormField('notes', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 select-text"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {/* ─── Form Total ─── */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-300">Form Total</span>
                <span className="text-xl font-bold text-emerald-400 font-mono">
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

      {/* ═══════════════ PLOT DETAIL MODAL ═══════════════ */}
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
                  <p className="text-[10px] text-slate-400">Material Entries</p>
                  <p className="font-bold text-sky-400">{(expenses[detailPlot.id] || []).filter(e => {
                    return (e.sand_price || 0) + (e.bajri_price || 0) + (e.srya_price || 0) + (e.truck_price || 0) + (e.cement_price || 0) + (e.bricks_price || 0) > 0;
                  }).length} entries</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                  <User size={20} className="text-amber-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-400">Labor Entries</p>
                  <p className="font-bold text-amber-400">{(expenses[detailPlot.id] || []).filter(e => e.labor_details && e.labor_details !== '[]').length} entries</p>
                </div>
              </div>

              {/* Expense Timeline */}
              <div>
                <h4 className="text-sm font-bold text-white mb-3">Expense Timeline</h4>
                {(expenses[detailPlot.id] || []).length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No expenses recorded yet</p>
                ) : (
                  <div className="space-y-2">
                    {(expenses[detailPlot.id] || []).map((exp) => {
                      const laborers = parseLaborDetails(exp.labor_details);
                      const laborTotal = laborers.reduce((s, l) => s + (l.payment || 0), 0);

                      return (
                        <div key={exp.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="text-slate-500" />
                              <span className="text-xs font-semibold text-white">{exp.expense_date}</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-400 font-mono">{fmt(exp.total_amount)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            {exp.sand_price > 0 && <div className="text-sky-400">Sand: {fmt(exp.sand_price)}</div>}
                            {exp.bajri_price > 0 && <div className="text-sky-400">Bajri: {fmt(exp.bajri_price)}</div>}
                            {exp.srya_price > 0 && <div className="text-sky-400">Srya: {fmt(exp.srya_price)}</div>}
                            {exp.truck_price > 0 && <div className="text-sky-400">Truck: {fmt(exp.truck_price)}</div>}
                            {exp.cement_price > 0 && <div className="text-sky-400">Cement: {fmt(exp.cement_price)}</div>}
                            {exp.bricks_price > 0 && <div className="text-sky-400">Bricks: {fmt(exp.bricks_price)}</div>}
                          </div>
                          {laborers.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                              {laborers.filter(l => l.name.trim()).map((l, i) => (
                                <div key={i} className="flex items-center justify-between text-[10px]">
                                  <span className="text-amber-400">{l.name} — {l.work || 'General'}</span>
                                  <span className="text-amber-400 font-mono">{fmt(l.payment)}</span>
                                </div>
                              ))}
                              <div className="flex items-center justify-between text-[10px] font-bold pt-1">
                                <span className="text-amber-300">Labor Subtotal</span>
                                <span className="text-amber-300 font-mono">{fmt(laborTotal)}</span>
                              </div>
                            </div>
                          )}
                          {exp.notes && <p className="text-[10px] text-slate-500 mt-2">{exp.notes}</p>}
                        </div>
                      );
                    })}
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
