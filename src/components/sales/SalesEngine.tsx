import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, X, Search, Trash2 } from 'lucide-react';
import { PlotSaleDetailModal } from './PlotSaleDetailModal';

interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
}

interface SalesEngineProps {
  branchId: string;
  currentUser: CurrentUser;
}

interface SalesDealRow {
  id: string;
  deal_id: string | null;
  plot_id: string;
  cash_counter_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_cnic: string;
  total_deal_price: number;
  down_payment: number;
  balance_amount: number;
  sales_agent: string;
  payment_mode: string;
  sale_date: string;
  notes: string;
  created_at: string;
  plot_number?: string;
  society_name?: string;
  block_phase?: string;
  size_dimension?: string;
}

const fmt = (n: number): string => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const SalesEngine: React.FC<SalesEngineProps> = ({ branchId: _branchId, currentUser: _currentUser }) => {
  const [deals, setDeals] = useState<SalesDealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<SalesDealRow | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.api.dbQuery<SalesDealRow>(
        `SELECT
           p.id AS plot_id,
           p.plot_number,
           p.society_name,
           p.block_phase,
           p.size_dimension,
           sd.id AS deal_id,
           sd.cash_counter_id,
           COALESCE(sd.buyer_name, 'Direct Buyer') AS buyer_name,
           COALESCE(sd.buyer_phone, 'N/A') AS buyer_phone,
           COALESCE(sd.buyer_cnic, 'N/A') AS buyer_cnic,
           COALESCE(sd.total_deal_price, p.target_asking_price, 0) AS total_deal_price,
           COALESCE(sd.down_payment, 0) AS down_payment,
           COALESCE(sd.balance_amount, 0) AS balance_amount,
           COALESCE(sd.sales_agent, 'Direct') AS sales_agent,
           COALESCE(sd.payment_mode, 'CASH') AS payment_mode,
           COALESCE(sd.sale_date, p.updated_at, CURRENT_TIMESTAMP) AS sale_date,
           sd.notes,
           COALESCE(sd.created_at, p.updated_at, CURRENT_TIMESTAMP) AS created_at
         FROM inventory_plots p
         LEFT JOIN sales_deals sd ON sd.plot_id = p.id
         WHERE p.status = 'SOLD' OR sd.id IS NOT NULL
         ORDER BY sale_date DESC`,
        []
      );
      if (res.success && res.data) {
        const mapped = res.data.map((row) => ({
          ...row,
          id: row.deal_id || row.plot_id,
        }));
        setDeals(mapped);
        console.log(`[SalesEngine] Loaded ${mapped.length} sold plots`);
      }
    } catch (err) {
      console.error('[SalesEngine] Fetch error:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load deals' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [message]);

  const filtered = deals.filter((row) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      row.buyer_name.toLowerCase().includes(term) ||
      row.plot_number?.toLowerCase().includes(term) ||
      row.society_name?.toLowerCase().includes(term) ||
      row.block_phase?.toLowerCase().includes(term) ||
      row.id.toLowerCase().includes(term)
    );
  });

  const totalRevenue = deals.reduce((s, r) => s + (r.total_deal_price || 0), 0);
  const totalCollected = deals.reduce((s, r) => s + (r.total_deal_price - r.balance_amount || 0), 0);
  const totalOutstanding = deals.reduce((s, r) => s + (r.balance_amount || 0), 0);

  const openDetail = (row: SalesDealRow) => {
    setSelectedDeal(row);
    setShowDetail(true);
  };

  const handleDeleteDeal = async (plotId: string, dealId: string | null) => {
    if (!window.confirm('Delete this sale record? The plot will revert to AVAILABLE.')) return;
    try {
      if (dealId) {
        await window.api.dbExecute('DELETE FROM sales_deals WHERE id = ?', [dealId]);
      }
      await window.api.dbExecute('DELETE FROM sales_transactions WHERE plot_id = ?', [plotId]);
      await window.api.dbExecute("UPDATE inventory_plots SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [plotId]);
      setMessage({ type: 'success', text: 'Sale deleted. Plot reverted to AVAILABLE.' });
      await fetchDeals();
    } catch (err) {
      console.error('[SalesEngine] Delete error:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete deal' });
    }
  };

  const handlePrintReceipt = async (deal: SalesDealRow) => {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════');
    lines.push('            SALE RECEIPT');
    lines.push('═══════════════════════════════════════════════');
    lines.push(`  Receipt # : ${deal.id}`);
    lines.push(`  Cash Ref  : ${deal.cash_counter_id || '—'}`);
    lines.push(`  Date      : ${deal.sale_date}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Buyer     : ${deal.buyer_name || '—'}`);
    if (deal.buyer_phone && deal.buyer_phone !== 'N/A') lines.push(`  Phone     : ${deal.buyer_phone}`);
    if (deal.buyer_cnic && deal.buyer_cnic !== 'N/A') lines.push(`  CNIC      : ${deal.buyer_cnic}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Plot      : ${deal.plot_number || '—'}`);
    lines.push(`  Society   : ${deal.society_name || '—'}`);
    lines.push(`  Block     : ${deal.block_phase || '—'}`);
    lines.push(`  Size      : ${deal.size_dimension || '—'}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Total Price  : ${fmt(deal.total_deal_price)}`);
    lines.push(`  Down Payment : ${fmt(deal.down_payment)}`);
    lines.push(`  Balance      : ${fmt(deal.balance_amount)}`);
    lines.push(`  Payment Mode : ${deal.payment_mode}`);
    lines.push(`  Agent        : ${deal.sales_agent || '—'}`);
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

  const handleSendWhatsApp = (deal: SalesDealRow) => {
    if (!deal.buyer_phone || deal.buyer_phone === 'N/A') {
      setMessage({ type: 'error', text: 'No phone number on record.' });
      return;
    }
    const msg = encodeURIComponent(
      `Sale Confirmation\n` +
      `Deal #${deal.id}\n` +
      `Plot: ${deal.plot_number} (${deal.society_name}, Block ${deal.block_phase})\n` +
      `Buyer: ${deal.buyer_name}\n` +
      `Phone: ${deal.buyer_phone}\n` +
      `Total Price: ${fmt(deal.total_deal_price)}\n` +
      `Balance: ${fmt(deal.balance_amount)}\n` +
      `Thank you for your purchase!`
    );
    window.open(`https://wa.me/${deal.buyer_phone}?text=${msg}`, '_blank');
    setMessage({ type: 'success', text: 'Opening WhatsApp...' });
  };

  const handleEditNotes = async (deal: SalesDealRow, newNotes: string) => {
    if (!deal.deal_id) {
      setMessage({ type: 'error', text: 'No deal record to update notes on.' });
      return;
    }
    const res = await window.api.dbExecute(
      `UPDATE sales_deals SET notes = ? WHERE id = ?`,
      [newNotes, deal.deal_id]
    );
    if (res.success) {
      setMessage({ type: 'success', text: 'Notes updated.' });
      await fetchDeals();
    } else {
      setMessage({ type: 'error', text: 'Failed to update notes.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading sales records...
      </div>
    );
  }

  return (
    <div className="page-container text-white">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag size={24} className="text-emerald-400" /> Sales Engine
          </h2>
          <p className="text-sm text-slate-400">All sold plots — transaction details & receipt management</p>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Revenue</span>
          <span className="text-2xl font-bold text-white font-mono block">{fmt(totalRevenue)}</span>
          <span className="text-xs text-slate-400 block mt-1">{deals.length} sale{deals.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Cash Collected</span>
          <span className="text-2xl font-bold text-emerald-400 font-mono block">{fmt(totalCollected)}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Outstanding Balance</span>
          <span className="text-2xl font-bold text-amber-400 font-mono block">{fmt(totalOutstanding)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by buyer name, society, plot #, or deal ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4">Plot #</th>
                <th className="py-3 px-4">Society</th>
                <th className="py-3 px-4">Block</th>
                <th className="py-3 px-4">Buyer Name</th>
                <th className="py-3 px-4 text-right">Total Price</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((row) => (
                <tr
                  key={row.plot_id}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => openDetail(row)}
                >
                  <td className="py-3 px-4">
                    <div className="font-mono text-white font-medium">{row.plot_number || '—'}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{row.society_name || '—'}</td>
                  <td className="py-3 px-4 text-slate-300">{row.block_phase || '—'}</td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-white block">{row.buyer_name || '—'}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-white">
                    {fmt(row.total_deal_price || 0)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-amber-400">
                    {fmt(row.balance_amount || 0)}
                  </td>
                  <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                    {row.sale_date ? new Date(row.sale_date).toLocaleDateString('en-PK') : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      {row.payment_mode || 'CASH'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDeal(row.plot_id, row.deal_id);
                      }}
                      className="p-2 text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete Deal & Revert Plot to Available"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    {deals.length === 0
                      ? 'No sold plots found. Sales appear here after processing through Cash Counter.'
                      : 'No results match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && selectedDeal && (
        <PlotSaleDetailModal
          deal={selectedDeal}
          onClose={() => { setShowDetail(false); setSelectedDeal(null); }}
          onPrintReceipt={handlePrintReceipt}
          onSendWhatsApp={handleSendWhatsApp}
          onEditNotes={handleEditNotes}
        />
      )}
    </div>
  );
};

export default SalesEngine;
