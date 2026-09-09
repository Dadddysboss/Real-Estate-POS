import React, { useState, useEffect } from 'react';
import { HardHat, Plus, X, Truck, AlertTriangle, DollarSign, Package, TrendingUp } from 'lucide-react';
import {
  fetchProjects, createProject,
  fetchMaterials, addMaterial, restockMaterial,
  recordUsage, fetchUsages, calculateProjectStats,
} from '../../services/construction.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface ConstructionTrackerProps {
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const ConstructionTracker: React.FC<ConstructionTrackerProps> = ({ currentUser }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [usages, setUsages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showRestock, setShowRestock] = useState(false);
  const [showUsageForm, setShowUsageForm] = useState(false);
  const [restockTarget, setRestockTarget] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Project form
  const [projectName, setProjectName] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState(0);
  const [description, setDescription] = useState('');

  // Material form
  const [materialName, setMaterialName] = useState('');
  const [category, setCategory] = useState<'CEMENT' | 'STEEL' | 'BRICKS' | 'SAND' | 'AGGREGATE' | 'PAINT' | 'ELECTRICAL' | 'PLUMBING' | 'OTHER'>('CEMENT');
  const [unit, setUnit] = useState('bags');
  const [quantity, setQuantity] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(0);
  const [costPerUnit, setCostPerUnit] = useState(0);
  const [supplier, setSupplier] = useState('');

  // Usage form
  const [materialForUsage, setMaterialForUsage] = useState('');
  const [usageQuantity, setUsageQuantity] = useState(0);
  const [usageDate, setUsageDate] = useState(new Date().toISOString().split('T')[0]);
  const [usagePurpose, setUsagePurpose] = useState('');

  // Restock form
  const [restockQuantity, setRestockQuantity] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const projData = await fetchProjects();
      setProjects(projData);
      if (projData.length > 0 && !selectedProject) setSelectedProject(projData[0]);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
    }
    setLoading(false);
  };

  const loadProjectData = async (projectId: string) => {
    try {
      const [matData, usageData] = await Promise.all([
        fetchMaterials(projectId),
        fetchUsages(projectId),
      ]);
      setMaterials(matData);
      setUsages(usageData);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (selectedProject) loadProjectData(selectedProject.id); }, [selectedProject]);

  const resetProjectForm = () => {
    setProjectName(''); setLocation(''); setBudget(0); setDescription('');
  };

  const handleCreateProject = async () => {
    if (!projectName.trim() || budget <= 0) {
      setMessage({ type: 'error', text: 'Project name and budget are required' });
      return;
    }
    try {
      await createProject(currentUser.id, currentUser.fullName, {
        project_name: projectName.trim(),
        location: location.trim(),
        total_budget: budget,
        description: description.trim(),
      });
      setMessage({ type: 'success', text: 'Project created' });
      setShowProjectForm(false);
      resetProjectForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create project' });
    }
  };

  const handleAddMaterial = async () => {
    if (!selectedProject || !materialName.trim() || quantity <= 0) {
      setMessage({ type: 'error', text: 'Material name and quantity are required' });
      return;
    }
    try {
      await addMaterial(currentUser.id, currentUser.fullName, {
        project_id: selectedProject.id,
        material_name: materialName.trim(),
        category, unit,
        quantity_in_stock: quantity,
        reorder_level: reorderLevel,
        cost_per_unit: costPerUnit,
        supplier_name: supplier.trim(),
        last_restocked: usageDate,
      });
      setMessage({ type: 'success', text: 'Material added' });
      setShowMaterialForm(false);
      setMaterialName(''); setQuantity(0); setReorderLevel(0);
      setCostPerUnit(0); setSupplier('');
      await loadProjectData(selectedProject.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add material' });
    }
  };

  const handleRestock = async () => {
    if (!restockTarget || restockQuantity <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid quantity' });
      return;
    }
    try {
      await restockMaterial(restockTarget.id, restockQuantity, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: `Restocked +${restockQuantity} units` });
      setShowRestock(false);
      setRestockTarget(null);
      setRestockQuantity(0);
      await loadProjectData(selectedProject.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to restock' });
    }
  };

  const handleRecordUsage = async () => {
    if (!selectedProject || !materialForUsage || usageQuantity <= 0) {
      setMessage({ type: 'error', text: 'Select material and enter quantity' });
      return;
    }
    try {
      await recordUsage(currentUser.id, currentUser.fullName, {
        project_id: selectedProject.id,
        material_id: materialForUsage,
        quantity_used: usageQuantity,
        usage_date: usageDate,
        purpose: usagePurpose.trim(),
      });
      setMessage({ type: 'success', text: 'Usage recorded' });
      setShowUsageForm(false);
      setUsageQuantity(0); setUsagePurpose('');
      await loadProjectData(selectedProject.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record usage' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HardHat size={24} className="text-amber-400" /> Construction & Material Tracker
          </h2>
          <p className="text-sm text-slate-400">Module 14 — Budget vs spend, material stock, usage logging</p>
        </div>
        <button onClick={() => { setShowProjectForm(true); resetProjectForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> New Project
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Project List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Projects</h3>
          {projects.map((proj) => {
            const stats = calculateProjectStats(proj, materials.filter(m => m.project_id === proj.id));
            return (
              <button key={proj.id} onClick={() => setSelectedProject(proj)}
                className={`w-full text-left glass-card glass-card-hover p-3 ${selectedProject?.id === proj.id ? 'ring-2 ring-amber-500/50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-white text-sm">{proj.project_name}</h4>
                    <p className="text-[10px] text-slate-500">{proj.location}</p>
                  </div>
                  <span className="text-[10px] text-sky-400">{fmtNum(stats.materialCount)} items</span>
                </div>
                <div className="mt-2 w-full bg-slate-800 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, stats.spentPercentage)}%` }} />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{stats.spentPercentage.toFixed(0)}% of budget used</p>
                {stats.lowStockCount > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-400">
                    <AlertTriangle size={10} />{stats.lowStockCount} low stock
                  </div>
                )}
              </button>
            );
          })}
          {projects.length === 0 && <div className="text-center text-slate-500 text-sm p-8">No projects</div>}
        </div>

        {/* Project Detail */}
        <div className="lg:col-span-3">
          {selectedProject ? (() => {
            const projectMaterials = materials.filter(m => m.project_id === selectedProject.id);
            const stats = calculateProjectStats(selectedProject, projectMaterials);
            return (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Total Budget</p>
                    <p className="text-base font-bold text-white mt-1 font-mono">{fmt(stats.target)}</p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Stock Value</p>
                    <p className="text-base font-bold text-amber-400 mt-1 font-mono">{fmt(stats.materialCosts)}</p>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Low Stock Items</p>
                    <p className="text-base font-bold text-rose-400 mt-1 font-mono">{stats.lowStockCount}</p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-rose-400"><AlertTriangle size={12} /></div>
                  </div>
                  <div className="glass-card p-4">
                    <p className="text-[10px] uppercase text-slate-500">Materials</p>
                    <p className="text-base font-bold text-sky-400 mt-1 font-mono">{stats.materialCount}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="glass-card p-4 flex flex-wrap gap-3">
                  <button onClick={() => { setShowMaterialForm(true); }}
                    className="flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-semibold transition">
                    <Package size={12} className="inline mr-1" /> Add Material
                  </button>
                  <button onClick={() => { setShowUsageForm(true); }}
                    className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold transition">
                    <Truck size={12} className="inline mr-1" /> Log Usage
                  </button>
                </div>

                {/* Materials Table */}
                <div className="glass-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-950/60 text-slate-400">
                          <th className="py-3 px-4">Material</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4 text-right">In Stock</th>
                          <th className="py-3 px-4 text-right">Value</th>
                          <th className="py-3 px-4 text-center">Stock Level</th>
                          <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {projectMaterials.map((mat) => (
                          <tr key={mat.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 px-4">
                              <p className="font-medium text-white">{mat.material_name}</p>
                              <p className="text-[10px] text-slate-500">{mat.supplier_name || '—'}</p>
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">{mat.category}</span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-white">{mat.quantity_in_stock} {mat.unit}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-amber-400">{fmt(mat.quantity_in_stock * mat.cost_per_unit)}</td>
                            <td className="py-2.5 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mat.quantity_in_stock <= mat.reorder_level ? 'status-rose' : 'status-emerald'}`}>
                                {mat.quantity_in_stock <= mat.reorder_level ? 'LOW' : 'OK'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <button onClick={() => { setRestockTarget(mat); setRestockQuantity(0); setShowRestock(true); }}
                                className="p-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 rounded" title="Restock">
                                <Truck size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {projectMaterials.length === 0 && (
                          <tr><td colSpan={6} className="py-6 text-center text-slate-500">No materials added</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Usages */}
                {usages.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-bold text-white mb-3">Recent Usage</h3>
                    <div className="space-y-2">
                      {usages.slice(0, 10).map((u) => (
                        <div key={u.id} className="flex items-center justify-between bg-slate-950/60 rounded-lg p-3 text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-sky-500/10 rounded-full flex items-center justify-center">
                              <DollarSign size={12} className="text-sky-400" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{u.material_name}</p>
                              <p className="text-[10px] text-slate-500">{u.purpose} · {u.usage_date}</p>
                            </div>
                          </div>
                          <p className="font-mono font-bold text-rose-400">-{fmtNum(u.quantity_used)} {u.unit || 'units'}</p>
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
              <p>Select a project to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {showProjectForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowProjectForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">New Project</h3>
              <button onClick={() => setShowProjectForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Project Name *</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Total Budget *</label>
                <input type="number" min={0} value={budget || ''} onChange={(e) => setBudget(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowProjectForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleCreateProject} className="px-5 py-2 btn-primary text-xs">Create Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Material Modal */}
      {showMaterialForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowMaterialForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add Material</h3>
              <button onClick={() => setShowMaterialForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Material Name *</label>
                <input type="text" value={materialName} onChange={(e) => setMaterialName(e.target.value)} className="input-base" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="input-base">
                    {['CEMENT','STEEL','BRICKS','SAND','AGGREGATE','PAINT','ELECTRICAL','PLUMBING','OTHER'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Unit</label>
                  <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} className="input-base" placeholder="bags/tons/units" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Initial Quantity *</label>
                  <input type="number" min={0} value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Reorder Level</label>
                  <input type="number" min={0} value={reorderLevel || ''} onChange={(e) => setReorderLevel(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Cost / Unit</label>
                  <input type="number" min={0} value={costPerUnit || ''} onChange={(e) => setCostPerUnit(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Supplier</label>
                  <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="input-base" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowMaterialForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddMaterial} className="px-5 py-2 btn-primary text-xs">Add Material</button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {showRestock && restockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowRestock(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Restock Material</h3>
              <button onClick={() => setShowRestock(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-950/60 rounded-lg p-3 text-xs">
                <p className="text-slate-400">Current Stock</p>
                <p className="font-mono text-white text-lg font-bold">{restockTarget.quantity_in_stock} {restockTarget.unit}</p>
                <p className="text-slate-500 mt-1">Reorder Level: {restockTarget.reorder_level}</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Quantity to Add *</label>
                <input type="number" min={1} value={restockQuantity || ''} onChange={(e) => setRestockQuantity(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowRestock(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleRestock} className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold">Restock</button>
            </div>
          </div>
        </div>
      )}

      {/* Log Usage Modal */}
      {showUsageForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowUsageForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Log Material Usage</h3>
              <button onClick={() => setShowUsageForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Material *</label>
                <select value={materialForUsage} onChange={(e) => setMaterialForUsage(e.target.value)} className="input-base">
                  <option value="">Select material...</option>
                  {materials.filter(m => m.project_id === selectedProject?.id).map(m => (
                    <option key={m.id} value={m.id}>{m.material_name} ({m.quantity_in_stock} {m.unit})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Quantity Used *</label>
                  <input type="number" min={1} value={usageQuantity || ''} onChange={(e) => setUsageQuantity(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input type="date" value={usageDate} onChange={(e) => setUsageDate(e.target.value)} className="input-base" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Purpose</label>
                <input type="text" value={usagePurpose} onChange={(e) => setUsagePurpose(e.target.value)} className="input-base" placeholder="Foundation work, etc." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowUsageForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleRecordUsage} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold">Log Usage</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-PK');
export default ConstructionTracker;