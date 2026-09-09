import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface ExpensePayload {
  category: string;
  amount: number;
  description: string;
  date: string;
  recurring: boolean;
  recurring_frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
}

export interface AssetPayload {
  asset_name: string;
  category: string;
  purchase_price: number;
  purchase_date: string;
  useful_life_years: number;
  salvage_value: number;
  depreciation_method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
}

// ------------------------------------------------------------------
// EXPENSE OPERATIONS
// ------------------------------------------------------------------

export async function fetchExpenses(category?: string, limit = 100): Promise<any[]> {
  let sql = `SELECT * FROM office_expenses`;
  const args: string[] = [];
  if (category) {
    sql += ` WHERE category = ?`;
    args.push(category);
  }
  sql += ` ORDER BY date DESC LIMIT ?`;
  args.push(String(limit));
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch expenses');
  return res.data;
}

export async function recordExpense(
  userId: string,
  userName: string,
  payload: ExpensePayload
): Promise<string> {
  const id = `EXP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO office_expenses (id, category, amount, description, date, recurring, recurring_frequency, payment_method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.category, Math.round(payload.amount), payload.description,
    payload.date, payload.recurring, payload.recurring_frequency, payload.payment_method
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to record expense');

  await queueMutation('INSERT', 'office_expenses', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'EXPENSES',
    entityId: id,
    description: `Expense recorded: ${payload.category} — Rs. ${payload.amount.toLocaleString()}`,
  });
  return id;
}

export async function deleteExpense(expenseId: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM office_expenses WHERE id = ?`, [expenseId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete expense');
  await queueMutation('DELETE', 'office_expenses', { id: expenseId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'EXPENSES',
    entityId: expenseId, description: `Expense deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// ASSET & DEPRECIATION OPERATIONS
// ------------------------------------------------------------------

export async function fetchAssets(): Promise<any[]> {
  const sql = `SELECT * FROM fixed_assets ORDER BY purchase_date DESC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch assets');
  return res.data;
}

export async function addAsset(
  userId: string,
  userName: string,
  payload: AssetPayload
): Promise<string> {
  const id = `ASSET_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Calculate annual depreciation
  let annualDepreciation = 0;
  if (payload.depreciation_method === 'STRAIGHT_LINE') {
    annualDepreciation = (payload.purchase_price - payload.salvage_value) / payload.useful_life_years;
  } else {
    // Declining balance: double the straight-line rate
    const rate = 2 / payload.useful_life_years;
    annualDepreciation = payload.purchase_price * rate;
  }
  const currentBookValue = payload.purchase_price;

  const sql = `
    INSERT INTO fixed_assets (id, asset_name, category, purchase_price, purchase_date, useful_life_years, salvage_value, depreciation_method, annual_depreciation, current_book_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.asset_name, payload.category, Math.round(payload.purchase_price),
    payload.purchase_date, payload.useful_life_years, Math.round(payload.salvage_value),
    payload.depreciation_method, Math.round(annualDepreciation), Math.round(currentBookValue)
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add asset');

  await queueMutation('INSERT', 'fixed_assets', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'EXPENSES',
    entityId: id, description: `Fixed asset added: ${payload.asset_name} — Rs. ${payload.purchase_price.toLocaleString()}`,
  });
  return id;
}

export async function calculateDepreciation(assetId: string): Promise<number> {
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT * FROM fixed_assets WHERE id = ? LIMIT 1`, [assetId]
  );
  if (!res.success || !res.data || res.data.length === 0) return 0;
  
  const asset = res.data[0];
  const purchaseDate = new Date(asset.purchase_date);
  const today = new Date();
  const yearsElapsed = (today.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  
  if (asset.depreciation_method === 'STRAIGHT_LINE') {
    const totalDepreciable = asset.purchase_price - asset.salvage_value;
    const accumulated = totalDepreciable * (yearsElapsed / asset.useful_life_years);
    return Math.min(accumulated, totalDepreciable);
  } else {
    // Declining balance
    const rate = 2 / asset.useful_life_years;
    let bookValue = asset.purchase_price;
    const fullYears = Math.floor(yearsElapsed);
    for (let i = 0; i < fullYears; i++) {
      const dep = bookValue * rate;
      bookValue -= dep;
      if (bookValue < asset.salvage_value) {
        bookValue = asset.salvage_value;
        break;
      }
    }
    return asset.purchase_price - bookValue;
  }
}

export async function updateAssetBookValue(assetId: string): Promise<void> {
  const depreciation = await calculateDepreciation(assetId);
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(
    `SELECT * FROM fixed_assets WHERE id = ? LIMIT 1`, [assetId]
  );
  if (!res.success || !res.data || res.data.length === 0) return;
  
  const asset = res.data[0];
  const newValue = asset.purchase_price - depreciation;
  
  await window.api.dbExecute(
    `UPDATE fixed_assets SET current_book_value = ? WHERE id = ?`,
    [Math.round(Math.max(newValue, asset.salvage_value)), assetId]
  );
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function calculateExpenseSummary(expenses: any[]) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const recurringTotal = expenses.filter(e => e.recurring).reduce((s, e) => s + e.amount, 0);
  const oneTimeTotal = expenses.filter(e => !e.recurring).reduce((s, e) => s + e.amount, 0);
  
  const byCategory: Record<string, number> = {};
  expenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  
  return { total, recurringTotal, oneTimeTotal, byCategory, count: expenses.length };
}
