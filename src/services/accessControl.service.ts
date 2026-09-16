import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';
import bcrypt from 'bcryptjs';

export interface StaffPayload {
  username: string;
  password: string;
  full_name: string;
  role: 'ADMIN' | 'MANAGER' | 'SALES' | 'ACCOUNTANT' | 'VIEWER';
  branch_id: string | null;
  is_active: boolean;
  pin_code: string | null;
}

export interface LoginPayload {
  username: string;
  password?: string;
  pin_code?: string;
}

export interface StaffRecord {
  id: string;
  username: string;
  full_name: string;
  role: string;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  user_id: string;
  user_name: string;
  action_type: string;
  module_name: string;
  entity_id: string;
  description: string;
  created_at: string;
}

// ------------------------------------------------------------------
// STAFF OPERATIONS
// ------------------------------------------------------------------

export async function fetchStaff(): Promise<StaffRecord[]> {
  const sql = `SELECT id, username, full_name, role, branch_id, is_active, created_at FROM staff_users ORDER BY created_at DESC`;
  const res = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch staff');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    username: String(row.username || ''),
    full_name: String(row.full_name || ''),
    role: String(row.role || 'VIEWER'),
    branch_id: row.branch_id != null ? String(row.branch_id) : null,
    is_active: !!row.is_active,
    created_at: String(row.created_at || ''),
  }));
}

export async function addStaff(
  userId: string,
  userName: string,
  payload: StaffPayload
): Promise<string> {
  const id = `STAFF_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const hashedPassword = await bcrypt.hash(payload.password, 10);
  const hashedPin = payload.pin_code ? await bcrypt.hash(payload.pin_code, 10) : null;
  
  const sql = `
    INSERT INTO staff_users (id, username, password_hash, full_name, role, branch_id, is_active, pin_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.username, hashedPassword, payload.full_name, payload.role,
    payload.branch_id, payload.is_active, hashedPin
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add staff');

  // Verify the insert actually persisted (guards against offline queue silently swallowing the write)
  const verifyRes = await window.api.dbQuery(
    `SELECT id, username FROM staff_users WHERE id = ? LIMIT 1`, [id]
  );
  if (!verifyRes.success || !verifyRes.data || (verifyRes.data as unknown[]).length === 0) {
    throw new Error('Staff insert appeared to succeed but verification failed — row not found. The database may be offline or the write was queued.');
  }
  const verifiedRow = verifyRes.data[0] as Record<string, unknown>;
  console.log(`[AccessControl] Verified staff insert: id=${id}, username=${String(verifiedRow.username || '')}`);

  await queueMutation('INSERT', 'staff_users', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'ACCESS_CONTROL',
    entityId: id, description: `Staff user added: ${payload.full_name} (${payload.role})`,
  });
  return id;
}

export async function updateStaffRole(
  staffId: string,
  role: 'ADMIN' | 'MANAGER' | 'SALES' | 'ACCOUNTANT' | 'VIEWER',
  is_active: boolean,
  userId: string,
  userName: string
): Promise<void> {
  const res = await window.api.dbExecute(`UPDATE staff_users SET role = ?, is_active = ? WHERE id = ?`, [role, is_active, staffId]);
  if (!res.success) throw new Error(res.error || 'Failed to update staff role');
  await queueMutation('UPDATE', 'staff_users', { id: staffId, role, is_active });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'ACCESS_CONTROL',
    entityId: staffId, description: `Staff role updated: ${role}, Active: ${is_active}`
  });
}

export async function setPinCode(staffId: string, oldPin: string | null, newPin: string, userId: string, userName: string): Promise<void> {
  if (oldPin) {
    // Verify old PIN against stored hash
    const userRes = await window.api.dbQuery(
      `SELECT pin_hash FROM staff_users WHERE id = ? LIMIT 1`, [staffId]
    );
    if (!userRes.success || !userRes.data || (userRes.data as unknown[]).length === 0) {
      throw new Error('Staff user not found');
    }
    const userRow = userRes.data[0] as Record<string, unknown>;
    const storedHash = String(userRow.pin_hash || '');
    if (!storedHash) {
      throw new Error('No existing PIN set — cannot verify old PIN');
    }
    const valid = await bcrypt.compare(oldPin, storedHash);
    if (!valid) throw new Error('Invalid current PIN');
  }
  
  const hashedPin = await bcrypt.hash(newPin, 10);
  const res = await window.api.dbExecute(`UPDATE staff_users SET pin_hash = ? WHERE id = ?`, [hashedPin, staffId]);
  if (!res.success) throw new Error(res.error || 'Failed to set PIN');
  await queueMutation('UPDATE', 'staff_users', { id: staffId, has_pin: true });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'ACCESS_CONTROL',
    entityId: staffId, description: 'PIN code updated'
  });
}

export async function authenticateStaff(payload: LoginPayload): Promise<{ success: boolean; user: any | null }> {
  const sql = `SELECT * FROM staff_users WHERE username = ? LIMIT 1`;
  const res = await window.api.dbQuery(sql, [payload.username]);
  if (!res.success || !res.data || res.data.length === 0) {
    return { success: false, user: null };
  }
  
  const user = res.data[0] as Record<string, unknown>;
  let isValid = false;
  
  if (payload.password) {
    isValid = await bcrypt.compare(payload.password, String(user.password_hash || ''));
  } else if (payload.pin_code && user.pin_hash) {
    isValid = await bcrypt.compare(payload.pin_code, String(user.pin_hash));
  }
  
  if (!isValid || !user.is_active) {
    return { success: false, user: null };
  }
  
  return { success: true, user };
}

// ------------------------------------------------------------------
// AUDIT LOG OPERATIONS
// ------------------------------------------------------------------

export async function fetchAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
  const sql = `SELECT * FROM audit_trail_logs ORDER BY created_at DESC LIMIT ?`;
  const res = await window.api.dbQuery(sql, [String(limit)]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch audit logs');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    user_name: String(row.user_name || ''),
    action_type: String(row.action_type || ''),
    module_name: String(row.module_name || ''),
    entity_id: String(row.entity_id || ''),
    description: String(row.description || ''),
    created_at: String(row.created_at || ''),
  }));
}

export async function searchAuditLogs(searchTerm: string, limit = 100): Promise<AuditLogRecord[]> {
  const sql = `SELECT * FROM audit_trail_logs 
    WHERE description LIKE ? OR action_type LIKE ? OR module_name LIKE ?
    ORDER BY created_at DESC LIMIT ?`;
  const res = await window.api.dbQuery(sql, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, String(limit)]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to search audit logs');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    user_name: String(row.user_name || ''),
    action_type: String(row.action_type || ''),
    module_name: String(row.module_name || ''),
    entity_id: String(row.entity_id || ''),
    description: String(row.description || ''),
    created_at: String(row.created_at || ''),
  }));
}

export async function exportAuditLogs(dateFrom: string, dateTo: string): Promise<AuditLogRecord[]> {
  const sql = `SELECT * FROM audit_trail_logs WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC`;
  const res = await window.api.dbQuery(sql, [dateFrom, dateTo]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to export audit logs');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    user_id: String(row.user_id || ''),
    user_name: String(row.user_name || ''),
    action_type: String(row.action_type || ''),
    module_name: String(row.module_name || ''),
    entity_id: String(row.entity_id || ''),
    description: String(row.description || ''),
    created_at: String(row.created_at || ''),
  }));
}

// ------------------------------------------------------------------
// PERMISSIONS
// ------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<string, string[]> = {
  'ADMIN': ['ALL'],
  'MANAGER': ['VIEW_DASHBOARD', 'MANAGE_SALES', 'MANAGE_CUSTOMERS', 'VIEW_REPORTS', 'MANAGE_INVENTORY'],
  'SALES': ['VIEW_DASHBOARD', 'CREATE_SALE', 'MANAGE_CUSTOMERS', 'VIEW_INVENTORY'],
  'ACCOUNTANT': ['VIEW_DASHBOARD', 'MANAGE_EXPENSES', 'VIEW_REPORTS', 'MANAGE_LEDGER'],
  'VIEWER': ['VIEW_DASHBOARD'],
};

export function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('ALL') || permissions.includes(permission);
}
