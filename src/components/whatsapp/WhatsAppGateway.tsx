import React, { useState } from 'react';
import { MessageSquare, Plus, X, Phone, Send } from 'lucide-react';
import { DEFAULT_TEMPLATES } from '../../services/whatsapp.service';

interface WhatsAppGatewayProps {}

export const WhatsAppGateway: React.FC<WhatsAppGatewayProps> = () => {
  const [showForm, setShowForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [message, setMessage] = useState('');
  const [messageText, setMessageText] = useState('+92 300 1234567');

  const handleCreate = async () => {
    if (!templateName.trim() || !message.trim()) {
      alert('Enter template name and message');
      return;
    }
    // Would call createTemplate here
    console.log(`[Mock] Created template: ${templateName}`);
    alert(`Template "${templateName}" created!`);
    setShowForm(false);
    setTemplateName('');
    setMessage('');
  };

  const getPlaceholderExample = (text: string) => {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return matches.map((m, i) => <span key={i} className="bg-sky-500/20 text-sky-300 px-1 rounded mx-0.5">{m}</span>);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare size={24} className="text-green-400" /> WhatsApp Self-Service Gateway
          </h2>
          <p className="text-sm text-slate-400">Module 19 — Predefined templates, automated messaging</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 btn-primary text-sm">
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {DEFAULT_TEMPLATES.map((tpl, i) => (
          <button key={i} onClick={() => setMessage(tpl.message)}
            className="glass-card p-4 text-left hover:border-green-500/50 transition">
            <p className="font-semibold text-white text-sm truncate">{tpl.name.replace('_', ' ')}</p>
            <p className="text-xs text-slate-400 mt-1 truncate">{tpl.message.slice(0, 60)}...</p>
          </button>
        ))}
      </div>

      {/* Preview Panel */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-white mb-3">Message Preview</h3>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Phone size={12} />
            <input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)}
              className="bg-transparent text-white w-full focus:outline-none" placeholder="Recipient number..." />
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 max-w-md">
            <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
              {message || 'Select a template or enter custom message...'}
            </pre>
          </div>
          <div className="flex justify-end">
            <button onClick={() => alert(`[Mock] Sent to ${messageText}`)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
              <Send size={12} /> Send Test Message
            </button>
          </div>
        </div>
      </div>

      {/* Add Template Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create Template</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Template Name *</label>
                <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="input-base" placeholder="e.g., LEAD_NOTIFICATION" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Message Body *</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                  className="input-base font-mono text-xs" placeholder="Hello {{name}}, your inquiry is received..." />
              </div>
              {getPlaceholderExample(message)}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs">Cancel</button>
              <button onClick={handleCreate} className="px-5 py-2 btn-primary text-xs">Save Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppGateway;