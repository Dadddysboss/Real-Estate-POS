import React, { useState, useEffect } from 'react';
import { LandPlot, Plus, X, Search, Trash2, ArrowDownUp, FileText } from 'lucide-react';
import { DigiKhataEntry } from '../../types/electron';
import { fetchParties, fetchLedgerEntries, addLedgerEntry, deleteLedgerEntry, calculatePartyBalance, generateKhataStatement } from '../../services/digikhata.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface DigiKhataProps {
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
const fmtNum = (n: number) => Math.round(n).toLocaleString('en-PK');

const categories = [
  'MATERIAL', 'LABOR', 'MACHINERY', 'TRANSPORT', 'RENT', 'ELECTRICITY',
  'WATER', 'GAS', 'OFFICE', 'TELECOMMUNICATION', 'MAINTENANCE',
  'SALARIES', 'REPAIRS', 'OTHER',
];

export const DigiKhata: React.FC<DigiKhataProps> = ({ currentUser }) => {
  const [parties, setParties] = useState<any[]>([]);
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [entries, setEntries] = useState<DigiKhataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [statementText, setStatementText] = useState('');

  // Form state
  const [partyName, setPartyName] = useState('');
  const [entryType, setEntryType] = useState<'CREDIT_LENA' | 'DEBIT_DENA'>('CREDIT_LENA');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState('OTHER');
  const [description, setDescription] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');

  const loadParties = async () => {
    setLoading(true);
    try {
      const data = await fetchParties();
      setParties(data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load parties' });
    }
    setLoading(false);
  };

  const loadEntries = async (partyName: string) => {
    try {
      const data = await fetchLedgerEntries(partyName);
      setEntries(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadParties();
  }, []);

  useEffect(() => {
    if (selectedParty) {
      loadEntries(selectedParty);
    }
  }, [selectedParty]);

  const resetForm = () => {
    setPartyName(selectedParty || '');
    setEntryType('CREDIT_LENA');
    setAmount(0);
    setCategory('OTHER');
    setDescription('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    setReference('');
  };

  const handleAddEntry = async () => {
    if (!partyName.trim() || amount <= 0) {
      setMessage({ type: 'error', text: 'Party name and amount are required' });
      return;
    }
    try {
      await addLedgerEntry(currentUser.id, currentUser.fullName, {
        party_id: '',
        party_name: partyName.trim(),
        entry_type: entryType,
        amount,
        category,
        description,
        date: entryDate,
        reference: reference.trim() || null,
      });
      setMessage({ type: 'success', text: 'Entry added' });
      setShowForm(false);
      setAmount(0);
      setDescription('');
      setReference('');
      await loadParties();
      if (selectedParty) loadEntries(selectedParty);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add entry' });
    }
  };

  const handleDelete = async (entry: DigiKhataEntry) => {
    if (!window.confirm(`Delete this entry?`)) return;
    try {
      await deleteLedgerEntry(entry.id, currentUser.id, currentUser.fullName, `${selectedParty} ${entry.amount}`);
      setMessage({ type: 'success', text: 'Entry deleted' });
      await loadParties();
      if (selectedParty) loadEntries(selectedParty);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const handleViewStatement = () => {
    if (selectedParty && entries.length > 0) {
      setStatementText(generateKhataStatement(selectedParty, entries));
      setShowStatement(true);
    }
  };

  const filteredParties = parties.filter((p) => {
    if (!searchTerm) return true;
    return p.party_name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const balance = selectedParty ? calculatePartyBalance(entries) : null;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading DigiKhata...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <LandPlot size={24} className="text-amber-400" /> DigiKhata — Party Ledger
          </h2>
          <p className="text-sm text-slate-400">Module 12 — Double-entry ledger (Lena/Dena) with running balance</p>
        </div>
        <div className="flex gap-2">
          {selectedParty && (
            <button onClick={handleViewStatement} className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs">
              <FileText size={14} /> Statement
            </button>
          )}
          <button onClick={() => { setShowForm(true); resetForm(); }}
            className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Party List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex gap-1 mb-2">
            <Search size={14} className="text-slate-500 mt-2 ml-2" />
            <input type="text" placeholder="Search parties..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white" />
          </div>
          {filteredParties.map((party) => (
            <button key={party.party_name} onClick={() => { setSelectedParty(party.party_name); }}
              className={`w-full text-left glass-card glass-card-hover p-3 ${selectedParty === party.party_name ? 'ring-2 ring-amber-500/50' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-white text-sm">{party.party_name}</h4>
                  <p className="text-[10px] text-slate-500">{party.entry_count} entries</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${party.balance > 0 ? 'status-rose' : 'status-emerald'}`}>
                  {party.balance > 0 ? '+' : ''}{fmtNum(party.balance)}
                </span>
              </div>
              <div className="flex justify-between mt-2 text-[10px]">
                <span className="text-sky-400">Dena: {fmtNum(party.total_dena || 0)}</span>
                <span className="text-emerald-400">Lena: {fmtNum(party.total_lena || 0)}</span>
              </div>
            </button>
          ))}
          {filteredParties.length === 0 && (
            <div className="text-center text-slate-500 text-sm p-8">No parties found</div>
          )}
        </div>

        {/* Ledger View */}
        <div className="lg:col-span-3">
          {selectedParty && balance ? (
            <div className="space-y-4">
              {/* Balance Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <p className="text-[10px] uppercase text-slate-500">Total LENA (Received)</p>
                  <p className="text-lg font-bold text-emerald-400 mt-1 font-mono">{fmt(balance.totalLena)}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-[10px] uppercase text-slate-500">Total DENA (Paid)</p>
                  <p className="text-lg font-bold text-rose-400 mt-1 font-mono">{fmt(balance.totalDena)}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-[10px] uppercase text-slate-500">Net Balance</p>
                  <p className={`text-lg font-bold mt-1 font-mono ${balance.balance > 0 ? 'text-rose-400' : balance.balance < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {fmt(balance.balance)}
                  </p>
                </div>
              </div>

              {/* Quick Add */}
              <div className="glass-card p-4 flex items-center gap-3">
                <button onClick={() => { setPartyName(selectedParty); setEntryType('CREDIT_LENA'); setShowForm(true); }}
                  className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold transition">
                  + LENA (Received)
                </button>
                <button onClick={() => { setPartyName(selectedParty); setEntryType('DEBIT_DENA'); setShowForm(true); }}
                  className="flex-1 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition">
                  + DENA (Paid)
                </button>
              </div>

              {/* Entries Table */}
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-950/60 text-slate-400">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4 text-right">Balance</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(() => {
                        let runningBalance = 0;
                        return [...entries].reverse().map((entry) => {
                          if (entry.entry_type === 'DEBIT_DENA') runningBalance += entry.amount;
                          else runningBalance -= entry.amount;
                          return (
                            <tr key={entry.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 px-4 text-slate-300">{entry.created_at.slice(0, 10)}</td>
                              <td className="py-2.5 px-4">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${entry.entry_type === 'CREDIT_LENA' ? 'status-emerald' : entry.entry_type === 'DEBIT_DENA' ? 'status-rose' : 'status-sky'}`}>
                                  {entry.entry_type === 'CREDIT_LENA' ? 'LENA' : entry.entry_type === 'DEBIT_DENA' ? 'DENA' : entry.entry_type}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-300 max-w-[200px] truncate">{entry.description || '—'}</td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold">
                                <span className={entry.entry_type === 'DEBIT_DENA' ? 'text-rose-400' : 'text-emerald-400'}>
                                  {entry.entry_type === 'DEBIT_DENA' ? '+' : '-'}{fmtNum(entry.amount)}
                                </span>
                              </td>
                              <td className={`py-2.5 px-4 text-right font-mono font-bold ${runningBalance > 0 ? 'text-rose-400' : runningBalance < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {fmtNum(runningBalance)}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <button onClick={() => handleDelete(entry)}
                                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded" title="Delete">
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {entries.length === 0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-slate-500">No entries for this party</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-12 text-center text-slate-500">
              <ArrowDownUp size={48} className="mx-auto mb-3 opacity-30" />
              <p>Select a party to view their ledger</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add Ledger Entry</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Party Name *</label>
                <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Entry Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setEntryType('CREDIT_LENA')}
                    className={`py-2 rounded-xl text-xs font-semibold transition ${entryType === 'CREDIT_LENA' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    LENA (Received)
                  </button>
                  <button onClick={() => setEntryType('DEBIT_DENA')}
                    className={`py-2 rounded-xl text-xs font-semibold transition ${entryType === 'DEBIT_DENA' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    DENA (Paid)
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Amount *</label>
                <input type="number" min={0} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="input-base font-mono text-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-base">
                    {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="input-base" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Reference</label>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="input-base" placeholder="Receipt #, Invoice #, etc." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddEntry} className="px-5 py-2 btn-primary text-xs">Add Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {showStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowStatement(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Khata Statement</h3>
              <button onClick={() => setShowStatement(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5">
              <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-[10px] text-slate-300 font-mono whitespace-pre-wrap leading-tight max-h-[60vh] overflow-y-auto">
                {statementText}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DigiKhata;