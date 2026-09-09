import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface ProjectPayload {
  project_name: string;
  location: string;
  total_budget: number;
  description: string;
}

export interface MaterialPayload {
  project_id: string;
  material_name: string;
  category: 'CEMENT' | 'STEEL' | 'BRICKS' | 'SAND' | 'AGGREGATE' | 'PAINT' | 'ELECTRICAL' | 'PLUMBING' | 'OTHER';
  unit: string;
  quantity_in_stock: number;
  reorder_level: number;
  cost_per_unit: number;
  supplier_name: string;
  last_restocked: string;
}

export interface UsagePayload {
  project_id: string;
  material_id: string;
  quantity_used: number;
  usage_date: string;
  purpose: string;
}

// ------------------------------------------------------------------
// PROJECT OPERATIONS
// ------------------------------------------------------------------

export async function fetchProjects(): Promise<any[]> {
  const sql = `
    SELECT p.*, 
      COALESCE(SUM(CASE WHEN m.category = 'MATERIAL' THEN m.quantity * m.cost_per_unit ELSE 0 END), 0) as material_costs,
      COUNT(m.id) as material_count
    FROM construction_projects p
    LEFT JOIN materials m ON m.project_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC
  `;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch projects');
  return res.data;
}

export async function createProject(
  userId: string,
  userName: string,
  payload: ProjectPayload
): Promise<string> {
  const id = `PROJECT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO construction_projects (id, project_name, location, total_budget, description, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.project_name, payload.location, Math.round(payload.total_budget), payload.description
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create project');

  await queueMutation('INSERT', 'construction_projects', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'CONSTRUCTION',
    entityId: id, description: `Construction project created: ${payload.project_name}`,
  });
  return id;
}

export async function deleteProject(projectId: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM construction_projects WHERE id = ?`, [projectId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete project');
  await queueMutation('DELETE', 'construction_projects', { id: projectId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'CONSTRUCTION',
    entityId: projectId, description: `Project deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// MATERIAL OPERATIONS
// ------------------------------------------------------------------

export async function fetchMaterials(projectId?: string): Promise<any[]> {
  let sql = `
    SELECT m.*, p.project_name
    FROM materials m
    LEFT JOIN construction_projects p ON p.id = m.project_id
  `;
  const args: string[] = [];
  if (projectId) {
    sql += ` WHERE m.project_id = ?`;
    args.push(projectId);
  }
  sql += ` ORDER BY m.reorder_level ASC, m.material_name ASC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch materials');
  return res.data;
}

export async function addMaterial(
  userId: string,
  userName: string,
  payload: MaterialPayload
): Promise<string> {
  const id = `MAT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO materials (id, project_id, material_name, category, unit, quantity_in_stock, reorder_level, cost_per_unit, supplier_name, last_restocked, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.project_id, payload.material_name, payload.category, payload.unit,
    Math.round(payload.quantity_in_stock), Math.round(payload.reorder_level),
    Math.round(payload.cost_per_unit), payload.supplier_name, payload.last_restocked
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add material');

  await queueMutation('INSERT', 'materials', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'CONSTRUCTION',
    entityId: id,
    description: `Material added: ${payload.material_name} — Stock: ${payload.quantity_in_stock} ${payload.unit}`,
  });
  return id;
}

export async function restockMaterial(
  materialId: string,
  quantity: number,
  userId: string,
  userName: string
): Promise<void> {
  const res = await window.api.dbExecute(
    `UPDATE materials SET quantity_in_stock = quantity_in_stock + ?, last_restocked = CURRENT_DATE WHERE id = ?`,
    [Math.round(quantity), materialId]
  );
  if (!res.success) throw new Error(res.error || 'Failed to restock');
  await queueMutation('UPDATE', 'materials', { id: materialId, quantity });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'CONSTRUCTION',
    entityId: materialId, description: `Restocked +${quantity} units`
  });
}

// ------------------------------------------------------------------
// USAGE LOGGING
// ------------------------------------------------------------------

export async function recordUsage(
  userId: string,
  userName: string,
  payload: UsagePayload
): Promise<void> {
  // First deduct from stock
  const stockRes: DatabaseResponse<any> = await window.api.dbQuery(
    `SELECT * FROM materials WHERE id = ? LIMIT 1`, [payload.material_id]
  );
  if (!stockRes.success || !stockRes.data) throw new Error('Material not found');
  const currentStock = stockRes.data.quantity_in_stock;
  if (currentStock < payload.quantity_used) throw new Error('Insufficient stock');

  await window.api.dbExecute(
    `UPDATE materials SET quantity_in_stock = quantity_in_stock - ? WHERE id = ?`,
    [Math.round(payload.quantity_used), payload.material_id]
  );

  // Log the usage
  const usageId = `USAGE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO material_usages (id, project_id, material_id, quantity_used, usage_date, purpose, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  await window.api.dbExecute(sql, [usageId, payload.project_id, payload.material_id, Math.round(payload.quantity_used), payload.usage_date, payload.purpose]);
  
  await queueMutation('INSERT', 'material_usages', { id: usageId });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'CONSTRUCTION',
    entityId: usageId,
    description: `Material usage: ${payload.quantity_used} units logged for project`,
  });
}

export async function fetchUsages(projectId?: string): Promise<any[]> {
  let sql = `SELECT u.*, m.material_name FROM material_usages u LEFT JOIN materials m ON m.id = u.material_id`;
  const args: string[] = [];
  if (projectId) {
    sql += ` WHERE u.project_id = ?`;
    args.push(projectId);
  }
  sql += ` ORDER BY u.usage_date DESC LIMIT 100`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch usages');
  return res.data;
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function calculateProjectStats(project: any, materials: any[]) {
  const materialCosts = materials.reduce((s, m) => s + (m.quantity_in_stock * m.cost_per_unit), 0);
  const target = project.total_budget;
  const spentPercentage = target > 0 ? (materialCosts / target) * 100 : 0;
  
  // Count low stock items
  const lowStockCount = materials.filter(m => m.quantity_in_stock <= m.reorder_level).length;
  
  return { materialCosts, target, spentPercentage, lowStockCount, materialCount: materials.length };
}
