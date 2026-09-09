import { DatabaseResponse } from '../../electron/preload';
import { PlotRecord } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export type PlotCategory = PlotRecord['category'];
export type PlotStatus = PlotRecord['status'];

export interface PlotFilters {
  search?: string;
  category?: PlotCategory | 'ALL';
  status?: PlotStatus | 'ALL';
}

export interface PlotPayload {
  plot_number: string;
  society_name: string;
  block_phase: string;
  size_dimension: string;
  category: PlotCategory;
  feature_tags: string[] | null;
  purchase_date: string;
  purchase_price: number;
  target_asking_price: number;
  floor_price: number;
  gps_coordinates: string;
  status: PlotStatus;
  notes: string;
}

export const PLOT_CATEGORIES: PlotCategory[] = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL'];
export const PLOT_STATUSES: PlotStatus[] = ['AVAILABLE', 'BOOKED', 'ON_HOLD', 'UNDER_DEVELOPMENT', 'SOLD'];

// ------------------------------------------------------------------
// PLOT INVENTORY DB OPERATIONS (100% parameterized)
// ------------------------------------------------------------------

export async function fetchPlots(branchId: string, filters: PlotFilters = {}, limit = 500): Promise<PlotRecord[]> {
  let sql = `SELECT * FROM inventory_plots WHERE branch_id = ?`;
  const args: (string | number)[] = [branchId];

  if (filters.search && filters.search.trim()) {
    sql += ` AND (society_name LIKE ? OR block_phase LIKE ? OR plot_number LIKE ? OR size_dimension LIKE ?)`;
    const pattern = `%${filters.search.trim()}%`;
    args.push(pattern, pattern, pattern, pattern);
  }
  if (filters.category && filters.category !== 'ALL') {
    sql += ` AND category = ?`;
    args.push(filters.category);
  }
  if (filters.status && filters.status !== 'ALL') {
    sql += ` AND status = ?`;
    args.push(filters.status);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  args.push(limit);

  const res: DatabaseResponse<PlotRecord[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch plots');
  return res.data;
}

export async function fetchPlotById(id: string): Promise<PlotRecord | null> {
  const sql = `SELECT * FROM inventory_plots WHERE id = ? LIMIT 1`;
  const res: DatabaseResponse<PlotRecord[]> = await window.api.dbQuery(sql, [id]);
  if (!res.success || !res.data || res.data.length === 0) return null;
  return res.data[0];
}

export async function createPlot(
  branchId: string,
  userId: string,
  userName: string,
  payload: PlotPayload
): Promise<string> {
  const id = `PLOT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO inventory_plots (
      id, branch_id, plot_number, society_name, block_phase, size_dimension, category,
      feature_tags, purchase_date, purchase_price, target_asking_price, floor_price,
      gps_coordinates, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
  const args = [
    id,
    branchId,
    payload.plot_number,
    payload.society_name,
    payload.block_phase,
    payload.size_dimension,
    payload.category,
    payload.feature_tags?.length ? JSON.stringify(payload.feature_tags) : null,
    payload.purchase_date,
    Math.round(payload.purchase_price),
    Math.round(payload.target_asking_price),
    Math.round(payload.floor_price),
    payload.gps_coordinates || null,
    payload.status,
    payload.notes || null,
  ];
  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to insert plot record');

  await queueMutation('INSERT', 'inventory_plots', { ...payload, id, branch_id: branchId });
  await logAudit({
    userId,
    userName,
    actionType: 'CREATE',
    moduleName: 'INVENTORY',
    entityId: id,
    description: `Plot added: ${payload.society_name} Block ${payload.block_phase} #${payload.plot_number} (${payload.category}) at cost Rs. ${payload.purchase_price.toLocaleString()}`,
  });

  return id;
}

export async function updatePlot(
  id: string,
  branchId: string,
  userId: string,
  userName: string,
  payload: PlotPayload,
  previous: PlotRecord
): Promise<void> {
  const sql = `
    UPDATE inventory_plots SET
      plot_number = ?, society_name = ?, block_phase = ?, size_dimension = ?, category = ?,
      feature_tags = ?, purchase_date = ?, purchase_price = ?, target_asking_price = ?,
      floor_price = ?, gps_coordinates = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  const args = [
    payload.plot_number,
    payload.society_name,
    payload.block_phase,
    payload.size_dimension,
    payload.category,
    payload.feature_tags?.length ? JSON.stringify(payload.feature_tags) : null,
    payload.purchase_date,
    Math.round(payload.purchase_price),
    Math.round(payload.target_asking_price),
    Math.round(payload.floor_price),
    payload.gps_coordinates || null,
    payload.status,
    payload.notes || null,
    id,
  ];
  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to update plot');

  await queueMutation('UPDATE', 'inventory_plots', { ...payload, id, branch_id: branchId });
  await logAudit({
    userId,
    userName,
    actionType: 'UPDATE',
    moduleName: 'INVENTORY',
    entityId: id,
    description: `Plot ${previous.plot_number} updated: status ${previous.status} -> ${payload.status}, price ${previous.target_asking_price.toLocaleString()} -> ${payload.target_asking_price.toLocaleString()}`,
  });
}

export async function deletePlot(
  id: string,
  userId: string,
  userName: string,
  reference: string
): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM inventory_plots WHERE id = ?`, [id]);
  if (!res.success) {
    throw new Error(
      res.error && /FOREIGN KEY|constraint/i.test(res.error)
        ? 'Cannot delete: plot is referenced by sales, installments, or other records. Set status to SOLD/removed instead.'
        : res.error || 'Failed to delete plot'
    );
  }
  await queueMutation('DELETE', 'inventory_plots', { id });
  await logAudit({
    userId,
    userName,
    actionType: 'DELETE',
    moduleName: 'INVENTORY',
    entityId: id,
    description: `Plot deleted: ${reference}`,
  });
}

export async function countPlotsByStatus(branchId: string): Promise<{ status: PlotStatus; count: number }[]> {
  const sql = `
    SELECT status, COUNT(*) as count
    FROM inventory_plots
    WHERE branch_id = ?
    GROUP BY status
  `;
  const res: DatabaseResponse<{ status: PlotStatus; count: number }[]> = await window.api.dbQuery(sql, [branchId]);
  return res.data || [];
}

export function parseFeatureTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}