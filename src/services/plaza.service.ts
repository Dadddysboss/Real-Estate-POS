import { DatabaseResponse } from '../../electron/preload';
import { Plaza, PlazaUnit } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export const FLOOR_LEVELS = ['BASEMENT', 'GROUND', 'MEZZANINE', '1ST_FLOOR', '2ND_FLOOR', '3RD_FLOOR', '4TH_FLOOR', '5TH_FLOOR', '6TH_FLOOR', 'ROOF_TOP'] as const;

export type FloorLevel = (typeof FLOOR_LEVELS)[number];
export type PlazaUnitStatus = PlazaUnit['status'];

export interface PlazaPayload {
  plaza_name: string;
  city_location: string;
  total_floors: number;
}

export interface PlazaUnitPayload {
  floor_level: FloorLevel;
  unit_number: string;
  covered_area_sqft: number;
  rate_per_sqft: number;
  target_price: number;
  target_monthly_rent: number;
  maintenance_fee: number;
  status: PlazaUnitStatus;
  tenant_name: string;
  tenant_phone: string;
  lease_expiry_date: string;
  security_deposit: number;
}

// ------------------------------------------------------------------
// PLAZA BUILDING OPERATIONS
// ------------------------------------------------------------------

export async function fetchPlazas(branchId: string): Promise<Plaza[]> {
  const sql = `SELECT * FROM plazas WHERE branch_id = ? ORDER BY created_at DESC`;
  const res: DatabaseResponse<Plaza[]> = await window.api.dbQuery(sql, [branchId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch plazas');
  return res.data;
}

export async function createPlaza(
  branchId: string,
  userId: string,
  userName: string,
  payload: PlazaPayload
): Promise<string> {
  const id = `PLAZA_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO plazas (id, branch_id, plaza_name, city_location, total_floors, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [id, branchId, payload.plaza_name, payload.city_location, Math.trunc(payload.total_floors)]);
  if (!res.success) throw new Error(res.error || 'Failed to create plaza');

  await queueMutation('INSERT', 'plazas', { id, branch_id: branchId, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'PLAZA',
    entityId: id,
    description: `Plaza created: ${payload.plaza_name} (${payload.city_location}) — ${payload.total_floors} floors`,
  });
  return id;
}

export async function deletePlaza(id: string, userId: string, userName: string, name: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM plazas WHERE id = ?`, [id]);
  if (!res.success) {
    throw new Error(
      res.error && /FOREIGN KEY|constraint/i.test(res.error)
        ? 'Cannot delete plaza with existing units. Delete units first.'
        : res.error || 'Failed to delete plaza'
    );
  }
  await queueMutation('DELETE', 'plazas', { id });
  await logAudit({ userId, userName, actionType: 'DELETE', moduleName: 'PLAZA', entityId: id, description: `Plaza deleted: ${name}` });
}

// ------------------------------------------------------------------
// PLAZA UNIT OPERATIONS
// ------------------------------------------------------------------

export async function fetchUnits(plazaId: string): Promise<PlazaUnit[]> {
  const sql = `SELECT * FROM plaza_units WHERE plaza_id = ? ORDER BY floor_level, unit_number ASC`;
  const res: DatabaseResponse<PlazaUnit[]> = await window.api.dbQuery(sql, [plazaId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch plaza units');
  return res.data;
}

export async function createPlazaUnit(
  plazaId: string,
  userId: string,
  userName: string,
  payload: PlazaUnitPayload
): Promise<string> {
  const id = `UNIT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO plaza_units (
      id, plaza_id, floor_level, unit_number, covered_area_sqft, rate_per_sqft,
      target_price, target_monthly_rent, maintenance_fee, status,
      tenant_name, tenant_phone, lease_expiry_date, security_deposit, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, plazaId, payload.floor_level, payload.unit_number,
    Math.round(payload.covered_area_sqft * 100) / 100,
    Math.round(payload.rate_per_sqft * 100) / 100,
    Math.round(payload.target_price),
    Math.round(payload.target_monthly_rent),
    Math.round(payload.maintenance_fee),
    payload.status === 'SOLD' ? 'SOLD' : 'RENTED',
    payload.tenant_name || null,
    payload.tenant_phone || null,
    payload.lease_expiry_date || null,
    Math.round(payload.security_deposit),
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create plaza unit');

  await queueMutation('INSERT', 'plaza_units', { id, plaza_id: plazaId, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'PLAZA', entityId: id,
    description: `Unit ${payload.unit_number} (${payload.floor_level}) added — ${payload.covered_area_sqft} sqft @ Rs. ${payload.rate_per_sqft}/sqft`,
  });
  return id;
}

export async function updatePlazaUnitStatus(
  unit: PlazaUnit,
  status: PlazaUnitStatus,
  tenant?: { tenant_name: string; tenant_phone: string; lease_expiry_date: string; security_deposit: number },
  userId?: string,
  userName?: string
): Promise<void> {
  const sql = `
    UPDATE plaza_units
    SET status = ?, tenant_name = ?, tenant_phone = ?, lease_expiry_date = ?, security_deposit = ?, maintenance_fee = ?
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    status,
    tenant ? tenant.tenant_name : unit.tenant_name || null,
    tenant ? tenant.tenant_phone : unit.tenant_phone || null,
    tenant ? tenant.lease_expiry_date : unit.lease_expiry_date || null,
    Math.round(tenant ? tenant.security_deposit : unit.security_deposit),
    unit.maintenance_fee,
    unit.id,
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to update unit status');

  await queueMutation('UPDATE', 'plaza_units', { id: unit.id, status });
  if (userId && userName) {
    await logAudit({
      userId, userName, actionType: 'UPDATE', moduleName: 'PLAZA', entityId: unit.id,
      description: `Unit ${unit.unit_number} status: ${unit.status} -> ${status}${tenant ? ` (leased to ${tenant.tenant_name})` : ''}`,
    });
  }
}

export async function deletePlazaUnit(id: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM plaza_units WHERE id = ?`, [id]);
  if (!res.success) throw new Error(res.error || 'Failed to delete unit');
  await queueMutation('DELETE', 'plaza_units', { id });
  await logAudit({ userId, userName, actionType: 'DELETE', moduleName: 'PLAZA', entityId: id, description: `Unit deleted: ${ref}` });
}

// ------------------------------------------------------------------
// DERIVED HELPERS
// ------------------------------------------------------------------

export function unitsByFloor(units: PlazaUnit[]): { floor: string; units: PlazaUnit[] }[] {
  const map = new Map<string, PlazaUnit[]>();
  for (const u of units) {
    const list = map.get(u.floor_level) || [];
    list.push(u);
    map.set(u.floor_level, list);
  }
  return [...map.entries()]
    .map(([floor, list]) => ({ floor, units: list.sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })) }))
    .sort((a, b) => FLOOR_LEVELS.indexOf(a.floor as FloorLevel) - FLOOR_LEVELS.indexOf(b.floor as FloorLevel));
}

export function plazaUnitStats(units: PlazaUnit[]): {
  totalUnits: number;
  rented: number;
  sold: number;
  available: number;
  monthlyRentProjection: number;
  annualRentProjection: number;
} {
  const rented = units.filter(u => u.status === 'RENTED');
  const sold = units.filter(u => u.status === 'SOLD');
  const available = units.filter(u => u.status === 'AVAILABLE' || u.status === 'ON_HOLD');
  const monthlyRentProjection = units.reduce((s, u) => s + u.target_monthly_rent, 0);
  return {
    totalUnits: units.length,
    rented: rented.length,
    sold: sold.length,
    available: available.length,
    monthlyRentProjection,
    annualRentProjection: monthlyRentProjection * 12,
  };
}