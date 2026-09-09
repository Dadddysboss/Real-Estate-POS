import { DatabaseResponse } from '../../electron/preload';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'OVERRIDE' | 'EXCEED_CREDIT';

export interface AuditLogParams {
  userId?: string | null;
  userName?: string | null;
  actionType: AuditAction;
  moduleName: string;
  entityId?: string | null;
  description: string;
  ipAddress?: string | null;
}

export interface AuditLogRecord {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action_type: AuditAction;
  module_name: string;
  entity_id: string | null;
  description: string;
  ip_address: string | null;
  created_at: string;
}

// ------------------------------------------------------------------
// IMMUTABLE AUDIT TRAIL (Module 17 Guardrail)
// INSERT / SELECT ONLY — no UPDATE or DELETE handlers are exposed.
// ------------------------------------------------------------------

export async function logAudit(params: AuditLogParams): Promise<void> {
  const id = `AUDIT_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const sql = `
    INSERT INTO audit_trail_logs (id, user_id, user_name, action_type, module_name, entity_id, description, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const args = [
    id,
    params.userId ?? null,
    params.userName ?? null,
    params.actionType,
    params.moduleName,
    params.entityId ?? null,
    params.description,
    params.ipAddress ?? null,
  ];
  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(`Audit logging failed: ${res.error}`);
}

export async function fetchAuditLogs(filters: {
  userId?: string | null;
  actionType?: string | null;
  moduleName?: string | null;
  search?: string | null;
  limit?: number;
} = {}): Promise<AuditLogRecord[]> {
  let sql = `
    SELECT id, user_id, user_name, action_type, module_name, entity_id, description, ip_address, created_at
    FROM audit_trail_logs
    WHERE 1 = 1
  `;
  const args: (string | number | null)[] = [];

  if (filters.userId) {
    sql += ` AND user_id = ?`;
    args.push(filters.userId);
  }
  if (filters.actionType) {
    sql += ` AND action_type = ?`;
    args.push(filters.actionType);
  }
  if (filters.moduleName) {
    sql += ` AND module_name = ?`;
    args.push(filters.moduleName);
  }
  if (filters.search) {
    sql += ` AND (description LIKE ? OR module_name LIKE ? OR user_name LIKE ?)`;
    const p = `%${filters.search}%`;
    args.push(p, p, p);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  args.push(filters.limit ?? 100);

  const res: DatabaseResponse<AuditLogRecord[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch audit logs');
  return res.data;
}

export async function countSyncQueue(): Promise<{ pending: number; synced: number; failed: number }> {
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) as pending,
      COALESCE(SUM(CASE WHEN status = 'SYNCED' THEN 1 ELSE 0 END), 0) as synced,
      COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) as failed
    FROM sync_queue
  `;
  const res: DatabaseResponse<{ pending: number; synced: number; failed: number }[]> = await window.api.dbQuery(sql, []);
  return {
    pending: res.data?.[0]?.pending ?? 0,
    synced: res.data?.[0]?.synced ?? 0,
    failed: res.data?.[0]?.failed ?? 0,
  };
}
