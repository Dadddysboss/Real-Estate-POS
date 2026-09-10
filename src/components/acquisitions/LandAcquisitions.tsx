import React, { useState, useEffect } from 'react';
import { LandPlot, Plus, Pencil, Trash2, X, FileText, Phone, User, Calendar } from 'lucide-react';
import { LandAcquisition } from '../../types/electron';
import {
  fetchAcquisitions, createAcquisition, updateAcquisition, deleteAcquisition, recordPayment,
  calculateDebtPercentage, isFullyPaid,
} from '../../services/acquisition.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface LandAcquisitionsProps {
  currentUser: CurrentUser;
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const LandAcquisitions: React.FC<LandAcquisitionsProps> = ({ currentUser }) => {
  const [acquisitions, setAcquisitions] = useState<LandAcquisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LandAcquisition | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<LandAcquisition | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [sellerName, setSellerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerCnic, setSellerCnic] = useState('');
  const [landTitle, setLandTitle] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);
  const [advancePaid, setAdvancePaid] = useState(0);
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [docUrl, setDocUrl] = useState('');

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNotes, setPaymentNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAcquisitions();
      setAcquisitions(data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load acquisitions' });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setSellerName('');
    setSellerPhone('');
    setSellerCnic('');
    setLandTitle('');
    setTotalPrice(0);
    setAdvancePaid(0);
    setAcquisitionDate(new Date().toISOString().split('T')[0]);
    setDocUrl('');
  };

  const handleSave = async () => {
    if (!sellerName.trim() || !sellerCnic.trim() || !landTitle.trim()) {
      setMessage({ type: 'error', text: 'Seller name, CNIC, and land title are required' });
      return;
    }
    try {
      const payload = {
        seller_name: sellerName.trim(),
        seller_phone: sellerPhone.trim(),
        seller_cnic: sellerCnic.trim(),
        land_title_khata: landTitle.trim(),
        total_agreed_price: totalPrice,
        advance_paid: advancePaid,
        acquisition_date: acquisitionDate,
        registry_doc_url: docUrl.trim() || null,
      };
      if (editing) {
        await updateAcquisition(editing.id, currentUser.id, currentUser.fullName, payload, editing);
        setMessage({ type: 'success', text: 'Acquisition updated' });
      } else {
        await createAcquisition(currentUser.id, currentUser.fullName, payload);
        setMessage({ type: 'success', text: 'Acquisition created' });
      }
      setShowForm(false);
      setEditing(null);
      resetForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    }
  };

  const handleDelete = async (acq: LandAcquisition) => {
    if (!window.confirm(`Delete acquisition for ${acq.seller_name}?`)) return;
    try {
      await deleteAcquisition(acq.id, currentUser.id, currentUser.fullName, `${acq.seller_name} (${acq.land_title_khata})`);
      setMessage({ type: 'success', text: 'Acquisition deleted' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const openEditForm = (acq: LandAcquisition) => {
    setEditing(acq);
    setSellerName(acq.seller_name);
    setSellerPhone(acq.seller_phone);
    setSellerCnic(acq.seller_cnic);
    setLandTitle(acq.land_title_khata);
    setTotalPrice(acq.total_agreed_price);
    setAdvancePaid(acq.advance_paid);
    setAcquisitionDate(acq.acquisition_date);
    setDocUrl(acq.registry_doc_url || '');
    setShowForm(true);
  };

  const openPaymentModal = (acq: LandAcquisition) => {
    setPaymentTarget(acq);
    setPaymentAmount(0);
    setPaymentNotes('');
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentTarget || paymentAmount <= 0) {
      setMessage({ type: 'error', text: 'Enter a valid payment amount' });
      return;
    }
    try {
      await recordPayment(paymentTarget.id, currentUser.id, currentUser.fullName, paymentAmount, paymentNotes);
      setMessage({ type: 'success', text: `Payment of ${fmt(paymentAmount)} recorded` });
      setShowPaymentModal(false);
      setPaymentTarget(null);
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record payment' });
    }
  };

  const totalDebt = acquisitions.reduce((sum, acq) => sum + acq.debt_remaining, 0);
  const totalPaid = acquisitions.reduce((sum, acq) => sum + acq.advance_paid, 0);
  const totalAgreed = acquisitions.reduce((sum, acq) => sum + acq.total_agreed_price, 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <LandPlot size={24} className="text-emerald-400" /> Land Acquisitions & Seller Debt
          </h2>
          <p className="text-sm text-slate-400">Module 8 — Track land purchases, seller debt, and payment progress</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); resetForm(); }}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> New Acquisition
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Agreed Value</p>
          <p className="text-2xl font-bold text-white font-mono">{fmt(totalAgreed)}</p>
          <p className="text-xs text-slate-500 mt-1">{acquisitions.length} acquisitions</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">{fmt(totalPaid)}</p>
          <p className="text-xs text-slate-500 mt-1">{totalAgreed > 0 ? ((totalPaid / totalAgreed) * 100).toFixed(1) : 0}% of total</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Outstanding Debt</p>
          <p className="text-2xl font-bold text-amber-400 font-mono">{fmt(totalDebt)}</p>
          <p className="text-xs text-slate-500 mt-1">{acquisitions.filter(a => a.debt_remaining > 0).length} active debts</p>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Acquisitions List */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">Loading...</div>
      ) : acquisitions.length === 0 ? (
        <div className="glass-card p-12 text-center text-slate-500">
          <LandPlot size={48} className="mx-auto mb-3 opacity-30" />
          <p>No land acquisitions recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {acquisitions.map((acq) => {
            const debtPercent = calculateDebtPercentage(acq);
            const fullyPaid = isFullyPaid(acq);
            return (
              <div key={acq.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <User size={18} className="text-slate-400" />
                      {acq.seller_name}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {acq.seller_phone || 'No phone'}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={12} /> {acq.land_title_khata}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} /> {new Date(acq.acquisition_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {fullyPaid ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Fully Paid
                      </span>
                    ) : (
                      <button onClick={() => openPaymentModal(acq)}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30">
                        Record Payment
                      </button>
                    )}
                    <button onClick={() => openEditForm(acq)}
                      className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(acq)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">Payment Progress</span>
                    <span className="font-mono font-semibold text-white">{debtPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${debtPercent}%` }} />
                  </div>
                </div>

                {/* Financial Details */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500 mb-1">Agreed Price</p>
                    <p className="font-mono font-semibold text-white">{fmt(acq.total_agreed_price)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Paid to Date</p>
                    <p className="font-mono font-semibold text-emerald-400">{fmt(acq.advance_paid)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-1">Remaining Debt</p>
                    <p className="font-mono font-semibold text-amber-400">{fmt(acq.debt_remaining)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">{editing ? 'Edit Acquisition' : 'New Land Acquisition'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Seller Name *</label>
                  <input type="text" value={sellerName} onChange={(e) => setSellerName(e.target.value)} className="input-base" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Seller Phone</label>
                  <input type="text" value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} className="input-base" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Seller CNIC *</label>
                  <input type="text" value={sellerCnic} onChange={(e) => setSellerCnic(e.target.value)} className="input-base" placeholder="12345-6789012-3" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Land Title/Khata *</label>
                  <input type="text" value={landTitle} onChange={(e) => setLandTitle(e.target.value)} className="input-base" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Total Agreed Price</label>
                  <input type="number" min={0} value={totalPrice || ''} onChange={(e) => setTotalPrice(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Advance Paid</label>
                  <input type="number" min={0} value={advancePaid || ''} onChange={(e) => setAdvancePaid(Number(e.target.value) || 0)} className="input-base font-mono" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Acquisition Date</label>
                  <input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} className="input-base" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Registry Document URL</label>
                <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} className="input-base" placeholder="Optional link or path" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleSave} className="px-5 py-2 btn-primary text-xs">
                {editing ? 'Update' : 'Save'} Acquisition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Record Payment</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="glass-card p-3 text-xs">
                <p className="text-slate-400 mb-1">Paying to</p>
                <p className="font-semibold text-white">{paymentTarget.seller_name}</p>
                <p className="text-slate-500 mt-1">Current debt: <span className="font-mono text-amber-400">{fmt(paymentTarget.debt_remaining)}</span></p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Payment Amount *</label>
                <input type="number" min={0} max={paymentTarget.debt_remaining} value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)} className="input-base font-mono" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="input-base" placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleRecordPayment} className="px-5 py-2 btn-primary text-xs">Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandAcquisitions;