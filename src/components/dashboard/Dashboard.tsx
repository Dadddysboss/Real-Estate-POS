import React, { useState, useEffect } from 'react';
import {
  Warehouse, ShoppingBag, CreditCard, LandPlot, Users, TrendingUp, TrendingDown, DollarSign,
  ArrowUpRight, ArrowDownRight, Activity, Target, RefreshCw, Download, Eye, Plus
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { fetchDashboardMetrics, fetchMonthlyRevenue, fetchInventoryVelocity, fetchLeadConversion, DashboardMetrics } from '../../services/dashboard.service';

const COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];

export const Dashboard: React.FC<{ branchId: string }> = ({ branchId }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalInventoryValuation: 0,
    totalSales: 0,
    totalProfit: 0,
    installmentRecoveryRate: 0,
    cashCounterBalance: 0,
    digikhataLena: 0,
    digikhataDena: 0,
    agentCommissionDebt: 0,
    investorCapital: 0,
  });
  const [monthlyRevenue, setMonthlyRevenue] = useState<Array<{ month: string; revenue: number; profit: number; expenses: number }>>([]);
  const [inventoryVelocity, setInventoryVelocity] = useState<Array<{ category: string; count: number; value: number }>>([]);
  const [leadConversion, setLeadConversion] = useState<Array<{ stage: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, rev, inv, lead] = await Promise.all([
        fetchDashboardMetrics(branchId),
        fetchMonthlyRevenue(branchId),
        fetchInventoryVelocity(),
        fetchLeadConversion(),
      ]);
      setMetrics(m);
      setMonthlyRevenue(rev);
      setInventoryVelocity(inv);
      setLeadConversion(lead);
    } catch (error) {
      console.error('Dashboard load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [branchId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };

  const formatCompact = (value: number) => {
    if (value >= 1e7) return `Rs. ${(value / 1e7).toFixed(1)} Cr`;
    if (value >= 1e5) return `Rs. ${(value / 1e5).toFixed(1)} Lac`;
    if (value >= 1e3) return `Rs. ${(value / 1e3).toFixed(1)}K`;
    return `Rs. ${value}`;
  };

  const metricCards = [
    {
      label: 'Total Inventory Valuation',
      value: formatCompact(metrics.totalInventoryValuation),
      icon: Warehouse,
      color: 'emerald',
      trend: '+12.5%',
      trendIcon: TrendingUp,
    },
    {
      label: 'Total Sales Revenue',
      value: formatCompact(metrics.totalSales),
      icon: ShoppingBag,
      color: 'sky',
      trend: '+8.2%',
      trendIcon: TrendingUp,
    },
    {
      label: 'Net Profit',
      value: formatCompact(metrics.totalProfit),
      icon: DollarSign,
      color: metrics.totalProfit >= 0 ? 'emerald' : 'rose',
      trend: metrics.totalProfit >= 0 ? '+15.3%' : '-5.2%',
      trendIcon: metrics.totalProfit >= 0 ? TrendingUp : TrendingDown,
    },
    {
      label: 'Installment Recovery',
      value: `${metrics.installmentRecoveryRate}%`,
      icon: CreditCard,
      color: metrics.installmentRecoveryRate >= 80 ? 'emerald' : metrics.installmentRecoveryRate >= 50 ? 'amber' : 'rose',
      trend: 'Target: 90%',
      trendIcon: Target,
    },
    {
      label: 'Cash Counter Balance',
      value: formatCompact(metrics.cashCounterBalance),
      icon: CreditCard,
      color: metrics.cashCounterBalance >= 0 ? 'emerald' : 'rose',
      trend: 'Physical Verified',
      trendIcon: Activity,
    },
    {
      label: 'DigiKhata Lena (Credit)',
      value: formatCompact(metrics.digikhataLena),
      icon: LandPlot,
      color: 'emerald',
      trend: 'Receivable',
      trendIcon: ArrowUpRight,
    },
    {
      label: 'DigiKhata Dena (Debit)',
      value: formatCompact(metrics.digikhataDena),
      icon: LandPlot,
      color: 'rose',
      trend: 'Payable',
      trendIcon: ArrowDownRight,
    },
    {
      label: 'Agent Commission Debt',
      value: formatCompact(metrics.agentCommissionDebt),
      icon: Users,
      color: metrics.agentCommissionDebt > 0 ? 'amber' : 'emerald',
      trend: metrics.agentCommissionDebt > 0 ? 'Pending Payout' : 'All Clear',
      trendIcon: metrics.agentCommissionDebt > 0 ? TrendingUp : TrendingDown,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Business Intelligence Command Center</h2>
            <p className="text-sm text-slate-400">Live financial metrics & analytics overview</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card p-5 space-y-2 animate-pulse">
              <div className="h-4 bg-slate-800 rounded w-3/4"></div>
              <div className="h-8 bg-slate-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Business Intelligence Command Center</h2>
          <p className="text-sm text-slate-400">Live financial metrics & analytics overview</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            {(['7d', '30d', '90d', '1y'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  timeRange === range
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Refresh Data">
              <RefreshCw size={18} />
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Export Report">
              <Download size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card, i) => (
          <div
            key={i}
            className="glass-card glass-card-hover p-5 space-y-3 group"
            style={{ transitionDelay: `${i * 50}ms` }}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                <p className="text-2xl font-bold font-mono text-white currency-display mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.color === 'emerald' ? 'bg-emerald-500/10' : card.color === 'rose' ? 'bg-rose-500/10' : card.color === 'amber' ? 'bg-amber-500/10' : card.color === 'sky' ? 'bg-sky-500/10' : 'bg-purple-500/10'}`}>
                <card.icon className={`text-${card.color}-400`} size={22} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
              <div className={`flex items-center space-x-1 text-xs font-medium ${card.color === 'emerald' ? 'text-emerald-400' : card.color === 'rose' ? 'text-rose-400' : 'text-amber-400'}`}>
                <card.trendIcon size={12} />
                <span>{card.trend}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Revenue Trend - Area Chart */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-300">Monthly Revenue Trend</h3>
            <div className="flex items-center space-x-2">
              <span className="flex items-center space-x-1 text-xs text-slate-400">
                <span className="w-3 h-0.5 bg-emerald-500 rounded"></span>
                <span>Revenue</span>
              </span>
              <span className="flex items-center space-x-1 text-xs text-slate-400">
                <span className="w-3 h-0.5 bg-sky-500 rounded"></span>
                <span>Profit</span>
              </span>
            </div>
          </div>
          <div className="h-72">
            {monthlyRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyRevenue} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(value) => value.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickFormatter={(value) => value >= 1e7 ? `₹${(value / 1e7).toFixed(1)}Cr` : value >= 1e5 ? `₹${(value / 1e5).toFixed(1)}L` : `₹${value}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    }}
                    labelStyle={{ color: '#94a3b8', fontSize: '12px' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => value !== undefined ? [formatCurrency(value), ''] : ['', '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#16a34a"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorProfit)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No revenue data available</div>
            )}
          </div>
        </div>

        {/* Inventory Velocity - Pie Chart */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-bold text-slate-300 mb-4">Inventory Velocity by Category</h3>
          <div className="h-72">
            {inventoryVelocity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={inventoryVelocity}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="category"
                    label={({ category, percent }: { category?: string; percent?: number }) => `${category || ''} ${percent !== undefined ? (percent * 100).toFixed(0) : 0}%`}
                    labelLine={false}
                    stroke="#0f172a"
                    strokeWidth={2}
                  >
                    {inventoryVelocity.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => value !== undefined ? [formatCurrency(value), 'Value'] : ['', 'Value']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No inventory data</div>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {inventoryVelocity.map((item, i) => (
              <div key={item.category} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-slate-300 capitalize">{item.category}</span>
                </div>
                <span className="font-mono font-semibold text-white">{formatCompact(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Conversion Funnel - Bar Chart */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-bold text-slate-300 mb-4">Lead Pipeline Conversion</h3>
          <div className="h-72">
            {leadConversion.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadConversion} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    stroke="#64748b"
                    fontSize={11}
                    width={120}
                    tickFormatter={(stage) => stage.replace('_', ' ')}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#0ea5e9"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={30}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No lead data</div>
            )}
          </div>
        </div>

        {/* Investor Capital - Summary Card */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-bold text-slate-300 mb-4">Investor Capital Overview</h3>
          <div className="space-y-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-purple-400">Total Committed Capital</span>
              </div>
              <p className="text-2xl font-bold font-mono text-purple-400">{formatCompact(metrics.investorCapital)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <p className="text-xs text-slate-400">Active Pools</p>
                <p className="font-bold text-white">3</p>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <p className="text-xs text-slate-400">Total Investors</p>
                <p className="font-bold text-white">12</p>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-800">
              <button className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-semibold transition-colors">
                <Eye size={14} />
                <span>View Investor Pools</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-bold text-slate-300 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button className="flex items-center justify-center space-x-2 p-4 bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-xl transition-all group">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
              <Plus size={20} />
            </div>
            <span className="text-sm font-medium text-white">New Plot Entry</span>
          </button>
          <button className="flex items-center justify-center space-x-2 p-4 bg-slate-950 border border-slate-800 hover:border-sky-500/50 rounded-xl transition-all group">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg group-hover:bg-sky-500/20 transition-colors">
              <ShoppingBag size={20} />
            </div>
            <span className="text-sm font-medium text-white">Record Sale</span>
          </button>
          <button className="flex items-center justify-center space-x-2 p-4 bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all group">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg group-hover:bg-amber-500/20 transition-colors">
              <CreditCard size={20} />
            </div>
            <span className="text-sm font-medium text-white">Collect Installment</span>
          </button>
          <button className="flex items-center justify-center space-x-2 p-4 bg-slate-950 border border-slate-800 hover:border-purple-500/50 rounded-xl transition-all group">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover:bg-purple-500/20 transition-colors">
              <Users size={20} />
            </div>
            <span className="text-sm font-medium text-white">Add Lead</span>
          </button>
        </div>
      </div>
    </div>
  );
};