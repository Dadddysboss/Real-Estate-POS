import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, X, Phone, Hash, Building2, Percent,
  DollarSign, Loader2, CheckCircle2, AlertCircle, ChevronDown,
  ChevronUp, Search, UserPlus, Banknote, TrendingUp, AlertTriangle,
} from 'lucide-react';

interface Agent {
  id: string;
  agent_name: string;
  agency_name: string;
  phone_number: string;
  cnic: string;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_rate: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AgentCommission {
  id: string;
  agent_id: string;
  deal_id: string | null;
  property_description: string | null;
  deal_amount: number;
  commission_amount: number;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_rate: number;
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID';
  amount_paid: number;
  deal_date: string;
  created_at: string;
}

interface AgentForm {
  agent_name: string;
  agency_name: string;
  phone_number: string;
  cnic: string;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_rate: string;
}

const fmt = (n: number): string => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const emptyForm: AgentForm = {
  agent_name: '',
  agency_name: '',
  phone_number: '',
  cnic: '',
  commission_type: 'PERCENTAGE',
  commission_rate: '',
};

const AgentNetwork: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commissions, setCommissions] = useState<Record<string, AgentCommission[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AgentForm>({ ...emptyForm });
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PERCENTAGE' | 'FIXED'>('ALL');

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await window.api.dbQuery<Agent>(
        'SELECT * FROM agents ORDER BY created_at DESC',
        []
      );
      if (res.success && res.data) {
        setAgents(res.data);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to fetch agents' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to fetch agents' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCommissionsForAgent = useCallback(async (agentId: string) => {
    try {
      const res = await window.api.dbQuery<AgentCommission>(
        'SELECT * FROM agent_commissions WHERE agent_id = ? ORDER BY deal_date DESC, created_at DESC',
        [agentId]
      );
      if (res.success && res.data) {
        setCommissions(prev => ({ ...prev, [agentId]: res.data! }));
      }
    } catch (err) {
      console.error('Fetch commissions error:', err);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const toggleAgent = useCallback((agentId: string) => {
    setExpandedAgent(prev => {
      const next = prev === agentId ? null : agentId;
      if (next && !commissions[next]) {
        fetchCommissionsForAgent(next);
      }
      return next;
    });
  }, [commissions, fetchCommissionsForAgent]);

  const handleCreateAgent = async () => {
    if (!form.agent_name.trim()) {
      setMessage({ type: 'error', text: 'Agent name is required' });
      return;
    }
    if (!form.phone_number.trim()) {
      setMessage({ type: 'error', text: 'Phone number is required' });
      return;
    }
    if (!form.cnic.trim()) {
      setMessage({ type: 'error', text: 'CNIC is required' });
      return;
    }
    const rate = parseFloat(form.commission_rate);
    if (isNaN(rate) || rate <= 0) {
      setMessage({ type: 'error', text: 'Commission rate must be a positive number' });
      return;
    }

    try {
      setSubmitting(true);
      const now = new Date().toISOString();
      const res = await window.api.dbExecute(
        `INSERT INTO agents (id, agent_name, agency_name, phone_number, cnic, commission_type, commission_rate, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        [
          `AGT-${Date.now()}`,
          form.agent_name.trim(),
          form.agency_name.trim(),
          form.phone_number.trim(),
          form.cnic.trim(),
          form.commission_type,
          rate,
          now,
          now,
        ]
      );
      if (res.success) {
        setMessage({ type: 'success', text: `Agent "${form.agent_name}" registered successfully` });
        setForm({ ...emptyForm });
        setShowForm(false);
        fetchAgents();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to create agent' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create agent' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (!confirm(`Delete agent "${agent.agent_name}"? This cannot be undone.`)) return;
    try {
      const res = await window.api.dbExecute('DELETE FROM agents WHERE id = ?', [agent.id]);
      if (res.success) {
        setMessage({ type: 'success', text: `Agent "${agent.agent_name}" deleted` });
        setCommissions(prev => {
          const next = { ...prev };
          delete next[agent.id];
          return next;
        });
        fetchAgents();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to delete agent' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete agent' });
    }
  };

  const filteredAgents = agents.filter(agent => {
    const sq = (searchQuery ?? '').toLowerCase();
    const matchesSearch =
      (agent.agent_name ?? '').toLowerCase().includes(sq) ||
      (agent.agency_name ?? '').toLowerCase().includes(sq) ||
      (agent.phone_number ?? '').includes(searchQuery) ||
      (agent.cnic ?? '').includes(searchQuery);
    const matchesType = filterType === 'ALL' || agent.commission_type === filterType;
    return matchesSearch && matchesType;
  });

  const getAgentStats = (agentId: string) => {
    const agentComms = commissions[agentId] || [];
    const totalEarned = agentComms.reduce((sum, c) => sum + c.commission_amount, 0);
    const totalPaid = agentComms.reduce((sum, c) => sum + c.amount_paid, 0);
    const outstanding = totalEarned - totalPaid;
    return { totalEarned, totalPaid, outstanding, dealCount: agentComms.length };
  };

  const globalStats = {
    totalAgents: agents.length,
    activeAgents: agents.filter(a => a.status === 'ACTIVE').length,
    totalCommissions: Object.values(commissions).flat().reduce((sum, c) => sum + c.commission_amount, 0),
    totalPaid: Object.values(commissions).flat().reduce((sum, c) => sum + c.amount_paid, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={24} className="text-emerald-400" /> Agent Network
          </h2>
          <p className="text-sm text-slate-400">Register agents, track commissions & manage payouts</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition"
        >
          <UserPlus size={16} /> Register Agent
        </button>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Users size={14} /> Total Agents
          </div>
          <p className="text-2xl font-bold text-white">{globalStats.totalAgents}</p>
          <p className="text-xs text-emerald-400 mt-1">{globalStats.activeAgents} active</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <TrendingUp size={14} /> Total Commission
          </div>
          <p className="text-2xl font-bold text-emerald-400">{fmt(globalStats.totalCommissions)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <Banknote size={14} /> Paid Out
          </div>
          <p className="text-2xl font-bold text-white">{fmt(globalStats.totalPaid)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <AlertTriangle size={14} /> Outstanding
          </div>
          <p className="text-2xl font-bold text-amber-400">{fmt(globalStats.totalCommissions - globalStats.totalPaid)}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents by name, phone, CNIC..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
        <div className="flex gap-2">
          {(['ALL', 'PERCENTAGE', 'FIXED'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
                filterType === type
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {type === 'ALL' ? 'All Types' : type === 'PERCENTAGE' ? '% Percentage' : 'Fixed Rs.'}
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="text-emerald-400 animate-spin" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{searchQuery ? 'No agents match your search' : 'No agents registered yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAgents.map(agent => {
            const expanded = expandedAgent === agent.id;
            const stats = getAgentStats(agent.id);
            const agentComms = commissions[agent.id] || [];

            return (
              <div key={agent.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                {/* Agent Row */}
                <div
                  onClick={() => toggleAgent(agent.id)}
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-800/50 transition"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm truncate">{agent.agent_name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        agent.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {agent.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400">
                        {agent.commission_type === 'PERCENTAGE' ? `${agent.commission_rate}%` : fmt(agent.commission_rate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Building2 size={12} /> {agent.agency_name || 'N/A'}</span>
                      <span className="flex items-center gap-1"><Phone size={12} /> {agent.phone_number}</span>
                      <span className="flex items-center gap-1"><Hash size={12} /> {agent.cnic}</span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-right mr-2">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Earned</p>
                      <p className="text-sm font-semibold text-emerald-400">{fmt(stats.totalEarned)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Paid</p>
                      <p className="text-sm font-semibold text-white">{fmt(stats.totalPaid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Outstanding</p>
                      <p className={`text-sm font-semibold ${stats.outstanding > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {fmt(stats.outstanding)}
                      </p>
                    </div>
                  </div>
                  <button className="text-slate-400 hover:text-white ml-2">
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>

                {/* Expanded: Commission Details */}
                {expanded && (
                  <div className="border-t border-slate-800 p-4 bg-slate-950/50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Commission History</h4>
                      <button
                        onClick={() => handleDeleteAgent(agent)}
                        className="text-xs text-red-400 hover:text-red-300 transition"
                      >
                        Delete Agent
                      </button>
                    </div>

                    {/* Mobile Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4 sm:hidden">
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-slate-500">Earned</p>
                        <p className="text-sm font-bold text-emerald-400">{fmt(stats.totalEarned)}</p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-slate-500">Paid</p>
                        <p className="text-sm font-bold text-white">{fmt(stats.totalPaid)}</p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-slate-500">Outstanding</p>
                        <p className={`text-sm font-bold ${stats.outstanding > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{fmt(stats.outstanding)}</p>
                      </div>
                    </div>

                    {agentComms.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">No commission records for this agent</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 uppercase border-b border-slate-800">
                              <th className="text-left py-2 pr-3 font-semibold">Date</th>
                              <th className="text-left py-2 pr-3 font-semibold">Property</th>
                              <th className="text-right py-2 pr-3 font-semibold">Deal Amt</th>
                              <th className="text-right py-2 pr-3 font-semibold">Commission</th>
                              <th className="text-right py-2 pr-3 font-semibold">Paid</th>
                              <th className="text-right py-2 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {agentComms.map(c => (
                              <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                <td className="py-2.5 pr-3 text-slate-300">{c.deal_date}</td>
                                <td className="py-2.5 pr-3 text-white max-w-[180px] truncate">{c.property_description || '—'}</td>
                                <td className="py-2.5 pr-3 text-right text-slate-300">{fmt(c.deal_amount)}</td>
                                <td className="py-2.5 pr-3 text-right text-emerald-400 font-semibold">{fmt(c.commission_amount)}</td>
                                <td className="py-2.5 pr-3 text-right text-white">{fmt(c.amount_paid)}</td>
                                <td className="py-2.5 text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    c.payment_status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400' :
                                    c.payment_status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400' :
                                    'bg-red-500/10 text-red-400'
                                  }`}>
                                    {c.payment_status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Register Agent Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus size={18} className="text-emerald-400" /> Register New Agent
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Agent Name *</label>
                <input
                  type="text"
                  value={form.agent_name}
                  onChange={(e) => setForm({ ...form, agent_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                  placeholder="e.g. Ahmad Khan"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Agency Name</label>
                <input
                  type="text"
                  value={form.agency_name}
                  onChange={(e) => setForm({ ...form, agency_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                  placeholder="e.g. Dripp Real Estate"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Phone Number *</label>
                  <input
                    type="text"
                    value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                    placeholder="0300 1234567"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">CNIC *</label>
                  <input
                    type="text"
                    value={form.cnic}
                    onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                    placeholder="35202-1234567-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Commission Type *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, commission_type: 'PERCENTAGE' })}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition border ${
                        form.commission_type === 'PERCENTAGE'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Percent size={14} /> Percentage
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, commission_type: 'FIXED' })}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition border ${
                        form.commission_type === 'FIXED'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <DollarSign size={14} /> Fixed (Rs.)
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Commission Rate * {form.commission_type === 'PERCENTAGE' ? '(%)' : '(Rs.)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.commission_rate}
                    onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                    placeholder={form.commission_type === 'PERCENTAGE' ? 'e.g. 2.5' : 'e.g. 50000'}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAgent}
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Register Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentNetwork;
