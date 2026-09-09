import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Plus, X, Phone, Send, Loader2, CheckCircle2, AlertCircle,
  Trash2, Edit3, Save, Search, Eye, Copy,
  Smartphone, FileText,
} from 'lucide-react';

interface WhatsAppTemplate {
  id: string;
  template_name: string;
  message_body: string;
  placeholders: string | null;
  category: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TemplateForm {
  template_name: string;
  message_body: string;
  category: string;
}

const emptyForm: TemplateForm = {
  template_name: '',
  message_body: '',
  category: 'GENERAL',
};

const WhatsAppGateway: React.FC = () => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [senderPhone, setSenderPhone] = useState('');
  const [apiDeviceKey, setApiDeviceKey] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>({ ...emptyForm });

  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [previewPhone, setPreviewPhone] = useState('+92 300 1234567');
  const [previewMessage, setPreviewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await window.api.dbQuery<WhatsAppTemplate>(
        'SELECT * FROM whatsapp_templates ORDER BY created_at DESC',
        []
      );
      if (res.success && res.data) {
        setTemplates(res.data);
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to fetch templates' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to fetch templates' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (selectedTemplate) {
      setPreviewMessage(selectedTemplate.message_body);
    }
  }, [selectedTemplate]);

  const extractPlaceholders = (body: string): string[] => {
    const matches = body.match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim()))];
  };

  const handleSaveTemplate = async () => {
    if (!form.template_name.trim()) {
      setMessage({ type: 'error', text: 'Template name is required' });
      return;
    }
    if (!form.message_body.trim()) {
      setMessage({ type: 'error', text: 'Message body is required' });
      return;
    }

    try {
      setSubmitting(true);
      const placeholders = extractPlaceholders(form.message_body);
      const now = new Date().toISOString();

      if (editingId) {
        const res = await window.api.dbExecute(
          `UPDATE whatsapp_templates SET template_name = ?, message_body = ?, placeholders = ?, category = ?, updated_at = ? WHERE id = ?`,
          [form.template_name.trim(), form.message_body.trim(), JSON.stringify(placeholders), form.category, now, editingId]
        );
        if (res.success) {
          setMessage({ type: 'success', text: `Template "${form.template_name}" updated` });
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to update template' });
          return;
        }
      } else {
        const res = await window.api.dbExecute(
          `INSERT INTO whatsapp_templates (id, template_name, message_body, placeholders, category, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
          [`TPL-${Date.now()}`, form.template_name.trim(), form.message_body.trim(), JSON.stringify(placeholders), form.category, now, now]
        );
        if (res.success) {
          setMessage({ type: 'success', text: `Template "${form.template_name}" created` });
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to create template' });
          return;
        }
      }

      setForm({ ...emptyForm });
      setEditingId(null);
      setShowForm(false);
      fetchTemplates();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save template' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditTemplate = (tpl: WhatsAppTemplate) => {
    setForm({
      template_name: tpl.template_name,
      message_body: tpl.message_body,
      category: tpl.category || 'GENERAL',
    });
    setEditingId(tpl.id);
    setShowForm(true);
  };

  const handleDeleteTemplate = async (tpl: WhatsAppTemplate) => {
    if (!confirm(`Delete template "${tpl.template_name}"? This cannot be undone.`)) return;
    try {
      const res = await window.api.dbExecute('DELETE FROM whatsapp_templates WHERE id = ?', [tpl.id]);
      if (res.success) {
        setMessage({ type: 'success', text: `Template "${tpl.template_name}" deleted` });
        if (selectedTemplate?.id === tpl.id) {
          setSelectedTemplate(null);
          setPreviewMessage('');
        }
        fetchTemplates();
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to delete template' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete template' });
    }
  };

  const handleSend = async () => {
    if (!previewPhone.trim()) {
      setMessage({ type: 'error', text: 'Recipient phone number is required' });
      return;
    }
    if (!previewMessage.trim()) {
      setMessage({ type: 'error', text: 'Message cannot be empty' });
      return;
    }
    if (!apiDeviceKey.trim()) {
      setMessage({ type: 'error', text: 'API Device Key is required. Configure it first.' });
      return;
    }

    try {
      setSending(true);
      const res = await window.api.dbExecute(
        `INSERT INTO whatsapp_logs (id, template_id, recipient_phone, message_body, api_device_key, status, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'SENT', ?, ?)`,
        [
          `WAL-${Date.now()}`,
          selectedTemplate?.id || null,
          previewPhone.trim(),
          previewMessage.trim(),
          apiDeviceKey.trim(),
          new Date().toISOString(),
          new Date().toISOString(),
        ]
      );
      if (res.success) {
        setMessage({ type: 'success', text: `Message sent to ${previewPhone}` });
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to send message' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send message' });
    } finally {
      setSending(false);
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(previewMessage).then(() => {
      setMessage({ type: 'success', text: 'Message copied to clipboard' });
    });
  };

  const renderPlaceholderHighlights = (text: string) => {
    const safeText = text ?? '';
    const parts = safeText.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, i) => {
      if (/\{\{[^}]+\}\}/.test(part)) {
        return (
          <span key={i} className="bg-sky-500/20 text-sky-300 px-1 rounded mx-0.5 font-mono">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const filteredTemplates = templates.filter(tpl => {
    const sq = (searchQuery ?? '').toLowerCase();
    const matchesSearch =
      (tpl.template_name ?? '').toLowerCase().includes(sq) ||
      (tpl.message_body ?? '').toLowerCase().includes(sq);
    const matchesCategory = filterCategory === 'ALL' || tpl.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(templates.map(t => t.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquare size={24} className="text-green-400" /> WhatsApp Gateway
          </h2>
          <p className="text-sm text-slate-400">Manage templates, preview & send messages</p>
        </div>
        <button
          onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition"
        >
          <Plus size={16} /> New Template
        </button>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Sender Config */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Smartphone size={16} className="text-green-400" /> Sender Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Sender Phone Number</label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                placeholder="+92 300 1234567"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">API Device Key</label>
            <div className="relative">
              <Smartphone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={apiDeviceKey}
                onChange={(e) => setApiDeviceKey(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                placeholder="Enter your API device key"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template List */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-green-500/50"
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="text-green-400 animate-spin" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{searchQuery ? 'No templates match your search' : 'No templates created yet'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map(tpl => {
                const expanded = expandedId === tpl.id;
                const placeholders = tpl.placeholders ? JSON.parse(tpl.placeholders) : [];

                return (
                  <div key={tpl.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div
                      onClick={() => {
                        setSelectedTemplate(tpl);
                        setExpandedId(expanded ? null : tpl.id);
                      }}
                      className={`flex items-center gap-3 p-3.5 cursor-pointer transition ${
                        selectedTemplate?.id === tpl.id ? 'bg-green-500/10 border-l-2 border-green-500' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        selectedTemplate?.id === tpl.id ? 'bg-green-500/20' : 'bg-slate-800'
                      }`}>
                        <MessageSquare size={14} className={selectedTemplate?.id === tpl.id ? 'text-green-400' : 'text-slate-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white text-sm truncate">{tpl.template_name}</p>
                          {tpl.category && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">
                              {tpl.category}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            tpl.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {tpl.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{(tpl.message_body ?? '').slice(0, 80)}...</p>
                        {placeholders.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {placeholders.map((p: string) => (
                              <span key={p} className="bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                {`{{${p}}}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditTemplate(tpl); }}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl); }}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-800 p-4 bg-slate-950/50">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Full Message</p>
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                            {renderPlaceholderHighlights(tpl.message_body)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Message Preview & Send */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Eye size={16} className="text-green-400" /> Message Preview
            </h3>

            {/* Selected Template Info */}
            {selectedTemplate && (
              <div className="mb-3 px-3 py-2 bg-green-500/5 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-300 font-semibold">{selectedTemplate.template_name}</p>
                {selectedTemplate.placeholders && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Placeholders: {JSON.parse(selectedTemplate.placeholders).join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Recipient Phone */}
            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Recipient Phone Number</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={previewPhone}
                  onChange={(e) => setPreviewPhone(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                  placeholder="+92 300 1234567"
                />
              </div>
            </div>

            {/* Message Body (editable for preview) */}
            <div className="mb-3">
              <label className="text-xs text-slate-400 block mb-1">Message Body</label>
              <textarea
                value={previewMessage}
                onChange={(e) => setPreviewMessage(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 font-mono focus:outline-none focus:border-green-500/50 resize-none"
                placeholder="Select a template or type a custom message..."
              />
            </div>

            {/* Preview Bubble */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 block mb-1">Chat Preview</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="flex justify-end">
                  <div className="bg-green-600/20 border border-green-500/30 rounded-xl rounded-tr-sm px-4 py-3 max-w-[85%]">
                    <pre className="text-xs text-green-200 font-mono whitespace-pre-wrap leading-relaxed">
                      {previewMessage || 'Select a template or type a message...'}
                    </pre>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-green-400/60">
                        {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyMessage}
                disabled={!previewMessage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition"
              >
                <Copy size={14} /> Copy
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !previewMessage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send Message
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Template Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditingId(null); }}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText size={18} className="text-green-400" />
                {editingId ? 'Edit Template' : 'Create Template'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-white transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={form.template_name}
                    onChange={(e) => setForm({ ...form, template_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                    placeholder="e.g. LEAD_NOTIFICATION"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-green-500/50"
                  >
                    <option value="GENERAL">General</option>
                    <option value="LEAD">Lead</option>
                    <option value="FOLLOW_UP">Follow Up</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="REMINDER">Reminder</option>
                    <option value="WELCOME">Welcome</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Message Body *</label>
                <textarea
                  value={form.message_body}
                  onChange={(e) => setForm({ ...form, message_body: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 font-mono focus:outline-none focus:border-green-500/50 resize-none"
                  placeholder="Hello {{name}}, your inquiry for {{property}} has been received..."
                />
                <p className="text-[10px] text-slate-500 mt-1">Use {'{{variable}}'} for dynamic placeholders</p>
              </div>

              {/* Placeholder Preview */}
              {form.message_body && extractPlaceholders(form.message_body).length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Detected Placeholders</p>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {extractPlaceholders(form.message_body).map(p => (
                      <span key={p} className="bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded text-xs font-mono">
                        {`{{${p}}}`}
                      </span>
                    ))}
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3 mt-2">
                    <p className="text-[10px] text-slate-500 mb-1 font-semibold">Preview</p>
                    <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {renderPlaceholderHighlights(form.message_body)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={submitting}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? 'Update Template' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { WhatsAppGateway };
