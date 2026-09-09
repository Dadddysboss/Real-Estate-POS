import { DatabaseResponse } from '../../electron/preload';
import { LandAcquisition } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface AcquisitionPayload {
  seller_name: string;
  seller_phone: string;
  seller_cnic: string;
  land_title_khata: string;
  total_agreed_price: number;
  advance_paid: number;
  acquisition_date: string;
  registry_doc_url: string | null;
}

// ------------------------------------------------------------------
// LAND ACQUISITION OPERATIONS
// ------------------------------------------------------------------

export async function fetchAcquisitions(limit = 100): Promise<LandAcquisition[]> {
  const sql = `SELECT * FROM land_acquisitions ORDER BY acquisition_date DESC LIMIT ?`;
  const res: DatabaseResponse<LandAcquisition[]> = await window.api.dbQuery(sql, [limit]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch acquisitions');
  return res.data;
}

export async function fetchAcquisitionById(id: string): Promise<LandAcquisition | null> {
  const sql = `SELECT * FROM land_acquisitions WHERE id = ? LIMIT 1`;
  const res: DatabaseResponse<LandAcquisition[]> = await window.api.dbQuery(sql, [id]);
  if (!res.success || !res.data || res.data.length === 0) return null;
  return res.data[0];
}

export async function createAcquisition(
  userId: string,
  userName: string,
  payload: AcquisitionPayload
): Promise<string> {
  const id = `ACQ_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const debtRemaining = Math.max(0, payload.total_agreed_price - payload.advance_paid);

  const sql = `
    INSERT INTO land_acquisitions (
      id, seller_name, seller_phone, seller_cnic, land_title_khata,
      total_agreed_price, advance_paid, debt_remaining, acquisition_date,
      registry_doc_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.seller_name, payload.seller_phone, payload.seller_cnic,
    payload.land_title_khata, Math.round(payload.total_agreed_price),
    Math.round(payload.advance_paid), Math.round(debtRemaining),
    payload.acquisition_date, payload.registry_doc_url
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create acquisition');

  await queueMutation('INSERT', 'land_acquisitions', { id, ...payload, debt_remaining: debtRemaining });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'ACQUISITIONS',
    entityId: id,
    description: `Land acquisition: ${payload.seller_name} (Khata: ${payload.land_title_khata}) - ${fmt(payload.total_agreed_price)} agreed, ${fmt(payload.advance_paid)} paid`,
  });
  return id;
}

export async function updateAcquisition(
  id: string,
  userId: string,
  userName: string,
  payload: AcquisitionPayload,
  previous: LandAcquisition
): Promise<void> {
  const debtRemaining = Math.max(0, payload.total_agreed_price - payload.advance_paid);

  const sql = `
    UPDATE land_acquisitions SET
      seller_name = ?, seller_phone = ?, seller_cnic = ?, land_title_khata = ?,
      total_agreed_price = ?, advance_paid = ?, debt_remaining = ?,
      acquisition_date = ?, registry_doc_url = ?
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    payload.seller_name, payload.seller_phone, payload.seller_cnic,
    payload.land_title_khata, Math.round(payload.total_agreed_price),
    Math.round(payload.advance_paid), Math.round(debtRemaining),
    payload.acquisition_date, payload.registry_doc_url, id
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to update acquisition');

  await queueMutation('UPDATE', 'land_acquisitions', { id, ...payload, debt_remaining: debtRemaining });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'ACQUISITIONS',
    entityId: id,
    description: `Acquisition updated: ${payload.seller_name} - debt ${fmt(previous.debt_remaining)} -> ${fmt(debtRemaining)}`,
  });
}

export async function recordPayment(
  id: string,
  userId: string,
  userName: string,
  paymentAmount: number,
  paymentNotes: string
): Promise<void> {
  const acquisition = await fetchAcquisitionById(id);
  if (!acquisition) throw new Error('Acquisition not found');

  const newAdvancePaid = acquisition.advance_paid + paymentAmount;
  const newDebtRemaining = Math.max(0, acquisition.total_agreed_price - newAdvancePaid);

  const sql = `
    UPDATE land_acquisitions SET
      advance_paid = ?, debt_remaining = ?
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    Math.round(newAdvancePaid), Math.round(newDebtRemaining), id
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to record payment');

  await queueMutation('UPDATE', 'land_acquisitions', {
    id,
    advance_paid: newAdvancePaid,
    debt_remaining: newDebtRemaining,
  });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'ACQUISITIONS',
    entityId: id,
    description: `Payment recorded: ${fmt(paymentAmount)} to ${acquisition.seller_name} (${paymentNotes}). Debt: ${fmt(acquisition.debt_remaining)} -> ${fmt(newDebtRemaining)}`,
  });
}

export async function deleteAcquisition(id: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM land_acquisitions WHERE id = ?`, [id]);
  if (!res.success) throw new Error(res.error || 'Failed to delete acquisition');

  await queueMutation('DELETE', 'land_acquisitions', { id });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'ACQUISITIONS',
    entityId: id,
    description: `Acquisition deleted: ${ref}`,
  });
}

// ------------------------------------------------------------------
// HELPER FUNCTIONS
// ------------------------------------------------------------------

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export function calculateDebtPercentage(acquisition: LandAcquisition): number {
  if (acquisition.total_agreed_price === 0) return 0;
  return Math.min(100, (acquisition.advance_paid / acquisition.total_agreed_price) * 100);
}

export function isFullyPaid(acquisition: LandAcquisition): boolean {
  return acquisition.debt_remaining <= 0;
}