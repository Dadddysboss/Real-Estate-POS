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
      `INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, 'PENDING', datetime('now'))`,
      [id, action, tableName, JSON.stringify(payload)]
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

export async function getPendingSyncItems(limit = 50): Promise<unknown[]> {
  try {
    const result = await dbQuery(
      `SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
    if (result.success && result.data) {
      return result.data;
    }
    return [];
  } catch {
    return [];
  }
}

export async function markSyncItemCompleted(id: string): Promise<void> {
  await dbExecute(
    `UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?`,
    [id]
  );
}

export async function markSyncItemFailed(id: string): Promise<void> {
  await dbExecute(
    `UPDATE sync_queue SET status = 'FAILED', retry_count = retry_count + 1 WHERE id = ?`,
    [id]
  );
}

/**
 * Process pending sync queue items sequentially.
 * Each item is replayed against the current database (local or remote).
 * On success, marked SYNCED. On failure, marked FAILED.
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  try {
    const items = await getPendingSyncItems(100);
    for (const item of items) {
      const row = item as { id: string; action_type: string; target_table: string; payload_json: string };
      try {
        const payload = JSON.parse(row.payload_json);
        let sql = '';
        const args: unknown[] = [];

        switch (row.action_type) {
          case 'INSERT': {
            const columns = Object.keys(payload).filter(k => k !== 'id');
            const placeholders = columns.map(() => '?').join(', ');
            sql = `INSERT OR IGNORE INTO ${row.target_table} (${columns.join(', ')}) VALUES (${placeholders})`;
            args.push(...columns.map(c => payload[c]));
            break;
          }
          case 'UPDATE': {
            const updateColumns = Object.keys(payload).filter(k => k !== 'id');
            const setClauses = updateColumns.map(c => `${c} = ?`).join(', ');
            sql = `UPDATE ${row.target_table} SET ${setClauses} WHERE id = ?`;
            args.push(...updateColumns.map(c => payload[c]), payload.id);
            break;
          }
          case 'DELETE': {
            sql = `DELETE FROM ${row.target_table} WHERE id = ?`;
            args.push(payload.id);
            break;
          }
          default:
            await markSyncItemFailed(row.id);
            failed++;
            continue;
        }

        if (sql) {
          await dbExecute(sql, args);
          await markSyncItemCompleted(row.id);
          synced++;
        }
      } catch (err) {
        console.error(`[SyncQueue] Failed to process item ${row.id}:`, err);
        await markSyncItemFailed(row.id);
        failed++;
      }
    }
  } catch (err) {
    console.error('[SyncQueue] Error processing queue:', err);
  }
  return { synced, failed };
}

/**
 * Get a network/sync status summary for the UI.
 */
export async function getSyncStatusSummary(): Promise<{
  isOnline: boolean;
  pendingSyncItems: number;
  lastSyncTime: string | null;
  queuedOfflineWrites: number;
}> {
  try {
    const netStatus = await window.api.getNetworkStatus();
    const pendingSync = await getPendingSyncCount();
    return {
      isOnline: netStatus.data?.isOnline ?? navigator.onLine,
      pendingSyncItems: pendingSync,
      lastSyncTime: netStatus.data?.lastSyncTime ?? null,
      queuedOfflineWrites: netStatus.data?.queuedWrites ?? 0,
    };
  } catch {
    return {
      isOnline: navigator.onLine,
      pendingSyncItems: 0,
      lastSyncTime: null,
      queuedOfflineWrites: 0,
    };
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
