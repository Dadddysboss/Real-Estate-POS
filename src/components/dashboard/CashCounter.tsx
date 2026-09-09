import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Banknote, Receipt, Printer, CheckCircle2, AlertTriangle, X,
  CalendarDays, CreditCard, User, MapPin,
  ChevronDown,
} from 'lucide-react';

interface CashCounterProps {
  branchId: string;
  currentUser: { id: string; username: string; fullName: string };
}

interface PlotOption {
  id: string;
  plot_number: string;
  society_name: string;
  block_phase: string;
  size_dimension: string;
  target_asking_price: number;
  category: string;
}

interface CashSaleForm {
  plotId: string;
  buyerName: string;
  buyerPhone: string;
  buyerCnic: string;
  salePrice: number;
  taxRate: number;
  registrationFee: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'PAY_ORDER';
  receiptNotes: string;
}

interface InstallmentSaleForm {
  plotId: string;
  buyerName: string;
  buyerPhone: string;
  buyerCnic: string;
  totalPrice: number;
  downPayment: number;
  monthlyInstallment: number;
  planDurationMonths: number;
  startDate: string;
  dueDayOfMonth: number;
  receiptNotes: string;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const defaultCashForm: CashSaleForm = {
  plotId: '', buyerName: '', buyerPhone: '', buyerCnic: '',
  salePrice: 0, taxRate: 0, registrationFee: 0,
  paymentMethod: 'CASH', receiptNotes: '',
};

const defaultInstallmentForm: InstallmentSaleForm = {
  plotId: '', buyerName: '', buyerPhone: '', buyerCnic: '',
  totalPrice: 0, downPayment: 0, monthlyInstallment: 0,
  planDurationMonths: 0, startDate: '', dueDayOfMonth: 1, receiptNotes: '',
};

export const CashCounter: React.FC<CashCounterProps> = ({ branchId, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'instant' | 'installment'>('instant');
  const [plots, setPlots] = useState<PlotOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptText, setReceiptText] = useState('');

  const [cashForm, setCashForm] = useState<CashSaleForm>({ ...defaultCashForm });
  const [installmentForm, setInstallmentForm] = useState<InstallmentSaleForm>({ ...defaultInstallmentForm });

  const fetchAvailablePlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.api.dbQuery<PlotOption>(
        `SELECT id, plot_number, society_name, block_phase, size_dimension, target_asking_price, category
         FROM inventory_plots WHERE branch_id = ? AND status = 'AVAILABLE' ORDER BY society_name, plot_number`,
        [branchId]
      );
      if (res.success && res.data) setPlots(res.data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load available plots.' });
    }
    setLoading(false);
  }, [branchId]);

  useEffect(() => { fetchAvailablePlots(); }, [fetchAvailablePlots]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 6000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [message]);

  const selectedPlotCash = plots.find((p) => p.id === cashForm.plotId);
  const selectedPlotInst = plots.find((p) => p.id === installmentForm.plotId);

  const cashSalePrice = selectedPlotCash ? selectedPlotCash.target_asking_price : cashForm.salePrice;
  const cashTaxAmount = cashSalePrice * cashForm.taxRate / 100;
  const cashTotalWithTax = cashSalePrice + cashTaxAmount + cashForm.registrationFee;

  const instTotal = selectedPlotInst ? selectedPlotInst.target_asking_price : installmentForm.totalPrice;
  const instBalanceAfterDown = instTotal - installmentForm.downPayment;
  const instMonthly = installmentForm.planDurationMonths > 0 && installmentForm.downPayment < instTotal
    ? Math.ceil(instBalanceAfterDown / installmentForm.planDurationMonths)
    : installmentForm.monthlyInstallment;

  const handleCashPlotChange = (plotId: string) => {
    const plot = plots.find((p) => p.id === plotId);
    setCashForm({
      ...cashForm,
      plotId,
      salePrice: plot ? plot.target_asking_price : 0,
    });
  };

  const handleInstallmentPlotChange = (plotId: string) => {
    const plot = plots.find((p) => p.id === plotId);
    setInstallmentForm({
      ...installmentForm,
      plotId,
      totalPrice: plot ? plot.target_asking_price : 0,
    });
  };

  const generateCashReceipt = (saleId: string, plot: PlotOption, total: number, taxAmt: number): string => {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════');
    lines.push('          INSTANT CASH SALE RECEIPT');
    lines.push('═══════════════════════════════════════════════');
    lines.push(`  Receipt # : ${saleId}`);
    lines.push(`  Date      : ${new Date().toLocaleDateString('en-PK')}`);
    lines.push(`  Branch    : ${branchId}`);
    lines.push(`  Cashier   : ${currentUser.fullName}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Buyer     : ${cashForm.buyerName}`);
    if (cashForm.buyerPhone) lines.push(`  Phone     : ${cashForm.buyerPhone}`);
    if (cashForm.buyerCnic) lines.push(`  CNIC      : ${cashForm.buyerCnic}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Plot      : ${plot.plot_number} (${plot.society_name})`);
    lines.push(`  Society   : ${plot.society_name} Block ${plot.block_phase}`);
    lines.push(`  Size      : ${plot.size_dimension}`);
    lines.push(`  Category  : ${plot.category}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Sale Price      : ${fmt(cashSalePrice)}`);
    if (cashForm.taxRate > 0) lines.push(`  Tax (${cashForm.taxRate}%)    : ${fmt(taxAmt)}`);
    if (cashForm.registrationFee > 0) lines.push(`  Reg. Fee        : ${fmt(cashForm.registrationFee)}`);
    lines.push(`  TOTAL DUE       : ${fmt(total)}`);
    lines.push(`  Payment Method  : ${cashForm.paymentMethod.replace('_', ' ')}`);
    lines.push('───────────────────────────────────────────────');
    if (cashForm.receiptNotes) lines.push(`  Notes: ${cashForm.receiptNotes}`);
    lines.push('═══════════════════════════════════════════════');
    lines.push('          Thank you for your purchase!');
    lines.push('═══════════════════════════════════════════════');
    return lines.join('\n');
  };

  const generateInstallmentReceipt = (planId: string, plot: PlotOption): string => {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════');
    lines.push('         INSTALLMENT SALE RECEIPT');
    lines.push('═══════════════════════════════════════════════');
    lines.push(`  Plan ID   : ${planId}`);
    lines.push(`  Date      : ${new Date().toLocaleDateString('en-PK')}`);
    lines.push(`  Branch    : ${branchId}`);
    lines.push(`  Cashier   : ${currentUser.fullName}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Buyer     : ${installmentForm.buyerName}`);
    if (installmentForm.buyerPhone) lines.push(`  Phone     : ${installmentForm.buyerPhone}`);
    if (installmentForm.buyerCnic) lines.push(`  CNIC      : ${installmentForm.buyerCnic}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Plot      : ${plot.plot_number} (${plot.society_name})`);
    lines.push(`  Size      : ${plot.size_dimension}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Total Price          : ${fmt(instTotal)}`);
    lines.push(`  Down Payment         : ${fmt(installmentForm.downPayment)}`);
    lines.push(`  Balance to Finance   : ${fmt(instBalanceAfterDown)}`);
    lines.push(`  Monthly Installment  : ${fmt(instMonthly)}`);
    lines.push(`  Plan Duration        : ${installmentForm.planDurationMonths} months`);
    lines.push(`  Due Day of Month     : ${installmentForm.dueDayOfMonth}`);
    lines.push(`  Start Date           : ${installmentForm.startDate}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  STATUS: BOOKED`);
    lines.push('═══════════════════════════════════════════════');
    lines.push('          Thank you for your purchase!');
    lines.push('═══════════════════════════════════════════════');
    return lines.join('\n');
  };

  const handleCashSale = async () => {
    if (!cashForm.plotId || !cashForm.buyerName.trim() || !cashForm.buyerPhone.trim()) {
      setMessage({ type: 'error', text: 'Select a plot and fill buyer name & phone.' });
      return;
    }
    if (cashSalePrice <= 0) {
      setMessage({ type: 'error', text: 'Sale price must be greater than zero.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const saleId = `SALE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const plot = plots.find((p) => p.id === cashForm.plotId)!;

      const insertSale = await window.api.dbExecute(
        `INSERT INTO sales_transactions (
          id, plot_id, buyer_name, buyer_phone, buyer_cnic,
          final_sale_price, cost_basis, development_costs,
          agent_commission, government_taxes, net_profit_calculated,
          payment_method, agent_id, sale_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          saleId,
          cashForm.plotId,
          cashForm.buyerName.trim(),
          cashForm.buyerPhone.trim(),
          cashForm.buyerCnic.trim(),
          cashTotalWithTax,
          cashSalePrice,
          Math.round(cashTaxAmount),
          cashTotalWithTax,
          cashForm.paymentMethod,
        ]
      );
      if (!insertSale.success) throw new Error(insertSale.error || 'Failed to record sale');

      const updatePlot = await window.api.dbExecute(
        `UPDATE inventory_plots SET status = 'SOLD', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [cashForm.plotId]
      );
      if (!updatePlot.success) throw new Error(updatePlot.error || 'Failed to update plot status');

      const receipt = generateCashReceipt(saleId, plot, cashTotalWithTax, cashTaxAmount);
      setReceiptText(receipt);
      setShowReceipt(true);
      setMessage({ type: 'success', text: `Sale ${saleId} recorded successfully! Plot marked as SOLD.` });
      setCashForm({ ...defaultCashForm });
      fetchAvailablePlots();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record sale' });
    }
    setSubmitting(false);
  };

  const handleInstallmentSale = async () => {
    if (!installmentForm.plotId || !installmentForm.buyerName.trim() || !installmentForm.buyerPhone.trim()) {
      setMessage({ type: 'error', text: 'Select a plot and fill buyer name & phone.' });
      return;
    }
    if (instTotal <= 0) {
      setMessage({ type: 'error', text: 'Total price must be greater than zero.' });
      return;
    }
    if (installmentForm.downPayment < 0) {
      setMessage({ type: 'error', text: 'Down payment cannot be negative.' });
      return;
    }
    if (installmentForm.planDurationMonths <= 0) {
      setMessage({ type: 'error', text: 'Plan duration must be at least 1 month.' });
      return;
    }
    if (!installmentForm.startDate) {
      setMessage({ type: 'error', text: 'Select a start date.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const planId = `PLAN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const plot = plots.find((p) => p.id === installmentForm.plotId)!;

      const insertPlan = await window.api.dbExecute(
        `INSERT INTO installment_plans (
          id, plot_id, buyer_name, buyer_phone, buyer_cnic,
          total_sale_price, down_payment, plan_duration_months, monthly_installment_amount,
          start_date, due_day_of_month, grace_period_days, late_penalty_fee, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 0, 'ACTIVE', CURRENT_TIMESTAMP)`,
        [
          planId,
          installmentForm.plotId,
          installmentForm.buyerName.trim(),
          installmentForm.buyerPhone.trim(),
          installmentForm.buyerCnic.trim(),
          instTotal,
          installmentForm.downPayment,
          installmentForm.planDurationMonths,
          instMonthly,
          installmentForm.startDate,
          installmentForm.dueDayOfMonth,
        ]
      );
      if (!insertPlan.success) throw new Error(insertPlan.error || 'Failed to create installment plan');

      for (let i = 1; i <= installmentForm.planDurationMonths; i++) {
        const schedId = `SCHED_${planId}_${i}`;
        const dueDate = new Date(`${installmentForm.startDate}T00:00:00`);
        dueDate.setMonth(dueDate.getMonth() + i);
        dueDate.setDate(installmentForm.dueDayOfMonth);
        const isLast = i === installmentForm.planDurationMonths;
        const amountDue = isLast
          ? Math.max(0, instBalanceAfterDown - instMonthly * (installmentForm.planDurationMonths - 1))
          : instMonthly;

        const insertSched = await window.api.dbExecute(
          `INSERT INTO installment_schedules (
            id, plan_id, installment_number, due_date, amount_due, amount_paid,
            late_fine_charged, discount_applied, payment_date, payment_method, status, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, 'PENDING', CURRENT_TIMESTAMP)`,
          [schedId, planId, i, dueDate.toISOString().split('T')[0], amountDue]
        );
        if (!insertSched.success) throw new Error(insertSched.error || 'Failed to create installment schedule');
      }

      const updatePlot = await window.api.dbExecute(
        `UPDATE inventory_plots SET status = 'BOOKED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [installmentForm.plotId]
      );
      if (!updatePlot.success) throw new Error(updatePlot.error || 'Failed to update plot status');

      const receipt = generateInstallmentReceipt(planId, plot);
      setReceiptText(receipt);
      setShowReceipt(true);
      setMessage({ type: 'success', text: `Installment plan ${planId} created! Plot marked as BOOKED.` });
      setInstallmentForm({ ...defaultInstallmentForm });
      fetchAvailablePlots();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create installment plan' });
    }
    setSubmitting(false);
  };

  const handlePrintReceipt = async () => {
    if (!receiptText) return;
    try {
      const res = await window.api.printReceipt(receiptText);
      if (!res.success) throw new Error(res.error || 'Print failed');
      setMessage({ type: 'success', text: 'Receipt sent to printer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Print failed' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet size={24} className="text-emerald-400" /> Cash Counter
          </h2>
          <p className="text-sm text-slate-400">Instant Sales & Installment Plans</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex gap-1 bg-slate-900/80 border border-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('instant')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'instant'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Banknote size={16} /> Instant Cash Sale
        </button>
        <button
          onClick={() => setActiveTab('installment')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'installment'
              ? 'bg-sky-600 text-white shadow-lg shadow-sky-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <CalendarDays size={16} /> Installment Sale
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          Loading available plots...
        </div>
      )}

      {/* Instant Cash Sale Tab */}
      {!loading && activeTab === 'instant' && (
        <div className="space-y-6">
          {/* Plot Selection */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-emerald-400" /> Plot Selection
            </h3>
            {plots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No available plots found. Add plots to inventory first.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Select Plot *</label>
                  <div className="relative">
                    <select
                      value={cashForm.plotId}
                      onChange={(e) => handleCashPlotChange(e.target.value)}
                      className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 pr-10"
                    >
                      <option value="">-- Choose an available plot --</option>
                      {plots.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.society_name} | Block {p.block_phase} | Plot #{p.plot_number} | {p.size_dimension} | {fmt(p.target_asking_price)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {selectedPlotCash && (
                  <div className="md:col-span-2 lg:col-span-3 grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Plot #</p>
                      <p className="text-sm font-mono text-white mt-0.5">{selectedPlotCash.plot_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Society</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotCash.society_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Block</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotCash.block_phase}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Size</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotCash.size_dimension}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Category</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotCash.category}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Buyer Info */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <User size={18} className="text-sky-400" /> Buyer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Buyer Name *</label>
                <input
                  type="text"
                  value={cashForm.buyerName}
                  onChange={(e) => setCashForm({ ...cashForm, buyerName: e.target.value })}
                  placeholder="Full name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone *</label>
                <input
                  type="tel"
                  value={cashForm.buyerPhone}
                  onChange={(e) => setCashForm({ ...cashForm, buyerPhone: e.target.value })}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">CNIC</label>
                <input
                  type="text"
                  value={cashForm.buyerCnic}
                  onChange={(e) => setCashForm({ ...cashForm, buyerCnic: e.target.value })}
                  placeholder="42101-1234567-1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Payment & Pricing */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-amber-400" /> Payment & Pricing
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Sale Price (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={cashForm.salePrice || ''}
                  onChange={(e) => setCashForm({ ...cashForm, salePrice: Number(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={cashForm.taxRate || ''}
                  onChange={(e) => setCashForm({ ...cashForm, taxRate: Number(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Registration Fee (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={cashForm.registrationFee || ''}
                  onChange={(e) => setCashForm({ ...cashForm, registrationFee: Number(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Payment Method *</label>
                <div className="relative">
                  <select
                    value={cashForm.paymentMethod}
                    onChange={(e) => setCashForm({ ...cashForm, paymentMethod: e.target.value as CashSaleForm['paymentMethod'] })}
                    className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 pr-10"
                  >
                    <option value="CASH">CASH</option>
                    <option value="BANK_TRANSFER">BANK TRANSFER</option>
                    <option value="PAY_ORDER">PAY ORDER</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Sale Price</p>
                <p className="text-lg font-mono font-bold text-white mt-1">{fmt(cashSalePrice)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Tax + Fees</p>
                <p className="text-lg font-mono font-bold text-amber-400 mt-1">{fmt(cashTaxAmount + cashForm.registrationFee)}</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <p className="text-[10px] uppercase text-emerald-300 font-bold">Total Due</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-1">{fmt(cashTotalWithTax)}</p>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="text-xs text-slate-400 block mb-1">Receipt Notes</label>
              <input
                type="text"
                value={cashForm.receiptNotes}
                onChange={(e) => setCashForm({ ...cashForm, receiptNotes: e.target.value })}
                placeholder="Optional notes for receipt"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setCashForm({ ...defaultCashForm })}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
            >
              Reset Form
            </button>
            <button
              onClick={handleCashSale}
              disabled={submitting || plots.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50"
            >
              <Receipt size={16} />
              {submitting ? 'Processing...' : 'Complete Cash Sale'}
            </button>
          </div>
        </div>
      )}

      {/* Installment Sale Tab */}
      {!loading && activeTab === 'installment' && (
        <div className="space-y-6">
          {/* Plot Selection */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-sky-400" /> Plot Selection
            </h3>
            {plots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No available plots found. Add plots to inventory first.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-xs text-slate-400 block mb-1">Select Plot *</label>
                  <div className="relative">
                    <select
                      value={installmentForm.plotId}
                      onChange={(e) => handleInstallmentPlotChange(e.target.value)}
                      className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-sky-500 pr-10"
                    >
                      <option value="">-- Choose an available plot --</option>
                      {plots.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.society_name} | Block {p.block_phase} | Plot #{p.plot_number} | {p.size_dimension} | {fmt(p.target_asking_price)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {selectedPlotInst && (
                  <div className="md:col-span-2 lg:col-span-3 grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Plot #</p>
                      <p className="text-sm font-mono text-white mt-0.5">{selectedPlotInst.plot_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Society</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotInst.society_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Block</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotInst.block_phase}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Size</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlotInst.size_dimension}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Asking Price</p>
                      <p className="text-sm font-mono text-emerald-400 mt-0.5">{fmt(selectedPlotInst.target_asking_price)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Buyer Info */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <User size={18} className="text-sky-400" /> Buyer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Buyer Name *</label>
                <input
                  type="text"
                  value={installmentForm.buyerName}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, buyerName: e.target.value })}
                  placeholder="Full name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone *</label>
                <input
                  type="tel"
                  value={installmentForm.buyerPhone}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, buyerPhone: e.target.value })}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">CNIC</label>
                <input
                  type="text"
                  value={installmentForm.buyerCnic}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, buyerCnic: e.target.value })}
                  placeholder="42101-1234567-1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Installment Details */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <CalendarDays size={18} className="text-sky-400" /> Installment Plan Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Total Price (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={installmentForm.totalPrice || ''}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, totalPrice: Number(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Down Payment (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={installmentForm.downPayment || ''}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, downPayment: Number(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Plan Duration (months) *</label>
                <input
                  type="number"
                  min={1}
                  value={installmentForm.planDurationMonths || ''}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, planDurationMonths: Number(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Start Date *</label>
                <input
                  type="date"
                  value={installmentForm.startDate}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, startDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Due Day of Month</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={installmentForm.dueDayOfMonth}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, dueDayOfMonth: Number(e.target.value) || 1 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monthly Installment (auto-calculated)</label>
                <div className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm text-sky-400">
                  {fmt(instMonthly)}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Balance After Down Payment</label>
                <div className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm text-amber-400">
                  {fmt(instBalanceAfterDown)}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Total Price</p>
                <p className="text-lg font-mono font-bold text-white mt-1">{fmt(instTotal)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Down Payment</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-1">{fmt(installmentForm.downPayment)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Monthly x {installmentForm.planDurationMonths}</p>
                <p className="text-lg font-mono font-bold text-sky-400 mt-1">{fmt(instMonthly)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Status on Submit</p>
                <p className="text-lg font-bold text-amber-400 mt-1">BOOKED</p>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <label className="text-xs text-slate-400 block mb-1">Receipt Notes</label>
              <input
                type="text"
                value={installmentForm.receiptNotes}
                onChange={(e) => setInstallmentForm({ ...installmentForm, receiptNotes: e.target.value })}
                placeholder="Optional notes for receipt"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setInstallmentForm({ ...defaultInstallmentForm })}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
            >
              Reset Form
            </button>
            <button
              onClick={handleInstallmentSale}
              disabled={submitting || plots.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-sky-950/50"
            >
              <CalendarDays size={16} />
              {submitting ? 'Processing...' : 'Create Installment Plan'}
            </button>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt size={16} className="text-emerald-400" /> Sale Receipt — 80mm Preview
              </h3>
              <button onClick={() => setShowReceipt(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto bg-slate-950">
              <pre className="font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre">{receiptText}</pre>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800">
              <button onClick={() => setShowReceipt(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Close</button>
              <button onClick={handlePrintReceipt} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold">
                <Printer size={14} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashCounter;
