import React, { useState, useEffect, useMemo } from 'react';
import {
  LandPlot, Plus, X, Search, ArrowDownUp, Users, TrendingUp, TrendingDown,
  Wallet, Phone, Calendar, CreditCard, FileText, ChevronRight,
} from 'lucide-react';

interface CurrentUser { id: string; username: string; fullName: string; }
interface DigiKhataProps { currentUser: CurrentUser; }

interface Party {
  id: string;
  party_name: string;
  phone_number: string;
  party_type: 'CUSTOMER' | 'VENDOR' | 'INVESTOR' | 'AGENT' | 'PARTNER';
  current_balance: number;
  created_at: string;
}

interface Transaction {
  id: string;
  party_id: string;
  entry_type: 'CREDIT_LENA' | 'DEBIT_DENA';
  amount: number;
  description: string;
  due_date: string | null;
  attachment_url: string | null;
  created_at: string;
}

const fmt = (n: number) => `Rs. ${Math.abs(Math.round(n || 0)).toLocaleString('en-PK')}`;
const safeStr = (v: unknown): string => v == null ? '' : String(v);
const PARTY_TYPES = ['CUSTOMER', 'VENDOR', 'INVESTOR', 'AGENT', 'PARTNER'] as const;
const PAYMENT_MODES = ['Cash', 'JazzCash', 'EasyPaisa', 'Bank Transfer'] as const;

export const DigiKhata: React.FC<DigiKhataProps> = () => {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showAddParty, setShowAddParty] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyType, setPartyType] = useState<Party['party_type']>('CUSTOMER');

  const [showTxModal, setShowTxModal] = useState(false);
  const [txParty, setTxParty] = useState<Party | null>(null);
  const [txType, setTxType] = useState<'CREDIT_LENA' | 'DEBIT_DENA'>('CREDIT_LENA');
  const [txAmount, setTxAmount] = useState('');
  const [txPaymentMode, setTxPaymentMode] = useState('Cash');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txDescription, setTxDescription] = useState('');

  const [showLedger, setShowLedger] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<Party | null>(null);
  const [ledgerTxns, setLedgerTxns] = useState<Transaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const summary = useMemo(() => {
    let totalLena = 0;
    let totalDena = 0;
    parties.forEach((p) => {
      if (p.current_balance > 0) totalLena += p.current_balance;
      else totalDena += Math.abs(p.current_balance);
    });
    return { totalLena, totalDena, net: totalLena - totalDena, count: parties.length };
  }, [parties]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return parties;
    const q = (searchTerm ?? '').toLowerCase();
    return parties.filter(
      (p) =>
        (p.party_name ?? '').toLowerCase().includes(q) ||
        (p.phone_number ?? '').includes(q) ||
        (p.party_type ?? '').toLowerCase().includes(q),
    );
  }, [parties, searchTerm]);

  const loadParties = async () => {
    setLoading(true);
    try {
      const res = await window.api.dbQuery<Party[]>(
        'SELECT * FROM digikhata_parties ORDER BY current_balance DESC',
      );
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to load parties');
      const raw: Party[] = Array.isArray(res.data[0]) ? (res.data[0] as any) : (res.data as any);
      const sanitized = raw.map(p => ({
        ...p,
        id: p.id ?? `PARTY_${Date.now()}_${Math.random()}`,
        party_name: p.party_name ?? 'Unknown Party',
        phone_number: p.phone_number ?? '-',
        party_type: (p.party_type ?? 'CUSTOMER') as Party['party_type'],
        current_balance: Number(p.current_balance) || 0,
        created_at: p.created_at ?? new Date().toISOString(),
      }));
      setParties(sanitized);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load parties' });
    }
    setLoading(false);
  };

  const loadLedger = async (party: Party) => {
    setLedgerParty(party);
    setShowLedger(true);
    setLedgerLoading(true);
    try {
      const res = await window.api.dbQuery<Transaction[]>(
        'SELECT * FROM digikhata_entries WHERE party_id = ? ORDER BY created_at DESC',
        [party.id],
      );
      if (!res.success || !res.data) throw new Error(res.error || 'Failed to load transactions');
      const raw: Transaction[] = Array.isArray(res.data[0]) ? (res.data[0] as any) : (res.data as any);
      const sanitized = raw.map(t => ({
        ...t,
        id: t.id ?? `TX_${Date.now()}_${Math.random()}`,
        party_id: t.party_id ?? '',
        entry_type: (t.entry_type ?? 'CREDIT_LENA') as Transaction['entry_type'],
        amount: Number(t.amount) || 0,
        description: t.description ?? '',
        due_date: t.due_date ?? null,
        attachment_url: t.attachment_url ?? null,
        created_at: t.created_at ?? new Date().toISOString(),
      }));
      setLedgerTxns(sanitized);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load ledger' });
    }
    setLedgerLoading(false);
  };

  const handleAddParty = async () => {
    if (!partyName.trim()) {
      setMessage({ type: 'error', text: 'Party name is required' });
      return;
    }
    if (!partyPhone.trim()) {
      setMessage({ type: 'error', text: 'Phone number is required' });
      return;
    }
    try {
      const id = `PARTY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const res = await window.api.dbExecute(
        'INSERT INTO digikhata_parties (id, party_name, phone_number, party_type, current_balance, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        [id, partyName.trim(), partyPhone.trim(), partyType, new Date().toISOString()],
      );
      if (!res.success) throw new Error(res.error || 'Failed to add party');
      setMessage({ type: 'success', text: `Party "${partyName.trim()}" added` });
      setShowAddParty(false);
      setPartyName('');
      setPartyPhone('');
      setPartyType('CUSTOMER');
      await loadParties();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add party' });
    }
  };

  const openTxModal = (party: Party, type: 'CREDIT_LENA' | 'DEBIT_DENA') => {
    setTxParty(party);
    setTxType(type);
    setTxAmount('');
    setTxPaymentMode('Cash');
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxDescription('');
    setShowTxModal(true);
  };

  const handleAddTransaction = async () => {
    if (!txParty) return;
    const amount = parseFloat(txAmount);
    if (isNaN(amount) || amount <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid amount' });
      return;
    }
    try {
      const id = `TX_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const balanceDelta = txType === 'CREDIT_LENA' ? amount : -amount;

      await window.api.dbExecute(
        'INSERT INTO digikhata_entries (id, party_id, entry_type, amount, description, due_date, attachment_url, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
        [id, txParty.id, txType, amount, `[${txPaymentMode}] ${txDescription.trim()}`, txDate, new Date().toISOString()],
      );

      await window.api.dbExecute(
        'UPDATE digikhata_parties SET current_balance = current_balance + ? WHERE id = ?',
        [balanceDelta, txParty.id],
      );

      const label = txType === 'CREDIT_LENA' ? 'Credit (Lena)' : 'Debit (Dena)';
      setMessage({ type: 'success', text: `${label} of ${fmt(amount)} recorded for ${txParty.party_name}` });
      setShowTxModal(false);
      await loadParties();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record transaction' });
    }
  };

  const getPartyTypeColor = (t: string) => {
    switch (t) {
      case 'CUSTOMER': return 'bg-sky-500/15 text-sky-400 border-sky-500/20';
      case 'VENDOR': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      case 'INVESTOR': return 'bg-violet-500/15 text-violet-400 border-violet-500/20';
      case 'AGENT': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
      case 'PARTNER': return 'bg-rose-500/15 text-rose-400 border-rose-500/20';
      default: return 'bg-slate-500/15 text-slate-400 border-slate-500/20';
    }
  };

  useEffect(() => { loadParties(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        Loading DigiKhata...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <LandPlot size={24} className="text-emerald-400" /> DigiKhata
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Party ledger &amp; double-entry balance tracker</p>
        </div>
        <button
          onClick={() => { setShowAddParty(true); setPartyName(''); setPartyPhone(''); setPartyType('CUSTOMER'); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-900/30"
        >
          <Plus size={16} /> Add New Party
        </button>
      </div>

      {/* ─── Toast ─── */}
      {message && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto hover:text-white"><X size={14} /></button>
        </div>
      )}

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Lena (Receivable)</span>
          </div>
          <p className="text-xl font-bold text-emerald-400 font-mono">{fmt(summary.totalLena)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={16} className="text-rose-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Dena (Payable)</span>
          </div>
          <p className="text-xl font-bold text-rose-400 font-mono">{fmt(summary.totalDena)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={16} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Net Balance</span>
          </div>
          <p className={`text-xl font-bold font-mono ${summary.net > 0 ? 'text-emerald-400' : summary.net < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {summary.net >= 0 ? '+' : '-'} {fmt(summary.net)}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-sky-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Parties</span>
          </div>
          <p className="text-xl font-bold text-white font-mono">{summary.count}</p>
        </div>
      </div>

      {/* ─── Search ─── */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search parties by name, phone, or type..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      {/* ─── Party Table ─── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{parties.length === 0 ? 'No parties yet. Add your first party above.' : 'No parties match your search.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="py-3 px-5 font-semibold">Party</th>
                  <th className="py-3 px-5 font-semibold">Phone</th>
                  <th className="py-3 px-5 font-semibold">Type</th>
                  <th className="py-3 px-5 font-semibold text-right">Lena (Receivable)</th>
                  <th className="py-3 px-5 font-semibold text-right">Dena (Payable)</th>
                  <th className="py-3 px-5 font-semibold text-right">Balance</th>
                  <th className="py-3 px-5 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((party) => {
                  const lena = party.current_balance > 0 ? party.current_balance : 0;
                  const dena = party.current_balance < 0 ? Math.abs(party.current_balance) : 0;
                  return (
                    <tr
                      key={party.id}
                      className="hover:bg-slate-800/40 cursor-pointer transition"
                      onClick={() => loadLedger(party)}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0">
                            {(safeStr(party.party_name).charAt(0) || '?').toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-white text-sm">{safeStr(party.party_name)}</p>
                            <p className="text-[10px] text-slate-500">ID: {safeStr(party.id).slice(0, 12)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-300 text-sm flex items-center gap-1.5">
                        <Phone size={12} className="text-slate-500" /> {safeStr(party.phone_number)}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPartyTypeColor(party.party_type)}`}>
                          {safeStr(party.party_type)}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <span className="font-mono font-bold text-emerald-400 text-sm">{fmt(lena)}</span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <span className="font-mono font-bold text-rose-400 text-sm">{fmt(dena)}</span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <span className={`font-mono font-bold text-sm ${party.current_balance > 0 ? 'text-emerald-400' : party.current_balance < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {party.current_balance >= 0 ? '+' : '-'}{fmt(party.current_balance)}
                        </span>
                      </td>
                      <td className="py-3.5 px-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openTxModal(party, 'CREDIT_LENA')}
                            className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold transition"
                            title="Credit / Lena"
                          >
                            +
                          </button>
                          <button
                            onClick={() => openTxModal(party, 'DEBIT_DENA')}
                            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 rounded-lg text-xs font-bold transition"
                            title="Debit / Dena"
                          >
                            -
                          </button>
                          <button
                            onClick={() => loadLedger(party)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition"
                            title="View Ledger"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Add Party Modal ─── */}
      {showAddParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddParty(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" /> Add New Party
              </h3>
              <button onClick={() => setShowAddParty(false)} className="text-slate-400 hover:text-white transition"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Party Name *</label>
                <input
                  type="text"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder="e.g. Ahmed Khan"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Phone Number *</label>
                <input
                  type="tel"
                  value={partyPhone}
                  onChange={(e) => setPartyPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Party Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {PARTY_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setPartyType(t)}
                      className={`py-2 rounded-xl text-[11px] font-bold border transition ${
                        partyType === t
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowAddParty(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition">
                Cancel
              </button>
              <button onClick={handleAddParty} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-900/30">
                Add Party
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Transaction Modal ─── */}
      {showTxModal && txParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowTxModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {txType === 'CREDIT_LENA' ? (
                  <span className="text-emerald-400">+ Credit / Lena</span>
                ) : (
                  <span className="text-rose-400">- Debit / Dena</span>
                )}
                <span className="text-slate-500 text-sm ml-2">for {txParty.party_name}</span>
              </h3>
              <button onClick={() => setShowTxModal(false)} className="text-slate-400 hover:text-white transition"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Amount (Rs.) *</label>
                <input
                  type="number"
                  min={0}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-lg font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Payment Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => setTxPaymentMode(m)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border transition ${
                        txPaymentMode === m
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <CreditCard size={12} /> {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Date</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Description / Note</label>
                <textarea
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional note..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                />
              </div>
              {txAmount && parseFloat(txAmount) > 0 && (
                <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium ${
                  txType === 'CREDIT_LENA'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}>
                  {txType === 'CREDIT_LENA' ? (
                    <><TrendingUp size={14} /> {txParty.party_name} will owe you {fmt(parseFloat(txAmount))}</>
                  ) : (
                    <><TrendingDown size={14} /> {txParty.party_name} will pay back {fmt(parseFloat(txAmount))}</>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowTxModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition">
                Cancel
              </button>
              <button
                onClick={handleAddTransaction}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg ${
                  txType === 'CREDIT_LENA'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                }`}
              >
                Record {txType === 'CREDIT_LENA' ? 'Credit' : 'Debit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Transaction Ledger Modal ─── */}
      {showLedger && ledgerParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowLedger(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Ledger Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-emerald-400" /> Transaction Ledger
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ledgerParty.party_name} &middot; {ledgerParty.phone_number} &middot;{' '}
                  <span className={getPartyTypeColor(ledgerParty.party_type).split(' ')[1]}>{ledgerParty.party_type}</span>
                </p>
              </div>
              <button onClick={() => setShowLedger(false)} className="text-slate-400 hover:text-white transition"><X size={18} /></button>
            </div>

            {/* Ledger Balance Banner */}
            <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-6 shrink-0">
              <div>
                <p className="text-[10px] uppercase text-slate-500 font-semibold">Current Balance</p>
                <p className={`text-lg font-bold font-mono ${ledgerParty.current_balance > 0 ? 'text-emerald-400' : ledgerParty.current_balance < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {ledgerParty.current_balance >= 0 ? '+' : '-'} {fmt(ledgerParty.current_balance)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500 font-semibold">Transactions</p>
                <p className="text-lg font-bold font-mono text-white">{ledgerTxns.length}</p>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="flex-1 overflow-y-auto p-5">
              {ledgerLoading ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading transactions...
                </div>
              ) : ledgerTxns.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <ArrowDownUp size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 text-[10px] uppercase tracking-wider">
                        <th className="py-2 px-3 font-semibold">#</th>
                        <th className="py-2 px-3 font-semibold">Date</th>
                        <th className="py-2 px-3 font-semibold">Payment</th>
                        <th className="py-2 px-3 font-semibold">Type</th>
                        <th className="py-2 px-3 font-semibold">Note</th>
                        <th className="py-2 px-3 font-semibold text-right">Amount</th>
                        <th className="py-2 px-3 font-semibold text-right">Running Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(() => {
                        let running = 0;
                        return [...ledgerTxns].reverse().map((tx, i) => {
                          if (tx.entry_type === 'CREDIT_LENA') running += tx.amount;
                          else running -= tx.amount;
                          const paymentMatch = tx.description.match(/^\[(.+?)\]\s*(.*)$/);
                          const paymentMethod = paymentMatch ? paymentMatch[1] : '—';
                          const note = paymentMatch ? paymentMatch[2] || '—' : tx.description || '—';
                          return (
                            <tr key={tx.id} className="hover:bg-slate-800/40">
                              <td className="py-2.5 px-3 text-slate-500 font-mono">{i + 1}</td>
                              <td className="py-2.5 px-3 text-slate-300 flex items-center gap-1.5">
                                <Calendar size={10} className="text-slate-600" />
                                {tx.created_at.slice(0, 10)}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                  {paymentMethod}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  tx.entry_type === 'CREDIT_LENA'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                }`}>
                                  {tx.entry_type === 'CREDIT_LENA' ? '+' : '-'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate">{note}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold">
                                <span className={tx.entry_type === 'CREDIT_LENA' ? 'text-emerald-400' : 'text-rose-400'}>
                                  {tx.entry_type === 'CREDIT_LENA' ? '+' : '-'}{fmt(tx.amount)}
                                </span>
                              </td>
                              <td className={`py-2.5 px-3 text-right font-mono font-bold ${running > 0 ? 'text-emerald-400' : running < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                {running >= 0 ? '+' : '-'}{fmt(running)}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DigiKhata;
