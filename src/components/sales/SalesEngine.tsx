import React, { useState, useEffect } from 'react';
import { ShoppingBag, X, Printer, FileText, Search } from 'lucide-react';

interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  branchId?: string;
}

interface SalesEngineProps {
  branchId: string;
  currentUser: CurrentUser;
}

interface SoldPlotRow {
  sale_id: string;
  plot_id: string;
  plot_number: string;
  society_name: string;
  block_phase: string;
  size_dimension: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_cnic: string;
  final_sale_price: number;
  cost_basis: number;
  government_taxes: number;
  agent_commission: number;
  payment_method: string;
  sale_date: string;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const SalesEngine: React.FC<SalesEngineProps> = ({ branchId, currentUser: _currentUser }) => {
  const [soldPlots, setSoldPlots] = useState<SoldPlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<SoldPlotRow | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const fetchSoldPlots = async () => {
    setLoading(true);
    try {
      const res = await window.api.dbQuery<SoldPlotRow>(
        `SELECT
          st.id as sale_id,
          st.plot_id,
          ip.plot_number,
          ip.society_name,
          ip.block_phase,
          ip.size_dimension,
          st.buyer_name,
          st.buyer_phone,
          st.buyer_cnic,
          st.final_sale_price,
          st.cost_basis,
          st.government_taxes,
          st.agent_commission,
          st.payment_method,
          st.sale_date
        FROM sales_transactions st
        INNER JOIN inventory_plots ip ON st.plot_id = ip.id
        WHERE ip.branch_id = ? AND ip.status = 'SOLD'
        ORDER BY st.sale_date DESC`,
        [branchId]
      );
      if (res.success && res.data) {
        setSoldPlots(res.data);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load sold plots' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchSoldPlots(); }, [branchId]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [message]);

  const filtered = soldPlots.filter((row) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.buyer_name.toLowerCase().includes(term) ||
      row.plot_number.toLowerCase().includes(term) ||
      row.society_name.toLowerCase().includes(term) ||
      row.block_phase.toLowerCase().includes(term) ||
      row.buyer_phone.includes(term) ||
      (row.buyer_cnic && row.buyer_cnic.includes(term)) ||
      row.sale_id.toLowerCase().includes(term)
    );
  });

  const totalRevenue = soldPlots.reduce((s, r) => s + r.final_sale_price, 0);
  const totalCashCollected = soldPlots.reduce((s, r) => s + r.cost_basis, 0);
  const totalOutstanding = totalRevenue - totalCashCollected;

  const handlePrintReceipt = async (row: SoldPlotRow) => {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════');
    lines.push('            SALE RECEIPT');
    lines.push('═══════════════════════════════════════════════');
    lines.push(`  Receipt # : ${row.sale_id}`);
    lines.push(`  Date      : ${row.sale_date}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Buyer     : ${row.buyer_name}`);
    if (row.buyer_phone) lines.push(`  Phone     : ${row.buyer_phone}`);
    if (row.buyer_cnic) lines.push(`  CNIC      : ${row.buyer_cnic}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Plot      : ${row.plot_number}`);
    lines.push(`  Society   : ${row.society_name}`);
    lines.push(`  Block     : ${row.block_phase}`);
    lines.push(`  Size      : ${row.size_dimension}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Sale Price    : ${fmt(row.final_sale_price)}`);
    lines.push(`  Cost Basis    : ${fmt(row.cost_basis)}`);
    if (row.government_taxes > 0) lines.push(`  Govt Taxes    : ${fmt(row.government_taxes)}`);
    if (row.agent_commission > 0) lines.push(`  Agent Comm    : ${fmt(row.agent_commission)}`);
    const outstanding = row.final_sale_price - row.cost_basis;
    if (outstanding > 0) lines.push(`  Outstanding   : ${fmt(outstanding)}`);
    lines.push(`  Payment       : ${row.payment_method.replace('_', ' ')}`);
    lines.push('═══════════════════════════════════════════════');
    lines.push('          Thank you for your purchase!');
    lines.push('═══════════════════════════════════════════════');
    const receiptText = lines.join('\n');

    try {
      const res = await window.api.printReceipt(receiptText);
      if (!res.success) throw new Error(res.error || 'Print failed');
      setMessage({ type: 'success', text: 'Receipt sent to printer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Print failed' });
    }
  };

  const openDetail = (row: SoldPlotRow) => {
    setSelectedSale(row);
    setShowDetail(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading sales records...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag size={24} className="text-emerald-400" /> Sales Engine
          </h2>
          <p className="text-sm text-slate-400">All sold plots — transaction details & receipt management</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Revenue</p>
          <p className="text-lg font-bold text-white mt-1 font-mono">{fmt(totalRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">{soldPlots.length} sale{soldPlots.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Cash Collected</p>
          <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">{fmt(totalCashCollected)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Outstanding Balance</p>
          <p className="text-lg font-bold text-amber-400 mt-1 font-mono">{fmt(totalOutstanding)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search buyer, plot, society, CNIC, or sale ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Sold Plots Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4">Plot #</th>
                <th className="py-3 px-4">Society</th>
                <th className="py-3 px-4">Buyer Name</th>
                <th className="py-3 px-4 text-right">Sale Price</th>
                <th className="py-3 px-4">Sale Date</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((row) => (
                <tr
                  key={row.sale_id}
                  className="hover:bg-slate-900/40 cursor-pointer"
                  onClick={() => openDetail(row)}
                >
                  <td className="py-3 px-4">
                    <div className="font-mono text-white font-medium">{row.plot_number}</div>
                    <div className="text-[10px] text-slate-500">{row.block_phase} Block</div>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{row.society_name}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-white">{row.buyer_name}</p>
                    <p className="text-[10px] text-slate-500">{row.buyer_phone}</p>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white">{fmt(row.final_sale_price)}</td>
                  <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                    {row.sale_date ? new Date(row.sale_date).toLocaleDateString('en-PK') : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      row.payment_method === 'CASH'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                    }`}>
                      {row.payment_method.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openDetail(row)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        title="View Details"
                      >
                        <FileText size={12} />
                      </button>
                      <button
                        onClick={() => handlePrintReceipt(row)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        title="Print Receipt"
                      >
                        <Printer size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {soldPlots.length === 0
                      ? 'No sold plots found. Sales appear here after processing through Cash Counter.'
                      : 'No results match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetail && selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowDetail(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-2xl z-10">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-emerald-400" /> Sale Detail
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedSale.sale_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintReceipt(selectedSale)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                >
                  <Printer size={12} /> Print
                </button>
                <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Customer Info */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Customer Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Customer Name</p>
                    <p className="text-sm font-medium text-white mt-1">{selectedSale.buyer_name}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">CNIC</p>
                    <p className="text-sm font-mono text-white mt-1">{selectedSale.buyer_cnic || '—'}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Phone</p>
                    <p className="text-sm text-white mt-1">{selectedSale.buyer_phone || '—'}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Sale Date</p>
                    <p className="text-sm text-white mt-1">
                      {selectedSale.sale_date ? new Date(selectedSale.sale_date).toLocaleDateString('en-PK', {
                        year: 'numeric', month: 'long', day: 'numeric',
                      }) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Plot Info */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Plot Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Plot Number</p>
                    <p className="text-sm font-mono text-white mt-1">{selectedSale.plot_number}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Society</p>
                    <p className="text-sm text-white mt-1">{selectedSale.society_name}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Block</p>
                    <p className="text-sm text-white mt-1">{selectedSale.block_phase}</p>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-500 font-bold">Size</p>
                    <p className="text-sm text-white mt-1">{selectedSale.size_dimension}</p>
                  </div>
                </div>
              </div>

              {/* Financial Details */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Financial Details</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3">
                    <span className="text-xs text-slate-400">Sold Price</span>
                    <span className="text-sm font-mono font-bold text-white">{fmt(selectedSale.final_sale_price)}</span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3">
                    <span className="text-xs text-slate-400">Cash Paid</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">{fmt(selectedSale.cost_basis)}</span>
                  </div>
                  {selectedSale.government_taxes > 0 && (
                    <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3">
                      <span className="text-xs text-slate-400">Government Taxes</span>
                      <span className="text-sm font-mono font-bold text-amber-400">{fmt(selectedSale.government_taxes)}</span>
                    </div>
                  )}
                  {selectedSale.agent_commission > 0 && (
                    <div className="flex items-center justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3">
                      <span className="text-xs text-slate-400">Agent Commission</span>
                      <span className="text-sm font-mono font-bold text-rose-400">{fmt(selectedSale.agent_commission)}</span>
                    </div>
                  )}
                  <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                    (selectedSale.final_sale_price - selectedSale.cost_basis) > 0
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-emerald-500/10 border-emerald-500/30'
                  }`}>
                    <span className="text-xs font-semibold text-slate-300">Outstanding Balance</span>
                    <span className={`text-sm font-mono font-bold ${
                      (selectedSale.final_sale_price - selectedSale.cost_basis) > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {fmt(selectedSale.final_sale_price - selectedSale.cost_basis)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Payment Method</h4>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${
                  selectedSale.payment_method === 'CASH'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                }`}>
                  {selectedSale.payment_method.replace('_', ' ')}
                </div>
              </div>

              {/* Receipt Details */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Receipt Details</h4>
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Sale ID</span>
                    <span className="text-xs font-mono text-slate-300">{selectedSale.sale_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Date</span>
                    <span className="text-xs text-slate-300">
                      {selectedSale.sale_date ? new Date(selectedSale.sale_date).toLocaleString('en-PK') : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Total Amount</span>
                    <span className="text-xs font-mono font-bold text-white">{fmt(selectedSale.final_sale_price)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesEngine;
