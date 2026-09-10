import React from 'react';
import { X, Printer, Send, Edit3, MapPin, User, Phone, CreditCard, Calendar, FileText, MessageSquare } from 'lucide-react';

interface SalesDeal {
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

interface PlotSaleDetailModalProps {
  deal: SalesDeal;
  onClose: () => void;
  onPrintReceipt: (deal: SalesDeal) => void;
  onSendWhatsApp: (deal: SalesDeal) => void;
  onEditNotes: (deal: SalesDeal, newNotes: string) => void;
}

const fmt = (n: number): string => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export const PlotSaleDetailModal: React.FC<PlotSaleDetailModalProps> = ({
  deal,
  onClose,
  onPrintReceipt,
  onSendWhatsApp,
  onEditNotes,
}) => {
  const [editingNotes, setEditingNotes] = React.useState(deal.notes || '');
  const [showNotesEdit, setShowNotesEdit] = React.useState(false);

  const handleSaveNotes = async () => {
    await onEditNotes(deal, editingNotes);
    setShowNotesEdit(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 rounded-t-2xl z-10">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText size={18} className="text-emerald-400" /> Deal Summary
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Deal #{deal.id} | Plot #{deal.plot_number}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPrintReceipt(deal)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
              title="Print Receipt"
            >
              <Printer size={12} /> Print
            </button>
            <button
              onClick={() => onSendWhatsApp(deal)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-semibold transition-colors"
              title="Send WhatsApp"
            >
              <Send size={12} /> WhatsApp
            </button>
            <button
              onClick={() => setShowNotesEdit(!showNotesEdit)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors"
              title="Edit Notes"
            >
              <Edit3 size={12} /> Notes
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5">
          {/* Notes Edit Section */}
          {showNotesEdit && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase">Edit Deal Notes</h4>
              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                rows={3}
                placeholder="Enter notes..."
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNotes}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                >
                  Save Notes
                </button>
                <button
                  onClick={() => { setEditingNotes(deal.notes || ''); setShowNotesEdit(false); }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Plot Information */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <MapPin size={14} className="text-emerald-400" /> Plot Information
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Plot #</p>
                <p className="text-sm font-mono text-white mt-1">{deal.plot_number || '—'}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Society / Block</p>
                <p className="text-sm text-white mt-1">{deal.society_name || '—'}</p>
                <p className="text-xs text-slate-400">Block {deal.block_phase || '—'}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Size</p>
                <p className="text-sm text-white mt-1">{deal.size_dimension || '—'}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Total Deal Price</p>
                <p className="text-sm font-mono font-bold text-emerald-400 mt-1">{fmt(deal.total_deal_price)}</p>
              </div>
            </div>
          </div>

          {/* Buyer & Party Profile */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <User size={14} className="text-sky-400" /> Buyer & Party Profile
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Full Name</p>
                <p className="text-sm font-medium text-white mt-1">{deal.buyer_name || '—'}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Phone</p>
                <p className="text-sm text-white mt-1 flex items-center gap-1">
                  <Phone size={12} /> {deal.buyer_phone || '—'}
                </p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">CNIC</p>
                <p className="text-sm font-mono text-white mt-1">{deal.buyer_cnic || '—'}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Sales Agent</p>
                <p className="text-sm text-white mt-1">{deal.sales_agent || '—'}</p>
              </div>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <CreditCard size={14} className="text-amber-400" /> Payment Breakdown
            </h4>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800/50">
                <div className="bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase text-slate-500 font-bold">Total Price</p>
                  <p className="text-sm font-mono font-bold text-white mt-1">{fmt(deal.total_deal_price)}</p>
                </div>
                <div className="bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase text-slate-500 font-bold">Received (Cash Counter)</p>
                  <p className="text-sm font-mono font-bold text-emerald-400 mt-1">{fmt(deal.total_deal_price - deal.balance_amount)}</p>
                </div>
                <div className="bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase text-slate-500 font-bold">Balance Remaining</p>
                  <p className={`text-sm font-mono font-bold mt-1 ${deal.balance_amount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {fmt(deal.balance_amount)}
                  </p>
                </div>
                <div className="bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase text-slate-500 font-bold">Payment Method</p>
                  <p className="text-sm text-white mt-1">{deal.payment_mode || 'CASH'}</p>
                </div>
              </div>
              <div className="p-3 border-t border-slate-800">
                <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Down Payment</p>
                <p className="text-sm font-mono text-slate-300">{fmt(deal.down_payment)}</p>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <Calendar size={14} className="text-purple-400" /> Transaction Details
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Reference #</p>
                <p className="text-sm font-mono text-slate-300 mt-1">{deal.id}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Cash Counter: {deal.cash_counter_id}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Sale Date</p>
                <p className="text-sm text-white mt-1">
                  {deal.sale_date ? new Date(deal.sale_date).toLocaleDateString('en-PK', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  }) : '—'}
                </p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Deal ID</p>
                <p className="text-sm font-mono text-slate-300 mt-1">{deal.id}</p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Created</p>
                <p className="text-sm text-slate-300 mt-1">
                  {deal.created_at ? new Date(deal.created_at).toLocaleString('en-PK') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
              <MessageSquare size={14} className="text-slate-400" /> Notes
            </h4>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <p className="text-sm text-slate-300">{deal.notes || 'No notes recorded.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlotSaleDetailModal;