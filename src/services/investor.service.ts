import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface PoolPayload {
  pool_name: string;
  total_target_capital: number;
  description: string;
  status: 'ACTIVE' | 'CLOSED' | 'COMPLETED';
}

export interface InvestorPayload {
  pool_id: string;
  investor_name: string;
  phone_number: string;
  cnic: string;
  contributed_amount: number;
  equity_percentage: number;
}

export interface DividendPayload {
  pool_id: string;
  profit_amount: number;
  distribution_date: string;
  description: string;
}

// ------------------------------------------------------------------
// POOL OPERATIONS
// ------------------------------------------------------------------

export async function fetchPools(): Promise<any[]> {
  const sql = `
    SELECT p.*, 
      COALESCE(SUM(i.contributed_amount), 0) as total_raised,
      COUNT(i.id) as investor_count
    FROM investor_pools p
    LEFT JOIN investors i ON i.pool_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC
  `;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch pools');
  return res.data;
}

export async function createPool(
  userId: string,
  userName: string,
  payload: PoolPayload
): Promise<string> {
  const id = `POOL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO investor_pools (id, pool_name, total_target_capital, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.pool_name, Math.round(payload.total_target_capital),
    payload.description, payload.status
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create pool');

  await queueMutation('INSERT', 'investor_pools', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INVESTORS',
    entityId: id, description: `Investor pool created: ${payload.pool_name}`,
  });
  return id;
}

export async function deletePool(poolId: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM investor_pools WHERE id = ?`, [poolId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete pool');
  await queueMutation('DELETE', 'investor_pools', { id: poolId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'INVESTORS',
    entityId: poolId, description: `Pool deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// INVESTOR OPERATIONS
// ------------------------------------------------------------------

export async function fetchInvestors(poolId?: string): Promise<any[]> {
  let sql = `
    SELECT i.*, p.pool_name
    FROM investors i
    LEFT JOIN investor_pools p ON p.id = i.pool_id
  `;
  const args: string[] = [];
  if (poolId) {
    sql += ` WHERE i.pool_id = ?`;
    args.push(poolId);
  }
  sql += ` ORDER BY i.contributed_amount DESC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch investors');
  return res.data;
}

export async function addInvestor(
  userId: string,
  userName: string,
  payload: InvestorPayload
): Promise<string> {
  const id = `INV_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO investors (id, pool_id, investor_name, phone_number, cnic, contributed_amount, equity_percentage, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.pool_id, payload.investor_name, payload.phone_number,
    payload.cnic, Math.round(payload.contributed_amount), Math.round(payload.equity_percentage)
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add investor');

  await queueMutation('INSERT', 'investors', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INVESTORS',
    entityId: id,
    description: `Investor added to pool: ${payload.investor_name} — Rs. ${payload.contributed_amount.toLocaleString()} (${payload.equity_percentage}% equity)`,
  });
  return id;
}

export async function removeInvestor(
  investorId: string,
  userId: string,
  userName: string
): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM investors WHERE id = ?`, [investorId]);
  if (!res.success) throw new Error(res.error || 'Failed to remove investor');
  await queueMutation('DELETE', 'investors', { id: investorId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'INVESTORS',
    entityId: investorId, description: `Investor removed`
  });
}

// ------------------------------------------------------------------
// DIVIDEND DISTRIBUTION
// ------------------------------------------------------------------

export async function distributeDividend(
  userId: string,
  userName: string,
  payload: DividendPayload
): Promise<void> {
  // Get all investors in this pool
  const investorsRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT * FROM investors WHERE pool_id = ? AND equity_percentage > 0`, [payload.pool_id]
  );
  if (!investorsRes.success || !investorsRes.data) throw new Error('Failed to fetch investors');
  
  const totalEquity = investorsRes.data.reduce((s, inv) => s + inv.equity_percentage, 0);
  if (totalEquity <= 0) throw new Error('No active investors in pool');

  // Distribute proportionally by equity %
  for (const investor of investorsRes.data) {
    const share = Math.round((payload.profit_amount * investor.equity_percentage / totalEquity));
    
    // Create dividend record
    const divId = `DIV_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const divSql = `
      INSERT INTO dividend_distributions (id, pool_id, investor_id, investor_name, profit_amount, distribution_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await window.api.dbExecute(divSql, [
      divId, payload.pool_id, investor.id, investor.investor_name,
      share, payload.distribution_date
    ]);

    // Also create DigiKhata entry for deposit notification
    const khataSql = `
      INSERT INTO digikhata_entries (id, party_name, entry_type, amount, category, description, date, reference, created_at)
      VALUES (?, ?, 'DEBIT_DENA', ?, 'INVESTMENT', 'Dividend: ${payload.description}', ?, ?, CURRENT_TIMESTAMP)
    `;
    await window.api.dbExecute(khataSql, [
      `${divId}_KHATA`, investor.investor_name, share,
      payload.distribution_date, `DIV:${divId}`
    ]);
  }

  await queueMutation('INSERT', 'dividend_distributions', { pool_id: payload.pool_id, profit_amount: payload.profit_amount, date: payload.distribution_date });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INVESTORS',
    entityId: payload.pool_id,
    description: `Dividend distributed: Rs. ${payload.profit_amount.toLocaleString()} to ${investorsRes.data.length} investors`,
  });
}

export async function fetchDividendHistory(poolId?: string): Promise<any[]> {
  let sql = `SELECT * FROM dividend_distributions`;
  const args: string[] = [];
  if (poolId) {
    sql += ` WHERE pool_id = ?`;
    args.push(poolId);
  }
  sql += ` ORDER BY distribution_date DESC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch dividends');
  return res.data;
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function calculatePoolStats(pool: any, investors: any[]) {
  const totalRaised = investors.reduce((s, inv) => s + inv.contributed_amount, 0);
  const target = pool.total_target_capital;
  const progress = target > 0 ? (totalRaised / target) * 100 : 0;
  return { totalRaised, target, progress, investorCount: investors.length };
}
