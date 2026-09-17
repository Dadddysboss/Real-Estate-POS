import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface KYCPayload {
  party_type: 'INVESTOR' | 'CLIENT' | 'AGENT' | 'BUYER' | 'SELLER' | 'TENANT';
  person_type: 'BUYER' | 'SELLER' | 'AGENT' | 'TENANT' | 'INVESTOR';
  full_name: string;
  cnic: string;
  phone_number: string;
  address: string;
  email: string | null;
  verified: boolean;
}

export interface DocumentPayload {
  document_type: 'SALE_AGREEMENT' | 'LEASE_AGREEMENT' | 'CNIC_COPY' | 'TITLE_DEED' | 'NOC' | 'RECEIPT' | 'OTHER';
  title: string;
  description: string | null;
  expiry_date: string | null;
  related_person_id: string | null;
  related_plot_id: string | null;
  file_path: string | null;
}

export interface KYCRecord {
  id: string;
  person_type: string;
  full_name: string;
  cnic: string;
  phone_number: string;
  address: string;
  email: string | null;
  verified: boolean;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  document_type: string;
  title: string;
  description: string | null;
  expiry_date: string | null;
  related_person_id: string | null;
  related_plot_id: string | null;
  file_path: string | null;
  created_at: string;
}

// ------------------------------------------------------------------
// KYC OPERATIONS
// ------------------------------------------------------------------

export async function fetchKYCRegistry(): Promise<KYCRecord[]> {
  const sql = `SELECT * FROM kyc_registry ORDER BY created_at DESC`;
  const res = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch KYC registry');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    person_type: String(row.person_type || ''),
    full_name: String(row.full_name || ''),
    cnic: String(row.cnic || ''),
    phone_number: String(row.phone_number || ''),
    address: String(row.address || ''),
    email: row.email != null ? String(row.email) : null,
    verified: !!row.verified,
    created_at: String(row.created_at || ''),
  }));
}

export async function addKYCEntry(
  userId: string,
  userName: string,
  payload: KYCPayload
): Promise<string> {
  const id = `KYC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO kyc_registry (id, party_type, person_type, full_name, cnic, phone_number, address, email, verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.party_type || payload.person_type, payload.person_type, payload.full_name, payload.cnic,
    payload.phone_number, payload.address, payload.email, payload.verified
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add KYC entry');

  await queueMutation('INSERT', 'kyc_registry', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'LEGAL',
    entityId: id, description: `KYC entry added: ${payload.full_name} (${payload.person_type})`,
  });
  return id;
}

export async function verifyKYC(kycId: string, userId: string, userName: string): Promise<void> {
  const res = await window.api.dbExecute(`UPDATE kyc_registry SET verified = 1 WHERE id = ?`, [kycId]);
  if (!res.success) throw new Error(res.error || 'Failed to verify KYC');
  await queueMutation('UPDATE', 'kyc_registry', { id: kycId, verified: true });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'LEGAL',
    entityId: kycId, description: `KYC verified for entry ${kycId}`
  });
}

export async function deleteKYC(kycId: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM kyc_registry WHERE id = ?`, [kycId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete KYC');
  await queueMutation('DELETE', 'kyc_registry', { id: kycId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'LEGAL',
    entityId: kycId, description: `KYC entry deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// DOCUMENT OPERATIONS
// ------------------------------------------------------------------

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const sql = `SELECT * FROM documents ORDER BY created_at DESC`;
  const res = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch documents');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    document_type: String(row.document_type || ''),
    title: String(row.title || ''),
    description: row.description != null ? String(row.description) : null,
    expiry_date: row.expiry_date != null ? String(row.expiry_date) : null,
    related_person_id: row.related_person_id != null ? String(row.related_person_id) : null,
    related_plot_id: row.related_plot_id != null ? String(row.related_plot_id) : null,
    file_path: row.file_path != null ? String(row.file_path) : null,
    created_at: String(row.created_at || ''),
  }));
}

export async function addDocument(
  userId: string,
  userName: string,
  payload: DocumentPayload
): Promise<string> {
  const id = `DOC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO documents (id, doc_type, title, description, expiry_date, related_person_id, related_plot_id, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.document_type, payload.title, payload.description,
    payload.expiry_date, payload.related_person_id, payload.related_plot_id, payload.file_path
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add document');

  await queueMutation('INSERT', 'documents', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'LEGAL',
    entityId: id, description: `Document added: ${payload.title} (${payload.document_type})`,
  });
  return id;
}

export async function deleteDocument(docId: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM documents WHERE id = ?`, [docId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete document');
  await queueMutation('DELETE', 'documents', { id: docId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'LEGAL',
    entityId: docId, description: `Document deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function generateQRCodeData(docId: string): string {
  return `POS-DOC:${docId}:VERIFIED:${new Date().toISOString()}`;
}

export function checkExpiringDocuments(documents: DocumentRecord[], daysAhead = 30): DocumentRecord[] {
  const today = new Date();
  const threshold = new Date();
  threshold.setDate(today.getDate() + daysAhead);
  
  return documents.filter(doc => {
    if (!doc.expiry_date) return false;
    const expiry = new Date(doc.expiry_date);
    return expiry <= threshold && expiry >= today;
  });
}
