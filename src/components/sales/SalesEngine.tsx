import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, X, Trash2, Printer, FileText, TrendingUp, AlertTriangle } from 'lucide-react';
import { SalesTransaction } from '../../types/electron';
import { fetchSalesByBranch, createSale, deleteSale, cancelSale, generateSaleReceiptText, printSaleReceipt } from '../../services/sales.service';
import { fetchAgents } from '../../services/agent.service';
import { Agent } from '../../types/electron';

interface CurrentUser { id: string; username: string; fullName: string; branchId?: string; }

interface SalesEngineProps {
  branchId: string;
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
const fmtNum = (n: number) => Math.round(n).toLocaleString('en-PK');

export const SalesEngine: React.FC<SalesEngineProps> = ({ branchId, currentUser }) => {
  const [sales, setSales] = useState<SalesTransaction[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SalesTransaction | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SalesTransaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [plotId, setPlotId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCnic, setBuyerCnic] = useState('');
  const [plotArea, setPlotArea] = useState(0);
  const [plotRate, setPlotRate] = useState(0);
  const [stampDutyRate, setStampDutyRate] = useState(0.15);
  const [regFees, setRegFees] = useState(5000);
  const [vatRate, setVatRate] = useState(0);
  const [agentId, setAgentId] = useState('');
  const [agentCommAmount, setAgentCommAmount] = useState(0);
  const [cashPaid, setCashPaid] = useState(0);
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [installmentMonths, setInstallmentMonths] = useState(0);
  const [installmentStartDate, setInstallmentStartDate] = useState('');
  const [installmentInterest, setInstallmentInterest] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [receiptNumber, setReceiptNumber] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesData, agentsData] = await Promise.all([
        fetchSalesByBranch(branchId),
        fetchAgents(),
      ]);
      setSales(salesData);
      setAgents(agentsData);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setPlotId(''); setBuyerName(''); setBuyerPhone(''); setBuyerCnic('');
    setPlotArea(0); setPlotRate(0); setStampDutyRate(0.15); setRegFees(5000);
    setVatRate(0); setAgentId(''); setAgentCommAmount(0);
    setCashPaid(0); setInstallmentAmount(0); setInstallmentMonths(0);
    setInstallmentStartDate(''); setInstallmentInterest(0);
    setPaymentMode('CASH'); setReceiptNumber('');
  };

  // Live calculations
  const totalPlotValue = plotArea * plotRate;
  const stampDuty = totalPlotValue * stampDutyRate / 100;
  const vat = totalPlotValue * vatRate / 100;
  const totalFees = stampDuty + regFees + vat;
  const totalSalePrice = totalPlotValue + totalFees;
  const outstandingBalance = totalSalePrice - cashPaid;
  const netRevenue = totalSalePrice - agentCommAmount;
  const estimatedCost = plotArea * (plotRate * 0.7);
  const estimatedProfit = netRevenue - estimatedCost;

  const handleCreateSale = async () => {
    if (!plotId.trim() || !buyerName.trim() || !buyerPhone.trim() || plotArea <= 0 || plotRate <= 0) {
      setMessage({ type: 'error', text: 'Plot ID, buyer details, area and rate are required' });
      return;
    }
    if (cashPaid < totalSalePrice) {
      setMessage({ type: 'error', text: 'Cash paid must cover total sale price' });
      return;
    }
    try {
      const saleId = await createSale(currentUser.id, currentUser.fullName, branchId, {
        plot_id: plotId.trim(),
        buyer_name: buyerName.trim(),
        buyer_phone: buyerPhone.trim(),
        buyer_cnic: buyerCnic.trim() || null,
        plot_area_sqft: plotArea,
        plot_rate_per_sqft: plotRate,
        stamp_duty_rate: stampDutyRate,
        reg_fees: regFees,
        vat_rate: vatRate,
        agent_id: agentId || null,
        agent_commission_amount: agentCommAmount,
        cash_paid: cashPaid,
        installment_amount: installmentAmount,
        installment_months: installmentMonths || null,
        installment_start_date: installmentStartDate || null,
        installment_interest_rate: installmentInterest,
        payment_mode: paymentMode,
        receipt_number: receiptNumber.trim() || null,
      });
      setMessage({ type: 'success', text: `Sale ${saleId} created` });
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create sale' });
    }
  };

  const handleDelete = async (sale: SalesTransaction) => {
    if (!window.confirm(`Delete sale ${sale.id}? This cannot be undone.`)) return;
    try {
      await deleteSale(sale.id, currentUser.id, currentUser.fullName, sale.buyer_name);
      setMessage({ type: 'success', text: 'Sale deleted' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) {
      setMessage({ type: 'error', text: 'Cancellation reason is required' });
      return;
    }
    try {
      await cancelSale(cancelTarget.id, currentUser.id, currentUser.fullName, cancelReason);
      setMessage({ type: 'success', text: 'Sale cancelled' });
      setCancelTarget(null);
      setCancelReason('');
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cancel sale' });
    }
  };

  const handlePrint = async (sale: SalesTransaction) => {
    try {
      await printSaleReceipt(sale);
      setMessage({ type: 'success', text: 'Receipt sent to printer' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Print failed' });
    }
  };

  const filteredSales = sales.filter((s) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return s.buyer_name.toLowerCase().includes(term) || s.plot_id.toLowerCase().includes(term) || s.id.toLowerCase().includes(term);
    }
    return true;
  });

  const totalRevenue = sales.reduce((s, v) => s + v.final_sale_price, 0);
  const totalCashCollected = sales.reduce((s, v) => s + v.cost_basis, 0);
  const totalOutstanding = sales.reduce((s, v) => s + (v.final_sale_price - v.cost_basis), 0);
  const totalCommissions = sales.reduce((s, v) => s + v.agent_commission, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading sales...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag size={24} className="text-emerald-400" /> Instant Cash Sales & Profit Engine
          </h2>
          <p className="text-sm text-slate-400">Module 10 — Record plot sales, estimate taxes, calculate live profit</p>
        </div>
        <button onClick={() => { setShowForm(true); resetForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> New Sale
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Revenue</p>
          <p className="text-lg font-bold text-white mt-1 font-mono">{fmt(totalRevenue)}</p>
          <div className="flex items-center gap-1 mt-1 text-xs text-emerald-400"><TrendingUp size={12} />{sales.length} sales</div>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Cash Collected</p>
          <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">{fmt(totalCashCollected)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Outstanding</p>
          <p className="text-lg font-bold text-amber-400 mt-1 font-mono">{fmt(totalOutstanding)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Agent Commissions</p>
          <p className="text-lg font-bold text-rose-400 mt-1 font-mono">{fmt(totalCommissions)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input type="text" placeholder="Search buyer, plot, or sale ID..." value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white" />
        <div className="flex gap-1">
          {['ALL', 'COMPLETED', 'PENDING', 'CANCELLED'].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${filterStatus === s ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sales Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4">Sale ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Buyer</th>
                <th className="py-3 px-4">Plot</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4 text-right">Cash</th>
                <th className="py-3 px-4 text-right">Outstanding</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-4 font-mono text-slate-300">{sale.id.slice(0, 16)}</td>
                  <td className="py-2.5 px-4 text-slate-300">{sale.sale_date.slice(0, 10)}</td>
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-white">{sale.buyer_name}</p>
                    <p className="text-[10px] text-slate-500">{sale.buyer_phone}</p>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-300">{sale.plot_id}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-white">{fmtNum(sale.final_sale_price)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-400">{fmtNum(sale.cost_basis)}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-amber-400">{fmtNum(sale.final_sale_price - sale.cost_basis)}</td>
                  <td className="py-2.5 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${sale.payment_method === 'CASH' ? 'status-emerald' : 'status-sky'}`}>
                      {sale.payment_method}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setReceiptSale(sale); setShowReceipt(true); }}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded" title="Receipt">
                        <FileText size={12} />
                      </button>
                      <button onClick={() => handlePrint(sale)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded" title="Print">
                        <Printer size={12} />
                      </button>
                      {sale.payment_method !== 'BANK_TRANSFER' && (
                        <>
                          <button onClick={() => setCancelTarget(sale)}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded" title="Cancel">
                            <AlertTriangle size={12} />
                          </button>
                          <button onClick={() => handleDelete(sale)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded" title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-slate-500">No sales found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Sale Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between p-5 rounded-t-2xl">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><ShoppingBag size={18} className="text-emerald-400" /> New Sale</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Buyer Info */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Buyer Information</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Buyer Name *</label>
                    <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Phone *</label>
                    <input type="text" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">CNIC</label>
                    <input type="text" value={buyerCnic} onChange={(e) => setBuyerCnic(e.target.value)} className="input-base" placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Plot Details */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Plot Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Plot ID *</label>
                    <input type="text" value={plotId} onChange={(e) => setPlotId(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Area (sqft)</label>
                    <input type="number" min={0} value={plotArea || ''} onChange={(e) => setPlotArea(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Rate / sqft</label>
                    <input type="number" min={0} value={plotRate || ''} onChange={(e) => setPlotRate(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Plot Value</label>
                    <div className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm text-emerald-400 font-bold">{fmt(totalPlotValue)}</div>
                  </div>
                </div>
              </div>

              {/* Taxes & Fees */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Taxes & Government Fees</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Stamp Duty (%)</label>
                    <input type="number" min={0} step={0.01} value={stampDutyRate || ''} onChange={(e) => setStampDutyRate(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Registration Fees</label>
                    <input type="number" min={0} value={regFees || ''} onChange={(e) => setRegFees(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">VAT (%)</label>
                    <input type="number" min={0} step={0.01} value={vatRate || ''} onChange={(e) => setVatRate(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Total Fees</label>
                    <div className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm text-amber-400 font-bold">{fmt(totalFees)}</div>
                  </div>
                </div>
              </div>

              {/* Agent Commission */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Agent Commission</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Agent</label>
                    <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input-base">
                      <option value="">No Agent</option>
                      {agents.map((a) => (<option key={a.id} value={a.id}>{a.agent_name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Commission Amount</label>
                    <input type="number" min={0} value={agentCommAmount || ''} onChange={(e) => setAgentCommAmount(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Net Revenue</label>
                    <div className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm text-sky-400 font-bold">{fmt(netRevenue)}</div>
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Payment</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Total Sale Price</label>
                    <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl font-mono text-sm text-emerald-400 font-bold">{fmt(totalSalePrice)}</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Cash Paid</label>
                    <input type="number" min={0} value={cashPaid || ''} onChange={(e) => setCashPaid(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Installment Amount</label>
                    <input type="number" min={0} value={installmentAmount || ''} onChange={(e) => setInstallmentAmount(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Balance Due</label>
                    <div className={`px-3 py-2 border rounded-xl font-mono text-sm font-bold ${outstandingBalance > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                      {fmt(outstandingBalance)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Installment Months</label>
                    <input type="number" min={0} value={installmentMonths || ''} onChange={(e) => setInstallmentMonths(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Start Date</label>
                    <input type="date" value={installmentStartDate} onChange={(e) => setInstallmentStartDate(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Interest Rate (%)</label>
                    <input type="number" min={0} step={0.01} value={installmentInterest || ''} onChange={(e) => setInstallmentInterest(Number(e.target.value) || 0)} className="input-base font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Payment Mode</label>
                    <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)} className="input-base">
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Profit Estimation */}
              <div className="glass-card p-4 border border-slate-700">
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-1"><TrendingUp size={12} /> Live Profit Estimation</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">Est. Cost (70%)</p>
                    <p className="text-sm font-mono text-rose-400 font-bold">{fmt(estimatedCost)}</p>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">Net Revenue</p>
                    <p className="text-sm font-mono text-sky-400 font-bold">{fmt(netRevenue)}</p>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">Est. Profit</p>
                    <p className={`text-sm font-mono font-bold ${estimatedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(estimatedProfit)}</p>
                  </div>
                </div>
              </div>

              {/* Receipt Number */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Receipt Number (optional)</label>
                <input type="text" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} className="input-base" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-slate-900 flex items-center justify-end gap-3 p-5 border-t border-slate-800 rounded-b-2xl">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleCreateSale} className="px-5 py-2 btn-primary text-xs">Create Sale & Print Receipt</button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {showReceipt && receiptSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Sale Receipt</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handlePrint(receiptSale)} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs flex items-center gap-1">
                  <Printer size={12} /> Print
                </button>
                <button onClick={() => setShowReceipt(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
            </div>
            <div className="p-5">
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[10px] text-slate-300 font-mono whitespace-pre-wrap leading-tight">
                {generateSaleReceiptText(receiptSale)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Sale Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setCancelTarget(null)}>
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-amber-400 flex items-center gap-2"><AlertTriangle size={18} /> Cancel Sale</h3>
              <button onClick={() => setCancelTarget(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
                Cancelling sale <strong>{cancelTarget.id.slice(0, 16)}</strong> for <strong>{cancelTarget.buyer_name}</strong>.
                The associated plot will be restored to AVAILABLE status.
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cancellation Reason *</label>
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} className="input-base" placeholder="Reason for cancellation..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setCancelTarget(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Back</button>
              <button onClick={handleCancel} className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold">Cancel Sale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesEngine;