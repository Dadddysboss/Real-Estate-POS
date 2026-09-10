/**
 * Unified Notification-Aware DB Adapter
 * 
 * Wraps window.api (Electron IPC or Web Turso HTTP) with:
 * - Automatic notification creation on write operations
 * - Sync queue management for offline tracking
 * - Safe empty-result handling (never throws on 0 rows)
 */

export interface DatabaseResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'TRANSACTION';
  module?: string;
  link?: string;
}

const NOTIFICATION_MODULES = {
  CASH: 'Cash Counter',
  CONSTRUCTION: 'Construction',
  INVENTORY: 'Inventory',
  BACKUP: 'Backup',
  SYNC: 'Sync',
  WHATSAPP: 'WhatsApp',
  SETTINGS: 'Settings',
} as const;

// ─── Core DB Operations ───

export async function dbExecute(sql: string, args: unknown[] = []): Promise<DatabaseResponse> {
  try {
    const result = await window.api.dbExecute(sql, args);
    return result;
  } catch (err) {
    console.error('[UnifiedAdapter] dbExecute error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function dbQuery<T = unknown>(sql: string, args: unknown[] = []): Promise<DatabaseResponse<T[]>> {
  try {
    const result = await window.api.dbQuery<T>(sql, args);
    return result;
  } catch (err) {
    console.error('[UnifiedAdapter] dbQuery error:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Notification Operations ───

export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    const id = `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await dbExecute(
      `INSERT INTO notifications (id, title, message, type, module, link, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, payload.title, payload.message, payload.type, payload.module || '', payload.link || '']
    );
  } catch (err) {
    console.error('[UnifiedAdapter] Failed to create notification:', err);
  }
}

export async function getNotifications(limit = 50): Promise<DatabaseResponse> {
  return dbQuery(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

export async function getUnreadCount(): Promise<number> {
  try {
    const result = await dbQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM notifications WHERE is_read = 0`,
      []
    );
    if (result.success && result.data && result.data.length > 0) {
      return Number(result.data[0].count) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await dbExecute(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id]);
}

export async function markAllNotificationsRead(): Promise<void> {
  await dbExecute(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`, []);
}

export async function clearAllNotifications(): Promise<void> {
  await dbExecute(`DELETE FROM notifications`, []);
}

export async function deleteNotification(id: string): Promise<void> {
  await dbExecute(`DELETE FROM notifications WHERE id = ?`, [id]);
}

// ─── Sync Queue Operations ───

export async function queueForSync(tableName: string, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: unknown): Promise<void> {
  try {
    const id = `SYNC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await dbExecute(
      `INSERT INTO sync_queue (id, table_name, action, payload, status, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', datetime('now'))`,
      [id, tableName, action, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error('[UnifiedAdapter] Failed to queue sync:', err);
  }
}

export async function getPendingSyncCount(): Promise<number> {
  try {
    const result = await dbQuery<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING'`,
      []
    );
    if (result.success && result.data && result.data.length > 0) {
      return Number(result.data[0].count) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

// ─── Smart Notification Triggers ───

export async function notifyCashTransaction(type: 'INFLOW' | 'OUTFLOW', amount: number, partyName?: string): Promise<void> {
  await createNotification({
    title: `Cash ${type === 'INFLOW' ? 'Inflow' : 'Outflow'}`,
    message: `Rs. ${Math.round(amount).toLocaleString('en-PK')} ${type === 'INFLOW' ? 'received from' : 'paid to'} ${partyName || 'N/A'}`,
    type: 'TRANSACTION',
    module: NOTIFICATION_MODULES.CASH,
  });
}

export async function notifyConstructionExpense(amount: number, plotNumber: string): Promise<void> {
  await createNotification({
    title: 'Construction Expense Recorded',
    message: `Rs. ${Math.round(amount).toLocaleString('en-PK')} expense recorded for Plot ${plotNumber}`,
    type: 'TRANSACTION',
    module: NOTIFICATION_MODULES.CONSTRUCTION,
  });
}

export async function notifyBackupCreated(): Promise<void> {
  await createNotification({
    title: 'Vault Backup Created',
    message: 'System backup exported successfully',
    type: 'SUCCESS',
    module: NOTIFICATION_MODULES.BACKUP,
  });
}

export async function notifySyncComplete(itemsSynced: number): Promise<void> {
  await createNotification({
    title: 'Cloud Sync Completed',
    message: `${itemsSynced} items synced to Turso Cloud DB`,
    type: 'SUCCESS',
    module: NOTIFICATION_MODULES.SYNC,
  });
}

export async function notifyWhatsAppSent(recipient: string): Promise<void> {
  await createNotification({
    title: 'WhatsApp Message Sent',
    message: `Message sent to ${recipient}`,
    type: 'SUCCESS',
    module: NOTIFICATION_MODULES.WHATSAPP,
  });
}

export async function notifyPlotStatusChange(plotNumber: string, newStatus: string): Promise<void> {
  await createNotification({
    title: 'Plot Status Updated',
    message: `Plot ${plotNumber} marked as ${newStatus.replace(/_/g, ' ')}`,
    type: 'INFO',
    module: NOTIFICATION_MODULES.INVENTORY,
  });
}
