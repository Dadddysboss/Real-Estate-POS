import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, BellOff, CheckCheck, Trash2, Filter, X, CircleDot, AlertTriangle,
  AlertCircle, CheckCircle2, DollarSign, MessageSquare, RefreshCw, Building2,
} from 'lucide-react';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  clearAllNotifications, deleteNotification,
} from '../../db/unifiedAdapter';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'TRANSACTION';
  is_read: number;
  module: string;
  link: string;
  created_at: string;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  INFO: { icon: <CircleDot size={14} />, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  SUCCESS: { icon: <CheckCircle2 size={14} />, color: 'text-green-400', bg: 'bg-green-500/20' },
  WARNING: { icon: <AlertTriangle size={14} />, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  ERROR: { icon: <AlertCircle size={14} />, color: 'text-red-400', bg: 'bg-red-500/20' },
  TRANSACTION: { icon: <DollarSign size={14} />, color: 'text-purple-400', bg: 'bg-purple-500/20' },
};

const MODULE_ICONS: Record<string, React.ReactNode> = {
  'Cash Counter': <DollarSign size={12} />,
  'Construction': <Building2 size={12} />,
  'Inventory': <Building2 size={12} />,
  'Backup': <RefreshCw size={12} />,
  'Sync': <RefreshCw size={12} />,
  'WhatsApp': <MessageSquare size={12} />,
  'Settings': <RefreshCw size={12} />,
};

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | string>('ALL');
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getNotifications(100);
      if (result.success && Array.isArray(result.data)) {
        const items = result.data.map((n: Record<string, unknown>) => ({
          id: String(n.id || ''),
          title: String(n.title || ''),
          message: String(n.message || ''),
          type: (String(n.type || 'INFO') as Notification['type']),
          is_read: Number(n.is_read || 0),
          module: String(n.module || ''),
          link: String(n.link || ''),
          created_at: String(n.created_at || ''),
        }));
        setNotifications(items);
        setUnreadCount(items.filter(n => n.is_read === 0).length);
      }
    } catch (err) {
      console.error('[NotificationCenter] Failed to load notifications:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: 1 } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setDeleting(null);
  };

  const handleClearAll = async () => {
    await clearAllNotifications();
    setNotifications([]);
    setUnreadCount(0);
  };

  const filtered = notifications.filter(n =>
    filter === 'ALL' || n.type === filter || n.module === filter
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] max-w-full z-50 glass-card border-l border-white/10 shadow-2xl flex flex-col animate-slideInRight">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-blue-400" />
            <h2 className="text-lg font-bold text-white">Notifications</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={18} className="text-white/60" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 overflow-x-auto">
          {['ALL', 'TRANSACTION', 'SUCCESS', 'WARNING', 'ERROR', 'INFO'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                filter === f
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <CheckCheck size={14} />
              Mark All Read
            </button>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} />
              Clear All
            </button>
            <button
              onClick={loadNotifications}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors ml-auto"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
              <BellOff size={48} strokeWidth={1} />
              <p className="text-sm">{loading ? 'Loading...' : 'No notifications'}</p>
            </div>
          ) : (
            filtered.map(n => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.INFO;
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${
                    n.is_read === 0 ? 'bg-white/[0.02]' : ''
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${cfg.bg} mt-0.5 ${cfg.color}`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${n.is_read === 0 ? 'text-white' : 'text-white/70'}`}>
                        {n.title}
                      </span>
                      {n.is_read === 0 && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {n.module && (
                        <span className="flex items-center gap-1 text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                          {MODULE_ICONS[n.module]}
                          {n.module}
                        </span>
                      )}
                      <span className="text-[10px] text-white/20">
                        {formatTimeAgo(n.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {n.is_read === 0 && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Mark as read"
                      >
                        <CheckCircle2 size={14} className="text-white/30 hover:text-green-400" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      disabled={deleting === n.id}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} className="text-white/30 hover:text-red-400" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 text-xs text-white/30">
          <span>{filtered.length} notification{filtered.length !== 1 ? 's' : ''}</span>
          <button
            onClick={loadNotifications}
            className="flex items-center gap-1 hover:text-white/50 transition-colors"
          >
            <Filter size={12} />
            {filter === 'ALL' ? 'Showing All' : filter}
          </button>
        </div>
      </div>
    </>
  );
};
