import { DatabaseResponse } from '../../electron/preload';

// ------------------------------------------------------------------
// DUAL-SYNC QUEUE (Layer 3 - Turso Cloud Async Sync)
// Local-first writes enqueue a PENDING payload for the background
// sync worker to push to the remote Turso DB.
// ------------------------------------------------------------------

export async function queueMutation(
  actionType: 'INSERT' | 'UPDATE' | 'DELETE',
  targetTable: string,
  payload: Record<string, unknown>
): Promise<void> {
  const syncId = `SYNC_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const sql = `
    INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at)
    VALUES (?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [syncId, actionType, targetTable, JSON.stringify(payload)]);
  if (!res.success) throw new Error(`Sync queue failed: ${res.error}`);
}

export async function fetchSyncQueue(limit = 50): Promise<SyncQueueRow[]> {
  const sql = `SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT ?`;
  const res: DatabaseResponse<SyncQueueRow[]> = await window.api.dbQuery(sql, [limit]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch sync queue');
  return res.data;
}

export async function markSyncCompleted(syncId: string): Promise<void> {
  await window.api.dbExecute(
    `UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?`,
    [syncId]
  );
}

export interface SyncQueueRow {
  id: string;
  action_type: 'INSERT' | 'UPDATE' | 'DELETE';
  target_table: string;
  payload_json: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  created_at: string;
}