import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface BranchPayload {
  branch_code: string;
  branch_name: string;
  address: string;
  phone_number: string;
  email: string | null;
  manager_name: string;
  is_active: boolean;
}

export interface BranchSyncPayload {
  source_branch_id: string;
  target_branch_id: string;
  table_name: string;
  record_ids: string[];
}

// ------------------------------------------------------------------
// BRANCH OPERATIONS
// ------------------------------------------------------------------

export async function fetchBranches(): Promise<any[]> {
  const sql = `SELECT * FROM branches WHERE is_active = TRUE ORDER BY branch_name ASC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch branches');
  return res.data;
}

export async function createBranch(
  userId: string,
  userName: string,
  payload: BranchPayload
): Promise<string> {
  const id = `BRANCH_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO branches (id, branch_code, branch_name, address, phone_number, email, manager_name, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.branch_code, payload.branch_name, payload.address,
    payload.phone_number, payload.email, payload.manager_name, payload.is_active
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create branch');

  await queueMutation('INSERT', 'branches', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'BRANCHES',
    entityId: id, description: `Branch created: ${payload.branch_name}`,
  });
  return id;
}

export async function updateBranchStatus(
  branchId: string,
  isActive: boolean,
  userId: string,
  userName: string
): Promise<void> {
  const res = await window.api.dbExecute(`UPDATE branches SET is_active = ? WHERE id = ?`, [isActive, branchId]);
  if (!res.success) throw new Error(res.error || 'Failed to update branch status');
  await queueMutation('UPDATE', 'branches', { id: branchId, is_active: isActive });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'BRANCHES',
    entityId: branchId, description: `Branch ${isActive ? 'activated' : 'deactivated'}: ${branchId}`
  });
}

// ------------------------------------------------------------------
// BRANCH SYNC
// ------------------------------------------------------------------

export async function syncDataToBranch(
  payload: BranchSyncPayload,
  userId: string,
  userName: string
): Promise<void> {
  // Queue sync operations for offline processing
  for (const recordId of payload.record_ids) {
    const syncId = `SYNC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const syncSql = `
      INSERT INTO branch_sync_queue (id, source_branch_id, target_branch_id, table_name, record_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
    `;
    const res = await window.api.dbExecute(syncSql, [syncId, payload.source_branch_id, payload.target_branch_id, payload.table_name, recordId]);
    if (!res.success) throw new Error(res.error || `Failed to queue sync for record ${recordId}`);
  }
  
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'BRANCHES',
    entityId: payload.target_branch_id,
    description: `Sync queued: ${payload.record_ids.length} records to branch ${payload.target_branch_id}`,
  });
}

export async function fetchSyncQueue(targetBranchId?: string): Promise<any[]> {
  let sql = `SELECT * FROM branch_sync_queue WHERE status = 'PENDING'`;
  const args: string[] = [];
  if (targetBranchId) {
    sql += ` AND target_branch_id = ?`;
    args.push(targetBranchId);
  }
  sql += ` ORDER BY created_at ASC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch sync queue');
  return res.data;
}

export async function processSyncQueue(recordId: string, _sourceBranchId: string, _targetBranchId: string, tableName: string): Promise<void> {
  const recordRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [recordId]
  );
  if (!recordRes.success || !recordRes.data || recordRes.data.length === 0) {
    throw new Error(`Record ${recordId} not found in ${tableName}`);
  }
  
  const record = recordRes.data[0];
  const columns = Object.keys(record).filter(k => k !== 'id').join(', ');
  const placeholders = Object.keys(record).filter(k => k !== 'id').map(() => '?').join(', ');
  const values = Object.values(record).filter((_, i) => i > 0); // Skip 'id' in values
  
  const insertSql = `INSERT OR REPLACE INTO ${tableName}_temp (id, ${columns}) VALUES (${recordId}, ${placeholders})`;
  const insertRes = await window.api.dbExecute(insertSql, [recordId, ...values]);
  if (!insertRes.success) throw new Error(insertRes.error || `Failed to insert into ${tableName}_temp`);
  
  // Update sync queue status
  const updateRes = await window.api.dbExecute(
    `UPDATE branch_sync_queue SET status = 'COMPLETED' WHERE id = ?`, [recordId]
  );
  if (!updateRes.success) throw new Error(updateRes.error || 'Failed to update sync queue status');
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function generateBranchCode(branchName: string): string {
  const code = (branchName ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  return `BR_${code}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}
