import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, Trash2, FileText, User, QrCode, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  fetchKYCRegistry, addKYCEntry, verifyKYC, deleteKYC,
  fetchDocuments, addDocument, deleteDocument, generateQRCodeData, checkExpiringDocuments,
} from '../../services/legal.service';

interface CurrentUser { id: string; username: string; fullName: string; }

interface LegalVaultProps {
  currentUser: CurrentUser;
}

export const LegalVault: React.FC<LegalVaultProps> = ({ currentUser }) => {
  const [kycRecords, setKycRecords] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKYCForm, setShowKYCForm] = useState(false);
  const [showDocForm, setShowDocForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'kyc' | 'documents'>('kyc');
  const [qrCodeDoc, setQrCodeDoc] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // KYC form
  const [personType, setPersonType] = useState<'BUYER' | 'SELLER' | 'AGENT' | 'TENANT' | 'INVESTOR'>('BUYER');
  const [fullName, setFullName] = useState('');
  const [cnic, setCnic] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);

  // Document form
  const [docType, setDocType] = useState<'SALE_AGREEMENT' | 'LEASE_AGREEMENT' | 'CNIC_COPY' | 'TITLE_DEED' | 'NOC' | 'RECEIPT' | 'OTHER'>('OTHER');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [relatedPersonId, setRelatedPersonId] = useState('');
  const [relatedPlotId, setRelatedPlotId] = useState('');
  const [filePath, setFilePath] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [kycData, docData] = await Promise.all([fetchKYCRegistry(), fetchDocuments()]);
      setKycRecords(kycData);
      setDocuments(docData);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleAddKYC = async () => {
    if (!fullName.trim() || !cnic.trim() || !phoneNumber.trim()) {
      setMessage({ type: 'error', text: 'Full name, CNIC, and phone are required' });
      return;
    }
    try {
      await addKYCEntry(currentUser.id, currentUser.fullName, {
        person_type: personType,
        full_name: fullName.trim(),
        cnic: cnic.trim(),
        phone_number: phoneNumber.trim(),
        address: address.trim(),
        email: email.trim() || null,
        verified,
      });
      setMessage({ type: 'success', text: 'KYC entry added' });
      setShowKYCForm(false);
      resetKYCForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add KYC' });
    }
  };

  const handleVerifyKYC = async (kycId: string) => {
    try {
      await verifyKYC(kycId, currentUser.id, currentUser.fullName);
      setMessage({ type: 'success', text: 'KYC verified' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to verify' });
    }
  };

  const handleDeleteKYC = async (kycId: string, name: string) => {
    if (!window.confirm(`Delete KYC record for ${name}?`)) return;
    try {
      await deleteKYC(kycId, currentUser.id, currentUser.fullName, name);
      setMessage({ type: 'success', text: 'KYC deleted' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const handleAddDocument = async () => {
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Document title is required' });
      return;
    }
    try {
      await addDocument(currentUser.id, currentUser.fullName, {
        document_type: docType,
        title: title.trim(),
        description: description.trim() || null,
        expiry_date: expiryDate || null,
        related_person_id: relatedPersonId || null,
        related_plot_id: relatedPlotId || null,
        file_path: filePath || null,
      });
      setMessage({ type: 'success', text: 'Document added' });
      setShowDocForm(false);
      resetDocForm();
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add document' });
    }
  };

  const handleDeleteDocument = async (docId: string, docTitle: string) => {
    if (!window.confirm(`Delete document "${docTitle}"?`)) return;
    try {
      await deleteDocument(docId, currentUser.id, currentUser.fullName, docTitle);
      setMessage({ type: 'success', text: 'Document deleted' });
      await loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  const resetKYCForm = () => {
    setPersonType('BUYER'); setFullName(''); setCnic(''); setPhoneNumber('');
    setAddress(''); setEmail(''); setVerified(false);
  };

  const resetDocForm = () => {
    setDocType('OTHER'); setTitle(''); setDescription(''); setExpiryDate('');
    setRelatedPersonId(''); setRelatedPlotId(''); setFilePath('');
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  const expiringDocs = checkExpiringDocuments(documents, 30);
  const verifiedCount = kycRecords.filter(r => r.verified).length;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={24} className="text-emerald-400" /> Legal Vault & KYC Registry
          </h2>
          <p className="text-sm text-slate-400">Module 16 — Document storage, KYC verification, QR authentication</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowKYCForm(true); resetKYCForm(); }}
            className="px-4 py-2.5 btn-primary text-xs flex items-center gap-1">
            <User size={14} /> Add KYC Entry
          </button>
          <button onClick={() => { setShowDocForm(true); resetDocForm(); }}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs">
            <FileText size={14} /> Upload Document
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {message.text}<button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total KYC Records</p>
          <p className="text-lg font-bold text-white mt-1">{kycRecords.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Verified</p>
          <p className="text-lg font-bold text-emerald-400 mt-1">{verifiedCount}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Total Documents</p>
          <p className="text-lg font-bold text-sky-400 mt-1">{documents.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[10px] uppercase text-slate-500">Expiring Soon</p>
          <p className="text-lg font-bold text-amber-400 mt-1">{expiringDocs.length}</p>
        </div>
      </div>

      {expiringDocs.length > 0 && (
        <div className="glass-card p-4 border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-amber-400">Expiring Documents (Next 30 Days)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {expiringDocs.map(doc => (
              <span key={doc.id} className="text-xs text-amber-300 bg-amber-900/50 px-2 py-1 rounded">{doc.title}</span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        <button onClick={() => setActiveTab('kyc')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${activeTab === 'kyc' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          KYC Registry ({kycRecords.length})
        </button>
        <button onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold ${activeTab === 'documents' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
          Documents ({documents.length})
        </button>
      </div>

      {activeTab === 'kyc' ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">CNIC</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {kycRecords.map((kyc) => (
                  <tr key={kyc.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4 font-medium text-white">{kyc.full_name}</td>
                    <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">{kyc.person_type}</span></td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{kyc.cnic}</td>
                    <td className="py-2.5 px-4 text-slate-300">{kyc.phone_number}</td>
                    <td className="py-2.5 px-4">
                      {kyc.verified ? <span className="text-emerald-400 flex items-center gap-1 text-[10px]"><CheckCircle size={12} />Verified</span> : <span className="text-amber-400 text-[10px]">Pending</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-1">
                      {!kyc.verified && (
                        <button onClick={() => handleVerifyKYC(kyc.id)} className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded" title="Verify">
                          <CheckCircle size={12} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteKYC(kyc.id, kyc.full_name)} className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {kycRecords.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No KYC records</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Related To</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-900/40">
                    <td className="py-2.5 px-4 font-medium text-white">{doc.title}</td>
                    <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300">{doc.document_type}</span></td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-[200px] truncate">{doc.description || '—'}</td>
                    <td className={`py-2.5 px-4 font-mono text-xs ${expiringDocs.some(d => d.id === doc.id) ? 'text-amber-400' : 'text-slate-300'}`}>{doc.expiry_date || '—'}</td>
                    <td className="py-2.5 px-4 text-slate-400 text-xs">{doc.related_plot_id ? `Plot: ${doc.related_plot_id}` : doc.related_person_id ? `Person: ${doc.related_person_id.slice(0, 12)}` : '—'}</td>
                    <td className="py-2.5 px-4 text-right space-x-1">
                      <button onClick={() => setQrCodeDoc(doc)} className="p-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded" title="Generate QR">
                        <QrCode size={12} />
                      </button>
                      <button onClick={() => handleDeleteDocument(doc.id, doc.title)} className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {documents.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No documents</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KYC Form Modal */}
      {showKYCForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowKYCForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Add KYC Entry</h3>
              <button onClick={() => setShowKYCForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Person Type</label>
                  <select value={personType} onChange={(e) => setPersonType(e.target.value as typeof personType)} className="input-base">
                    {['BUYER','SELLER','AGENT','TENANT','INVESTOR'].map(t => (<option key={t} value={t}>{t}</option>))}
                  </select></div>
                <div><label className="text-xs text-slate-400 block mb-1">Full Name *</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-base" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">CNIC *</label>
                  <input type="text" value={cnic} onChange={(e) => setCnic(e.target.value)} className="input-base" placeholder="12345-6789012-3" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Phone *</label>
                  <input type="text" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="input-base" /></div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Address</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="input-base" /></div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-base" /></div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowKYCForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddKYC} className="px-5 py-2 btn-primary text-xs">Add KYC Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* Document Form Modal */}
      {showDocForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowDocForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Upload Document</h3>
              <button onClick={() => setShowDocForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Document Type</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)} className="input-base">
                  {['SALE_AGREEMENT','LEASE_AGREEMENT','CNIC_COPY','TITLE_DEED','NOC','RECEIPT','OTHER'].map(t => (<option key={t} value={t}>{t.replace(/_/g, ' ')}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Title *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-base" /></div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-base" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 block mb-1">Expiry Date</label>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="input-base" /></div>
                <div><label className="text-xs text-slate-400 block mb-1">Related Plot ID</label>
                  <input type="text" value={relatedPlotId} onChange={(e) => setRelatedPlotId(e.target.value)} className="input-base" /></div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">File Path</label>
                <input type="text" value={filePath} onChange={(e) => setFilePath(e.target.value)} className="input-base" placeholder="/path/to/file.pdf" /></div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowDocForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleAddDocument} className="px-5 py-2 btn-primary text-xs">Upload Document</button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCodeDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setQrCodeDoc(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Document Verification QR</h3>
              <button onClick={() => setQrCodeDoc(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="bg-white p-4 rounded-xl flex items-center justify-center min-h-[200px]">
              <QrCode size={160} className="text-black" />
            </div>
            <div className="mt-4 p-3 bg-slate-950 rounded-lg text-xs font-mono break-all text-slate-300">
              {generateQRCodeData(qrCodeDoc.id)}
            </div>
            <p className="mt-2 text-xs text-slate-500">Scan this QR code to verify document authenticity.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalVault;