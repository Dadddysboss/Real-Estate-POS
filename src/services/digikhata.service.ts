import { DatabaseResponse } from '../../electron/preload';
import { DigiKhataEntry } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface LedgerEntryPayload {
  party_id: string;
  party_name: string;
  entry_type: 'CREDIT_LENA' | 'DEBIT_DENA';
  amount: number;
  category: string;
  description: string;
  date: string;
  reference: string | null;
}

// ------------------------------------------------------------------
// PARTY OPERATIONS
// ------------------------------------------------------------------

export async function fetchParties(): Promise<any[]> {
  const sql = `SELECT party_name, COUNT(*) as entry_count,
    SUM(CASE WHEN entry_type = 'DEBIT_DENA' THEN amount ELSE 0 END) as total_dena,
    SUM(CASE WHEN entry_type = 'CREDIT_LENA' THEN amount ELSE 0 END) as total_lena,
    SUM(CASE WHEN entry_type = 'DEBIT_DENA' THEN amount ELSE -amount END) as balance
    FROM digikhata_entries GROUP BY party_name ORDER BY balance DESC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch parties');
  return res.data;
}

export async function searchParty(name: string): Promise<any[]> {
  const sql = `SELECT DISTINCT party_name, party_phone, party_address, cnic
    FROM digikhata_entries WHERE party_name LIKE ? LIMIT 20`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, [`%${name}%`]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to search parties');
  return res.data;
}

// ------------------------------------------------------------------
// LEDGER ENTRY OPERATIONS
// ------------------------------------------------------------------

export async function fetchLedgerEntries(partyName?: string, limit = 100): Promise<DigiKhataEntry[]> {
  let sql = `SELECT * FROM digikhata_entries`;
  const args: string[] = [];
  if (partyName) {
    sql += ` WHERE party_name = ?`;
    args.push(partyName);
  }
  sql += ` ORDER BY date DESC, created_at DESC LIMIT ?`;
  args.push(String(limit));
  const res: DatabaseResponse<DigiKhataEntry[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch ledger entries');
  return res.data;
}

export async function addLedgerEntry(
  userId: string,
  userName: string,
  payload: LedgerEntryPayload
): Promise<string> {
  const id = `LEDGER_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO digikhata_entries (
      id, party_name, party_phone, party_address, cnic, entry_type, amount, category,
      description, date, reference, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.party_name, '', '', '', payload.entry_type,
    Math.round(payload.amount), payload.category, payload.description,
    payload.date, payload.reference
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add ledger entry');

  await queueMutation('INSERT', 'digikhata_entries', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'DIGIKHATA',
    entityId: id,
    description: `${payload.entry_type} entry: ${payload.party_name} — ${fmt(payload.amount)} (${payload.category})`,
  });
  return id;
}

export async function deleteLedgerEntry(
  entryId: string,
  userId: string,
  userName: string,
  ref: string
): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM digikhata_entries WHERE id = ?`, [entryId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete ledger entry');
  await queueMutation('DELETE', 'digikhata_entries', { id: entryId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'DIGIKHATA',
    entityId: entryId, description: `Ledger entry deleted: ${ref}`
  });
}

export async function adjustLedgerEntry(
  entryId: string,
  correctionAmount: number,
  reason: string,
  userId: string,
  userName: string
): Promise<void> {
  const id = `LEDGER_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO digikhata_entries (id, party_name, entry_type, amount, category, description, date, reference, created_at)
    VALUES (?, '', 'CORRECTION', ?, 'ADJUSTMENT', ?, CURRENT_DATE, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [id, Math.round(correctionAmount), reason, `CORRECT:${entryId}`]);
  if (!res.success) throw new Error(res.error || 'Failed to adjust entry');
  await queueMutation('INSERT', 'digikhata_entries', { id });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'DIGIKHATA',
    entityId: entryId, description: `Ledger correction: ${fmt(correctionAmount)} — ${reason}`
  });
}

// ------------------------------------------------------------------
// BALANCE HELPERS
// ------------------------------------------------------------------

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export function calculatePartyBalance(entries: DigiKhataEntry[]) {
  let totalLena = 0;
  let totalDena = 0;
  entries.forEach((e) => {
    if (e.entry_type === 'CREDIT_LENA') totalLena += e.amount;
    else if (e.entry_type === 'DEBIT_DENA') totalDena += e.amount;
  });
  return {
    totalLena,
    totalDena,
    balance: totalDena - totalLena,
    count: entries.length,
  };
}

export function generateKhataStatement(partyName: string, entries: DigiKhataEntry[]): string {
  const balance = calculatePartyBalance(entries);
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('                        DIGIKHATA LEDGER STATEMENT');
  lines.push('                    ═══════════════════════════════════════════════');
  lines.push(`  Party     : ${partyName}`);
  lines.push(`  Date      : ${new Date().toLocaleDateString()}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────────');
  entries.slice(0, 40).forEach((e) => {
    const line = `  ${e.created_at.slice(0, 10)}  ${e.entry_type.padEnd(12)} Rs.${e.amount.toLocaleString().padStart(12)}`;
    lines.push(line);
  });
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push(`  LENA Total: Rs. ${balance.totalLena.toLocaleString()}`);
  lines.push(`  DENA Total: Rs. ${balance.totalDena.toLocaleString()}`);
  lines.push(`  Balance   : Rs. ${balance.balance.toLocaleString()}`);
  lines.push('═══════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}