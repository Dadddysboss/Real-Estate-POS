import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Lock, Unlock, Plus, Minus, RotateCcw, History, Receipt, Printer,
  AlertTriangle, CheckCircle2, ArrowDownLeft, ArrowUpRight, Banknote, ShieldAlert, X,
} from 'lucide-react';
import {
  CashSession, CashTransaction, DenominationBreakdown,
  EMPTY_DENOMINATIONS, CASH_CATEGORIES,
  fetchActiveSession, fetchSessionHistory, fetchCashTransactions,
  calculateSessionExpectedBalance, openCashSession, closeCashSession,
  recordDenominationAudit, createCashIn, createCashOut,
  computeDenominationTotal, generateThermalReceipt, printThermalReceipt,
} from '../../services/cash.service';

const DENOM_META: { key: keyof DenominationBreakdown; label: string; value: number }[] = [
  { key: 'notes_5000', label: 'Rs. 5000', value: 5000 },
  { key: 'notes_1000', label: 'Rs. 1000', value: 1000 },
  { key: 'notes_500', label: 'Rs. 500', value: 500 },
  { key: 'notes_100', label: 'Rs. 100', value: 100 },
  { key: 'notes_50', label: 'Rs. 50', value: 50 },
  { key: 'notes_20', label: 'Rs. 20', value: 20 },
  { key: 'notes_10', label: 'Rs. 10', value: 10 },
];

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

interface CashCounterProps {
  branchId: string;
  currentUser: { id: string; username: string; fullName: string };
}

interface CashTxnForm {
  amount: number;
  category: string;
  notes: string;
  counterparty: string;
}

const emptyTxnForm = (category: string): CashTxnForm => ({ amount: 0, category, notes: '', counterparty: '' });

export const CashCounter: React.FC<CashCounterProps> = ({ branchId, currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [systemPosition, setSystemPosition] = useState<{ totalIn: number; totalOut: number; expected: number } | null>(null);
  const [denominations, setDenominations] = useState<DenominationBreakdown>({ ...EMPTY_DENOMINATIONS });
  const [openingFloat, setOpeningFloat] = useState(0);
  const [openingDenoms, setOpeningDenoms] = useState<DenominationBreakdown>({ ...EMPTY_DENOMINATIONS });
  const [handoverTo, setHandoverTo] = useState('');
  const [cashInForm, setCashInForm] = useState<CashTxnForm>(emptyTxnForm(CASH_CATEGORIES.CASH_IN[0]));
  const [cashOutForm, setCashOutForm] = useState<CashTxnForm>(emptyTxnForm(CASH_CATEGORIES.CASH_OUT[0]));
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);

  const countedTotal = computeDenominationTotal(denominations);
  const systemBalance = systemPosition?.expected ?? 0;
  const variance = countedTotal - systemBalance;
  const openingTally = computeDenominationTotal(openingDenoms);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const active = await fetchActiveSession(branchId);
      setActiveSession(active);
      setSessions(await fetchSessionHistory(branchId, 20));
      if (active) {
        const [txns, position] = await Promise.all([
          fetchCashTransactions(branchId, 100, active.opened_at),
          calculateSessionExpectedBalance(active),
        ]);
        setTransactions(txns);
        setSystemPosition(position);
        setOpeningFloat(active.opening_balance);
      } else {
        setTransactions([]);
        setSystemPosition(null);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load cash counter' });
    }
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    setDenominations({ ...EMPTY_DENOMINATIONS });
    void loadData();
  }, [loadData]);

  const showReceipt = (title: string, text: string) => setPreview({ title, text });

  const handleOpenDrawer = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const sessionId = await openCashSession(branchId, currentUser.id, currentUser.fullName, openingFloat, openingDenoms);
      setActiveSession(await fetchActiveSession(branchId));
      showReceipt('Drawer Opening Voucher', generateThermalReceipt({
        type: 'DRAWER_OPENING',
        transactionId: sessionId,
        branchName: branchId,
        userName: currentUser.fullName,
        amount: openingFloat,
        category: 'DRAWER_OPENING',
        notes: `Opening float tallied: ${fmt(openingTally)}`,
        denominations: openingDenoms,
        timestamp: new Date().toISOString(),
      }));
      setDenominations({ ...EMPTY_DENOMINATIONS });
      setMessage({ type: 'success', text: `Drawer session ${sessionId} opened successfully.` });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to open drawer' });
    }
    setActionLoading(false);
  };

  const handleRecordCount = async () => {
    if (!activeSession) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await recordDenominationAudit(activeSession, currentUser.id, currentUser.fullName, denominations);
      showReceipt('Denomination Audit Receipt', generateThermalReceipt({
        type: 'DENOMINATION_AUDIT',
        transactionId: result.adjustmentId,
        branchName: branchId,
        userName: currentUser.fullName,
        amount: result.actual,
        category: 'DENOMINATION_AUDIT',
        notes: `Physical count recorded against session ${activeSession.id}`,
        denominations,
        timestamp: new Date().toISOString(),
        variance: result.variance,
        expected: result.expected,
      }));
      setMessage({
        type: result.variance === 0 ? 'success' : 'error',
        text: result.variance === 0
          ? `Count reconciled perfectly at ${fmt(result.actual)}.`
          : `Variance ${result.variance > 0 ? '+' : ''}${fmt(result.variance)} booked as CASH_ADJUSTMENT.`,
      });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record count' });
    }
    setActionLoading(false);
  };

  const handleCloseSession = async () => {
    if (!activeSession) return;
    if (!handoverTo.trim()) {
      setMessage({ type: 'error', text: 'Enter the staff member receiving the drawer for the handover voucher.' });
      return;
    }
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await closeCashSession(activeSession.id, currentUser.id, currentUser.fullName, denominations, handoverTo.trim());
      showReceipt('Session Handover Voucher', generateThermalReceipt({
        type: 'HANDOVER_VOUCHER',
        transactionId: activeSession.id,
        branchName: branchId,
        userName: currentUser.fullName,
        amount: result.actual,
        category: 'DRAWER_CLOSING',
        notes: `Drawer closed and handed over. ${result.variance !== 0 ? `Variance adjusted via CASH_ADJUSTMENT.` : 'Zero variance — fully reconciled.'}`,
        denominations,
        timestamp: new Date().toISOString(),
        variance: result.variance,
        expected: result.expected,
        handoverTo: handoverTo.trim(),
      }));
      setMessage({ type: 'success', text: `Session closed. Counted ${fmt(result.actual)} vs system ${fmt(result.expected)}.` });
      setHandoverTo('');
      setDenominations({ ...EMPTY_DENOMINATIONS });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to close session' });
    }
    setActionLoading(false);
  };

  const handleCashMovement = async (direction: 'CASH_IN' | 'CASH_OUT') => {
    if (!activeSession) return;
    const form = direction === 'CASH_IN' ? cashInForm : cashOutForm;
    if (form.amount <= 0 || !Number.isFinite(form.amount)) {
      setMessage({ type: 'error', text: 'Enter a valid amount.' });
      return;
    }
    if (!form.counterparty.trim()) {
      setMessage({ type: 'error', text: direction === 'CASH_IN' ? 'Enter who paid in (received from).' : 'Enter who receives the cash (handed over to).' });
      return;
    }
    setActionLoading(true);
    setMessage(null);
    try {
      const id = direction === 'CASH_IN'
        ? await createCashIn(branchId, currentUser.id, Math.round(form.amount), form.category, form.notes, form.counterparty.trim(), { userName: currentUser.fullName })
        : await createCashOut(branchId, currentUser.id, Math.round(form.amount), form.category, form.notes, form.counterparty.trim(), { userName: currentUser.fullName });
      showReceipt(direction === 'CASH_IN' ? 'Cash Deposit Receipt' : 'Cash Withdrawal Receipt', generateThermalReceipt({
        type: direction,
        transactionId: id,
        branchName: branchId,
        userName: currentUser.fullName,
        amount: Math.round(form.amount),
        category: form.category,
        notes: form.notes,
        timestamp: new Date().toISOString(),
      }));
      setCashInForm(emptyTxnForm(cashInForm.category));
      setCashOutForm(emptyTxnForm(cashOutForm.category));
      setMessage({ type: 'success', text: `${direction === 'CASH_IN' ? 'Deposit' : 'Withdrawal'} of ${fmt(form.amount)} recorded.` });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record cash movement' });
    }
    setActionLoading(false);
  };

  const printPreviewNow = async () => {
    if (!preview) return;
    try {
      await printThermalReceipt(preview.text);
      setMessage({ type: 'success', text: 'Receipt sent to thermal printer.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Print failed' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading Cash Counter...</div>;
  }

  const locked = !activeSession;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet size={24} className="text-emerald-400" /> Cash Counter & Reconciliation
          </h2>
          <p className="text-sm text-slate-400">Module 4 — Drawer Sessions, Multi-Denomination Counting & Variance Audit</p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl glass-card text-sm text-slate-300 hover:text-white"
        >
          <History size={16} /> {showHistory ? 'Hide' : 'Session'} History
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* Drawer Session Control */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {locked ? (
            <div className="flex items-center gap-3">
              <div className="p-3 bg-slate-500/10 text-slate-400 rounded-xl border border-slate-500/30"><Lock size={22} /></div>
              <div>
                <p className="text-sm font-semibold text-white">Counter Locked — No Active Drawer</p>
                <p className="text-xs text-slate-400">Open a session with an opening float to activate the cash counter.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/30"><Unlock size={22} /></div>
              <div>
                <p className="text-sm font-semibold text-white">Counter Unlocked — Session Active</p>
                <p className="text-xs font-mono text-slate-400">{activeSession.id} • Opened {new Date(activeSession.opened_at).toLocaleString('en-PK')}</p>
              </div>
            </div>
          )}

          {locked ? (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Opening Float (PKR)</label>
                <input
                  type="number" min={0} value={openingFloat || ''}
                  onChange={(e) => setOpeningFloat(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  placeholder="0"
                  className="w-44 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tally From Notes Below (PKR)</label>
                <div className="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl font-mono text-sm text-emerald-400">{fmt(openingTally)}</div>
              </div>
              <button
                onClick={handleOpenDrawer}
                disabled={actionLoading || openingFloat <= 0 || openingTally !== openingFloat}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50"
              >
                <Unlock size={16} /> Open Drawer
              </button>
            </div>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Handover Voucher — Receiver Name</label>
                <input
                  type="text" value={handoverTo} onChange={(e) => setHandoverTo(e.target.value)}
                  placeholder="e.g. Cashier Shahid"
                  className="w-52 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-rose-500"
                />
              </div>
              <button
                onClick={handleCloseSession}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-rose-950/50"
              >
                <Lock size={16} /> Close & Reconcile
              </button>
            </div>
          )}
        </div>

        {/* Balance Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">System Calculated Balance</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white mt-1">{fmt(systemBalance)}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {systemPosition ? `In ${fmt(systemPosition.totalIn)} • Out ${fmt(systemPosition.totalOut)}` : 'No active session'}
            </p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Actual Counter Cash (Counted)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-sky-400 mt-1">{fmt(countedTotal)}</p>
            <p className="text-[11px] text-slate-500 mt-1">Live denomination tally</p>
          </div>
          <div className={`rounded-xl p-4 border ${variance === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Real-Time Variance</p>
            <p className={`text-2xl font-bold font-mono tabular-nums mt-1 ${variance === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {variance >= 0 ? '+' : ''}{fmt(Math.abs(variance) * Math.sign(variance) || 0)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {variance === 0 ? 'Drawer fully reconciled' : variance > 0 ? 'Overage (counted > system)' : 'Shortage (counted < system)'}
            </p>
          </div>
        </div>
      </div>

      {/* Opening Float Denomination Sheet (when locked) */}
      {locked && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Banknote size={18} className="text-amber-400" /> Opening Float Note Tally</h3>
          <DenominationSheetGrid values={openingDenoms} onChange={setOpeningDenoms} disabled={false} compact />
        </div>
      )}

      {/* Main Grid: Count Sheet + Movements */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-card p-5 relative overflow-hidden">
          {locked && (
            <div className="absolute inset-0 z-10 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center">
              <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold bg-slate-900 border border-slate-700 px-4 py-2 rounded-xl">
                <ShieldAlert size={16} className="text-rose-400" /> Counter locked — open a drawer session to count
              </div>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Banknote size={18} className="text-emerald-400" /> Multi-Denomination Counting Sheet</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setDenominations({ ...EMPTY_DENOMINATIONS })} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs">
                <RotateCcw size={13} /> Reset Count
              </button>
              <button onClick={handleRecordCount} disabled={locked || actionLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 disabled:bg-slate-800 disabled:text-slate-600 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold">
                <Receipt size={13} /> Record Count & Reconcile
              </button>
            </div>
          </div>
          <DenominationSheetGrid values={denominations} onChange={setDenominations} disabled={locked} />
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Total Counted Cash</span>
            <span className="text-xl font-bold font-mono tabular-nums text-emerald-400">{fmt(countedTotal)}</span>
          </div>
        </div>

        {/* Cash In / Cash Out */}
        <div className="space-y-6">
          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><ArrowDownLeft size={18} className="text-emerald-400" /> Cash In (Deposit)</h3>
            <div className="space-y-3">
              <input type="number" min={0} placeholder="Amount (PKR)" value={cashInForm.amount || ''}
                onChange={(e) => setCashInForm({ ...cashInForm, amount: Number(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500" />
              <select value={cashInForm.category} onChange={(e) => setCashInForm({ ...cashInForm, category: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
                {CASH_CATEGORIES.CASH_IN.map((c) => <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>)}
              </select>
              <input type="text" placeholder="Received From" value={cashInForm.counterparty}
                onChange={(e) => setCashInForm({ ...cashInForm, counterparty: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <input type="text" placeholder="Notes / Reference" value={cashInForm.notes}
                onChange={(e) => setCashInForm({ ...cashInForm, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <button onClick={() => handleCashMovement('CASH_IN')} disabled={locked || actionLoading}
                className="w-full py-2.5 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                <Plus size={16} /> Record Cash In
              </button>
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><ArrowUpRight size={18} className="text-rose-400" /> Cash Out (Withdrawal)</h3>
            <div className="space-y-3">
              <input type="number" min={0} placeholder="Amount (PKR)" value={cashOutForm.amount || ''}
                onChange={(e) => setCashOutForm({ ...cashOutForm, amount: Number(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-rose-500" />
              <select value={cashOutForm.category} onChange={(e) => setCashOutForm({ ...cashOutForm, category: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500">
                {CASH_CATEGORIES.CASH_OUT.map((c) => <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>)}
              </select>
              <input type="text" placeholder="Handed Over To" value={cashOutForm.counterparty}
                onChange={(e) => setCashOutForm({ ...cashOutForm, counterparty: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500" />
              <input type="text" placeholder="Notes / Voucher Ref" value={cashOutForm.notes}
                onChange={(e) => setCashOutForm({ ...cashOutForm, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500" />
              <button onClick={() => handleCashMovement('CASH_OUT')} disabled={locked || actionLoading}
                className="w-full py-2.5 btn-danger text-sm flex items-center justify-center gap-2 disabled:opacity-40">
                <Minus size={16} /> Record Cash Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Session Ledger */}
      {!locked && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4">Session Cash Ledger ({transactions.length} entries)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Party</th>
                  <th className="pb-2 pr-4">Notes</th>
                  <th className="pb-2 text-right">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {transactions.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-500">No cash movements recorded yet in this session.</td></tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-4 text-slate-400 font-mono whitespace-nowrap">{new Date(t.created_at).toLocaleTimeString('en-PK')}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.transaction_type === 'CASH_IN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {t.transaction_type === 'CASH_IN' ? 'IN' : 'OUT'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{t.category.replaceAll('_', ' ')}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{t.received_by || t.handed_over_by || '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-500 max-w-[240px] truncate">{t.notes || '—'}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-white whitespace-nowrap">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session History */}
      {showHistory && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-white mb-4">Drawer Session History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="pb-2 pr-4">Session</th>
                  <th className="pb-2 pr-4">Opened</th>
                  <th className="pb-2 pr-4">Closed</th>
                  <th className="pb-2 text-right">Opening</th>
                  <th className="pb-2 text-right">System</th>
                  <th className="pb-2 text-right">Counted</th>
                  <th className="pb-2 text-right">Variance</th>
                  <th className="pb-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sessions.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No sessions recorded.</td></tr>}
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-mono text-slate-300">{s.id.slice(0, 18)}…</td>
                    <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{new Date(s.opened_at).toLocaleString('en-PK')}</td>
                    <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{s.closed_at ? new Date(s.closed_at).toLocaleString('en-PK') : '—'}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-white">{fmt(s.opening_balance)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-slate-300">{s.expected_balance != null ? fmt(s.expected_balance) : '—'}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-sky-400">{s.closing_balance != null ? fmt(s.closing_balance) : '—'}</td>
                    <td className={`py-2.5 pr-4 text-right font-mono font-bold ${s.variance == null ? 'text-slate-500' : s.variance === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {s.variance != null ? `${s.variance >= 0 ? '+' : '-'}${fmt(Math.abs(s.variance))}` : '—'}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'OPEN' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 80mm Thermal Receipt Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setPreview(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Receipt size={16} className="text-emerald-400" /> {preview.title} — 80mm Preview</h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto bg-slate-950">
              <pre className="font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre">{preview.text}</pre>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-800">
              <button onClick={() => setPreview(null)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Close</button>
              <button onClick={printPreviewNow} className="flex items-center gap-2 px-5 py-2 btn-primary text-xs">
                <Printer size={14} /> Send to Thermal Printer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------
// Denomination Sheet Grid (reusable)
// ------------------------------------------------------------------

const DenominationSheetGrid: React.FC<{
  values: DenominationBreakdown;
  onChange: (next: DenominationBreakdown) => void;
  disabled: boolean;
  compact?: boolean;
}> = ({ values, onChange, disabled, compact = false }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-4 ${compact ? 'lg:grid-cols-7' : 'lg:grid-cols-4 xl:grid-cols-7'} gap-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
    {DENOM_META.map((d) => {
      const count = values[d.key];
      const subtotal = count * d.value;
      return (
        <div key={d.key} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">{d.label}</span>
            <span className="text-[10px] text-slate-500 font-mono">{subtotal.toLocaleString('en-PK')}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onChange({ ...values, [d.key]: Math.max(0, count - 1) })}
              className="w-8 h-8 flex-shrink-0 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center">
              <Minus size={14} className="text-slate-300" />
            </button>
            <input type="number" min={0} value={count || ''} placeholder="0" inputMode="numeric"
              onChange={(e) => onChange({ ...values, [d.key]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              className="w-full min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded-lg px-1 py-1.5 text-center text-sm font-mono text-white focus:outline-none focus:border-emerald-500" />
            <button onClick={() => onChange({ ...values, [d.key]: count + 1 })}
              className="w-8 h-8 flex-shrink-0 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center">
              <Plus size={14} className="text-slate-300" />
            </button>
          </div>
        </div>
      );
    })}
  </div>
);

export default CashCounter;
