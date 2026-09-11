import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export type ProjectType = 'LAND' | 'PLAZA' | 'SOCIETY' | 'MIXED';

export interface PoolPayload {
  pool_name: string;
  project_type: ProjectType;
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
  const poolRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    'SELECT * FROM investor_pools ORDER BY created_at DESC', []
  );
  if (!poolRes.success || !poolRes.data) throw new Error(poolRes.error || 'Failed to fetch pools');

  const invRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    'SELECT pool_id, COUNT(id) as cnt, COALESCE(SUM(contributed_amount), 0) as raised FROM investors GROUP BY pool_id', []
  );
  const invMap: Record<string, { cnt: number; raised: number }> = {};
  if (invRes.success && invRes.data) {
    for (const row of invRes.data) {
      invMap[row.pool_id] = { cnt: Number(row.cnt) || 0, raised: Number(row.raised) || 0 };
    }
  }

  return poolRes.data.map(p => ({
    ...p,
    total_raised: invMap[p.id]?.raised || 0,
    investor_count: invMap[p.id]?.cnt || 0,
  }));
}

export async function createPool(
  userId: string,
  userName: string,
  payload: PoolPayload
): Promise<string> {
  const id = `POOL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO investor_pools (id, pool_name, project_type, total_target_capital, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.pool_name, payload.project_type, Math.round(payload.total_target_capital),
    payload.description, payload.status, now
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create pool');

  await queueMutation('INSERT', 'investor_pools', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INVESTORS',
    entityId: id, description: `Investor pool created: ${payload.pool_name} (${payload.project_type})`,
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
  const investorsRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT * FROM investors WHERE pool_id = ? AND equity_percentage > 0`, [payload.pool_id]
  );
  if (!investorsRes.success || !investorsRes.data) throw new Error('Failed to fetch investors');
  
  const totalEquity = investorsRes.data.reduce((s, inv) => s + inv.equity_percentage, 0);
  if (totalEquity <= 0) throw new Error('No active investors in pool');

  const batchId = `BATCH_${Date.now()}`;

  for (const investor of investorsRes.data) {
    const share = Math.round((payload.profit_amount * investor.equity_percentage / totalEquity));
    
    const divId = `DIV_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await window.api.dbExecute(`
      INSERT INTO dividend_distributions (id, pool_id, investor_id, investor_name, profit_amount, distribution_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [divId, payload.pool_id, investor.id, investor.investor_name, share, payload.distribution_date, new Date().toISOString()]);

    await window.api.dbExecute(`
      INSERT INTO investor_payouts (id, pool_id, investor_id, amount_paid, payout_date, payment_mode, notes, created_at)
      VALUES (?, ?, ?, ?, ?, 'DIVIDEND', ?, ?)
    `, [
      `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      payload.pool_id, investor.id, share, payload.distribution_date,
      `Dividend: ${payload.description || 'Profit distribution'}`,
      new Date().toISOString()
    ]);

    await window.api.dbExecute(`
      UPDATE investors SET total_payout_received = COALESCE(total_payout_received, 0) + ? WHERE id = ?
    `, [share, investor.id]);
  }

  await queueMutation('INSERT', 'dividend_distributions', { pool_id: payload.pool_id, profit_amount: payload.profit_amount, date: payload.distribution_date });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INVESTORS',
    entityId: payload.pool_id,
    description: `Dividend distributed: Rs. ${payload.profit_amount.toLocaleString()} to ${investorsRes.data.length} investors (batch: ${batchId})`,
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
// PAYOUT LEDGER
// ------------------------------------------------------------------

export async function recordPayout(
  userId: string,
  userName: string,
  payload: { pool_id: string; investor_id: string; amount: number; payment_mode?: string; notes?: string }
): Promise<void> {
  const payoutId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  // Insert payout record
  const res = await window.api.dbExecute(`
    INSERT INTO investor_payouts (id, pool_id, investor_id, amount_paid, payout_date, payment_mode, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [payoutId, payload.pool_id, payload.investor_id, payload.amount, now, payload.payment_mode || 'CASH', payload.notes || '', now]);
  if (!res.success) throw new Error(res.error || 'Failed to record payout');

  // Update investor's total_payout_received
  await window.api.dbExecute(`
    UPDATE investors SET total_payout_received = COALESCE(total_payout_received, 0) + ? WHERE id = ?
  `, [payload.amount, payload.investor_id]);

  await queueMutation('INSERT', 'investor_payouts', { id: payoutId, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INVESTORS',
    entityId: payload.investor_id,
    description: `Payout recorded: Rs. ${payload.amount.toLocaleString()} for investor in pool ${payload.pool_id}`,
  });
}

export async function fetchPayouts(poolId: string): Promise<any[]> {
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT p.*, i.investor_name FROM investor_payouts p
     LEFT JOIN investors i ON i.id = p.investor_id
     WHERE p.pool_id = ? ORDER BY p.payout_date DESC`, [poolId]
  );
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch payouts');
  return res.data;
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function calculatePoolStats(pool: any, investors: any[]) {
  const totalRaised = investors.reduce((s, inv) => s + inv.contributed_amount, 0);
  const target = pool.total_target_capital;
  const progress = target > 0 ? (totalRaised / target) * 100 : 0;
  const totalPayouts = investors.reduce((s, inv) => s + (inv.total_payout_received || 0), 0);
  const totalEquity = investors.reduce((s, inv) => s + (inv.equity_percentage || 0), 0);
  return { totalRaised, target, progress, investorCount: investors.length, totalPayouts, totalEquity };
}

// ------------------------------------------------------------------
// INTER-MODULE LINKING — Sales & Cash Counter Revenue
// ------------------------------------------------------------------

export async function fetchPoolRevenueLinks(_poolId: string): Promise<{
  salesRevenue: number;
  cashInflow: number;
  recentSales: any[];
}> {
  const salesRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT sd.*, ip.plot_number, ip.society_name
     FROM sales_deals sd
     JOIN inventory_plots ip ON sd.plot_id = ip.id
     ORDER BY sd.created_at DESC
     LIMIT 20`, []
  );
  const salesRevenue = salesRes.success && salesRes.data
    ? salesRes.data.reduce((s, r) => s + (r.total_deal_price || 0), 0)
    : 0;
  const recentSales = salesRes.success ? (salesRes.data || []) : [];

  const cashRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT COALESCE(SUM(amount), 0) as total_inflow
     FROM cash_counter
     WHERE transaction_type = 'INFLOW'`, []
  );
  const cashInflow = cashRes.success && cashRes.data && cashRes.data.length > 0
    ? Number(cashRes.data[0].total_inflow) || 0
    : 0;

  return { salesRevenue, cashInflow, recentSales };
}

export async function fetchPoolROI(poolId: string): Promise<{
  totalInvested: number;
  totalDistributed: number;
  roiPercentage: number;
  distributionCount: number;
}> {
  const invRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT COALESCE(SUM(contributed_amount), 0) as total_invested
     FROM investors WHERE pool_id = ?`, [poolId]
  );
  const totalInvested = invRes.success && invRes.data && invRes.data.length > 0
    ? Number(invRes.data[0].total_invested) || 0
    : 0;

  const divRes: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT COALESCE(SUM(profit_amount), 0) as total_distributed, COUNT(*) as dist_count
     FROM dividend_distributions WHERE pool_id = ?`, [poolId]
  );
  const totalDistributed = divRes.success && divRes.data && divRes.data.length > 0
    ? Number(divRes.data[0].total_distributed) || 0
    : 0;
  const distributionCount = divRes.success && divRes.data && divRes.data.length > 0
    ? Number(divRes.data[0].dist_count) || 0
    : 0;

  const roiPercentage = totalInvested > 0 ? (totalDistributed / totalInvested) * 100 : 0;

  return { totalInvested, totalDistributed, roiPercentage, distributionCount };
}
