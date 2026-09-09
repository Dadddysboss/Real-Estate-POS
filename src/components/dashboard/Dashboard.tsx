import React, { useState, useEffect, useCallback } from 'react';
import {
  Warehouse, ShoppingBag, CreditCard, LandPlot, Users, TrendingUp, TrendingDown,
  Activity, Target, RefreshCw, Download, Eye, Plus,
  Banknote, FileText, BarChart3, DollarSign, LayoutDashboard, Loader2,
} from 'lucide-react';

const COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];

interface MetricData {
  totalInventoryValuation: number;
  totalSales: number;
  cashCounterBalance: number;
  digikhataLena: number;
  digikhataDena: number;
  agentCommissionDebt: number;
  installmentRecoveryRate: number;
  totalPlots: number;
  totalLeads: number;
  activeInstallments: number;
  totalInstallmentValue: number;
  paidInstallmentValue: number;
}

interface InventoryVelocity {
  category: string;
  count: number;
  value: number;
}

interface LeadPipeline {
  stage: string;
  count: number;
}

interface SalesRow {
  id: string;
  buyer_name: string;
  buyer_phone: string;
  final_sale_price: number;
  net_profit_calculated: number;
  sale_date: string;
  plot_number: string;
  society_name: string;
}

export interface DashboardProps {
  branchId: string;
  onNavigate?: (module: string) => void;
}

const formatCompact = (value: number): string => {
  if (value >= 1e7) return `Rs. ${(value / 1e7).toFixed(1)} Cr`;
  if (value >= 1e5) return `Rs. ${(value / 1e5).toFixed(1)} Lac`;
  if (value >= 1e3) return `Rs. ${(value / 1e3).toFixed(1)}K`;
  return `Rs. ${value}`;
};

export const Dashboard: React.FC<DashboardProps> = ({ branchId, onNavigate }) => {
  const [metrics, setMetrics] = useState<MetricData>({
    totalInventoryValuation: 0,
    totalSales: 0,
    cashCounterBalance: 0,
    digikhataLena: 0,
    digikhataDena: 0,
    agentCommissionDebt: 0,
    installmentRecoveryRate: 0,
    totalPlots: 0,
    totalLeads: 0,
    activeInstallments: 0,
    totalInstallmentValue: 0,
    paidInstallmentValue: 0,
  });
  const [inventoryVelocity, setInventoryVelocity] = useState<InventoryVelocity[]>([]);
  const [leadPipeline, setLeadPipeline] = useState<LeadPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const invSql = `SELECT COALESCE(SUM(target_asking_price), 0) as total, COUNT(*) as cnt FROM inventory_plots WHERE branch_id = ? AND status = 'AVAILABLE'`;
      const salesSql = `SELECT COALESCE(SUM(final_sale_price), 0) as total FROM sales_transactions st JOIN inventory_plots p ON st.plot_id = p.id WHERE p.branch_id = ?`;
      const cashSql = `SELECT opening_balance, status FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`;
      const lenaSql = `SELECT COALESCE(SUM(amount), 0) as total FROM digikhata_entries WHERE entry_type = 'CREDIT_LENA'`;
      const denaSql = `SELECT COALESCE(SUM(amount), 0) as total FROM digikhata_entries WHERE entry_type = 'DEBIT_DENA'`;
      const agentSql = `SELECT COALESCE(SUM(balance_due), 0) as total FROM agent_commissions WHERE status IN ('UNPAID', 'PARTIAL')`;
      const instSql = `
        SELECT
          COALESCE(SUM(CASE WHEN s.status = 'PAID' THEN s.amount_due ELSE 0 END), 0) as paid,
          COALESCE(SUM(s.amount_due), 0) as total
        FROM installment_schedules s
        JOIN installment_plans p ON s.plan_id = p.id
        JOIN inventory_plots ip ON p.plot_id = ip.id
        WHERE ip.branch_id = ?
      `;
      const instCountSql = `SELECT COUNT(*) as cnt FROM installment_plans p JOIN inventory_plots ip ON p.plot_id = ip.id WHERE ip.branch_id = ? AND p.status = 'ACTIVE'`;
      const totalPlotsSql = `SELECT COUNT(*) as cnt FROM inventory_plots WHERE branch_id = ?`;
      const leadsSql = `SELECT COUNT(*) as cnt FROM leads WHERE branch_id = ?`;
      const velSql = `SELECT category, COUNT(*) as count, COALESCE(SUM(target_asking_price), 0) as value FROM inventory_plots WHERE status = 'AVAILABLE' GROUP BY category`;
      const pipelineSql = `SELECT pipeline_stage as stage, COUNT(*) as count FROM leads GROUP BY pipeline_stage ORDER BY CASE pipeline_stage WHEN 'NEW_LEAD' THEN 1 WHEN 'CONTACTED' THEN 2 WHEN 'SITE_VISIT' THEN 3 WHEN 'NEGOTIATION' THEN 4 WHEN 'CLOSED_WON' THEN 5 WHEN 'CLOSED_LOST' THEN 6 END`;

      const results = await Promise.all([
        window.api.dbQuery(invSql, [branchId]),
        window.api.dbQuery(salesSql, [branchId]),
        window.api.dbQuery(cashSql, [branchId]),
        window.api.dbQuery(lenaSql, []),
        window.api.dbQuery(denaSql, []),
        window.api.dbQuery(agentSql, []),
        window.api.dbQuery(instSql, [branchId]),
        window.api.dbQuery(instCountSql, [branchId]),
        window.api.dbQuery(totalPlotsSql, [branchId]),
        window.api.dbQuery(leadsSql, [branchId]),
        window.api.dbQuery(velSql, []),
        window.api.dbQuery(pipelineSql, []),
      ]);

      const invRes = results[0];
      const salesRes = results[1];
      const cashRes = results[2];
      const lenaRes = results[3];
      const denaRes = results[4];
      const agentRes = results[5];
      const instRes = results[6];
      const instCountRes = results[7];
      const totalPlotsRes = results[8];
      const leadsRes = results[9];
      const velRes = results[10];
      const pipelineRes = results[11];

      const paidVal = (instRes.data?.[0] as Record<string, unknown>)?.paid as number || 0;
      const totalVal = (instRes.data?.[0] as Record<string, unknown>)?.total as number || 1;

      setMetrics({
        totalInventoryValuation: (invRes.data?.[0] as Record<string, unknown>)?.total as number || 0,
        totalSales: (salesRes.data?.[0] as Record<string, unknown>)?.total as number || 0,
        cashCounterBalance: (cashRes.data?.[0] as Record<string, unknown>)?.opening_balance as number || 0,
        digikhataLena: (lenaRes.data?.[0] as Record<string, unknown>)?.total as number || 0,
        digikhataDena: (denaRes.data?.[0] as Record<string, unknown>)?.total as number || 0,
        agentCommissionDebt: (agentRes.data?.[0] as Record<string, unknown>)?.total as number || 0,
        installmentRecoveryRate: totalVal > 0 ? Math.round((paidVal / totalVal) * 100) : 0,
        totalPlots: (totalPlotsRes.data?.[0] as Record<string, unknown>)?.cnt as number || 0,
        totalLeads: (leadsRes.data?.[0] as Record<string, unknown>)?.cnt as number || 0,
        activeInstallments: (instCountRes.data?.[0] as Record<string, unknown>)?.cnt as number || 0,
        totalInstallmentValue: totalVal,
        paidInstallmentValue: paidVal,
      });

      setInventoryVelocity((velRes.data || []) as InventoryVelocity[]);
      setLeadPipeline((pipelineRes.data || []) as LeadPipeline[]);
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const sql = `
        SELECT st.id, st.buyer_name, st.buyer_phone, st.final_sale_price,
               st.net_profit_calculated, st.sale_date, ip.plot_number, ip.society_name
        FROM sales_transactions st
        JOIN inventory_plots ip ON st.plot_id = ip.id
        ORDER BY st.sale_date DESC
      `;
      const res = await window.api.dbQuery(sql, []);
      const rows = (res.data || []) as SalesRow[];

      const header = 'ID,Buyer Name,Phone,Sale Price,Net Profit,Sale Date,Plot,Society\n';
      const csvBody = rows.map(r =>
        `${r.id},${r.buyer_name},${r.buyer_phone},${r.final_sale_price},${r.net_profit_calculated},${r.sale_date},${r.plot_number || ''},${r.society_name || ''}`
      ).join('\n');

      const blob = new Blob([header + csvBody], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  const metricCards = [
    {
      label: 'Total Inventory Valuation',
      value: formatCompact(metrics.totalInventoryValuation),
      sub: `${metrics.totalPlots} plots available`,
      icon: Warehouse,
      color: 'emerald',
      trend: '+12.5%',
      trendUp: true,
      navigate: 'inventory',
    },
    {
      label: 'Total Sales Revenue',
      value: formatCompact(metrics.totalSales),
      sub: 'Lifetime sales',
      icon: ShoppingBag,
      color: 'sky',
      trend: '+8.2%',
      trendUp: true,
      navigate: 'sales',
    },
    {
      label: 'Cash Counter Balance',
      value: formatCompact(metrics.cashCounterBalance),
      sub: 'Current session',
      icon: Banknote,
      color: metrics.cashCounterBalance >= 0 ? 'emerald' : 'rose',
      trend: metrics.cashCounterBalance >= 0 ? 'Positive' : 'Deficit',
      trendUp: metrics.cashCounterBalance >= 0,
      navigate: 'cash-counter',
    },
    {
      label: 'DigiKhata Lena / Dena',
      value: formatCompact(metrics.digikhataLena),
      value2: formatCompact(metrics.digikhataDena),
      sub: `Dena: ${formatCompact(metrics.digikhataDena)}`,
      icon: LandPlot,
      color: 'amber',
      trend: `Dena: ${formatCompact(metrics.digikhataDena)}`,
      trendUp: false,
      navigate: 'digikhata',
    },
    {
      label: 'Agent Commission Debt',
      value: formatCompact(metrics.agentCommissionDebt),
      sub: 'Pending payouts',
      icon: Users,
      color: metrics.agentCommissionDebt > 0 ? 'amber' : 'emerald',
      trend: metrics.agentCommissionDebt > 0 ? 'Pending' : 'All Clear',
      trendUp: metrics.agentCommissionDebt > 0,
      navigate: 'agents',
    },
    {
      label: 'Installment Recovery',
      value: `${metrics.installmentRecoveryRate}%`,
      sub: `${metrics.activeInstallments} active plans`,
      icon: CreditCard,
      color: metrics.installmentRecoveryRate >= 80 ? 'emerald' : metrics.installmentRecoveryRate >= 50 ? 'amber' : 'rose',
      trend: `Target: 90%`,
      trendUp: metrics.installmentRecoveryRate >= 80,
      navigate: 'installments',
    },
  ];

  const quickActions = [
    { label: 'Add Plot', icon: Plus, color: 'emerald', navigate: 'inventory' },
    { label: 'Record Sale', icon: ShoppingBag, color: 'sky', navigate: 'sales' },
    { label: 'Collect Installment', icon: CreditCard, color: 'amber', navigate: 'installments' },
    { label: 'Add Lead', icon: Users, color: 'purple', navigate: 'leads' },
    { label: 'Open Ledger', icon: BookIcon, color: 'rose', navigate: 'digikhata' },
    { label: 'Overheads', icon: FileText, color: 'slate', navigate: 'overheads' },
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string; hoverBorder: string }> = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', hoverBorder: 'hover:border-emerald-500/50' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', hoverBorder: 'hover:border-sky-500/50' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', hoverBorder: 'hover:border-amber-500/50' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', hoverBorder: 'hover:border-rose-500/50' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', hoverBorder: 'hover:border-purple-500/50' },
    slate: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', hoverBorder: 'hover:border-slate-500/50' },
  };

  const pipelineColors: Record<string, string> = {
    NEW_LEAD: '#0ea5e9',
    CONTACTED: '#a855f7',
    SITE_VISIT: '#f59e0b',
    NEGOTIATION: '#f97316',
    CLOSED_WON: '#16a34a',
    CLOSED_LOST: '#ef4444',
  };

  if (loading) {
    return (
      <div className="space-y-6 p-1">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-slate-800/60 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-9 w-9 bg-slate-800 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/50 space-y-3 animate-pulse">
              <div className="flex justify-between">
                <div className="h-3 w-28 bg-slate-800 rounded" />
                <div className="h-10 w-10 bg-slate-800 rounded-xl" />
              </div>
              <div className="h-8 w-32 bg-slate-800 rounded" />
              <div className="h-3 w-20 bg-slate-800/60 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-72 bg-slate-900/60 border border-slate-800/50 rounded-2xl animate-pulse" />
          <div className="h-72 bg-slate-900/60 border border-slate-800/50 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl">
            <LayoutDashboard className="text-emerald-400" size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Business Command Center</h2>
            <p className="text-sm text-slate-400">Live financial metrics & module navigation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50"
            title="Refresh Data"
          >
            {refreshing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl text-xs font-medium transition-all disabled:opacity-50"
            title="Export Sales CSV"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Metric Cards - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((card, i) => {
          const cc = colorClasses[card.color];
          return (
            <button
              key={i}
              onClick={() => onNavigate?.(card.navigate)}
              className={`text-left p-5 rounded-2xl bg-slate-900/60 border ${cc.border} ${cc.hoverBorder} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-900/50 group`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                  <p className="text-2xl font-bold font-mono text-white">{card.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${cc.bg} group-hover:scale-110 transition-transform`}>
                  <card.icon className={cc.text} size={22} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                <span className="text-xs text-slate-500">{card.sub}</span>
                <div className={`flex items-center space-x-1 text-xs font-medium ${card.trendUp ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {card.trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{card.trend}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory Velocity by Category */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-sky-400" size={18} />
            <h3 className="text-sm font-bold text-slate-300">Inventory by Category</h3>
          </div>
          <div className="space-y-3">
            {inventoryVelocity.length > 0 ? inventoryVelocity.map((item, i) => {
              const maxVal = Math.max(...inventoryVelocity.map(v => v.value), 1);
              const pct = (item.value / maxVal) * 100;
              return (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 capitalize font-medium">{item.category}</span>
                    <span className="font-mono text-white">{item.count} plots</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                    />
                  </div>
                  <div className="text-right text-[10px] text-slate-500 font-mono">{formatCompact(item.value)}</div>
                </div>
              );
            }) : (
              <div className="h-32 flex items-center justify-center text-slate-500 text-sm">No inventory data</div>
            )}
          </div>
        </div>

        {/* Lead Pipeline */}
        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="text-purple-400" size={18} />
              <h3 className="text-sm font-bold text-slate-300">Lead Pipeline</h3>
            </div>
            <span className="text-xs text-slate-500">{metrics.totalLeads} total leads</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {leadPipeline.length > 0 ? leadPipeline.map((item) => {
              const color = pipelineColors[item.stage] || '#64748b';
              return (
                <div key={item.stage} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-2 hover:border-slate-700 transition-colors">
                  <div className="w-full h-1 rounded-full" style={{ backgroundColor: color }} />
                  <p className="text-2xl font-bold font-mono text-white">{item.count}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
                    {(item.stage ?? '').replace(/_/g, ' ')}
                  </p>
                </div>
              );
            }) : (
              <div className="col-span-full h-32 flex items-center justify-center text-slate-500 text-sm">No leads yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Investor + Installment Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Investor Pool */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="text-purple-400" size={18} />
            <h3 className="text-sm font-bold text-slate-300">Investor Pool</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <p className="text-xs font-semibold text-purple-400 mb-1">Total Committed Capital</p>
              <p className="text-2xl font-bold font-mono text-purple-400">
                {formatCompact(metrics.digikhataLena + metrics.digikhataDena)}
              </p>
            </div>
            <button
              onClick={() => onNavigate?.('investors')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-semibold transition-colors"
            >
              <Eye size={14} />
              <span>View Investor Pool</span>
            </button>
          </div>
        </div>

        {/* Installment Summary */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Target className="text-amber-400" size={18} />
            <h3 className="text-sm font-bold text-slate-300">Installment Overview</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <p className="text-xs text-slate-400">Collected</p>
                <p className="font-bold font-mono text-emerald-400">{formatCompact(metrics.paidInstallmentValue)}</p>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <p className="text-xs text-slate-400">Total Due</p>
                <p className="font-bold font-mono text-white">{formatCompact(metrics.totalInstallmentValue)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Recovery Rate</span>
                <span className="font-mono text-white">{metrics.installmentRecoveryRate}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    metrics.installmentRecoveryRate >= 80 ? 'bg-emerald-500' :
                    metrics.installmentRecoveryRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${metrics.installmentRecoveryRate}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">{metrics.activeInstallments} active installment plans</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <LayoutDashboard className="text-emerald-400" size={18} />
          <h3 className="text-sm font-bold text-slate-300">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => {
            const cc = colorClasses[action.color];
            return (
              <button
                key={action.label}
                onClick={() => onNavigate?.(action.navigate)}
                className={`flex flex-col items-center justify-center gap-2 p-4 bg-slate-950 border border-slate-800 ${cc.hoverBorder} rounded-xl transition-all group hover:scale-[1.03]`}
              >
                <div className={`p-2.5 ${cc.bg} ${cc.text} rounded-xl group-hover:scale-110 transition-transform`}>
                  <action.icon size={20} />
                </div>
                <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function BookIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  );
}
