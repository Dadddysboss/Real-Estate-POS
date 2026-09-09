import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, MapPin, Tag, Grid3X3, Table2, Map as MapIcon, Pencil, Trash2, X, Layers, Ruler, BadgeDollarSign,
} from 'lucide-react';
import { PlotRecord } from '../../types/electron';
import {
  fetchPlots, createPlot, updatePlot, deletePlot, countPlotsByStatus,
  PLOT_CATEGORIES, PLOT_STATUSES, parseFeatureTags,
} from '../../services/inventory.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface PlotInventoryProps {
  branchId: string;
  currentUser: CurrentUser;
}

type ViewMode = 'grid' | 'table' | 'map';

const fmt = (n: number) => `Rs. ${Math.round(n || 0).toLocaleString('en-PK')}`;
const safeStr = (v: unknown): string => v == null ? '' : String(v);

const STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'status-emerald',
  BOOKED: 'status-sky',
  ON_HOLD: 'status-amber',
  UNDER_DEVELOPMENT: 'status-purple',
  SOLD: 'status-rose',
};

const STATUS_DOT: Record<string, string> = {
  AVAILABLE: '#10b981',
  BOOKED: '#0ea5e9',
  ON_HOLD: '#f59e0b',
  UNDER_DEVELOPMENT: '#a855f7',
  SOLD: '#f43f5e',
};

interface PlotFormState {
  plot_number: string;
  society_name: string;
  block_phase: string;
  size_value: number;
  size_unit: string;
  category: PlotRecord['category'];
  feature_tags_input: string;
  purchase_date: string;
  purchase_price: number;
  target_asking_price: number;
  floor_price: number;
  gps_coordinates: string;
  status: PlotRecord['status'];
  notes: string;
}

const SIZE_UNITS = ['Marla', 'Kanal', 'Murabba', 'Acre', 'Sqft', 'Sqyard'];
const SIZE_UNIT_OPTIONS = SIZE_UNITS.map(u => ({ value: u, label: u }));

const emptyForm = (): PlotFormState => ({
  plot_number: '',
  society_name: '',
  block_phase: '',
  size_value: 5,
  size_unit: 'Marla',
  category: 'RESIDENTIAL',
  feature_tags_input: '',
  purchase_date: new Date().toISOString().split('T')[0],
  purchase_price: 0,
  target_asking_price: 0,
  floor_price: 0,
  gps_coordinates: '',
  status: 'AVAILABLE',
  notes: '',
});

const formToState = (p: PlotRecord): PlotFormState => ({
  plot_number: p.plot_number,
  society_name: p.society_name,
  block_phase: p.block_phase,
  size_value: (p as any).size_value ?? 5,
  size_unit: (p as any).size_unit ?? 'Marla',
  category: p.category,
  feature_tags_input: parseFeatureTags(p.feature_tags).join(', '),
  purchase_date: (p.purchase_date ?? '').slice(0, 10),
  purchase_price: p.purchase_price,
  target_asking_price: p.target_asking_price,
  floor_price: p.floor_price,
  gps_coordinates: p.gps_coordinates || '',
  status: p.status,
  notes: p.notes || '',
});

export const PlotInventory: React.FC<PlotInventoryProps> = ({ branchId, currentUser }) => {
  const [plots, setPlots] = useState<PlotRecord[]>([]);
  const [statusCounts, setStatusCounts] = useState<{ status: PlotRecord['status']; count: number }[]>([]);
  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | PlotRecord['category']>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PlotRecord['status']>('ALL');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlotRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlotFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selected, setSelected] = useState<PlotRecord | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, counts] = await Promise.all([
        fetchPlots(branchId, { search, category: categoryFilter, status: statusFilter }),
        countPlotsByStatus(branchId),
      ]);
      setPlots(data);
      setStatusCounts(counts);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load plots' });
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, search, categoryFilter, statusFilter]);

  const filtered = useMemo(() => plots, [plots]);
  const groupedByBlock = useMemo(() => {
    const map = new Map<string, PlotRecord[]>();
    for (const p of filtered) {
      const key = `${safeStr(p.society_name) || 'Unknown'} / ${safeStr(p.block_phase) || '-'}`;
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const handleSave = async () => {
    if (!form.society_name.trim() || !form.plot_number.trim() || !form.block_phase.trim()) {
      setMessage({ type: 'error', text: 'Society, block/phase, and plot number are required.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        plot_number: form.plot_number.trim(),
        society_name: form.society_name.trim(),
        block_phase: form.block_phase.trim(),
        size_value: Math.round(form.size_value * 100) / 100,
        size_unit: form.size_unit,
        size_dimension: `${form.size_value} ${form.size_unit}`,
        category: form.category,
        feature_tags: form.feature_tags_input.split(',').map(t => t.trim()).filter(Boolean),
        purchase_date: form.purchase_date,
        purchase_price: Math.round(form.purchase_price),
        target_asking_price: Math.round(form.target_asking_price),
        floor_price: Math.round(form.floor_price),
        gps_coordinates: form.gps_coordinates.trim(),
        status: form.status,
        notes: form.notes.trim(),
      };
      if (editing) {
        await updatePlot(editing.id, branchId, currentUser.id, currentUser.fullName, payload, editing);
        setMessage({ type: 'success', text: `Plot ${editing.plot_number} updated.` });
      } else {
        await createPlot(branchId, currentUser.id, currentUser.fullName, payload);
        setMessage({ type: 'success', text: `Plot ${payload.plot_number} added to inventory.` });
      }
      setShowForm(false);
      setEditing(null);
      setSelected(null);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save plot' });
    }
    setSaving(false);
  };

  const handleDelete = async (plot: PlotRecord) => {
    if (!window.confirm(`Delete plot ${plot.plot_number} (${plot.society_name})? This action is audited.`)) return;
    try {
      await deletePlot(plot.id, currentUser.id, currentUser.fullName, `${plot.society_name} #${plot.plot_number}`);
      setMessage({ type: 'success', text: 'Plot deleted.' });
      setSelected(null);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
    }
  };

  const quickStatusChange = async (plot: PlotRecord, status: PlotRecord['status']) => {
    try {
      const payload = {
        plot_number: plot.plot_number,
        society_name: plot.society_name,
        block_phase: plot.block_phase,
        size_dimension: plot.size_dimension,
        category: plot.category,
        feature_tags: parseFeatureTags(plot.feature_tags),
        purchase_date: plot.purchase_date,
        purchase_price: plot.purchase_price,
        target_asking_price: plot.target_asking_price,
        floor_price: plot.floor_price,
        gps_coordinates: plot.gps_coordinates || '',
        status,
        notes: plot.notes || '',
      };
      await updatePlot(plot.id, branchId, currentUser.id, currentUser.fullName, payload, plot);
      setMessage({ type: 'success', text: `Status set to ${status.replace(/_/g, ' ')}.` });
      await loadData();
      setSelected(null);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Status change failed' });
    }
  };

  const countByStatusMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of statusCounts) m[c.status] = c.count;
    return m;
  }, [statusCounts]);

  return (
    <div className="space-y-6">
      {/* Header + Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers size={24} className="text-emerald-400" /> Plot & Property Inventory
          </h2>
          <p className="text-sm text-slate-400">Module 5 — Grid, Table & Visual Layout Map</p>
        </div>
        <button
          onClick={() => { setEditing(null); setForm(emptyForm()); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm"
        >
          <Plus size={16} /> Add New Plot
        </button>
      </div>

      {/* Status Summary Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {PLOT_STATUSES.map((s) => (
          <span key={s} className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[s]}`}>
            {s.replace(/_/g, ' ')}: {countByStatusMap[s] || 0}
          </span>
        ))}
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Toolbar */}
      <div className="glass-card p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search society, block, plot #, size..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | PlotRecord['category'])}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
          <option value="ALL">All Categories</option>
          {PLOT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | PlotRecord['status'])}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
          <option value="ALL">All Statuses</option>
          {PLOT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          {([
            { key: 'grid', icon: Grid3X3, title: 'Grid View' },
            { key: 'table', icon: Table2, title: 'Table View' },
            { key: 'map', icon: MapIcon, title: 'Visual Layout Map' },
          ] as { key: ViewMode; icon: typeof Grid3X3; title: string }[]).map((v) => (
            <button key={v.key} onClick={() => setView(v.key)} title={v.title}
              className={`p-2 rounded-lg transition-colors ${view === v.key ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}>
              <v.icon size={16} />
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading inventory...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center text-slate-500 text-sm">
          No plots match the current filters. Click "Add New Plot" to register inventory.
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((plot) => (
            <button key={plot.id} onClick={() => setSelected(plot)} className="glass-card glass-card-hover p-5 text-left space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${STATUS_STYLE[plot.category]} ${plot.category === 'RESIDENTIAL' ? 'status-emerald' : plot.category === 'COMMERCIAL' ? 'status-sky' : plot.category === 'INDUSTRIAL' ? 'status-purple' : 'status-amber'}`}>
                    {plot.category}
                  </span>
                  <h3 className="text-base font-bold text-white mt-2">{plot.society_name}</h3>
                  <p className="text-xs text-slate-400">Block/Phase {plot.block_phase} • Plot #{plot.plot_number}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[plot.status]}`}>
                  {(plot.status ?? '').replace(/_/g, ' ')}
                </span>
              </div>
              {parseFeatureTags(plot.feature_tags).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {parseFeatureTags(plot.feature_tags).map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full">
                      <Tag size={10} /> {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-1">
                  <Ruler size={12} className="text-slate-500" />
                  <span className="text-slate-500">Size</span>
                  <span className="font-semibold text-slate-200 ml-auto">{(plot as any).size_value ?? ''} {(plot as any).size_unit ?? plot.size_dimension}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={12} className="text-slate-500" />
                  <span className="text-slate-500">{plot.gps_coordinates ? 'GPS' : 'No GPS'}</span>
                  <span className="font-semibold text-sky-400 ml-auto">{fmt(plot.floor_price)}</span>
                </div>
                <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span className="text-slate-500">Cost Basis</span>
                  <span className="font-mono font-semibold text-slate-300">{fmt(plot.purchase_price)}</span>
                  <span className="text-slate-500">Target</span>
                  <span className="font-mono font-bold text-emerald-400">{fmt(plot.target_asking_price)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : view === 'table' ? (
        <div className="glass-card p-5 overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                <th className="pb-2 pr-4">Plot</th>
                <th className="pb-2 pr-4">Society</th>
                <th className="pb-2 pr-4">Block</th>
                <th className="pb-2 pr-4">Size</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Tags</th>
                <th className="pb-2 pr-4 text-right">Cost</th>
                <th className="pb-2 pr-4 text-right">Asking</th>
                <th className="pb-2 pr-4 text-right">Floor</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((plot) => (
                <tr key={plot.id} className="hover:bg-slate-800/30 cursor-pointer" onClick={() => setSelected(plot)}>
                  <td className="py-2.5 pr-4 font-semibold text-white">{plot.plot_number}</td>
                  <td className="py-2.5 pr-4 text-slate-300">{plot.society_name}</td>
                  <td className="py-2.5 pr-4 text-slate-400">{plot.block_phase}</td>
                  <td className="py-2.5 pr-4 text-slate-400">{plot.size_dimension}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${plot.category === 'COMMERCIAL' ? 'status-sky' : plot.category === 'INDUSTRIAL' ? 'status-purple' : plot.category === 'AGRICULTURAL' ? 'status-amber' : 'status-emerald'}`}>
                      {plot.category}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-500 max-w-[140px] truncate">{parseFeatureTags(plot.feature_tags).join(', ') || '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-slate-300">{fmt(plot.purchase_price)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-emerald-400">{fmt(plot.target_asking_price)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-sky-400">{fmt(plot.floor_price)}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[plot.status]}`}>{(plot.status ?? '').replace(/_/g, ' ')}</span>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setEditing(plot); setForm(formToState(plot)); setShowForm(true); }}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(plot)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card p-5 space-y-6">
          {groupedByBlock.length === 0 && <p className="text-center text-slate-500 text-sm py-10">No plots for map view.</p>}
          {groupedByBlock.map(([blockName, blockPlots]) => (
            <div key={blockName}>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <Layers size={15} className="text-amber-400" /> {blockName}
                <span className="text-[10px] text-slate-500">{blockPlots.length} plots</span>
              </h3>
              <div className="overflow-x-auto pb-2">
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', minWidth: 640 }}>
                  {blockPlots.map((plot) => (
                    <button key={plot.id} onClick={() => setSelected(plot)}
                      className="p-3 rounded-xl border text-left transition-all hover:-translate-y-0.5"
                      style={{ backgroundColor: `${STATUS_DOT[plot.status]}1a`, borderColor: `${STATUS_DOT[plot.status]}55` }}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_DOT[plot.status] }} />
                        <span className="text-[10px] font-bold text-white truncate">#{plot.plot_number}</span>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 truncate">{plot.size_dimension}</p>
                      <p className="text-[9px] font-mono text-slate-300 mt-0.5 truncate">{fmt(plot.target_asking_price)}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-slate-500 flex items-center gap-2">
            <span>Legend:</span>
            {PLOT_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_DOT[s] }} /> {s.replace(/_/g, ' ')}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">{editing ? `Edit Plot #${editing.plot_number}` : 'Register New Plot'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Society Name *</label>
                <input type="text" value={form.society_name} onChange={(e) => setForm({ ...form, society_name: e.target.value })}
                  className="input-base" placeholder="e.g. DHA Phase 2" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Block / Phase *</label>
                <input type="text" value={form.block_phase} onChange={(e) => setForm({ ...form, block_phase: e.target.value })}
                  className="input-base" placeholder="e.g. Block B" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Plot Number *</label>
                <input type="text" value={form.plot_number} onChange={(e) => setForm({ ...form, plot_number: e.target.value })}
                  className="input-base" placeholder="e.g. 102" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Size Value</label>
                <input type="number" min={0} step={0.25} value={form.size_value || ''} onChange={(e) => setForm({ ...form, size_value: Number(e.target.value) || 0 })}
                  className="input-base" placeholder="e.g. 5" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Unit</label>
                <select value={form.size_unit} onChange={(e) => setForm({ ...form, size_unit: e.target.value })} className="input-base">
                  {SIZE_UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PlotRecord['category'] })} className="input-base">
                  {PLOT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PlotRecord['status'] })} className="input-base">
                  {PLOT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Purchase Date</label>
                <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="input-base" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Feature Tags (comma separated)</label>
                <input type="text" value={form.feature_tags_input} onChange={(e) => setForm({ ...form, feature_tags_input: e.target.value })}
                  className="input-base" placeholder="Corner, Park Facing, Main Boulevard" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cost Basis (PKR)</label>
                <input type="number" min={0} value={form.purchase_price || ''} onChange={(e) => setForm({ ...form, purchase_price: Number(e.target.value) || 0 })}
                  className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Asking Price (PKR)</label>
                <input type="number" min={0} value={form.target_asking_price || ''} onChange={(e) => setForm({ ...form, target_asking_price: Number(e.target.value) || 0 })}
                  className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Floor Price (PKR)</label>
                <input type="number" min={0} value={form.floor_price || ''} onChange={(e) => setForm({ ...form, floor_price: Number(e.target.value) || 0 })}
                  className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">GPS Coordinates</label>
                <input type="text" value={form.gps_coordinates} onChange={(e) => setForm({ ...form, gps_coordinates: e.target.value })}
                  className="input-base" placeholder="31.5204, 74.3587" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input-base" placeholder="Internal remarks..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2 btn-primary text-xs disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update Plot' : 'Save Plot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Slide-Over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setSelected(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{selected.society_name} — Plot #{selected.plot_number}</h3>
                <p className="text-xs text-slate-400">Block/Phase {selected.block_phase}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 rounded-xl p-3"><p className="text-slate-500">Category</p><p className="font-semibold text-white mt-0.5">{selected.category}</p></div>
                <div className="bg-slate-950 rounded-xl p-3"><p className="text-slate-500">Size</p><p className="font-semibold text-white mt-0.5">{selected.size_dimension}</p></div>
                <div className="bg-slate-950 rounded-xl p-3"><p className="text-slate-500">Cost Basis</p><p className="font-mono font-semibold text-slate-300 mt-0.5">{fmt(selected.purchase_price)}</p></div>
                <div className="bg-slate-950 rounded-xl p-3"><p className="text-slate-500">Asking Price</p><p className="font-mono font-semibold text-emerald-400 mt-0.5">{fmt(selected.target_asking_price)}</p></div>
                <div className="bg-slate-950 rounded-xl p-3"><p className="text-slate-500">Floor Price</p><p className="font-mono font-semibold text-sky-400 mt-0.5">{fmt(selected.floor_price)}</p></div>
                <div className="bg-slate-950 rounded-xl p-3"><p className="text-slate-500">GPS</p><p className="font-mono text-slate-300 mt-0.5">{selected.gps_coordinates || '—'}</p></div>
              </div>
              {parseFeatureTags(selected.feature_tags).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <BadgeDollarSign size={13} className="text-slate-500" />
                  {parseFeatureTags(selected.feature_tags).map((tag) => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
              {selected.notes && <p className="text-xs text-slate-400 bg-slate-950 rounded-xl p-3">{selected.notes}</p>}
              <div>
                <p className="text-xs text-slate-400 mb-2 font-semibold">Change Status</p>
                <div className="flex flex-wrap gap-2">
                  {PLOT_STATUSES.filter(s => s !== selected.status).map((s) => (
                    <button key={s} onClick={() => quickStatusChange(selected, s)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold ${STATUS_STYLE[s]}`}>
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  onClick={() => { setForm(formToState(selected)); setEditing(selected); setSelected(null); setShowForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs">
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => handleDelete(selected)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl text-xs">
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlotInventory;