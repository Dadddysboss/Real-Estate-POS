import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Banknote, Receipt, Printer, CheckCircle2, AlertTriangle, X,
  CalendarDays, CreditCard, User, MapPin, ChevronDown, Plus, Trash2,
} from 'lucide-react';
import { notifyCashTransaction } from '../../db/unifiedAdapter';

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

interface PaymentRow {
  id: string;
  method: string;
  reference: string;
  amount: number;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash', category: 'wallet' },
  { value: 'JAZZCASH', label: 'JazzCash', category: 'wallet' },
  { value: 'EASYPAISA', label: 'EasyPaisa', category: 'wallet' },
  { value: 'SADAPAY', label: 'SadaPay', category: 'wallet' },
  { value: 'NAYAPAY', label: 'NayaPay', category: 'wallet' },
  { value: 'RAAST', label: 'Raast (IBFT)', category: 'wallet' },
  { value: 'MEEZAN', label: 'Meezan Bank', category: 'bank' },
  { value: 'HBL', label: 'HBL', category: 'bank' },
  { value: 'UBL', label: 'UBL', category: 'bank' },
  { value: 'MCB', label: 'MCB', category: 'bank' },
  { value: 'ABL', label: 'Allied Bank (ABL)', category: 'bank' },
  { value: 'ALFALAH', label: 'Bank Alfalah', category: 'bank' },
  { value: 'FAYSAL', label: 'Faysal Bank', category: 'bank' },
  { value: 'ISLAMI', label: 'Bank Islami', category: 'bank' },
  { value: 'ASKARI', label: 'Askari Bank', category: 'bank' },
  { value: 'BOP', label: 'Bank of Punjab (BOP)', category: 'bank' },
  { value: 'METRO', label: 'Habib Metropolitan Bank', category: 'bank' },
  { value: 'SCB', label: 'Standard Chartered', category: 'bank' },
  { value: 'DIB', label: 'Dubai Islamic Bank', category: 'bank' },
  { value: 'JS', label: 'JS Bank', category: 'bank' },
  { value: 'SONERI', label: 'Soneri Bank', category: 'bank' },
];

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const makeId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

const createEmptyPaymentRow = (): PaymentRow => ({
  id: makeId(),
  method: 'CASH',
  reference: '',
  amount: 0,
});

const safeStr = (v: unknown): string => {
  if (v == null) return '';
  return String(v);
};

export const CashCounter: React.FC<CashCounterProps> = ({ branchId, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'instant' | 'installment'>('instant');
  const [plots, setPlots] = useState<PlotOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptText, setReceiptText] = useState('');

  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCnic, setBuyerCnic] = useState('');
  const [plotId, setPlotId] = useState('');
  const [salePrice, setSalePrice] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [registrationFee, setRegistrationFee] = useState(0);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([createEmptyPaymentRow()]);
  const [receiptNotes, setReceiptNotes] = useState('');

  const [downPayment, setDownPayment] = useState(0);
  const [planDurationMonths, setPlanDurationMonths] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [dueDayOfMonth, setDueDayOfMonth] = useState(1);

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

  const selectedPlot = plots.find((p) => p.id === plotId);
  const effectivePrice = selectedPlot ? selectedPlot.target_asking_price : salePrice;
  const taxAmount = effectivePrice * taxRate / 100;
  const totalDue = effectivePrice + taxAmount + registrationFee;

  const balanceAfterDown = effectivePrice - downPayment;
  const monthlyInstallment = planDurationMonths > 0 && downPayment < effectivePrice
    ? Math.ceil(balanceAfterDown / planDurationMonths)
    : 0;

  const splitTotal = paymentRows.reduce((sum, r) => sum + (r.amount || 0), 0);
  const isSplitValid = Math.abs(splitTotal - totalDue) < 0.01;
  const isSplitOver = splitTotal > totalDue + 0.01;

  const downPaymentSplitTotal = paymentRows.reduce((sum, r) => sum + (r.amount || 0), 0);
  const isDownPaymentSplitValid = Math.abs(downPaymentSplitTotal - downPayment) < 0.01;
  const isDownPaymentSplitOver = downPaymentSplitTotal > downPayment + 0.01;

  const handlePlotChange = (id: string) => {
    const plot = plots.find((p) => p.id === id);
    setPlotId(id);
    if (plot) {
      setSalePrice(plot.target_asking_price);
      setDownPayment(Math.round(plot.target_asking_price * 0.3));
    } else {
      setSalePrice(0);
      setDownPayment(0);
    }
  };

  const addPaymentRow = () => {
    setPaymentRows((prev) => [...prev, createEmptyPaymentRow()]);
  };

  const removePaymentRow = (rowId: string) => {
    setPaymentRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== rowId);
    });
  };

  const updatePaymentRow = (rowId: string, field: keyof PaymentRow, value: string | number) => {
    setPaymentRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  };

  const resetAll = () => {
    setBuyerName('');
    setBuyerPhone('');
    setBuyerCnic('');
    setPlotId('');
    setSalePrice(0);
    setTaxRate(0);
    setRegistrationFee(0);
    setPaymentRows([createEmptyPaymentRow()]);
    setReceiptNotes('');
    setDownPayment(0);
    setPlanDurationMonths(0);
    setStartDate('');
    setDueDayOfMonth(1);
  };

  const generateReceipt = (title: string, id: string, plot: PlotOption, total: number, breakdownRows: PaymentRow[]): string => {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════');
    lines.push(`          ${title}`);
    lines.push('═══════════════════════════════════════════════');
    lines.push(`  Receipt # : ${id}`);
    lines.push(`  Date      : ${new Date().toLocaleDateString('en-PK')}`);
    lines.push(`  Branch    : ${branchId}`);
    lines.push(`  Cashier   : ${currentUser.fullName}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Buyer     : ${buyerName}`);
    if (buyerPhone) lines.push(`  Phone     : ${buyerPhone}`);
    if (buyerCnic) lines.push(`  CNIC      : ${buyerCnic}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Plot      : ${plot.plot_number} (${plot.society_name})`);
    lines.push(`  Society   : ${plot.society_name} Block ${plot.block_phase}`);
    lines.push(`  Size      : ${plot.size_dimension}`);
    lines.push(`  Category  : ${plot.category}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Sale Price        : ${fmt(effectivePrice)}`);
    if (taxRate > 0) lines.push(`  Tax (${taxRate}%)     : ${fmt(taxAmount)}`);
    if (registrationFee > 0) lines.push(`  Reg. Fee          : ${fmt(registrationFee)}`);
    lines.push(`  TOTAL DUE         : ${fmt(total)}`);
    lines.push('───────────────────────────────────────────────');
    lines.push('  === PAYMENT BREAKDOWN ===');
    breakdownRows.forEach((r) => {
      const methodName = safeStr(
        PAYMENT_METHODS.find((m) => m.value === r.method)?.label ?? r.method
      );
      const ref = r.reference ? r.reference : 'N/A';
      lines.push(`  Method: ${methodName} | Ref: ${ref} | ${fmt(r.amount)}`);
    });
    lines.push('───────────────────────────────────────────────');
    lines.push(`  TOTAL COLLECTED: ${fmt(splitTotal)}`);
    if (receiptNotes) {
      lines.push('───────────────────────────────────────────────');
      lines.push(`  Notes: ${receiptNotes}`);
    }
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
    lines.push(`  Buyer     : ${buyerName}`);
    if (buyerPhone) lines.push(`  Phone     : ${buyerPhone}`);
    if (buyerCnic) lines.push(`  CNIC      : ${buyerCnic}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Plot      : ${plot.plot_number} (${plot.society_name})`);
    lines.push(`  Size      : ${plot.size_dimension}`);
    lines.push('───────────────────────────────────────────────');
    lines.push(`  Total Price          : ${fmt(effectivePrice)}`);
    lines.push(`  Down Payment         : ${fmt(downPayment)}`);
    lines.push(`  Balance to Finance   : ${fmt(balanceAfterDown)}`);
    lines.push(`  Monthly Installment  : ${fmt(monthlyInstallment)}`);
    lines.push(`  Plan Duration        : ${planDurationMonths} months`);
    lines.push(`  Due Day of Month     : ${dueDayOfMonth}`);
    lines.push(`  Start Date           : ${startDate}`);
    lines.push('───────────────────────────────────────────────');
    lines.push('  === DOWN PAYMENT BREAKDOWN ===');
    paymentRows.forEach((r) => {
      const methodName = safeStr(
        PAYMENT_METHODS.find((m) => m.value === r.method)?.label ?? r.method
      );
      const ref = r.reference ? r.reference : 'N/A';
      lines.push(`  Method: ${methodName} | Ref: ${ref} | ${fmt(r.amount)}`);
    });
    lines.push('───────────────────────────────────────────────');
    lines.push(`  TOTAL COLLECTED: ${fmt(downPaymentSplitTotal)}`);
    lines.push('  STATUS: BOOKED');
    lines.push('═══════════════════════════════════════════════');
    lines.push('          Thank you for your purchase!');
    lines.push('═══════════════════════════════════════════════');
    return lines.join('\n');
  };

  const handleInstantSale = async () => {
    if (!plotId || !buyerName.trim() || !buyerPhone.trim()) {
      setMessage({ type: 'error', text: 'Select a plot and fill buyer name & phone.' });
      return;
    }
    if (effectivePrice <= 0) {
      setMessage({ type: 'error', text: 'Sale price must be greater than zero.' });
      return;
    }
    if (paymentRows.length === 0) {
      setMessage({ type: 'error', text: 'Add at least one payment row.' });
      return;
    }
    if (isSplitOver) {
      setMessage({ type: 'error', text: 'Payment collected exceeds the total due.' });
      return;
    }
    if (!isSplitValid) {
      setMessage({ type: 'error', text: `Payment collected (${fmt(splitTotal)}) does not match total due (${fmt(totalDue)}).` });
      return;
    }
    for (const row of paymentRows) {
      if (!row.method) {
        setMessage({ type: 'error', text: 'Select a payment method for all rows.' });
        return;
      }
      if (row.amount <= 0) {
        setMessage({ type: 'error', text: 'Each payment amount must be greater than zero.' });
        return;
      }
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const saleId = `SALE_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const plot = plots.find((p) => p.id === plotId)!;
      const cashCounterId = `CC_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const insertSale = await window.api.dbExecute(
        `INSERT INTO sales_transactions (
          id, plot_id, buyer_name, buyer_phone, buyer_cnic,
          final_sale_price, cost_basis, development_costs,
          agent_commission, government_taxes, net_profit_calculated,
          payment_method, agent_id, sale_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          saleId,
          plotId,
          buyerName.trim(),
          buyerPhone.trim(),
          buyerCnic.trim(),
          totalDue,
          effectivePrice,
          Math.round(taxAmount),
          totalDue,
          paymentRows[0]?.method ?? 'CASH',
          currentUser.id,
        ]
      );
      if (!insertSale.success) throw new Error(safeStr(insertSale.error) || 'Failed to record sale');

      for (const row of paymentRows) {
        const breakdownId = `BD_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const insertBreakdown = await window.api.dbExecute(
          `INSERT INTO sale_payment_breakdowns (id, sale_id, payment_method, transaction_ref, amount, created_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [breakdownId, saleId, row.method, row.reference.trim(), row.amount]
        );
        if (!insertBreakdown.success) throw new Error(safeStr(insertBreakdown.error) || 'Failed to record payment breakdown');
      }

      const insertCashCounter = await window.api.dbExecute(
        `INSERT INTO cash_counter (id, branch_id, user_id, transaction_type, category, amount, notes, received_by, created_at)
         VALUES (?, ?, ?, 'INFLOW', 'PLOT_SALE', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [cashCounterId, branchId, currentUser.id, totalDue, receiptNotes.trim() || `Instant plot sale: ${plot.plot_number}`, currentUser.fullName]
      );
      if (!insertCashCounter.success) throw new Error(safeStr(insertCashCounter.error) || 'Failed to record cash counter');

      const insertDeal = await window.api.dbExecute(
        `INSERT INTO sales_deals (id, plot_id, cash_counter_id, buyer_name, buyer_phone, buyer_cnic, total_deal_price, down_payment, balance_amount, sales_agent, payment_mode, sale_date, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`,
        [
          saleId,
          plotId,
          cashCounterId,
          buyerName.trim(),
          buyerPhone.trim(),
          buyerCnic.trim(),
          totalDue,
          downPayment,
          totalDue - downPayment,
          currentUser.fullName,
          paymentRows[0]?.method ?? 'CASH',
          receiptNotes.trim() || '',
        ]
      );
      if (!insertDeal.success) throw new Error(safeStr(insertDeal.error) || 'Failed to record sales deal');

      const updatePlot = await window.api.dbExecute(
        `UPDATE inventory_plots SET status = 'SOLD', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [plotId]
      );
      if (!updatePlot.success) throw new Error(safeStr(updatePlot.error) || 'Failed to update plot status');

      const receipt = generateReceipt('INSTANT CASH SALE RECEIPT', saleId, plot, totalDue, paymentRows);
      setReceiptText(receipt);
      setShowReceipt(true);
      setMessage({ type: 'success', text: `Sale ${saleId} recorded successfully! Plot marked as SOLD.` });
      await notifyCashTransaction('INFLOW', totalDue, buyerName.trim());
      resetAll();
      fetchAvailablePlots();
    } catch (err) {
      console.error('[CashCounter] Instant sale failed:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record sale' });
    }
    setSubmitting(false);
  };

  const handleInstallmentSale = async () => {
    if (!plotId || !buyerName.trim() || !buyerPhone.trim()) {
      setMessage({ type: 'error', text: 'Select a plot and fill buyer name & phone.' });
      return;
    }
    if (effectivePrice <= 0) {
      setMessage({ type: 'error', text: 'Total price must be greater than zero.' });
      return;
    }
    if (downPayment < 0) {
      setMessage({ type: 'error', text: 'Down payment cannot be negative.' });
      return;
    }
    if (planDurationMonths <= 0) {
      setMessage({ type: 'error', text: 'Plan duration must be at least 1 month.' });
      return;
    }
    if (!startDate) {
      setMessage({ type: 'error', text: 'Select a start date.' });
      return;
    }
    if (downPayment > 0) {
      if (paymentRows.length === 0) {
        setMessage({ type: 'error', text: 'Add at least one payment row for down payment.' });
        return;
      }
      if (isDownPaymentSplitOver) {
        setMessage({ type: 'error', text: 'Down payment collected exceeds the required amount.' });
        return;
      }
      if (!isDownPaymentSplitValid) {
        setMessage({ type: 'error', text: `Down payment collected (${fmt(downPaymentSplitTotal)}) does not match required (${fmt(downPayment)}).` });
        return;
      }
      for (const row of paymentRows) {
        if (!row.method) {
          setMessage({ type: 'error', text: 'Select a payment method for all rows.' });
          return;
        }
        if (row.amount <= 0) {
          setMessage({ type: 'error', text: 'Each payment amount must be greater than zero.' });
          return;
        }
      }
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const planId = `PLAN_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const plot = plots.find((p) => p.id === plotId)!;

      const insertPlan = await window.api.dbExecute(
        `INSERT INTO installment_plans (
          id, plot_id, buyer_name, buyer_phone, buyer_cnic,
          total_sale_price, down_payment, plan_duration_months, monthly_installment_amount,
          start_date, due_day_of_month, grace_period_days, late_penalty_fee, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 0, 'ACTIVE', CURRENT_TIMESTAMP)`,
        [
          planId,
          plotId,
          buyerName.trim(),
          buyerPhone.trim(),
          buyerCnic.trim(),
          effectivePrice,
          downPayment,
          planDurationMonths,
          monthlyInstallment,
          startDate,
          dueDayOfMonth,
        ]
      );
      if (!insertPlan.success) throw new Error(safeStr(insertPlan.error) || 'Failed to create installment plan');

      if (downPayment > 0) {
        for (const row of paymentRows) {
          const breakdownId = `BD_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const insertBreakdown = await window.api.dbExecute(
            `INSERT INTO sale_payment_breakdowns (id, sale_id, payment_method, transaction_ref, amount, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [breakdownId, planId, row.method, row.reference.trim(), row.amount]
          );
          if (!insertBreakdown.success) throw new Error(safeStr(insertBreakdown.error) || 'Failed to record payment breakdown');
        }
      }

      for (let i = 1; i <= planDurationMonths; i++) {
        const schedId = `SCHED_${planId}_${i}`;
        const dueDate = new Date(`${startDate}T00:00:00`);
        dueDate.setMonth(dueDate.getMonth() + i);
        dueDate.setDate(dueDayOfMonth);
        const isLast = i === planDurationMonths;
        const amountDue = isLast
          ? Math.max(0, balanceAfterDown - monthlyInstallment * (planDurationMonths - 1))
          : monthlyInstallment;

        const insertSched = await window.api.dbExecute(
          `INSERT INTO installment_schedules (
            id, plan_id, installment_number, due_date, amount_due, amount_paid,
            late_fine_charged, discount_applied, payment_date, payment_method, status, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, 'PENDING', CURRENT_TIMESTAMP)`,
          [schedId, planId, i, dueDate.toISOString().split('T')[0], amountDue]
        );
        if (!insertSched.success) throw new Error(safeStr(insertSched.error) || 'Failed to create installment schedule');
      }

      const updatePlot = await window.api.dbExecute(
        `UPDATE inventory_plots SET status = 'BOOKED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [plotId]
      );
      if (!updatePlot.success) throw new Error(safeStr(updatePlot.error) || 'Failed to update plot status');

      const receipt = generateInstallmentReceipt(planId, plot);
      setReceiptText(receipt);
      setShowReceipt(true);
      setMessage({ type: 'success', text: `Installment plan ${planId} created! Plot marked as BOOKED.` });
      await notifyCashTransaction('INFLOW', downPayment, buyerName.trim());
      resetAll();
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
      if (!res.success) throw new Error(safeStr(res.error) || 'Print failed');
      setMessage({ type: 'success', text: 'Receipt sent to printer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Print failed' });
    }
  };

  const renderPaymentRows = (requiredAmount: number, splitSum: number, isOver: boolean, isValid: boolean) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase">Payment Breakdown</h4>
        <button
          onClick={addPaymentRow}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg text-xs font-semibold transition-all border border-emerald-600/30"
        >
          <Plus size={14} /> Add Payment
        </button>
      </div>

      {paymentRows.map((row, idx) => (
        <div key={row.id} className="flex items-start gap-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
          <span className="text-[10px] text-slate-500 font-bold mt-2 min-w-[20px]">#{idx + 1}</span>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Method *</label>
              <div className="relative">
                <select
                  value={row.method}
                  onChange={(e) => updatePaymentRow(row.id, 'method', e.target.value)}
                  className="w-full appearance-none bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 pr-8"
                >
                  <optgroup label="Wallets & Mobile">
                    {PAYMENT_METHODS.filter((m) => m.category === 'wallet').map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Banks">
                    {PAYMENT_METHODS.filter((m) => m.category === 'bank').map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Transaction Ref</label>
              <input
                type="text"
                value={row.reference}
                onChange={(e) => updatePaymentRow(row.id, 'reference', e.target.value)}
                placeholder="Txn ID / Receipt #"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Amount (Rs.) *</label>
              <input
                type="number"
                min={0}
                value={row.amount || ''}
                onChange={(e) => updatePaymentRow(row.id, 'amount', Number(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <button
            onClick={() => removePaymentRow(row.id)}
            disabled={paymentRows.length <= 1}
            className="mt-5 p-1.5 text-rose-400/60 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className={`flex flex-col gap-1 p-3 rounded-xl border text-sm font-semibold ${
        isOver
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          : isValid
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}>
        <span>Total Collected: {fmt(splitSum)}</span>
        <span>{fmt(requiredAmount)} Required</span>
      </div>
      {isOver && (
        <p className="text-xs text-rose-400 font-medium">
          Error: Collected amount exceeds required amount by {fmt(splitSum - requiredAmount)}.
        </p>
      )}
    </div>
  );

  return (
    <div className="page-container">
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
        <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-medium ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* Tab Selector */}
      <div className="flex gap-1 bg-slate-900/80 border border-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => { setActiveTab('instant'); resetAll(); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'instant'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Banknote size={16} /> Instant Cash Sale
        </button>
        <button
          onClick={() => { setActiveTab('installment'); resetAll(); }}
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

      {/* ──────── INSTANT CASH SALE TAB ──────── */}
      {!loading && activeTab === 'instant' && (
        <div className="space-y-6">
          {/* Plot Selection */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-emerald-400" /> Plot Selection
            </h3>
            {plots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No available plots found. Add plots to inventory first.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Select Plot *</label>
                  <div className="relative">
                    <select
                      value={plotId}
                      onChange={(e) => handlePlotChange(e.target.value)}
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
                {selectedPlot && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Plot #</p>
                      <p className="text-sm font-mono text-white mt-0.5">{selectedPlot.plot_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Society</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlot.society_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Block</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlot.block_phase}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Size</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlot.size_dimension}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Asking Price</p>
                      <p className="text-sm font-mono text-emerald-400 mt-0.5">{fmt(selectedPlot.target_asking_price)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Buyer Info */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <User size={18} className="text-sky-400" /> Buyer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Buyer Name *</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone *</label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">CNIC</label>
                <input
                  type="text"
                  value={buyerCnic}
                  onChange={(e) => setBuyerCnic(e.target.value)}
                  placeholder="42101-1234567-1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Fees */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-amber-400" /> Pricing & Fees
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Sale Price (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={salePrice || ''}
                  onChange={(e) => setSalePrice(Number(e.target.value) || 0)}
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
                  value={taxRate || ''}
                  onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Registration Fee (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={registrationFee || ''}
                  onChange={(e) => setRegistrationFee(Number(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Sale Price</p>
                <p className="text-lg font-mono font-bold text-white mt-1">{fmt(effectivePrice)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Tax + Fees</p>
                <p className="text-lg font-mono font-bold text-amber-400 mt-1">{fmt(taxAmount + registrationFee)}</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <p className="text-[10px] uppercase text-emerald-300 font-bold">Total Due</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-1">{fmt(totalDue)}</p>
              </div>
            </div>
          </div>

          {/* Split Payment */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <Wallet size={18} className="text-emerald-400" /> Split Payment
            </h3>
            {renderPaymentRows(totalDue, splitTotal, isSplitOver, isSplitValid)}
          </div>

          {/* Notes */}
          <div className="glass-card-input p-6">
            <label className="text-xs text-slate-400 block mb-1">Receipt Notes</label>
            <input
              type="text"
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="Optional notes for receipt"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={resetAll}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
            >
              Reset Form
            </button>
            <button
              onClick={handleInstantSale}
              disabled={submitting || plots.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50"
            >
              <Receipt size={16} />
              {submitting ? 'Processing...' : 'Complete Cash Sale'}
            </button>
          </div>
        </div>
      )}

      {/* ──────── INSTALLMENT SALE TAB ──────── */}
      {!loading && activeTab === 'installment' && (
        <div className="space-y-6">
          {/* Plot Selection */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-sky-400" /> Plot Selection
            </h3>
            {plots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No available plots found. Add plots to inventory first.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Select Plot *</label>
                  <div className="relative">
                    <select
                      value={plotId}
                      onChange={(e) => handlePlotChange(e.target.value)}
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
                {selectedPlot && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Plot #</p>
                      <p className="text-sm font-mono text-white mt-0.5">{selectedPlot.plot_number}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Society</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlot.society_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Block</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlot.block_phase}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Size</p>
                      <p className="text-sm text-white mt-0.5">{selectedPlot.size_dimension}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-500 font-bold">Asking Price</p>
                      <p className="text-sm font-mono text-emerald-400 mt-0.5">{fmt(selectedPlot.target_asking_price)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Buyer Info */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <User size={18} className="text-sky-400" /> Buyer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Buyer Name *</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Phone *</label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">CNIC</label>
                <input
                  type="text"
                  value={buyerCnic}
                  onChange={(e) => setBuyerCnic(e.target.value)}
                  placeholder="42101-1234567-1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Installment Details */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <CalendarDays size={18} className="text-sky-400" /> Installment Plan Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Total Price (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={salePrice || ''}
                  onChange={(e) => setSalePrice(Number(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Down Payment (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={downPayment || ''}
                  onChange={(e) => setDownPayment(Number(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Plan Duration (months) *</label>
                <input
                  type="number"
                  min={1}
                  value={planDurationMonths || ''}
                  onChange={(e) => setPlanDurationMonths(Number(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Start Date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
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
                  value={dueDayOfMonth}
                  onChange={(e) => setDueDayOfMonth(Number(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monthly Installment (auto)</label>
                <div className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm text-sky-400">
                  {fmt(monthlyInstallment)}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Balance After Down Payment</label>
                <div className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl font-mono text-sm text-amber-400">
                  {fmt(balanceAfterDown)}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Total Price</p>
                <p className="text-lg font-mono font-bold text-white mt-1">{fmt(effectivePrice)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Down Payment</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-1">{fmt(downPayment)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Monthly x {planDurationMonths}</p>
                <p className="text-lg font-mono font-bold text-sky-400 mt-1">{fmt(monthlyInstallment)}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Status on Submit</p>
                <p className="text-lg font-bold text-amber-400 mt-1">BOOKED</p>
              </div>
            </div>
          </div>

          {/* Split Payment for Down Payment */}
          <div className="glass-card-input p-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
              <Wallet size={18} className="text-emerald-400" /> Down Payment - Split Payment
            </h3>
            {downPayment > 0 ? (
              renderPaymentRows(downPayment, downPaymentSplitTotal, isDownPaymentSplitOver, isDownPaymentSplitValid)
            ) : (
              <p className="text-xs text-slate-500 italic">Set a down payment amount above to add payment rows.</p>
            )}
          </div>

          {/* Notes */}
          <div className="glass-card-input p-6">
            <label className="text-xs text-slate-400 block mb-1">Receipt Notes</label>
            <input
              type="text"
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="Optional notes for receipt"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={resetAll}
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
