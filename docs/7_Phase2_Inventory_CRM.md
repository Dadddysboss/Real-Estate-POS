# 7. Phase 2 Implementation Blueprint – Core Inventory, Plazas & CRM Engine (Modules 1–7)
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Scope:** Phase 2 Execution (Modules 1 to 7: Branch Switcher, Cash Counter, Plot Inventory, Commercial Plazas, CRM Pipeline, Land Acquisition, & Agent Network)
**Enforcement Level:** High Performance, 100% Parameterized SQL, Type-Safe TSX, Strict Dual-Sync Queue Compliance

---

## 1. Phase 2 Architecture Overview & Module Scope

Phase 2 builds the core inventory management, physical cash drawer tracking, and customer relationship management engine of the ERP system.

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 2 MODULE ARCHITECTURE                           │
├───────────────────┬─────────────────────────────────────────────────────────────┤
│ Module 1          │ System Settings & Multi-Branch Switcher                     │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 2          │ Cash Counter Drawer & Physical Denomination Tracker         │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 3          │ Plots Inventory (Residential, Commercial, Industrial, Agro) │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 4          │ Commercial Plazas & Multi-Unit Floor Hierarchy Engine       │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 5          │ CRM Lead Kanban Pipeline & Site Visit Manager               │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 6          │ Seller / Land Acquisition Ledger                            │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 7          │ Agent Network & Commission Hierarchy Tracker                │
└───────────────────┴─────────────────────────────────────────────────────────────┘


---

## 2. IPC Service Contracts & Database Query Layer (`src/services/inventory.service.ts`)

```typescript
import { DatabaseResponse } from '../../electron/preload';

export interface PlotRecord {
  id: string;
  branch_id: string;
  society_name: string;
  block_sector: string;
  plot_number: string;
  plot_type: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'AGRICULTURAL';
  size_marla: number;
  cost_price: number;
  selling_price: number;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'DISPUTED';
  created_at?: string;
}

export interface PlazaFloorUnit {
  id: string;
  plaza_id: string;
  floor_number: number;
  unit_number: string;
  unit_type: 'SHOP' | 'OFFICE' | 'HALL' | 'PENTHOUSE';
  area_sqft: number;
  price: number;
  status: 'AVAILABLE' | 'RENTED' | 'SOLD' | 'RESERVED';
}

export interface CrmLead {
  id: string;
  branch_id: string;
  customer_name: string;
  phone: string;
  budget: number;
  preferred_location: string;
  stage: 'NEW' | 'CONTACTED' | 'SITE_VISIT' | 'NEGOTIATION' | 'WON' | 'LOST';
  assigned_agent_id?: string;
  site_visit_date?: string;
  notes?: string;
}

// ------------------------------------------------------------------
// PLOT INVENTORY DB OPERATIONS
// ------------------------------------------------------------------

export async function fetchPlots(branchId: string, search = ''): Promise<PlotRecord[]> {
  const sql = `
    SELECT * FROM plots 
    WHERE branch_id = ? 
      AND (society_name LIKE ? OR plot_number LIKE ? OR block_sector LIKE ?)
    ORDER BY created_at DESC
  `;
  const searchPattern = `%${search}%`;
  const res: DatabaseResponse<PlotRecord[]> = await window.api.dbQuery(sql, [branchId, searchPattern, searchPattern, searchPattern]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch plots');
  return res.data;
}

export async function createPlot(plot: Omit<PlotRecord, 'id'>): Promise<void> {
  const id = `PLOT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO plots (id, branch_id, society_name, block_sector, plot_number, plot_type, size_marla, cost_price, selling_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const args = [
    id,
    plot.branch_id,
    plot.society_name,
    plot.block_sector,
    plot.plot_number,
    plot.plot_type,
    plot.size_marla,
    plot.cost_price,
    plot.selling_price,
    plot.status || 'AVAILABLE',
  ];
  
  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to insert plot record');
}

// ------------------------------------------------------------------
// CRM LEADS DB OPERATIONS
// ------------------------------------------------------------------

export async function fetchLeads(branchId: string): Promise<CrmLead[]> {
  const sql = `SELECT * FROM crm_leads WHERE branch_id = ? ORDER BY created_at DESC`;
  const res: DatabaseResponse<CrmLead[]> = await window.api.dbQuery(sql, [branchId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch leads');
  return res.data;
}

export async function updateLeadStage(leadId: string, stage: CrmLead['stage']): Promise<void> {
  const sql = `UPDATE crm_leads SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const res = await window.api.dbExecute(sql, [stage, leadId]);
  if (!res.success) throw new Error(res.error || 'Failed to update lead stage');
}
3. UI Component Implementations
A. Module 1: System Settings & Multi-Branch Switcher (src/components/settings/BranchSwitcher.tsx)
TypeScript
import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check, Plus } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  is_active: boolean;
}

interface BranchSwitcherProps {
  currentBranchId: string;
  onBranchChange: (branch: Branch) => void;
}

export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ currentBranchId, onBranchChange }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const res = await window.api.dbQuery<Branch>('SELECT * FROM branches WHERE is_active = 1', []);
      if (res.success && res.data) {
        setBranches(res.data);
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  };

  const activeBranch = branches.find((b) => b.id === currentBranchId) || branches[0];

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 bg-slate-900 border border-slate-800 hover:border-slate-700 px-4 py-2.5 rounded-xl text-white transition-all shadow-sm"
      >
        <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
          <Building2 size="{18}"/>
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-400 font-medium">Active Branch</p>
          <p className="text-sm font-semibold tracking-wide">{activeBranch ? activeBranch.name : 'Loading...'}</p>
        </div>
        <ChevronDown className="text-slate-400 ml-2" size="{16}"/>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 divide-y divide-slate-800/60">
          <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Select Office Location
          </div>
          <div className="py-1">
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => {
                  onBranchChange(branch);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-800/80 transition-colors"
              >
                <div>
                  <span className="font-semibold block text-left">{branch.name}</span>
                  <span className="text-[10px] text-slate-400">{branch.city} ({branch.code})</span>
                </div>
                {branch.id === currentBranchId && <Check className="text-emerald-400" size="{16}"/>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
B. Module 2: Cash Counter & Physical Denomination Tracker (src/components/cash/CashCounter.tsx)
TypeScript
import React, { useState, useMemo } from 'react';
import { DollarSign, RefreshCw, Calculator, Save } from 'lucide-react';

interface DenominationCount {
  [key: number]: number;
}

export const CashCounter: React.FC = () => {
  const denominations = [5000, 1000, 500, 100, 50, 20, 10];
  const [counts, setCounts] = useState<DenominationCount>({
    5000: 0, 1000: 0, 500: 0, 100: 0, 50: 0, 20: 0, 10: 0,
  });

  const handleCountChange = (denom: number, value: string) => {
    const val = parseInt(value, 10) || 0;
    setCounts((prev) => ({ ...prev, [denom]: val }));
  };

  const totalCalculated = useMemo(() => {
    return Object.entries(counts).reduce((sum, [denom, count]) => sum + Number(denom) * count, 0);
  }, [counts]);

  const handleSaveAudit = async () => {
    try {
      const sql = `
        INSERT INTO cash_counter_logs (id, total_amount, breakdown_json, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;
      const id = `CASH_${Date.now()}`;
      await window.api.dbExecute(sql, [id, totalCalculated, JSON.stringify(counts)]);
      alert('Cash Drawer Audit saved successfully!');
    } catch (err) {
      alert('Error saving cash counter log.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-2xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Calculator size="{22}"/>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Physical Cash Counter Drawer</h2>
            <p className="text-xs text-slate-400">Pakistani Rupee (PKR) Denomination Verification</p>
          </div>
        </div>
        <button
          onClick={() => setCounts({ 5000: 0, 1000: 0, 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 })}
          className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
          title="Reset Counts"
        >
          <RefreshCw size="{16}"/>
        </button>
      </div>

      <div className="space-y-3">
        {denominations.map((denom) => (
          <div key={denom} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <span className="text-sm font-semibold text-emerald-400 w-24">Rs. {denom}</span>
            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-500">×</span>
              <input
                type="number"
                min="0"
                value={counts[denom] || ''}
                onChange={(e) => handleCountChange(denom, e.target.value)}
                placeholder="0"
                className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-right text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <span className="text-sm font-mono font-semibold text-white w-32 text-right">
              Rs. {((counts[denom] || 0) * denom).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Vault Cash</span>
          <p className="text-2xl font-bold text-emerald-400 font-mono">
            Rs. {totalCalculated.toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleSaveAudit}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-emerald-950/50"
        >
          <Save size="{18}"/>
          <span>Save Cash Audit</span>
        </button>
      </div>
    </div>
  );
};
C. Module 3: Plots Inventory Management (src/components/inventory/PlotInventory.tsx)
TypeScript
import React, { useState, useEffect } from 'react';
import { Plus, Search, MapPin, Tag, Filter, CheckCircle, AlertTriangle } from 'lucide-react';
import { fetchPlots, createPlot, PlotRecord } from '../../services/inventory.service';

interface PlotInventoryProps {
  branchId: string;
}

export const PlotInventory: React.FC<PlotInventoryProps> = ({ branchId }) => {
  const [plots, setPlots] = useState<PlotRecord[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form State
  const [society, setSociety] = useState('');
  const [block, setBlock] = useState('');
  const [plotNum, setPlotNum] = useState('');
  const [plotType, setPlotType] = useState<PlotRecord['plot_type']>('RESIDENTIAL');
  const [marla, setMarla] = useState(5);
  const [costPrice, setCostPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);

  useEffect(() => {
    loadPlotData();
  }, [branchId, search]);

  const loadPlotData = async () => {
    try {
      const data = await fetchPlots(branchId, search);
      setPlots(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createPlot({
        branch_id: branchId,
        society_name: society,
        block_sector: block,
        plot_number: plotNum,
        plot_type: plotType,
        size_marla: marla,
        cost_price: costPrice,
        selling_price: sellingPrice,
        status: 'AVAILABLE',
      });
      setIsModalOpen(false);
      loadPlotData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 text-slate-500" size="{18}"/>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search society, block, or plot #..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-emerald-950/40"
        >
          <Plus size="{18}"/>
          <span>Add New Plot</span>
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plots.map((plot) => (
          <div key={plot.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  {plot.plot_type}
                </span>
                <h3 className="text-base font-bold text-white mt-2">{plot.society_name}</h3>
                <p className="text-xs text-slate-400">Block/Sector {plot.block_sector} • Plot #{plot.plot_number}</p>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  plot.status === 'AVAILABLE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : plot.status === 'RESERVED'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {plot.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-500 block">Size</span>
                <span className="font-semibold text-slate-200">{plot.size_marla} Marla</span>
              </div>
              <div>
                <span className="text-slate-500 block">Selling Price</span>
                <span className="font-mono font-bold text-emerald-400">Rs. {plot.selling_price.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Register New Plot Inventory</h2>
            <form onSubmit={handleAddPlot} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Society Name</label>
                  <input
                    type="text"
                    required
                    value={society}
                    onChange={(e) => setSociety(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Block / Sector</label>
                  <input
                    type="text"
                    required
                    value={block}
                    onChange={(e) => setBlock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Plot #</label>
                  <input
                    type="text"
                    required
                    value={plotNum}
                    onChange={(e) => setPlotNum(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Type</label>
                  <select
                    value={plotType}
                    onChange={(e) => setPlotType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                  >
                    <option value="RESIDENTIAL">Residential</option>
                    <option value="COMMERCIAL">Commercial</option>
                    <option value="INDUSTRIAL">Industrial</option>
                    <option value="AGRICULTURAL">Agricultural</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Marla</label>
                  <input
                    type="number"
                    value={marla}
                    onChange={(e) => setMarla(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Cost Price (PKR)</label>
                  <input
                    type="number"
                    value={costPrice}
                    onChange={(e) => setCostPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Selling Price (PKR)</label>
                  <input
                    type="number"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-500"
                >
                  Save Plot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
D. Module 5: CRM Lead Kanban Pipeline (src/components/crm/CrmPipeline.tsx)
TypeScript
import React, { useState, useEffect } from 'react';
import { User, Phone, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { fetchLeads, updateLeadStage, CrmLead } from '../../services/inventory.service';

interface CrmPipelineProps {
  branchId: string;
}

const STAGES: CrmLead['stage'][] = ['NEW', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'WON', 'LOST'];

export const CrmPipeline: React.FC<CrmPipelineProps> = ({ branchId }) => {
  const [leads, setLeads] = useState<CrmLead[]>([]);

  useEffect(() => {
    loadLeads();
  }, [branchId]);

  const loadLeads = async () => {
    try {
      const data = await fetchLeads(branchId);
      setLeads(data);
    } catch (err) {
      console.error('Error fetching CRM leads:', err);
    }
  };

  const handleStageAdvance = async (leadId: string, currentStage: CrmLead['stage']) => {
    const currentIndex = STAGES.indexOf(currentStage);
    if (currentIndex < STAGES.length - 1) {
      const nextStage = STAGES[currentIndex + 1];
      await updateLeadStage(leadId, nextStage);
      loadLeads();
    }
  };

  return (
    <div className="flex space-x-4 overflow-x-auto pb-6 select-none">
      {STAGES.map((stage) => {
        const stageLeads = leads.filter((l) => l.stage === stage);
        return (
          <div key={stage} className="w-80 flex-shrink-0 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{stage}</span>
              <span className="text-xs bg-slate-800 text-slate-400 font-mono px-2 py-0.5 rounded-full font-semibold">
                {stageLeads.length}
              </span>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {stageLeads.map((lead) => (
                <div key={lead.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{lead.customer_name}</span>
                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                      Rs. {(lead.budget / 100000).toFixed(1)} Lac
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400">
                    <div className="flex items-center space-x-2">
                      <Phone className="text-slate-500" size="{12}"/>
                      <span>{lead.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="text-slate-500" size="{12}"/>
                      <span>{lead.preferred_location}</span>
                    </div>
                  </div>

                  {stage !== 'WON' && stage !== 'LOST' && (
                    <button
                      onClick={() => handleStageAdvance(lead.id, lead.stage)}
                      className="w-full flex items-center justify-center space-x-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 rounded-lg transition-colors border border-slate-800 mt-2"
                    >
                      <span>Move Forward</span>
                      <ArrowRight size="{12}"/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
4. Pre-Flight Verification Checklist for Phase 2
Before completing Phase 2 code review, verify the following standards:

[ ] Type Safety: Zero implicit any types in inventory.service.ts, PlotInventory.tsx, CashCounter.tsx, and CrmPipeline.tsx.

[ ] Database Integrity: SQL queries explicitly bind arguments using array parameterization [args].

[ ] Multi-Branch Isolation: All inventory queries filter specifically by branch_id.

[ ] Denomination Precision: Physical cash drawer total recalculates automatically without state drift.

[ ] Offline Performance: Local SQLite CRUD operations perform in < 15ms.