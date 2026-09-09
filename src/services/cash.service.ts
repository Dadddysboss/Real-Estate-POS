import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';

export interface CashTransaction {
  id: string;
  branch_id: string;
  user_id: string;
  transaction_type: 'CASH_IN' | 'CASH_OUT';
  category: string;
  amount: number;
  notes: string | null;
  handed_over_by: string | null;
  received_by: string | null;
  created_at: string;
}

export interface CashDenomination {
  id: string;
  cash_counter_id: string;
  notes_5000: number;
  notes_1000: number;
  notes_500: number;
  notes_100: number;
  notes_50: number;
  notes_20: number;
  notes_10: number;
  total_calculated: number;
  created_at: string;
}

export interface CashSession {
  id: string;
  branch_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  variance: number | null;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
}

export interface DenominationBreakdown {
  notes_5000: number;
  notes_1000: number;
  notes_500: number;
  notes_100: number;
  notes_50: number;
  notes_20: number;
  notes_10: number;
}

export const EMPTY_DENOMINATIONS: DenominationBreakdown = {
  notes_5000: 0, notes_1000: 0, notes_500: 0, notes_100: 0, notes_50: 0, notes_20: 0, notes_10: 0,
};

export const DENOMINATION_KEYS: (keyof DenominationBreakdown)[] = [
  'notes_5000', 'notes_1000', 'notes_500', 'notes_100', 'notes_50', 'notes_20', 'notes_10',
];

export const CASH_CATEGORIES: Record<'CASH_IN' | 'CASH_OUT', string[]> = {
  CASH_IN: ['SALE_ADVANCE', 'INSTALLMENT_COLLECTION', 'DIGIKHATA_SETTLEMENT', 'MISC_RECEIPT'],
  CASH_OUT: ['OFFICE_EXPENSE', 'AGENT_COMMISSION_PAYOUT', 'VENDOR_PAYMENT', 'SELLER_INSTALLMENT', 'DIGIKHATA_SETTLEMENT', 'MISC_PAYOUT'],
};

// Drawer-opening/closing snapshot rows are audit artifacts, NOT ledger movements:
// they are excluded from balance & expected calculations to prevent double counting.
const NON_LEDGER_CATEGORIES = `('DRAWER_OPENING','DRAWER_CLOSING')`;

export function computeDenominationTotal(breakdown: DenominationBreakdown): number {
  // Integer note counts x integer denominations => exact PKR, zero float drift.
  return DENOMINATION_KEYS.reduce((sum, key) => {
    const value = Number(key.replace('notes_', ''));
    return sum + value * Math.max(0, Math.trunc(breakdown[key] || 0));
  }, 0);
}

// ------------------------------------------------------------------
// CASH COUNTER TRANSACTION OPERATIONS
// ------------------------------------------------------------------

export async function fetchCashTransactions(branchId: string, limit = 50, sinceIso?: string): Promise<CashTransaction[]> {
  let sql = `SELECT * FROM cash_counter WHERE branch_id = ?`;
  const args: (string | number)[] = [branchId];
  if (sinceIso) {
    sql += ` AND created_at >= ?`;
    args.push(sinceIso);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  args.push(limit);
  const res: DatabaseResponse<CashTransaction[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch cash transactions');
  return res.data;
}

export async function createCashTransaction(
  transaction: Omit<CashTransaction, 'id' | 'created_at'>,
  opts?: { userId?: string; userName?: string; skipAudit?: boolean }
): Promise<string> {
  const id = `CASH_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO cash_counter (id, branch_id, user_id, transaction_type, category, amount, notes, handed_over_by, received_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const args = [
    id,
    transaction.branch_id,
    transaction.user_id,
    transaction.transaction_type,
    transaction.category,
    transaction.amount,
    transaction.notes,
    transaction.handed_over_by,
    transaction.received_by,
  ];
  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to create cash transaction');

  // Queue for background sync (Layer 3 - Turso)
  await window.api.dbExecute(
    `INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at) VALUES (?, 'INSERT', 'cash_counter', ?, 'PENDING', CURRENT_TIMESTAMP)`,
    [`SYNC_${id}`, JSON.stringify({ ...transaction, id })]
  );

  if (!opts?.skipAudit) {
    await logAudit({
      userId: opts?.userId ?? transaction.user_id,
      userName: opts?.userName ?? null,
      actionType: 'CREATE',
      moduleName: 'CASH_COUNTER',
      entityId: id,
      description: `${transaction.transaction_type} Rs. ${transaction.amount.toLocaleString()} [${transaction.category}] ${transaction.notes || ''}`.trim(),
    });
  }

  return id;
}

export async function createCashIn(
  branchId: string,
  userId: string,
  amount: number,
  category: string,
  notes: string,
  receivedBy: string,
  opts?: { userName?: string; skipAudit?: boolean }
): Promise<string> {
  return createCashTransaction(
    {
      branch_id: branchId,
      user_id: userId,
      transaction_type: 'CASH_IN',
      category,
      amount,
      notes,
      handed_over_by: null,
      received_by: receivedBy,
    },
    opts
  );
}

export async function createCashOut(
  branchId: string,
  userId: string,
  amount: number,
  category: string,
  notes: string,
  handedOverBy: string,
  opts?: { userName?: string; skipAudit?: boolean }
): Promise<string> {
  return createCashTransaction(
    {
      branch_id: branchId,
      user_id: userId,
      transaction_type: 'CASH_OUT',
      category,
      amount,
      notes,
      handed_over_by: handedOverBy,
      received_by: null,
    },
    opts
  );
}

// ------------------------------------------------------------------
// CASH DENOMINATION SNAPSHOT OPERATIONS
// ------------------------------------------------------------------

export async function saveDenominationBreakdown(
  cashCounterId: string,
  breakdown: DenominationBreakdown
): Promise<CashDenomination> {
  const total = computeDenominationTotal(breakdown);
  const id = `DENOM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO cash_denominations (id, cash_counter_id, notes_5000, notes_1000, notes_500, notes_100, notes_50, notes_20, notes_10, total_calculated, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const args = [
    id,
    cashCounterId,
    breakdown.notes_5000,
    breakdown.notes_1000,
    breakdown.notes_500,
    breakdown.notes_100,
    breakdown.notes_50,
    breakdown.notes_20,
    breakdown.notes_10,
    total,
  ];
  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to save denomination breakdown');
  return {
    id,
    cash_counter_id: cashCounterId,
    notes_5000: breakdown.notes_5000,
    notes_1000: breakdown.notes_1000,
    notes_500: breakdown.notes_500,
    notes_100: breakdown.notes_100,
    notes_50: breakdown.notes_50,
    notes_20: breakdown.notes_20,
    notes_10: breakdown.notes_10,
    total_calculated: total,
    created_at: new Date().toISOString(),
  };
}

export async function fetchLatestDenomination(branchId: string): Promise<CashDenomination | null> {
  const sql = `
    SELECT cd.* FROM cash_denominations cd
    JOIN cash_counter cc ON cd.cash_counter_id = cc.id
    WHERE cc.branch_id = ?
    ORDER BY cd.created_at DESC
    LIMIT 1
  `;
  const res: DatabaseResponse<CashDenomination[]> = await window.api.dbQuery(sql, [branchId]);
  if (!res.success || !res.data || res.data.length === 0) return null;
  return res.data[0];
}

// ------------------------------------------------------------------
// CASH SESSION OPERATIONS (Physical Drawer Open / Close / Reconcile)
// ------------------------------------------------------------------

export async function openCashSession(
  branchId: string,
  userId: string,
  userName: string,
  openingBalance: number,
  openingDenominations: DenominationBreakdown
): Promise<string> {
  const active = await fetchActiveSession(branchId);
  if (active) throw new Error('A cash drawer session is already OPEN. Close it before opening a new one.');
  if (openingBalance < 0 || !Number.isFinite(openingBalance)) throw new Error('Opening balance must be a valid non-negative amount.');
  if (computeDenominationTotal(openingDenominations) !== openingBalance) {
    throw new Error('Opening denomination tally does not match opening balance. Re-count physical notes.');
  }

  const sessionId = `SESSION_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Opening snapshot row (excluded from ledger balance) for denomination attachment
  const openingTxnId = await createCashIn(branchId, userId, openingBalance, 'DRAWER_OPENING', `Drawer opened by ${userName}`, userName, { skipAudit: true });
  await saveDenominationBreakdown(openingTxnId, openingDenominations);

  const sql = `
    INSERT INTO cash_sessions (id, branch_id, opened_by, opening_balance, status, opened_at)
    VALUES (?, ?, ?, ?, 'OPEN', CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [sessionId, branchId, userId, openingBalance]);
  if (!res.success) throw new Error(res.error || 'Failed to open cash session');

  await window.api.dbExecute(
    `INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at) VALUES (?, 'INSERT', 'cash_sessions', ?, 'PENDING', CURRENT_TIMESTAMP)`,
    [`SYNC_${sessionId}`, JSON.stringify({ id: sessionId, branch_id: branchId, opened_by: userId, opening_balance: openingBalance, status: 'OPEN' })]
  );

  await logAudit({
    userId,
    userName,
    actionType: 'CREATE',
    moduleName: 'CASH_COUNTER',
    entityId: sessionId,
    description: `Drawer session opened with float Rs. ${openingBalance.toLocaleString()}`,
  });

  return sessionId;
}

export async function fetchActiveSession(branchId: string): Promise<CashSession | null> {
  const sql = `SELECT * FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`;
  const res: DatabaseResponse<CashSession[]> = await window.api.dbQuery(sql, [branchId]);
  if (!res.success || !res.data || res.data.length === 0) return null;
  return res.data[0];
}

export async function fetchSessionHistory(branchId: string, limit = 20): Promise<CashSession[]> {
  const sql = `SELECT * FROM cash_sessions WHERE branch_id = ? ORDER BY opened_at DESC LIMIT ?`;
  const res: DatabaseResponse<CashSession[]> = await window.api.dbQuery(sql, [branchId, limit]);
  if (!res.success || !res.data) return [];
  return res.data;
}

// System-calculated drawer balance for the active session:
// float + ledgered CASH_IN - ledgered CASH_OUT, scoped to session window,
// snapshot categories excluded.
export async function calculateSessionExpectedBalance(session: CashSession): Promise<{ totalIn: number; totalOut: number; expected: number }> {
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type = 'CASH_IN' THEN amount ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN transaction_type = 'CASH_OUT' THEN amount ELSE 0 END), 0) as total_out
    FROM cash_counter
    WHERE branch_id = ?
      AND created_at >= ?
      AND category NOT IN ${NON_LEDGER_CATEGORIES}
  `;
  const res: DatabaseResponse<{ total_in: number; total_out: number }[]> = await window.api.dbQuery(sql, [session.branch_id, session.opened_at]);
  const totalIn = res.data?.[0]?.total_in || 0;
  const totalOut = res.data?.[0]?.total_out || 0;
  const expected = session.opening_balance + totalIn - totalOut;
  return { totalIn, totalOut, expected };
}

export async function calculateCurrentBalance(branchId: string): Promise<number> {
  const active = await fetchActiveSession(branchId);
  if (!active) return 0;
  const { expected } = await calculateSessionExpectedBalance(active);
  return expected;
}

export interface DenominationAuditResult {
  actual: number;
  expected: number;
  variance: number;
  adjustmentId: string;
}

// Mid-session physical count: records snapshot + books the variance as a
// signed CASH_ADJUSTMENT movement so the ledger equals the physical drawer.
export async function recordDenominationAudit(
  session: CashSession,
  userId: string,
  userName: string,
  breakdown: DenominationBreakdown
): Promise<DenominationAuditResult> {
  const actual = computeDenominationTotal(breakdown);
  const { expected } = await calculateSessionExpectedBalance(session);
  const variance = actual - expected;

  let adjustmentId: string;
  if (variance > 0) {
    adjustmentId = await createCashIn(session.branch_id, userId, variance, 'CASH_ADJUSTMENT', `Denomination count overage vs system Rs. ${expected.toLocaleString()} by ${userName}`, userName, { skipAudit: true });
  } else if (variance < 0) {
    adjustmentId = await createCashOut(session.branch_id, userId, Math.abs(variance), 'CASH_ADJUSTMENT', `Denomination count shortage vs system Rs. ${expected.toLocaleString()} by ${userName}`, userName, { skipAudit: true });
  } else {
    adjustmentId = await createCashIn(session.branch_id, userId, 0, 'DENOMINATION_AUDIT', `Zero-variance physical count by ${userName}`, userName, { skipAudit: true });
  }

  await saveDenominationBreakdown(adjustmentId, breakdown);

  await logAudit({
    userId,
    userName,
    actionType: variance !== 0 ? 'OVERRIDE' : 'CREATE',
    moduleName: 'CASH_COUNTER',
    entityId: adjustmentId,
    description: variance !== 0
      ? `Physical count Rs. ${actual.toLocaleString()} vs system Rs. ${expected.toLocaleString()} — variance ${variance >= 0 ? '+' : ''}${variance.toLocaleString()} booked as CASH_ADJUSTMENT`
      : `Physical count reconciled at Rs. ${actual.toLocaleString()} (zero variance)`,
  });

  return { actual, expected, variance, adjustmentId };
}

export interface SessionCloseResult {
  expected: number;
  actual: number;
  variance: number;
}

export async function closeCashSession(
  sessionId: string,
  userId: string,
  userName: string,
  closingDenominations: DenominationBreakdown,
  handoverTo: string
): Promise<SessionCloseResult> {
  const sessionRes: DatabaseResponse<CashSession[]> = await window.api.dbQuery(`SELECT * FROM cash_sessions WHERE id = ?`, [sessionId]);
  if (!sessionRes.success || !sessionRes.data || sessionRes.data.length === 0) throw new Error('Session not found');
  const session = sessionRes.data[0];
  if (session.status !== 'OPEN') throw new Error('Session is already closed.');

  const actual = computeDenominationTotal(closingDenominations);
  const { expected } = await calculateSessionExpectedBalance(session);
  const variance = actual - expected;

  // Book shortage/overage before closing so ledger == physical
  if (variance !== 0) {
    const adjId = variance > 0
      ? await createCashIn(session.branch_id, userId, variance, 'CASH_ADJUSTMENT', `Closing overage booked by ${userName}`, handoverTo, { skipAudit: true })
      : await createCashOut(session.branch_id, userId, Math.abs(variance), 'CASH_ADJUSTMENT', `Closing shortage booked by ${userName}`, userName, { skipAudit: true });
    await saveDenominationBreakdown(adjId, closingDenominations);
  }

  const closingTxnId = await createCashIn(session.branch_id, userId, actual, 'DRAWER_CLOSING', `Drawer closed by ${userName}, handed over to ${handoverTo}`, handoverTo, { skipAudit: true });
  await saveDenominationBreakdown(closingTxnId, closingDenominations);

  const updateSql = `
    UPDATE cash_sessions
    SET closed_by = ?, closing_balance = ?, expected_balance = ?, variance = ?, status = 'CLOSED', closed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  const updateRes = await window.api.dbExecute(updateSql, [userId, actual, expected, variance, sessionId]);
  if (!updateRes.success) throw new Error(updateRes.error || 'Failed to close cash session');

  await window.api.dbExecute(
    `INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at) VALUES (?, 'UPDATE', 'cash_sessions', ?, 'PENDING', CURRENT_TIMESTAMP)`,
    [`SYNC_${sessionId}_CLOSE`, JSON.stringify({ id: sessionId, closing_balance: actual, expected_balance: expected, variance, status: 'CLOSED' })]
  );

  await logAudit({
    userId,
    userName,
    actionType: variance !== 0 ? 'OVERRIDE' : 'UPDATE',
    moduleName: 'CASH_COUNTER',
    entityId: sessionId,
    description: `Session closed. Counted Rs. ${actual.toLocaleString()}, system Rs. ${expected.toLocaleString()}, variance ${variance >= 0 ? '+' : ''}${variance.toLocaleString()}. Handed over to ${handoverTo}.`,
  });

  return { expected, actual, variance };
}

// ------------------------------------------------------------------
// THERMAL RECEIPT GENERATION (80mm)
// ------------------------------------------------------------------

export interface ReceiptData {
  type: 'CASH_IN' | 'CASH_OUT' | 'DRAWER_OPENING' | 'DRAWER_CLOSING' | 'DENOMINATION_AUDIT' | 'HANDOVER_VOUCHER';
  transactionId: string;
  branchName: string;
  userName: string;
  amount: number;
  category: string;
  notes: string;
  denominations?: DenominationBreakdown;
  timestamp: string;
  variance?: number;
  expected?: number;
  handoverTo?: string;
}

export function generateThermalReceipt(data: ReceiptData): string {
  const width = 42; // 80mm thermal printer character width
  const line = '='.repeat(width);
  const dash = '-'.repeat(width);

  const center = (text: string) => ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text + '\n';

  let receipt = '';
  receipt += center('DRIPP REAL ESTATE ERP');
  receipt += center('DIGIKHATA EDITION');
  receipt += line + '\n';

  const typeLabels: Record<string, string> = {
    CASH_IN: 'CASH DEPOSIT RECEIPT',
    CASH_OUT: 'CASH WITHDRAWAL RECEIPT',
    DRAWER_OPENING: 'DRAWER OPENING RECEIPT',
    DRAWER_CLOSING: 'DRAWER CLOSING RECEIPT',
    DENOMINATION_AUDIT: 'DENOMINATION AUDIT RECEIPT',
    HANDOVER_VOUCHER: 'SESSION HANDOVER VOUCHER',
  };

  receipt += center(typeLabels[data.type] || 'CASH RECEIPT');
  receipt += line + '\n';
  receipt += `Date/Time : ${new Date(data.timestamp).toLocaleString('en-PK')}\n`;
  receipt += `Branch    : ${data.branchName}\n`;
  receipt += `User      : ${data.userName}\n`;
  receipt += `Txn ID    : ${data.transactionId}\n`;
  receipt += dash + '\n';
  receipt += `Category  : ${data.category}\n`;
  if (data.notes) receipt += `Notes     : ${data.notes}\n`;
  if (data.handoverTo) {
    receipt += dash + '\n';
    receipt += `HANDED OVER BY : ${data.userName}\n`;
    receipt += `RECEIVED BY    : ${data.handoverTo}\n`;
  }
  receipt += dash + '\n';

  if (data.denominations) {
    receipt += 'DENOMINATION BREAKDOWN:\n';
    receipt += dash + '\n';
    for (const key of DENOMINATION_KEYS) {
      const value = data.denominations[key];
      const denom = key.replace('notes_', '');
      if (value > 0) {
        const subtotal = value * Number(denom);
        receipt += `  Rs. ${denom.padStart(4)} x ${String(value).padStart(3)} = Rs. ${subtotal.toLocaleString().padStart(12)}\n`;
      }
    }
    receipt += dash + '\n';
  }

  receipt += `AMOUNT: Rs. ${data.amount.toLocaleString().padStart(width - 9)}\n`;

  if (data.variance !== undefined && data.expected !== undefined) {
    receipt += dash + '\n';
    receipt += `System Balance : Rs. ${data.expected.toLocaleString().padStart(width - 17)}\n`;
    receipt += `Actual Count   : Rs. ${data.amount.toLocaleString().padStart(width - 15)}\n`;
    receipt += `VARIANCE       : ${(data.variance >= 0 ? '+' : '') + data.variance.toLocaleString()}\n`;
  }

  receipt += line + '\n';
  receipt += center('THANK YOU');
  receipt += center('DUAL-SYNC SECURED');
  receipt += '\n\n\n';

  return receipt;
}

export async function printThermalReceipt(receiptText: string): Promise<void> {
  const res = await window.api.printReceipt(receiptText);
  if (!res.success) throw new Error(res.error || 'Print failed');
}
